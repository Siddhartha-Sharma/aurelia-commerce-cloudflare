import { createRequestId } from "./requestId.js";
import { ServiceError, requireValue } from "./serviceError.js";

export const COLLECTIONS = Object.freeze(["products", "customers", "orders", "payments", "inventoryMovements", "addresses", "sharedProducts", "stockAlerts"]);
export const VALUES = Object.freeze(["cart", "wishlist", "profile", "features", "themeConfig", "paymentConfig", "shopProfile", "customPurities", "festivalFeed", "campaignImageCleanup", "productViews"]);
const clone = value => structuredClone(value);
const failMissing = id => { throw new ServiceError(`Record ${id} was not found.`, { code: "NOT_FOUND", status: 404 }); };
const money = value => Math.round(Number(value) * 100) / 100;
const newId = prefix => `${prefix}-${createRequestId()}`;
const validId = id => typeof id === "string" && id.trim().length > 0 && id.length <= 160;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function validateRecord(resource, record) {
  requireValue(isObject(record) && validId(record.id), "A record needs a stable ID.");
  if (resource === "products") {
    requireValue(typeof record.name === "string" && record.name.trim(), "Product name is required.");
    requireValue(Number.isInteger(record.stock) && record.stock >= 0, "Stock must be a non-negative integer.");
    requireValue(Number.isFinite(record.price) && record.price >= 0, "Price must be a non-negative number.");
  }
  if (resource === "addresses") {
    requireValue(typeof record.name === "string" && record.name.trim().length >= 2, "Recipient name is required.");
    requireValue(typeof record.phone === "string" && /^[6-9]\d{9}$/.test(record.phone), "Enter a valid Indian mobile number.");
    requireValue(typeof record.address === "string" && record.address.trim().length >= 5 && typeof record.city === "string" && record.city.trim().length >= 2 && typeof record.state === "string" && record.state.trim().length >= 2 && /^[1-9]\d{5}$/.test(record.pincode || ""), "A complete delivery address is required.");
  }
  if (resource === "customers") {
    requireValue(typeof record.name === "string" && record.name.trim(), "Customer name is required.");
    requireValue(typeof record.phone === "string" && /^[6-9]\d{9}$/.test(record.phone), "Enter a valid Indian mobile number.");
  }
}

function list(records, query = {}) {
  let result = records;
  if (query.query) {
    const term = String(query.query).trim().toLowerCase();
    result = result.filter(record => ["id", "name", "customer", "phone", "sku", "category", "type", "purity", "city"].some(key => String(record[key] || "").toLowerCase().includes(term)));
  }
  for (const field of ["status", "channel", "paymentStatus", "productId", "customerId", "orderId", "category", "type", "purity"]) {
    if (query[field] != null && query[field] !== "ALL") result = result.filter(record => record[field] === query[field]);
  }
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 50);
  requireValue(Number.isInteger(page) && page > 0 && Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 200, "Invalid pagination; pageSize must be 1–200.");
  return { items: clone(result.slice((page - 1) * pageSize, page * pageSize)), total: result.length, page, pageSize };
}

