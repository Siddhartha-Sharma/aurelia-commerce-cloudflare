import {createD1Adapter} from "../d1Adapter.js";
import {ServiceError} from "../domain/serviceError.js";
import {readServiceRequest,normalizeOrderInput,normalizeCustomerInput,storefrontProjection} from "./v1.js";
import {createAureliaIdentity} from "../auth/context.js";
import {resolveGuest,claimGuestBag} from "../auth/guest.js";
import {authorizeOperation,can} from "../auth/policy.js";
import {boundedRequest} from "./body.js";
import {handleDraft} from "../auth/drafts.js";
import {handleTeam} from "../auth/team.js";

interface Env {
  DB:D1Database; DEMO_MODE:string; ALLOWED_ORIGINS:string; AUTH_ENABLED?:string;
  AUTH_SECRET?:string; AUTH_BASE_URL?:string; AUTH_SHOP_ID?:string; AUTH_APP_NAME?:string;
  GOOGLE_CLIENT_ID?:string; GOOGLE_CLIENT_SECRET?:string; AUTH_EMAIL_FROM?:string; RESEND_API_KEY?:string;
  DEMO_RESET_ENABLED?:string;
  APP_PROFILE?:string;
}
const customerOperations = new Set([
  "products.list","products.get","orders.list","orders.get","orders.place","payments.reference",
  "cart.get","cart.save","wishlist.get","wishlist.save","profile.get","profile.save",
  "addresses.list","addresses.get","addresses.create","addresses.update","addresses.remove",
  "sharedProducts.list","sharedProducts.get","sharedProducts.create","sharedProducts.update","sharedProducts.remove",
  "themeConfig.get","features.get","paymentConfig.get","festivalFeed.get","campaignImageCleanup.get",
  "analytics.recordView","analytics.trending","analytics.counts","stockAlerts.subscribe",
]);
const identityCache = new WeakMap<object,{key:string,value:ReturnType<typeof createAureliaIdentity>}>();
function identityFor(env:Env) {
  const key = JSON.stringify([env.AUTH_SECRET,env.AUTH_BASE_URL,env.AUTH_SHOP_ID,env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,env.RESEND_API_KEY,env.AUTH_EMAIL_FROM,env.ALLOWED_ORIGINS,env.APP_PROFILE]);
  const cached = identityCache.get(env.DB);
  if (cached?.key === key) return cached.value;
  const value = createAureliaIdentity(env);
  identityCache.set(env.DB,{key,value});
  return value;
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const origin = request.headers.get("Origin");
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    const headers:Record<string,string> = {"Content-Type":"application/json","Cache-Control":"no-store",
      "Vary":"Origin","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
    if (origin && origins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
      headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, X-Aurelia-Session, X-Aurelia-Audience, X-Aurelia-Identity, X-Aurelia-Profile";
      headers["Access-Control-Expose-Headers"] = "X-Aurelia-Profile";
    }
    const json = (body:unknown,status = 200) => new Response(JSON.stringify(body),{status,headers});
    if(env.APP_PROFILE)headers["X-Aurelia-Profile"]=env.APP_PROFILE;
    if ((env.APP_PROFILE && !["dev","demo","prod"].includes(env.APP_PROFILE)) ||
        (env.DEMO_RESET_ENABLED==="true" && env.APP_PROFILE!=="demo") ||
        (env.APP_PROFILE==="prod" && (env.AUTH_ENABLED!=="true" || env.DEMO_MODE!=="false")))
      return json({error:{code:"PROFILE_NOT_CONFIGURED",message:"This environment is not configured correctly."}},503);
    if (origin && !origins.includes(origin))
      return json({error:{code:"ORIGIN_DENIED",message:"This origin is not allowed."}},403);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
    const requestedProfile=request.headers.get("X-Aurelia-Profile");
    if(requestedProfile && requestedProfile!==env.APP_PROFILE)
      return json({error:{code:"PROFILE_MISMATCH",message:"The app and data service use different environments. Open the correct app address."}},409);
    const path = new URL(request.url).pathname;
    const enabled = env.AUTH_ENABLED === "true";
    const transport = new URL(request.url);
    const localHttp = transport.protocol === "http:" && ["localhost","127.0.0.1"].includes(transport.hostname);
    if (enabled && transport.protocol !== "https:" && !localHttp)
      return json({error:{code:"HTTPS_REQUIRED",message:"Open the secure HTTPS address to continue."}},403);
    if (enabled && transport.protocol === "https:")
      headers["Strict-Transport-Security"] = "max-age=15552000";
    if (env.AUTH_ENABLED && !["true","false"].includes(env.AUTH_ENABLED))
      return json({error:{code:"INVALID_CONFIGURATION",message:"Authentication configuration is invalid."}},503);
    if (["/api/health","/api/v1/health"].includes(path) && request.method === "GET") {
      try {
        await env.DB.prepare("SELECT version FROM data_version WHERE id=1").first();
        return json({data:{ready:true,profile:env.APP_PROFILE||"legacy",mode:enabled ? "authenticated" : env.DEMO_MODE === "true" ? "demo" : "locked",apiVersion:"v1"}});
      } catch { return json({error:{code:"DATABASE_NOT_READY",message:"Apply database migrations first."}},503); }
    }
    try {
      if (env.DEMO_RESET_ENABLED === "true") {
        const maintenance=await env.DB.prepare("SELECT phase,baselineAt FROM demo_reset_state WHERE id=1").first<{phase:string,baselineAt:number|null}>();
        if (!maintenance?.baselineAt || maintenance.phase !== "idle")
          return json({error:{code:"DEMO_MAINTENANCE",message:"The demo is being prepared. Please try again shortly."}},503);
      }
      if (enabled) {
        if (request.method === "POST" && (!origin || !origins.includes(origin)))
          throw new ServiceError("This request needs an approved origin.",{status:403,code:"ORIGIN_DENIED"});
        if (Number(request.headers.get("Content-Length") || 0) > 1048576)
          throw new ServiceError("Request is too large.",{status:413,code:"REQUEST_TOO_LARGE"});
        if(request.method==="POST")request=await boundedRequest(request,["/api/services","/api/v1/services"].includes(path)?1048576:65536);
        const identity = identityFor(env);
        if (path.startsWith("/api/v1/auth/") && path !== "/api/v1/auth/context") {
          const raw = await identity.provider.handle(request);
          const merged = new Headers(raw.headers);
          for (const [key,value] of Object.entries(headers)) if (key !== "Content-Type") merged.set(key,value);
          return new Response(raw.body,{status:raw.status,headers:merged});
        }
        const principal = await identity.principal(request.headers);
        const expected=request.headers.get("X-Aurelia-Identity");
        if(expected && expected !== (principal.user?.id || "guest"))throw new ServiceError("The signed-in account changed. Refresh this page before continuing.",{status:409,code:"IDENTITY_CHANGED"});
        const guest = await resolveGuest(request,env.AUTH_SECRET!,env.DB,Boolean(principal.user),env.APP_PROFILE);
        if (guest.cookie) headers["Set-Cookie"] = guest.cookie;
        const scope = principal.user ? "account:" + principal.shopId + ":" + principal.user.id : guest.scope;
        if (path === "/api/v1/auth/context" && request.method === "GET") {
          if (principal.user?.emailVerified && !principal.needsMfaEnrollment &&
            !principal.needsMfaVerification && !principal.disabled)
            await claimGuestBag(env.DB,guest,principal.user.id,scope);
          if (principal.disabled) throw new ServiceError("Your access has been disabled. Contact the shop owner.",{status:403,code:"ACCOUNT_DISABLED"});
          return json({data:{enabled:true,configured:true,...principal,providers:identity.provider.providers,
            emailDeliveryConfigured:Boolean(env.AUTH_EMAIL_FROM && env.RESEND_API_KEY)}});
        }
        if(path.startsWith("/api/v1/pos-draft"))return json({data:await handleDraft({request,path,principal,env})});
        if (path.startsWith("/api/v1/team") || path.startsWith("/api/v1/access/") ||
          path.startsWith("/api/v1/support") || path === "/api/v1/invitations/accept")
          return json({data:await handleTeam({request,path,identity,principal,env})});
        if (!["/api/services","/api/v1/services"].includes(path) || request.method !== "POST")
          return json({error:{code:"NOT_FOUND",message:"Endpoint not found."}},404);
        const {operation,input:rawInput} = await readServiceRequest(request);
        const input = operation === "orders.place" ? normalizeOrderInput(rawInput) : ["customers.create","customers.update"].includes(operation)?normalizeCustomerInput(operation,rawInput):rawInput;
        authorizeOperation(principal,operation,input);
        if (operation === "products.list" && !can(principal,"inventory.view") && !can(principal,"inventory.edit")) input.view = "storefront";
        if (operation === "analytics.recordView") input.audience =
          ["OWNER","STAFF","DEVELOPER"].includes(principal.role) ? "owner" : "customer";
        const businessAccess = ["OWNER","STAFF"].includes(principal.role) ||
          (principal.role === "DEVELOPER" && can(principal,"orders.read"));
        const restrictedView = input.view === "storefront" || operation === "payments.reference";
        const data = await createD1Adapter(env.DB,{sessionId:scope,
          audience:businessAccess && !restrictedView ? "owner" : "customer",actor:principal}).execute(operation,input);
        return json({data:await storefrontProjection(env.DB,operation,data,principal,input)});
      }
      if (path === "/api/v1/auth/context" && request.method === "GET")
        return json({data:{enabled:false,configured:false,user:null,session:null,permissions:[],
          providers:{emailPassword:false,google:false}}});
      if (!["/api/services","/api/v1/services"].includes(path) || request.method !== "POST")
        return json({error:{code:"NOT_FOUND",message:"Endpoint not found."}},404);
      if (env.DEMO_MODE !== "true")
        return json({error:{code:"DEMO_DISABLED",message:"Data endpoints are locked until authentication is configured."}},503);
      const {operation,input} = await readServiceRequest(request);
      const sessionId = request.headers.get("X-Aurelia-Session") || "";
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(sessionId))
        throw new ServiceError("A demo session ID is required.",{status:400,code:"INVALID_SESSION"});
      const audience = request.headers.get("X-Aurelia-Audience") === "owner" ? "owner" : "customer";
      if (audience === "customer" && !customerOperations.has(operation))
        throw new ServiceError("This operation is for the owner demo.",{status:403,code:"FORBIDDEN"});
      if (operation === "orders.place" && audience === "customer" && input.channel !== "ONLINE")
        throw new ServiceError("Use website checkout.",{status:403,code:"FORBIDDEN"});
      if (operation === "analytics.recordView") input.audience = audience;
      return json({data:await createD1Adapter(env.DB,{sessionId,audience}).execute(operation,input)});
    } catch (error:unknown) {
      if (error && typeof error === "object" && "code" in error && "status" in error && "message" in error)
        return json({error:{code:error.code,message:error.message}},Number(error.status));
      console.error("Aurelia request failed",{path});
      return json({error:{code:"SERVICE_UNAVAILABLE",message:"The service could not complete this request. Check configuration and retry."}},503);
    }
  },
} satisfies ExportedHandler<Env>;
