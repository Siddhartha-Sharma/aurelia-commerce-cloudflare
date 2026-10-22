import {randomToken} from "./repository.js";

function hex(bytes) { return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2,"0")).join(""); }
async function key(secret) {
  return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function resolveGuest(request, secret, db, authenticated, profile) {
  const name="aurelia_guest"+(profile?"_"+profile:"")+"=";
  const cookie = (request.headers.get("Cookie") || "").split(/;\s*/)
    .find(value => value.startsWith(name))?.slice(name.length);
  let id;
  if (cookie && /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(cookie)) {
    const [candidate,signature] = cookie.split(".");
    const valid = await crypto.subtle.verify("HMAC",await key(secret),
      Uint8Array.from(signature.match(/../g),part => parseInt(part,16)),
      new TextEncoder().encode(candidate));
    if (valid) id = candidate;
  }
  if (id && !authenticated) {
    const claimed = await db.prepare("SELECT guestId FROM app_guest_claims WHERE guestId=?").bind(id).first();
    if (claimed) id = null;
  }
  if (id) return {id,scope:"guest:" + id,cookie:null};
  id = randomToken();
  const signature = hex(await crypto.subtle.sign("HMAC",await key(secret),new TextEncoder().encode(id)));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {id,scope:"guest:" + id,cookie:name + id + "." + signature +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800" + secure};
}

/** Merge only server-owned guest bag/wishlist, never legacy orders or personal data. */
export async function claimGuestBag(db, guest, userId, accountScope) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const database = db.withSession("first-primary");
    if (await database.prepare("SELECT guestId FROM app_guest_claims WHERE guestId=?").bind(guest.id).first()) return;
    const [version,rows,products] = await database.batch([
      database.prepare("SELECT version FROM data_version WHERE id=1"),
      database.prepare("SELECT resource,scope,data FROM records WHERE resource IN ('cart','wishlist') AND scope IN (?,?)")
        .bind(guest.scope,accountScope),
      database.prepare("SELECT id,json_object('id',id,'name',json_extract(data,'$.name'),'price',json_extract(data,'$.price'),'stock',json_extract(data,'$.stock')) AS data FROM records WHERE resource='products' AND scope='shop'"),
    ]);
    const get = (resource,scope) => JSON.parse(rows.results.find(row => row.resource === resource && row.scope === scope)?.data || "[]");
    const catalogue = new Map(products.results.map(row => [row.id,JSON.parse(row.data)]));
    const merged = new Map();
    for (const line of [...get("cart",accountScope),...get("cart",guest.scope)]) {
      const product = catalogue.get(line.productId);
      if (!product || !Number.isInteger(line.qty) || line.qty < 1 || product.stock < 1) continue;
      const previous = merged.get(product.id);
      merged.set(product.id,{productId:product.id,name:product.name,price:product.price,
        qty:Math.min(product.stock,100,(previous?.qty || 0) + line.qty)});
      if (merged.size >= 100) break;
    }
    const wishlist = [...new Set([...get("wishlist",accountScope),...get("wishlist",guest.scope)])]
      .filter(id => catalogue.has(id)).slice(0,100);
    try {
      await database.batch([
        database.prepare("INSERT INTO commit_guard(id,expected) VALUES(1,?)").bind(version.results[0].version),
        database.prepare("DELETE FROM commit_guard WHERE id=1"),
        database.prepare("INSERT INTO app_guest_claims(guestId,userId,claimedAt) VALUES(?,?,?)")
          .bind(guest.id,userId,Date.now()),
        database.prepare("INSERT INTO records(resource,scope,id,data) VALUES('cart',?,'value',?) ON CONFLICT(resource,scope,id) DO UPDATE SET data=excluded.data")
          .bind(accountScope,JSON.stringify([...merged.values()])),
        database.prepare("INSERT INTO records(resource,scope,id,data) VALUES('wishlist',?,'value',?) ON CONFLICT(resource,scope,id) DO UPDATE SET data=excluded.data")
          .bind(accountScope,JSON.stringify(wishlist)),
        database.prepare("DELETE FROM records WHERE resource IN ('cart','wishlist') AND scope=?").bind(guest.scope),
        database.prepare("UPDATE data_version SET version=version+1 WHERE id=1"),
      ]);
      return;
    } catch (error) {
      if (String(error.message).includes("AURELIA_CONFLICT")) continue;
      if (String(error.message).includes("UNIQUE") &&
        await database.prepare("SELECT guestId FROM app_guest_claims WHERE guestId=?").bind(guest.id).first()) return;
      throw error;
    }
  }
  throw new Error("Guest bag changed while signing in. Refresh and retry.");
}
