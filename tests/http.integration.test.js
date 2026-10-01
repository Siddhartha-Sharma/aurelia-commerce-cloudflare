import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.AURELIA_TEST_API_URL;
test('Worker health and HTTP guardrails against real local D1', {skip:!base}, async () => {
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
  assert.equal((await (await fetch(base+'/health')).json()).data.ready,true);
  const headers={'Content-Type':'application/json','X-Aurelia-Session':crypto.randomUUID(),'X-Aurelia-Audience':'customer'};
  const post=(body, extra={})=>fetch(base+'/services',{method:'POST',headers:{...headers,...extra},body});
  let response=await post(JSON.stringify({operation:'customers.list',input:{}}));
  assert.equal(response.status,403);
  assert.equal((await response.json()).error.code,'FORBIDDEN');
  response=await post(JSON.stringify({operation:'products.list',input:{}}),{'X-Aurelia-Session':''});
  assert.equal((await response.json()).error.code,'INVALID_SESSION');
  assert.equal((await post('{bad json')).status,400);
  assert.equal((await post('{}',{Origin:'https://not-allowed.example'})).status,403);
  assert.equal((await fetch(base+'/missing')).status,404);
});