/** Pure domain dispatcher: adapters supply a transaction with read/write methods. */
export async function executeServiceOperation(tx, operation, input = {}, { now = () => new Date(), makeId = newId, sessionId } = {}) {
  requireValue(typeof operation === "string" && operation.split(".").length === 2 && isObject(input), "Invalid service request.");
  const [resource, action] = operation.split(".");
  const get = async (resourceName, id) => {
    requireValue(validId(id), "A valid record ID is required.");
    return (await tx.read(resourceName)).find(record => record.id === id) || failMissing(id);
  };
  const update = async (resourceName, id, changes) => {
    const records = await tx.read(resourceName);
    const record = records.find(item => item.id === id) || failMissing(id);
    const updated = { ...record, ...changes, id, updatedAt: now().toISOString() };
    await tx.write(resourceName, records.map(item => item.id === id ? updated : item));
    return updated;
  };

  if (COLLECTIONS.includes(resource) && ["list", "get"].includes(action)) {
    return action === "list" ? list(await tx.read(resource), input) : clone(await get(resource, input.id));
  }
  if (["products", "customers", "addresses", "sharedProducts"].includes(resource) && ["create", "update", "remove"].includes(action)) {
    const records = await tx.read(resource);
    if (action === "remove") {
      await get(resource, input.id);
      await tx.write(resource, records.filter(item => item.id !== input.id));
      return { id: input.id, removed: true };
    }
    requireValue(isObject(action === "create" ? input.record : input.changes), "Record data is required.");
    const record = action === "create" ? { ...input.record, id: input.record.id || makeId(resource.toUpperCase()) } : { ...await get(resource, input.id), ...input.changes, id: input.id };
    validateRecord(resource, record);
    requireValue(!records.some(item => item.id !== record.id && resource === "products" && record.sku && String(item.sku || "").trim().toLowerCase() === String(record.sku).trim().toLowerCase()), "SKU is already in use.", "DUPLICATE");
    requireValue(!records.some(item => item.id !== record.id && resource === "customers" && item.phone === record.phone), "Mobile number is already in use.", "DUPLICATE");
    if (action === "create") {
      requireValue(!records.some(item => item.id === record.id), "This ID is already in use.", "DUPLICATE");
      record.createdAt = now().toISOString();
      await tx.write(resource, [...records, record]);
      return clone(record);
    }
    return update(resource, record.id, record);
  }
  if (VALUES.includes(resource) && resource !== "productViews") {
    if (action === "get") return clone(await tx.read(resource));
    if (action === "save") {
      requireValue(input.data !== undefined, "Data is required.");
      if (["cart", "wishlist"].includes(resource)) requireValue(Array.isArray(input.data), "Data must be a list.");
      else if (resource === "campaignImageCleanup") requireValue(typeof input.data === "boolean", "Cleanup setting must be boolean.");
      else requireValue(isObject(input.data), "Data must be an object.");
      if (resource === "cart") requireValue(input.data.every(line => validId(line.productId) && Number.isInteger(line.qty) && line.qty > 0), "Invalid cart line.");
      if (resource === "wishlist") requireValue(input.data.every(validId), "Wishlist must contain product IDs.");
      if (resource === "shopProfile") {
        const p=input.data, decimal=v=>typeof v==='string' && /^\d+(\.\d{1,6})?$/.test(v) && Number.isFinite(Number(v)) && Number(v)<=1e12;
        requireValue(p.version===1 && typeof p.name==='string' && p.name.trim().length>0 && p.name.length<=150 && typeof p.state==='string' && p.state.length>0, "Shop name and state are required.");
        requireValue(['unconfigured','regular','composition','unregistered'].includes(p.gstStatus), "Choose a valid GST registration status.");
        if(['regular','composition'].includes(p.gstStatus)) requireValue(typeof p.gstin==='string' && /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.gstin), "Enter a valid GSTIN format.");
        requireValue(Array.isArray(p.rates) && p.rates.length<=30, "Use up to 30 purity rates.");
        const keys=new Set();
        for(const r of p.rates){
          requireValue(r && ['Gold','Silver','Platinum'].includes(r.metal) && typeof r.purity==='string' && r.purity.trim().length>0 && r.purity.length<=20, "Enter a metal and purity for every rate.");
          const key=r.metal+':'+r.purity.trim().toUpperCase();requireValue(!keys.has(key), "Each metal and purity needs one rate only.");keys.add(key);
          requireValue(r.ratePerGram==='' || (decimal(r.ratePerGram) && Number(r.ratePerGram)>0 && typeof r.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date))), "Enter a positive rate and its date.");
        }
        requireValue(p.pricing && ['fixed','perGram','percent'].includes(p.pricing.makingMode) && ['makingRate','wastagePercent','otherCharges'].every(k=>decimal(p.pricing[k])) && Number(p.pricing.wastagePercent)<=100 && (p.pricing.makingMode!=='percent'||Number(p.pricing.makingRate)<=100), "Enter valid making charges, wastage and other charges.");
      }
      if (resource === "paymentConfig") requireValue(typeof input.data.upiId === "string" && typeof input.data.merchantName === "string" && (!input.data.upiId || /^[\w.\-]{2,256}@[\w]{2,64}$/.test(input.data.upiId)), "Invalid payment configuration.");
      if (resource === "themeConfig") requireValue(['shop','dashboard'].every(area => ['classic','sunrise','ocean','golden',...(area === 'dashboard' ? ['darkGold','darkSilver','lightSilver'] : [])].includes(input.data[area])) && Object.keys(input.data).every(key => ['shop','dashboard','dashboardFont'].includes(key)) && (input.data.dashboardFont === undefined || ['manrope','inter','jakarta','dm','plex'].includes(input.data.dashboardFont)), "Choose a valid shop and dashboard theme preset.");
      if (resource === "features") requireValue(Object.values(input.data).every(value => typeof value === "boolean"), "Feature settings must be boolean.");
      await tx.write(resource, input.data);
      return clone(input.data);
    }
  }
  if (operation === "inventory.adjust") {
    requireValue(Number.isInteger(input.delta) && input.delta !== 0 && typeof input.reason === "string" && input.reason.trim(), "Provide an integer stock adjustment and reason.");
    const product = await get("products", input.productId);
    requireValue(product.stock + input.delta >= 0, "Stock cannot go below zero.", "INSUFFICIENT_STOCK");
    const updated = await update("products", product.id, { stock: product.stock + input.delta });
    const movement = { id: makeId("MOV"), productId: product.id, delta: input.delta, reason: input.reason.trim(), createdAt: now().toISOString() };
    await tx.write("inventoryMovements", [...await tx.read("inventoryMovements"), movement]);
    return { product: updated, movement };
  }
  if (operation === "inventory.lowStock") {
    requireValue(Number.isInteger(input.threshold) && input.threshold >= 0, "Invalid stock threshold.");
    return clone((await tx.read("products")).filter(product => product.stock <= input.threshold));
  }
  if (operation === "orders.place") {
    requireValue(validId(input.requestId), "A stable requestId is required for retry-safe ordering.");
    const existing = (await tx.read("orders")).find(order => order.requestId === input.requestId);
    if (existing) {
      requireValue(!existing.requestPayload || existing.requestPayload === JSON.stringify(input), "This request ID belongs to a different sale. Retry the original request.", "CONFLICT");
      return clone(existing);
    }
    requireValue(["POS", "ONLINE"].includes(input.channel), "Choose POS or ONLINE.");
    if (input.channel === "ONLINE") {
      requireValue((await tx.read("features")).showProductPrices !== false, "Checkout is paused while prices are being finalized.");
      if (input.paymentMethod === "UPI_DIRECT") requireValue(Boolean((await tx.read("paymentConfig")).upiId), "The shop has not configured its UPI ID.");
    }
    requireValue(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 100, "An order needs 1–100 items.");
    const products = await tx.read("products"), quantities = new Map();
    for (const line of input.items) {
      requireValue(validId(line.productId) && Number.isInteger(line.qty) && line.qty > 0, "Each item needs a product ID and positive integer quantity.");
      quantities.set(line.productId, (quantities.get(line.productId) || 0) + line.qty);
    }
    const items = [...quantities].map(([productId, qty]) => {
      const product = products.find(item => item.id === productId) || failMissing(productId);
      requireValue(product.stock >= qty, `${product.name} has insufficient stock.`, "INSUFFICIENT_STOCK");
      if (input.channel === "ONLINE") requireValue(!product.hidePrice, "This design's price is being finalized.");
      const submitted = input.items.find(item => item.productId === productId);
      const price = input.channel === "POS" && submitted.agreedPrice !== undefined ? Number(submitted.agreedPrice) : Number(product.price);
      requireValue(Number.isFinite(price) && price > 0, "Order prices must be positive.");
      return { productId, name: product.name, image: product.image || "", sku: product.sku || "", price: money(price), qty };
    });
    const subtotal = money(items.reduce((sum, line) => sum + line.price * line.qty, 0));
    const discount = input.channel === "POS" ? Number(input.discount ?? 0) : 0;
    requireValue(Number.isFinite(discount) && discount >= 0 && discount <= subtotal, "Invalid discount.");
    const total = money(subtotal - discount);
    const received = input.channel === "POS" ? Number(input.amountReceived ?? 0) : 0;
    requireValue(Number.isFinite(received) && received >= 0, "Invalid amount received.");
    const customer = input.customer || {};
    requireValue(isObject(customer), "Invalid customer details.");
    if (input.channel === "ONLINE") {
      requireValue(typeof customer.name === "string" && customer.name.trim(), "Customer name is required.");
      requireValue(typeof customer.phone === "string" && /^[6-9]\d{9}$/.test(customer.phone), "A valid mobile number is required.");
      requireValue(typeof customer.address === "string" && customer.address.trim().length >= 5 && typeof customer.city === "string" && customer.city.trim().length >= 2 && typeof customer.state === "string" && customer.state.trim().length >= 2 && /^[1-9]\d{5}$/.test(customer.pincode || ""), "A complete delivery address is required.");
      requireValue(["COD", "UPI_DIRECT"].includes(input.paymentMethod), "Use COD or direct UPI until server gateway verification is connected.");
    } else requireValue(["CASH", "UPI", "CARD"].includes(input.paymentMethod), "Invalid in-store payment method.");
    const timestamp = now().toISOString();
    const order = {
      id: makeId(input.channel === "POS" ? "POS" : "ORD"), requestId: input.requestId, requestPayload: JSON.stringify(input),
      ...(sessionId ? { sessionId } : {}),
      customer: String(customer.name || "Walk-in Customer").trim(), phone: String(customer.phone || "").trim(),
      address: customer.address || "", city: customer.city || "", state: customer.state || "", pincode: customer.pincode || "", landmark: customer.landmark || "",
      channel: input.channel, status: input.channel === "POS" ? "COMPLETED" : "CONFIRMED",
      payment: input.paymentMethod, paymentMethod: input.paymentMethod,
      subtotal, discount: money(discount), total, amountReceived: money(received),
      paymentStatus: received >= total ? "PAID" : received > 0 ? "PARTIAL" : "PENDING",
      balanceDue: money(Math.max(0, total - received)), changeDue: money(Math.max(0, received - total)), createdAt: timestamp, items,
    };
    await tx.write("products", products.map(product => quantities.has(product.id) ? { ...product, stock: product.stock - quantities.get(product.id) } : product));
    await tx.write("orders", [order, ...await tx.read("orders")]);
    await tx.write("inventoryMovements", [...await tx.read("inventoryMovements"), ...items.map(line => ({ id: makeId("MOV"), orderId: order.id, productId: line.productId, delta: -line.qty, reason: "SALE", createdAt: timestamp }))]);
    await tx.write("payments", [...await tx.read("payments"), { id: makeId("PAY"), orderId: order.id, method: input.paymentMethod, amountReceived: money(received), status: order.paymentStatus, createdAt: timestamp }]);
    if (order.phone) {
      const customers = await tx.read("customers"), match = customers.find(item => item.phone === order.phone);
      if (match) await update("customers", match.id, { purchases: Number(match.purchases || 0) + 1, spend: money(Number(match.spend || 0) + total) });
      else if (/^[6-9]\d{9}$/.test(order.phone)) await tx.write("customers", [...customers, { id: makeId("CUS"), ...customer, name: order.customer, phone: order.phone, purchases: 1, spend: total }]);
    }
    // Cart belongs to the caller's session; the live adapter must keep sessions isolated.
    if (input.channel === "ONLINE") await tx.write("cart", []);
    return clone(order);
  }
  if (operation === "orders.status") {
    const order = await get("orders", input.id);
    if (input.status === "CANCELLED") {
      if(order.status === "CANCELLED")return clone(order);
      requireValue(order.channel === "ONLINE" && ["CONFIRMED", "PROCESSING"].includes(order.status) && !Number(order.amountReceived || 0), "Only unpaid, unshipped orders can be cancelled here. Paid orders need a refund workflow.");
      const products = await tx.read("products");
      await tx.write("products", products.map(product => {const line=order.items.find(item=>item.productId===product.id);return line?{...product,stock:product.stock+line.qty}:product;}));
      await tx.write("inventoryMovements", [...await tx.read("inventoryMovements"), ...order.items.map(line=>({id:makeId("MOV"),orderId:order.id,productId:line.productId,delta:line.qty,reason:"CANCELLATION",createdAt:now().toISOString()}))]);
      return update("orders", input.id, {status:"CANCELLED", balanceDue:0, paymentStatus:"CANCELLED"});
    }
    requireValue(order.status !== "CANCELLED", "A cancelled order cannot resume delivery.");
    const sequence = ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
    requireValue(order.channel === "ONLINE" && sequence.includes(input.status), "Invalid website delivery status.");
    requireValue(sequence.indexOf(input.status) >= sequence.indexOf(order.status), "Delivery status cannot move backwards.");
    return update("orders", input.id, { status: input.status });
  }
  if (operation === "payments.reference") {
    requireValue(typeof input.reference === "string" && input.reference.trim().length > 0 && input.reference.length <= 160, "Enter a payment reference.");
    return update("orders", input.orderId, { paymentReference: input.reference.trim() });
  }
  if (operation === "payments.confirm") {
    const order = await get("orders", input.orderId), received = Number(input.amountReceived);
    requireValue(order.status !== "CANCELLED", "Cancelled orders need a separate refund/reconciliation workflow.");
    requireValue(Number.isFinite(received) && received >= Number(order.amountReceived || 0), "Enter the cumulative amount received; it cannot decrease.");
    const status = received >= order.total ? "PAID" : received > 0 ? "PARTIAL" : "PENDING";
    const updated = await update("orders", order.id, { amountReceived: money(received), balanceDue: money(Math.max(0, order.total - received)), changeDue: money(Math.max(0, received - order.total)), paymentStatus: status });
    const payments = await tx.read("payments"), previous = payments.find(payment => payment.orderId === order.id);
    const payment = { ...(previous || { id: makeId("PAY"), orderId: order.id, method: order.paymentMethod }), amountReceived: money(received), status, updatedAt: now().toISOString() };
    await tx.write("payments", previous ? payments.map(item => item.id === previous.id ? payment : item) : [...payments, payment]);
    return clone(updated);
  }
  if (operation === "stockAlerts.subscribe") {
    await get("products", input.productId);
    requireValue(typeof input.contact === "string" && input.contact.trim(), "A contact is required.");
    const alerts = await tx.read("stockAlerts");
    const previous = alerts.find(alert => alert.productId === input.productId && alert.contact.toLowerCase() === input.contact.trim().toLowerCase());
    if (previous) return clone(previous);
    const alert = { ...input, id: makeId("ALERT"), contact: input.contact.trim(), createdAt: now().toISOString() };
    await tx.write("stockAlerts", [...alerts, alert]);
    return clone(alert);
  }
  if (operation === "analytics.recordView") {
    requireValue(["customer", "owner"].includes(input.audience), "Invalid audience.");
    await get("products", input.productId);
    const counts = await tx.read("productViews"), previous = Number(counts[input.productId]?.count || 0);
    if (input.audience === "owner") return { count: previous, counted: false };
    counts[input.productId] = { count: previous + 1, updatedAt: now().toISOString() };
    await tx.write("productViews", counts);
    return { count: previous + 1, counted: true };
  }
  if (operation === "analytics.trending") {
    requireValue(Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 100, "Trending limit must be 1–100.");
    const counts = await tx.read("productViews"), products = await tx.read("products");
    return products.map(product => ({ product: clone(product), views: Number(counts[product.id]?.count || 0) })).filter(item => item.views > 0).sort((a, b) => b.views - a.views || a.product.id.localeCompare(b.product.id)).slice(0, input.limit);
  }
  if (operation === "analytics.counts") return clone(await tx.read("productViews"));
  if (operation === "reports.summary") {
    const orders = await tx.read("orders");
    const activeOrders = orders.filter(order => order.status !== "CANCELLED");
    return { orderCount: orders.length, totalSales: money(activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)), amountReceived: money(activeOrders.reduce((sum, order) => sum + Math.min(Number(order.total || 0), Number(order.amountReceived ?? (order.paymentStatus === "PAID" ? order.total : 0))), 0)), pendingPaymentCount: activeOrders.filter(order => ["PENDING", "PARTIAL"].includes(order.paymentStatus)).length, productCount: (await tx.read("products")).length, customerCount: (await tx.read("customers")).length };
  }
  if (operation === "notifications.list") {
    const products = await tx.read("products"), orders = await tx.read("orders");
    return [
      { id: "low-stock", path: "/inventory?stock=LOW_STOCK", records: products.filter(product => product.stock > 0 && product.stock <= 2) },
      { id: "out-of-stock", path: "/inventory?stock=OUT_OF_STOCK", records: products.filter(product => product.stock <= 0) },
      { id: "fulfilment", path: "/manage-orders?review=fulfilment", records: orders.filter(order => (order.channel || "ONLINE") === "ONLINE" && !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)) },
      { id: "payments", path: "/manage-orders?review=payments", records: orders.filter(order => order.status !== "CANCELLED" && (Number(order.balanceDue || 0) > 0 || ["PENDING", "PARTIAL"].includes(order.paymentStatus || order.payment))) },
    ].filter(group => group.records.length).map(group => ({ ...group, count: group.records.length }));
  }
  if (operation === "search.all") {
    requireValue(typeof input.query === "string", "Search text is required.");
    if (!input.query.trim()) return { products: [], customers: [], orders: [] };
    return Object.fromEntries(await Promise.all(["products", "customers", "orders"].map(async name => [name, list(await tx.read(name), { query: input.query, pageSize: 20 }).items])));
  }
  throw new ServiceError("Unknown service operation.", { code: "NOT_IMPLEMENTED", status: 404 });
}
