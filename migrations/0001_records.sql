-- Provider-independent domain payloads are stored per record, not whole-table snapshots.
CREATE TABLE records (
  resource TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'shop',
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY (resource, scope, id)
);
CREATE UNIQUE INDEX products_sku ON records (upper(json_extract(data, '$.sku')))
  WHERE resource = 'products' AND json_extract(data, '$.sku') <> '';
CREATE UNIQUE INDEX customers_phone ON records (json_extract(data, '$.phone'))
  WHERE resource = 'customers' AND json_extract(data, '$.phone') <> '';
CREATE UNIQUE INDEX orders_request ON records (json_extract(data, '$.requestId'))
  WHERE resource = 'orders' AND json_extract(data, '$.requestId') IS NOT NULL;
CREATE INDEX orders_session ON records (resource, json_extract(data, '$.sessionId'));
CREATE INDEX order_status ON records (resource, json_extract(data, '$.status'));
CREATE TABLE data_version (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL);
INSERT INTO data_version VALUES (1, 0);
CREATE TABLE commit_guard (id INTEGER PRIMARY KEY CHECK(id = 1), expected INTEGER NOT NULL);
CREATE TRIGGER verify_commit BEFORE INSERT ON commit_guard
WHEN NEW.expected != (SELECT version FROM data_version WHERE id = 1)
BEGIN SELECT RAISE(ABORT, 'AURELIA_CONFLICT'); END;
