import { COLLECTIONS, VALUES, executeServiceOperation } from "./domain/operations.js";
import { ServiceError } from "./domain/serviceError.js";
import { DEFAULT_FEATURES } from "./domain/featureDefaults.js";

const scoped = new Set(["cart", "wishlist", "profile", "addresses", "sharedProducts"]);
const defaults = {
  themeConfig: {shop:"sunrise",dashboard:"classic"},
  features: DEFAULT_FEATURES, paymentConfig: { upiId: "", merchantName: "Aurelia Jewellery" },
  festivalFeed: { mode: "auto", festivalSlug: "diwali", from: "", to: "" },
  profile: { name: "", phone: "", email: "", address: "", landmark: "", city: "", state: "", pincode: "" },
  campaignImageCleanup: true,
};

export function operationResources(operation) {
  if (operation === "orders.status") return ["orders", "products", "inventoryMovements"];
  if (operation === "payments.reference") return ["orders"];
  if (operation === "payments.confirm") return ["orders", "payments"];
  if (['customers.update','customers.remove'].includes(operation)) return ['customers','orders'];
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
  if (operation === 'dashboard.summary') return ['products','orders','productViews'];
  if (operation === 'search.suggestions') return ['products','customers','orders'];
  if (operation === "reports.summary" || operation === "search.all") return ["products", "customers", "orders"];
  if (operation === "notifications.list") return ["products", "orders"];
  throw new ServiceError("Unknown service operation.", { code: "NOT_IMPLEMENTED", status: 404 });
}

