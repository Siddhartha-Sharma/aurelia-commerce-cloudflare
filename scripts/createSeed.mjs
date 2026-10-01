import { writeFile } from "node:fs/promises";
import { products, initialCustomers, initialOrders } from "../fixtures/mockData.js";
import { DEFAULT_FEATURES } from "../src/domain/featureDefaults.js";
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const data = { products, ...(process.argv.includes("--demo-history") ? { customers: initialCustomers, orders: initialOrders } : {}) };
const sql = ["-- Synthetic demo seed. INSERT OR IGNORE preserves existing rows; never resets stock/history."];
for (const [resource, records] of Object.entries(data)) {
  for (const record of records) sql.push(`INSERT OR IGNORE INTO records(resource, scope, id, data) VALUES(${quote(resource)}, 'shop', ${quote(record.id)}, ${quote(JSON.stringify(record))});`);
}
sql.push(`INSERT OR IGNORE INTO records(resource, scope, id, data) VALUES('features', 'shop', 'value', ${quote(JSON.stringify(DEFAULT_FEATURES))});`);
sql.push("UPDATE data_version SET version = version + 1 WHERE id = 1;");
await writeFile(new URL("../seed.sql", import.meta.url), sql.join("\n"));
console.log("Created seed.sql. Review before importing; existing records are preserved.");
