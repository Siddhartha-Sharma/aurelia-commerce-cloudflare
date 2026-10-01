import { COLLECTIONS, VALUES, executeServiceOperation } from "./domain/operations.js";
import { ServiceError } from "./domain/serviceError.js";
import { DEFAULT_FEATURES } from "./domain/featureDefaults.js";

const scoped = new Set(["cart", "wishlist", "profile", "addresses", "sharedProducts"]);
const defaults = {
  features: DEFAULT_FEATURES, paymentConfig: { upiId: "", merchantName: "Aurelia Jewellery" },
  festivalFeed: { mode: "auto", festivalSlug: "diwali", from: "", to: "" },
  profile: { name: "", phone: "", email: "", address: "", landmark: "", city: "", state: "", pincode: "" },
  campaignImageCleanup: true,
};

export function operationResources(operation) {
  if (operation === "orders.status") return ["orders", "products", "inventoryMovements"];
  if (operation === "payments.reference") return ["orders"];
  if (operation === "payments.confirm") return ["orders", "payments"];
  const resource = operation.split(".")[0];
  if (COLLECTIONS.includes(resource) || VALUES.includes(resource)) {
    if (operation === "orders.place") return ["products", "orders", "customers", "payments", "inventoryMovements", "cart", "features", "paymentConfig"];
    if (operation === "stockAlerts.subscribe") return ["products", "stockAlerts"];
    return [resource];
  }
  if (operation === "inventory.adjust") return ["products", "inventoryMovements"];
  if (operation === "inventory.lowStock") return ["products"];
  if (operation === "analytics.recordView" || operation === "analytics.trending") return ["products", "productViews"];
  if (operation === "analytics.counts") return ["productViews"];
  if (operation === "reports.summary" || operation === "search.all") return ["products", "customers", "orders"];
  if (operation === "notifications.list") return ["products", "orders"];
  throw new ServiceError("Unknown service operation.", { code: "NOT_IMPLEMENTED", status: 404 });
}

export function createD1Adapter(db, { sessionId, audience }) {
  return {
    async execute(operation, input) {
      const resources = operationResources(operation);
      for (let attempt = 0; attempt < 4; attempt++) {
        const database = db.withSession("first-primary");
        const queries = [database.prepare("SELECT version FROM data_version WHERE id = 1")];
        for (const resource of resources) {
          const scope = scoped.has(resource) ? sessionId : "shop";
          // Customer history is session scoped; owner demo history spans the shop.
          queries.push(database.prepare(`SELECT id, data FROM records WHERE resource = ? AND scope = ?${resource === "orders" && audience === "customer" ? " AND json_extract(data, '$.sessionId') = ?" : ""} ORDER BY rowid`)
            .bind(resource, scope, ...(resource === "orders" && audience === "customer" ? [sessionId] : [])));
        }
        const snapshot = await database.batch(queries);
        const version = snapshot[0].results[0].version;
        const original = new Map(), values = new Map(), dirty = new Set();
        resources.forEach((resource, index) => {
          const rows = snapshot[index + 1].results;
          const value = COLLECTIONS.includes(resource) ? rows.map(row => JSON.parse(row.data)) : rows.length ? JSON.parse(rows[0].data) : structuredClone(defaults[resource] ?? (["cart", "wishlist"].includes(resource) ? [] : {}));
          original.set(resource, new Map(rows.map(row => [row.id, row.data])));
          values.set(resource, value);
        });
        const tx = {
          async read(resource) {
            if (!values.has(resource)) throw new Error(`Missing transaction resource: ${resource}`);
            return structuredClone(values.get(resource));
          },
          async write(resource, value) {
            if (!values.has(resource)) throw new Error(`Missing transaction resource: ${resource}`);
            values.set(resource, structuredClone(value)); dirty.add(resource);
          },
        };
        const result = await executeServiceOperation(tx, operation, input, { sessionId, audience });
        if (!dirty.size) return result;
        const writes = [database.prepare("INSERT INTO commit_guard(id, expected) VALUES(1, ?)").bind(version), database.prepare("DELETE FROM commit_guard WHERE id = 1")];
        for (const resource of dirty) {
          const scope = scoped.has(resource) ? sessionId : "shop";
          const next = new Map(COLLECTIONS.includes(resource) ? values.get(resource).map(record => [record.id, JSON.stringify(record)]) : [["value", JSON.stringify(values.get(resource))]]);
          for (const [id, body] of next) {
            if (original.get(resource).get(id) !== body) writes.push(database.prepare("INSERT INTO records(resource, scope, id, data) VALUES(?, ?, ?, ?) ON CONFLICT(resource, scope, id) DO UPDATE SET data = excluded.data").bind(resource, scope, id, body));
          }
          for (const id of original.get(resource).keys()) if (!next.has(id)) writes.push(database.prepare("DELETE FROM records WHERE resource = ? AND scope = ? AND id = ?").bind(resource, scope, id));
        }
        writes.push(database.prepare("UPDATE data_version SET version = version + 1 WHERE id = 1"));
        try { await database.batch(writes); return result; }
        catch (error) {
          if (String(error.message).includes("AURELIA_CONFLICT")) continue;
          if (String(error.message).includes("UNIQUE constraint")) throw new ServiceError("A matching SKU, phone or request already exists.", { code: "DUPLICATE", status: 409 });
          throw error;
        }
      }
      throw new ServiceError("Data changed while saving. Retry this request with the same request ID.", { code: "CONFLICT", status: 409 });
    },
  };
}
