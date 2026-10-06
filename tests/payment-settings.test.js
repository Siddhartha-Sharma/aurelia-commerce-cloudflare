import test from 'node:test';
import assert from 'node:assert/strict';
import {executeServiceOperation} from '../src/domain/operations.js';
import {normalizePaymentConfig,validatePaymentSettings,defaultPaymentMethod,paymentMethodError} from '../src/domain/paymentMethods.js';
const customer={name:'Verification Customer',phone:'9000000003',address:'Verification street 123',city:'Hyderabad',state:'Telangana',pincode:'500008'};
const product=(id,price,purity,featured=false)=>({id,name:featured?'Temple Necklace':'Gold Ring',sku:id,type:'Gold',category:'Rings',price,purity,featured,stock:4});
function fixture(config={upiId:'shop@upi',merchantName:'Verification Shop'}) {
 const records=new Map([['paymentConfig',config],['features',{showProductPrices:true}],['products',[product('P1',100,'22K'),product('P2',75000,'18K',true),product('P3',200000,'24K')]]]);
 let serial=0;
 const tx={read:async name=>structuredClone(records.get(name) ?? (['products','orders','customers','payments','inventoryMovements'].includes(name)?[]:{})),write:async(name,value)=>records.set(name,structuredClone(value))};
 return {records,run:(operation,input)=>executeServiceOperation(tx,operation,input,{sessionId:'verification-session',makeId:prefix=>prefix+'-'+(++serial)})};
}
const online=(method='COD',requestId=crypto.randomUUID())=>({requestId,channel:'ONLINE',paymentMethod:method,items:[{productId:'P1',qty:1}],customer});
test('legacy manual settings keep COD/counter defaults and configured direct UPI',()=> {
 const config=normalizePaymentConfig({upiId:'shop@upi'});
 assert.equal(defaultPaymentMethod('ONLINE',config),'COD');
 assert.equal(defaultPaymentMethod('POS',config),'CASH');
 assert.ok(config.enabledMethods.includes('UPI_DIRECT'));
});
test('owner selection validates enabled defaults and bank destinations',()=> {
 const config=normalizePaymentConfig({enabledMethods:['COD','CASH']});
 assert.equal(validatePaymentSettings(config),'');
 assert.ok(validatePaymentSettings({...config,defaultOnline:'UPI_DIRECT'}));
 assert.ok(validatePaymentSettings({...config,enabledMethods:['COD','CASH','RAZORPAY']}));
 assert.ok(validatePaymentSettings({...config,enabledMethods:['COD','CASH','BANK_TRANSFER']}));
 assert.ok(paymentMethodError('toString','ONLINE',config));
});
test('disabled methods cannot create orders or deduct stock',async()=> {
 const f=fixture(normalizePaymentConfig({enabledMethods:['COD','CASH']}));
 await assert.rejects(f.run('orders.place',online('UPI_DIRECT')),{code:'INVALID_INPUT'});
 assert.equal(f.records.get('products')[0].stock,4);
 await assert.rejects(f.run('orders.place',{...online('CARD'),channel:'POS'}),{code:'INVALID_INPUT'});
});
test('COD starts pending and repeated requests do not deduct stock twice',async()=> {
 const f=fixture(),input=online();
 const first=await f.run('orders.place',input);
 assert.equal(first.paymentStatus,'PENDING');assert.equal(first.amountReceived,0);
 assert.equal((await f.run('orders.place',input)).id,first.id);
 assert.equal(f.records.get('products')[0].stock,3);
});
test('bank-transfer order snapshots destination and a reference never marks paid',async()=> {
 const config=normalizePaymentConfig({enabledMethods:['BANK_TRANSFER','CASH'],defaultOnline:'BANK_TRANSFER',bank:{accountHolder:'Verification Shop',accountNumber:'12345678901',ifsc:'HDFC0001234',bankName:'HDFC'}});
 assert.equal(validatePaymentSettings(config),'');
 const f=fixture(config),order=await f.run('orders.place',online('BANK_TRANSFER'));
 assert.equal(order.paymentStatus,'PENDING');assert.deepEqual(order.paymentDetails.bank,config.bank);
 const updated=await f.run('payments.reference',{orderId:order.id,reference:'VERIFY-REFERENCE'});
 assert.equal(updated.paymentStatus,'PENDING');
 const paid=await f.run('payments.confirm',{orderId:order.id,amountReceived:100});
 assert.equal(paid.paymentStatus,'PAID');
});
test('Razorpay remains unavailable and cannot bypass server verification',async()=> {
 await assert.rejects(fixture().run('orders.place',online('RAZORPAY')),{code:'INVALID_INPUT'});
});
test('shop pagination filters all records before slicing and retains purity metadata',async()=> {
 const f=fixture();
 const page=await f.run('products.list',{view:'storefront',budget:'50to100',sort:'priceHigh',pageSize:1,page:1});
 assert.equal(page.total,1);assert.equal(page.items[0].id,'P2');
 assert.deepEqual(page.purities,['18K','22K','24K']);
 const wedding=await f.run('products.list',{view:'storefront',query:'wedding',featuredOnly:true,pageSize:12});
 assert.equal(wedding.total,1);assert.equal(wedding.items[0].id,'P2');
 const high=await f.run('products.list',{view:'storefront',sort:'priceHigh',pageSize:1,page:2});
 assert.equal(high.total,3);assert.equal(high.items[0].id,'P2');
});

