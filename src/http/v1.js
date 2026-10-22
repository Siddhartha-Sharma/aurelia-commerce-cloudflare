import {ServiceError} from "../domain/serviceError.js";

export async function readServiceRequest(request) {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new ServiceError("Use JSON content.",{status:415,code:"INVALID_CONTENT_TYPE"});
  if (Number(request.headers.get("Content-Length") || 0) > 1048576)
    throw new ServiceError("Request is too large.",{status:413,code:"REQUEST_TOO_LARGE"});
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1048576)
    throw new ServiceError("Request is too large.",{status:413,code:"REQUEST_TOO_LARGE"});
  let body;
  try { body = JSON.parse(raw); }
  catch { throw new ServiceError("Invalid JSON.",{status:400,code:"INVALID_JSON"}); }
  if (!body || typeof body.operation !== "string" || !/^[a-zA-Z]+\.[a-zA-Z]+$/.test(body.operation) ||
    !body.input || typeof body.input !== "object" || Array.isArray(body.input))
    throw new ServiceError("Invalid service request.",{status:400,code:"INVALID_INPUT"});
  return body;
}
export function normalizeOrderInput(input) {
  const permitted = new Set(["requestId","channel","customer","paymentMethod","items","discount","amountReceived"]);
  const customerFields = new Set(["name","phone","address","city","state","pincode","landmark"]);
  const result = Object.fromEntries(Object.entries(input).filter(([key]) => permitted.has(key)));
  if (input.customer && typeof input.customer === "object" && !Array.isArray(input.customer))
    result.customer = Object.fromEntries(Object.entries(input.customer).filter(([key]) => customerFields.has(key)));
  return result;
}
export function normalizeCustomerInput(operation,input) {
  const key=operation==="customers.create"?"record":"changes";
  const record=input[key];
  if(!record || typeof record!=="object" || Array.isArray(record))return input;
  const fields=new Set(["name","phone","email","address","landmark","city","state","pincode"]);
  const details=Object.fromEntries(Object.entries(record).filter(([field])=>fields.has(field)));
  return {...input,[key]:operation==="customers.create"?{...details,purchases:0,spend:0}:details};
}
/** Public DTOs are separate from the owner persistence model. */
export async function storefrontProjection(db,operation,data,principal,input = {}) {
  const privateInventory = ["OWNER","STAFF"].includes(principal.role) &&
    (principal.permissions.includes("inventory.edit") || principal.permissions.includes("inventory.view")) &&
    !principal.needsMfaEnrollment && !principal.needsMfaVerification && principal.user?.emailVerified;
  if(operation==="shopProfile.get" && !principal.permissions.includes("settings.read"))return {version:data.version || 1,rates:data.rates || [],pricing:data.pricing || {}};
  if(["search.all","search.suggestions"].includes(operation)) {
    const permissions=principal.permissions || [];
    return {...data,customers:permissions.includes("customers.read")?data.customers:[],orders:permissions.includes("orders.read")?data.orders:[],products:permissions.includes("inventory.view")?data.products:[]};
  }
  if (!["products.list","products.get","paymentConfig.get","cart.get","cart.save"].includes(operation)) return data;
  if (operation === "paymentConfig.get") return {
    version:data.version || 1,merchantName:data.merchantName,upiId:data.upiId,upiQrImage:data.upiQrImage,
    enabledMethods:data.enabledMethods,defaultOnline:data.defaultOnline,defaultPos:data.defaultPos,
    bank:{accountHolder:data.bank?.accountHolder,accountNumber:data.bank?.accountNumber,
      bankName:data.bank?.bankName,ifsc:data.bank?.ifsc},
  };
  if (privateInventory && input.view !== "storefront") return data;
  const feature = await db.prepare("SELECT data FROM records WHERE resource='features' AND scope='shop' AND id='value'").first();
  const visible = !feature || JSON.parse(feature.data).showProductPrices !== false;
  function product(record) {
    if (!record) return record;
    const fields = ["id","sku","name","category","type","purity","image","images","stock","featured",
      "netWeight","grossWeight","weight","description","addedAt","updatedAt","hidePrice"];
    const result = Object.fromEntries(fields.filter(key => Object.hasOwn(record,key)).map(key => [key,record[key]]));
    if (visible && !record.hidePrice) result.price = record.price;
    return result;
  }
  if (operation === "products.list") return {...data,items:data.items.map(product)};
  if (operation === "products.get") return product(data);
  if (["cart.get","cart.save"].includes(operation) && Array.isArray(data))
    return Promise.all(data.map(async line => {
      const row = await db.prepare("SELECT data FROM records WHERE resource='products' AND scope='shop' AND id=?").bind(line.productId).first();
      const record = row ? JSON.parse(row.data) : null;
      const safe = {productId:line.productId,name:record?.name || line.name,qty:line.qty};
      if (visible && record && !record.hidePrice) safe.price = record.price;
      return safe;
    }));
  return data;
}
