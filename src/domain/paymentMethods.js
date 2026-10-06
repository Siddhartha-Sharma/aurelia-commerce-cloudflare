// Canonical IDs are stored in orders/payments; labels are for display only.
export const PAYMENT_METHODS = Object.freeze({
  COD: Object.freeze({id:'COD',label:'Cash on Delivery',channels:['ONLINE'],provider:'manual',enabled:true,requiresUpi:false}),
  UPI_DIRECT: Object.freeze({id:'UPI_DIRECT',label:'Direct UPI',channels:['ONLINE'],provider:'manual',enabled:true,requiresUpi:true}),
  CASH: Object.freeze({id:'CASH',label:'Cash',channels:['POS'],provider:'manual',enabled:true,requiresUpi:false}),
  UPI: Object.freeze({id:'UPI',label:'UPI',channels:['POS'],provider:'manual',enabled:true,requiresUpi:false}),
  BANK_TRANSFER: Object.freeze({id:'BANK_TRANSFER',label:'Bank Transfer',channels:['ONLINE','POS'],provider:'manual',enabled:true,requiresUpi:false}),
  CARD: Object.freeze({id:'CARD',label:'Card',channels:['POS'],provider:'manual',enabled:true,requiresUpi:false}),
  // Enabling a browser key alone must never enable an unverified gateway.
  RAZORPAY: Object.freeze({id:'RAZORPAY',label:'Online payment',channels:['ONLINE'],provider:'razorpay',enabled:false,requiresUpi:false}),
});
const legacyIds={'Cash on Delivery':'COD','Direct UPI':'UPI_DIRECT',Cash:'CASH',Card:'CARD'};
export function getPaymentMethod(id) {const key=Object.hasOwn(legacyIds,id)?legacyIds[id]:id;return Object.hasOwn(PAYMENT_METHODS,key)?PAYMENT_METHODS[key]:null;}
export function paymentMethodLabel(id) {return getPaymentMethod(id)?.label || id || 'Not recorded';}
export function methodsForChannel(channel) {return Object.values(PAYMENT_METHODS).filter(method=>method.channels.includes(channel));}
export function paymentMethodError(id,channel,config={}) {
  const {upiId,enabledMethods}=config;
  const method=Object.hasOwn(PAYMENT_METHODS,id)?PAYMENT_METHODS[id]:null;
  if(!method || !method.channels.includes(channel))return 'Choose a valid payment method.';
  if(!method.enabled)return 'Online payment is not available yet. Choose another payment method.';
  if(Array.isArray(enabledMethods) && !enabledMethods.includes(id))return 'This payment method is not accepted by the shop. Choose another method.';
  if(method.requiresUpi && upiId!==undefined && !String(upiId).trim())return 'UPI is not available yet. Choose Cash on Delivery.';
  return '';
}
export function canConfirmManualPayment(order) {
  const method=getPaymentMethod(order.paymentMethod || order.payment);
  return Boolean(method?.enabled && method.provider==='manual' && order.paymentStatus!=='PAID' && order.status!=='CANCELLED');
}


export function normalizePaymentConfig(value={}) {
  const upiId=String(value.upiId || '').trim();
  const legacy=['COD','CASH','UPI','CARD',...(upiId?['UPI_DIRECT']:[])];
  return {version:1,upiId,merchantName:String(value.merchantName || 'Aurelia Jewellery').trim(),
    enabledMethods:Array.isArray(value.enabledMethods)?[...value.enabledMethods]:legacy,
    defaultOnline:value.defaultOnline ?? 'COD',defaultPos:value.defaultPos ?? 'CASH',
    upiQrImage:value.upiQrImage || '',
    bank:{accountHolder:'',accountNumber:'',ifsc:'',bankName:'',...value.bank}};
}
export function defaultPaymentMethod(channel,config={}) {
  const settings=normalizePaymentConfig(config),preferred=channel==='ONLINE'?settings.defaultOnline:settings.defaultPos;
  if(!paymentMethodError(preferred,channel,settings))return preferred;
  return methodsForChannel(channel).find(method=>!paymentMethodError(method.id,channel,settings))?.id || '';
}
export function validatePaymentSettings(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return 'Enter valid payment settings.';
  if(typeof value.upiId!=='string' || typeof value.merchantName!=='string' || value.merchantName.length>60)return 'Enter a merchant name of up to 60 characters.';
  if(value.upiId && !/^[\w.\-]{2,256}@[\w]{2,64}$/.test(value.upiId))return 'Enter a valid UPI ID.';
  if(value.enabledMethods!==undefined && (!Array.isArray(value.enabledMethods) || value.enabledMethods.length>7 || new Set(value.enabledMethods).size!==value.enabledMethods.length || value.enabledMethods.some(id=>!Object.hasOwn(PAYMENT_METHODS,id) || !PAYMENT_METHODS[id].enabled)))return 'Choose supported payment methods.';
  if(value.bank!==undefined && (!value.bank || typeof value.bank!=='object' || Array.isArray(value.bank)))return 'Enter valid bank details.';
  const settings=normalizePaymentConfig(value);
  if(settings.enabledMethods.includes('UPI_DIRECT') && !settings.upiId)return 'Add your UPI ID before enabling online UPI.';
  const bank=settings.bank;
  if(Object.values(bank).some(field=>typeof field!=='string' || field.length>100))return 'Enter valid bank details.';
  if(settings.enabledMethods.includes('BANK_TRANSFER') && (!bank.accountHolder.trim() || !/^\d{6,34}$/.test(bank.accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc) || !bank.bankName.trim()))return 'Enter account holder, account number, bank name and a valid IFSC.';
  if(typeof settings.upiQrImage!=='string' || settings.upiQrImage.length>220000 || (settings.upiQrImage && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(settings.upiQrImage)))return 'Upload a PNG or JPG QR image up to 150 KB.';
  for(const channel of ['ONLINE','POS']) {
    const id=channel==='ONLINE'?settings.defaultOnline:settings.defaultPos;
    if(typeof id!=='string' || paymentMethodError(id,channel,settings))return 'Choose an enabled default payment method for '+(channel==='ONLINE'?'online checkout.':'counter sales.');
  }
  return '';
}