export function createD1Adapter(db, { sessionId, audience }) {
  return {
    async execute(operation, input) {
      if (operation === 'products.list') return listProductPage(db,input);
      if (operation === 'products.get') return getProduct(db,input.id);
      const resources = operationResources(operation);
      for (let attempt = 0; attempt < 4; attempt++) {
        const database = db.withSession("first-primary");
        const queries = [database.prepare("SELECT version FROM data_version WHERE id = 1")];
        for (const resource of resources) {
          const scope = scoped.has(resource) ? sessionId : "shop";
          // Customer history is session scoped; owner demo history spans the shop.
          queries.push(database.prepare(`SELECT id, ${readProjection(operation,resource)} AS data FROM records WHERE resource = ? AND scope = ?${resource === "orders" && audience === "customer" ? " AND json_extract(data, '$.sessionId') = ?" : ""} ORDER BY rowid`)
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
        if (!dirty.size) {
          if (operation === 'dashboard.summary') await attachDashboardImages(database,result);
          return result;
        }
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

async function listProductPage(db, query = {}) {
  const page=Number(query.page ?? 1),pageSize=Number(query.pageSize ?? 50);
  if (!Number.isInteger(page) || page<1 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>200) throw new ServiceError('Invalid pagination; pageSize must be 1–200.',{code:'INVALID_INPUT',status:400});
  const clauses=["resource = ?","scope = ?"], params=['products','shop'];
  const term=String(query.query || '').trim().toLowerCase();
  if (term) {
    const fields=['id','name','customer','phone','sku','category','type','purity','city','email','displayId','orderNumber'];
    clauses.push('('+fields.map(field=>"instr(lower(coalesce(json_extract(data,'$."+field+"'),'')),?)>0").join(' OR ')+')');
    params.push(...fields.map(()=>term));
  }
  for (const field of ['status','channel','paymentStatus','productId','customerId','orderId','category','type','purity']) if(query[field]!=null && query[field]!=='ALL') {clauses.push("json_extract(data, '$."+field+"') = ?");params.push(query[field]);}
  if (query.sku) {clauses.push("lower(trim(json_extract(data,'$.sku'))) = ?");params.push(String(query.sku).trim().toLowerCase());}
  const stock="coalesce(cast(json_extract(data,'$.stock') as real),0)";
  if (query.stock && query.stock!=='ALL') {const condition={IN_STOCK:stock+'>0',LOW_STOCK:stock+'>0 AND '+stock+'<=2',OUT_OF_STOCK:stock+'<=0'}[query.stock];if (!condition) throw new ServiceError('Invalid stock filter.',{code:'INVALID_INPUT',status:400});clauses.push('('+condition+')');}
  if (query.addedFrom) {clauses.push("substr(json_extract(data,'$.addedAt'),1,10) >= ?");params.push(query.addedFrom);}
  if (query.addedTo) {clauses.push("substr(json_extract(data,'$.addedAt'),1,10) <= ?");params.push(query.addedTo);}
  const sorting={updated:"coalesce(julianday(json_extract(data,'$.updatedAt')),julianday(json_extract(data,'$.addedAt')),0) DESC, id",name:"json_extract(data,'$.name') COLLATE NOCASE, id",priceLow:"cast(json_extract(data,'$.price') as real), id",stockLow:stock+', id'};
  const order=query.sort ? sorting[query.sort] || sorting.updated : 'rowid';
  const where=clauses.join(' AND '),database=db.withSession('first-primary');
  const [count,rows]=await database.batch([database.prepare('SELECT count(*) AS total FROM records WHERE '+where).bind(...params),database.prepare('SELECT data FROM records WHERE '+where+' ORDER BY '+order+' LIMIT ? OFFSET ?').bind(...params,pageSize,(page-1)*pageSize)]);
  return {items:rows.results.map(row=>JSON.parse(row.data)),total:Number(count.results[0].total),page,pageSize};
}

// Read-only overview/search operations leave photo galleries and pricing snapshots in D1.
function readProjection(operation,resource) {
  let fields;
  if (operation==='dashboard.summary') {
    if(resource==='products')fields=['id','name','sku','category','stock'];
    if(resource==='orders') {
      const fields=['id','displayId','orderNumber','customer','channel','total','status','createdAt','paymentStatus','payment','balanceDue','presentationFallback'];
      return "json_object("+fields.map(field=>"'"+field+"',json_extract(data,'$."+field+"')").join(',')+",'itemCount',(SELECT coalesce(sum(cast(json_extract(value,'$.qty') as real)),0) FROM json_each(data,'$.items')),'lineCount',coalesce(json_array_length(data,'$.items'),0),'firstItem',json_object('name',json_extract(data,'$.items[0].name')))";
    }
  }
  if (operation==='search.suggestions') {
    if(resource==='products')fields=['id','name','sku','category','type','purity'];
    if(resource==='customers')fields=['id','name','phone','email','city','archivedAt'];
    if(resource==='orders') {
      const fields=['id','displayId','orderNumber','customer','phone','status'];
      return "json_object("+fields.map(field=>"'"+field+"',json_extract(data,'$."+field+"')").join(',')+",'items',json((SELECT coalesce(json_group_array(json_object('name',json_extract(value,'$.name'))),'[]') FROM json_each(data,'$.items'))))";
    }
  }
  return fields ? "json_object("+fields.map(field=>"'"+field+"',json_extract(data,'$."+field+"')").join(',')+")" : 'data';
}
async function attachDashboardImages(database,summary) {
  const requests=[['products',summary.popularProducts,"$.image"],['orders',summary.pos,"$.items[0].image"]].filter(([,records])=>records.length);
  if(!requests.length)return;
  const images=await database.batch(requests.map(([resource,records,imagePath])=>database.prepare("SELECT id,json_extract(data,?) AS image FROM records WHERE resource=? AND scope='shop' AND id IN ("+records.map(()=>'?').join(',')+")").bind(imagePath,resource,...records.map(record=>record.id))));
  requests.forEach(([resource,records],index)=>{const byId=new Map(images[index].results.map(row=>[row.id,row.image]));for(const record of records){if(resource==='products')record.image=byId.get(record.id);else record.firstItem.image=byId.get(record.id);}});
}

async function getProduct(db,id) {
  if(typeof id!=='string' || !id.trim() || id.length>160) throw new ServiceError('A valid record ID is required.',{code:'INVALID_INPUT',status:400});
  const row=await db.withSession('first-primary').prepare("SELECT data FROM records WHERE resource='products' AND scope='shop' AND id=?").bind(id).first();
  const product=row ? JSON.parse(row.data) : null;
  if(!product || product.id!==id) throw new ServiceError('Record '+id+' was not found.',{code:'NOT_FOUND',status:404});
  return product;
}
