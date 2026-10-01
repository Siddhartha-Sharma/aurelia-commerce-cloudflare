import test from 'node:test';
import assert from 'node:assert/strict';
import { executeServiceOperation } from '../src/domain/operations.js';
import { operationResources } from '../src/d1Adapter.js';
test('backend product queries use independent domain rules', async () => {
  const tx = { read: async () => [{id:'P1', name:'Gold Ring', stock:2, price:100}] };
  const result = await executeServiceOperation(tx, 'products.get', {id:'P1'}, {sessionId:'test-session', audience:'customer'});
  assert.equal(result.id, 'P1');
  await assert.rejects(executeServiceOperation(tx, 'products.get', {id:'missing'}, {}), {code:'NOT_FOUND'});
});
test('D1 order transaction includes stock and payment resources', () => {
  const resources = operationResources('orders.place');
  for (const name of ['products','orders','payments','inventoryMovements']) assert.ok(resources.includes(name));
});
