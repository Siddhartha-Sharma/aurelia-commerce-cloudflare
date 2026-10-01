import { createD1Adapter } from "./d1Adapter.js";
import { ServiceError } from "./domain/serviceError.js";

interface Env { DB: D1Database; DEMO_MODE: string; ALLOWED_ORIGINS: string; }
const customerOperations = new Set([
  "products.list", "products.get", "orders.list", "orders.get", "orders.place", "payments.reference",
  "cart.get", "cart.save", "wishlist.get", "wishlist.save", "profile.get", "profile.save",
  "addresses.list", "addresses.get", "addresses.create", "addresses.update", "addresses.remove",
  "sharedProducts.list", "sharedProducts.get", "sharedProducts.create", "sharedProducts.update", "sharedProducts.remove",
  "features.get", "paymentConfig.get", "festivalFeed.get", "campaignImageCleanup.get",
  "analytics.recordView", "analytics.trending", "analytics.counts", "stockAlerts.subscribe",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
    if (origin && origins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, X-Aurelia-Session, X-Aurelia-Audience";
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.includes(origin)) return json({ error: { code: "ORIGIN_DENIED", message: "This origin is not allowed." } }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (path === "/api/health" && request.method === "GET") {
      try { await env.DB.prepare("SELECT version FROM data_version WHERE id = 1").first(); return json({ data: { ready: true, mode: env.DEMO_MODE === "true" ? "demo" : "locked" } }); }
      catch { return json({ error: { code: "DATABASE_NOT_READY", message: "Apply D1 migrations first." } }, 503); }
    }
    if (path !== "/api/services" || request.method !== "POST") return json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }, 404);
    // Authentication is intentionally deferred. Default deployment fails closed.
    // Enable only on a disposable demo database containing synthetic data.
    if (env.DEMO_MODE !== "true") return json({ error: { code: "DEMO_DISABLED", message: "Data endpoints are locked until demo mode or authentication is configured." } }, 503);
    try {
      if (!request.headers.get("Content-Type")?.includes("application/json")) throw new ServiceError("Use JSON content.", { status: 415 });
      if (Number(request.headers.get("Content-Length") || 0) > 1024 * 1024) throw new ServiceError("Request is too large.", { status: 413 });
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) throw new ServiceError("Request is too large.", { status: 413 });
      let body;
      try { body = JSON.parse(raw); } catch { throw new ServiceError("Invalid JSON.", { status: 400 }); }
      if (!body || typeof body.operation !== "string" || !body.input || typeof body.input !== "object" || Array.isArray(body.input)) throw new ServiceError("Invalid service request.", { status: 400 });
      const sessionId = request.headers.get("X-Aurelia-Session") || "";
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) throw new ServiceError("A demo session ID is required.", { status: 400, code: "INVALID_SESSION" });
      const audience = request.headers.get("X-Aurelia-Audience") === "owner" ? "owner" : "customer";
      if (audience === "customer" && !customerOperations.has(body.operation)) throw new ServiceError("This operation is for the owner demo.", { status: 403, code: "FORBIDDEN" });
      if (body.operation === "orders.place" && audience === "customer" && body.input.channel !== "ONLINE") throw new ServiceError("Use website checkout.", { status: 403 });
      if (body.operation === "analytics.recordView") body.input.audience = audience;
      const data = await createD1Adapter(env.DB, { sessionId, audience }).execute(body.operation, body.input);
      return json({ data });
    } catch (error) {
      if (error instanceof ServiceError) return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
      console.error("Aurelia API request failed", error instanceof Error ? error.message : "Unknown error");
      return json({ error: { code: "DATABASE_ERROR", message: "The data service could not complete this request." } }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
