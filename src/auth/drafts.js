import {requirePermission} from "./policy.js";
import {ServiceError} from "../domain/serviceError.js";
export async function handleDraft({request,path,principal,env}) {
  requirePermission(principal,"pos.create");
  const db=env.DB.withSession("first-primary"),userId=principal.user.id,shopId=principal.shopId;
  if(path==="/api/v1/pos-draft" && request.method==="GET") {
    const row=await db.prepare("SELECT data FROM app_pos_drafts WHERE userId=? AND shopId=? AND expiresAt>?").bind(userId,shopId,Date.now()).first();
    return row?JSON.parse(row.data):null;
  }
  if(path==="/api/v1/pos-draft/clear" && request.method==="POST") {
    await db.prepare("DELETE FROM app_pos_drafts WHERE userId=? AND shopId=?").bind(userId,shopId).run();return {cleared:true};
  }
  if(path!=="/api/v1/pos-draft" || request.method!=="POST")throw new ServiceError("Endpoint not found.",{status:404,code:"NOT_FOUND"});
  const input=await request.json();
  if(!input || typeof input!=="object" || !Array.isArray(input.cart) || input.cart.length>100 || input.cart.some(item=>
    typeof item.productId!=="string" || item.productId.length>100 || !Number.isInteger(item.qty) || item.qty<1 || item.qty>10000 || !Number.isFinite(Number(item.price)) || Number(item.price)<0))
    throw new ServiceError("Enter valid draft items.",{status:400,code:"INVALID_INPUT"});
  const text=(value,max)=>typeof value==="string"?value.slice(0,max):"";
  const draft={requestId:typeof input.requestId==="string" && /^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId)?input.requestId:null,cart:input.cart.map(item=>({productId:item.productId,qty:item.qty,price:Number(item.price),name:text(item.name,200),image:text(item.image,2000)})),
    customerName:text(input.customerName,200),customerPhone:text(input.customerPhone,20),discount:text(String(input.discount||""),30),discountMode:input.discountMode==="PERCENT"?"PERCENT":"FIXED",paymentMethod:text(input.paymentMethod,30),savedAt:new Date().toISOString()};
  await db.prepare("INSERT INTO app_pos_drafts(userId,shopId,data,updatedAt,expiresAt) VALUES(?,?,?,?,?) ON CONFLICT(userId,shopId) DO UPDATE SET data=excluded.data,updatedAt=excluded.updatedAt,expiresAt=excluded.expiresAt")
    .bind(userId,shopId,JSON.stringify(draft),Date.now(),Date.now()+604800000).run();
  return {saved:true};
}
