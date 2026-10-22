import {createAuthServer, AuthServerError} from "@snort-intelligence/auth-server";
import {createIdentityRepository, hashToken} from "./repository.js";
import {createMailSender} from "./mail.js";
import {effectivePermissions, requireVerified, requireFreshMfa} from "./policy.js";
import {ServiceError} from "../domain/serviceError.js";

const publicPaths = new Set(["/sign-in/email","/sign-up/email","/sign-in/social","/callback/google",
  "/verify-email","/send-verification-email","/request-password-reset","/reset-password","/get-session","/sign-out"]);
const verificationPaths = new Set(["/two-factor/verify-totp","/two-factor/verify-backup-code"]);

export function createAureliaIdentity(env) {
  const shopId = env.AUTH_SHOP_ID || "aurelia";
  const repository = createIdentityRepository(env.DB,shopId);
  const sendEmail = createMailSender(env);
  let provider;
  const principal = async headers => {
    const identity = await provider.getSession(headers);
    if (!identity) return {user:null,session:null,role:"GUEST",permissions:[],shopId,disabled:false,
      needsMfaEnrollment:false,needsMfaVerification:false,mfaVerifiedAt:null};
    const access = await repository.access(identity.user.id);
    const assurance = await repository.assurance(identity.session.id);
    const grant = access?.role === "DEVELOPER" ? await repository.supportGrant(identity.user.id) : null;
    const role = access?.role || "CUSTOMER";
    return {
      user:{id:identity.user.id,name:identity.user.name,email:identity.user.email,
        emailVerified:Boolean(identity.user.emailVerified),twoFactorEnabled:Boolean(identity.user.twoFactorEnabled)},
      session:{id:identity.session.id,expiresAt:identity.session.expiresAt},
      role,shopId,disabled:Boolean(access?.disabled),
      permissions:effectivePermissions(access,grant),
      needsMfaEnrollment:role !== "CUSTOMER" && !identity.user.twoFactorEnabled,
      needsMfaVerification:Boolean(identity.user.twoFactorEnabled && !assurance),
      mfaVerifiedAt:assurance?.verifiedAt || null,
    };
  };
  provider = createAuthServer({
    database:env.DB, secret:env.AUTH_SECRET, baseURL:env.AUTH_BASE_URL,
    trustedIpHeaders:["cf-connecting-ip"],
    trustedOrigins:(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean),
    appName:env.AUTH_APP_NAME || "Aurelia Jewellery",cookiePrefix:"aurelia-auth"+(env.APP_PROFILE?"-"+env.APP_PROFILE:""),
    google:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET},sendEmail,
    async beforeRequest({request,path}) {
      if (["/sign-up/email","/send-verification-email","/request-password-reset"].includes(path) &&
          (!env.AUTH_EMAIL_FROM || !env.RESEND_API_KEY))
        throw new AuthServerError("Email delivery is not available yet. Use an existing verified account.",{status:503,code:"EMAIL_NOT_CONFIGURED"});
      if (publicPaths.has(path)) return;
      const current = await principal(request.headers);
      if (!current.user) {
        if (verificationPaths.has(path)) return; // Provider validates the pending credential challenge.
        throw new AuthServerError("Sign in to continue.", {status:401,code:"AUTH_REQUIRED"});
      }
      if (current.disabled) throw new AuthServerError("Your access has been disabled.",{code:"ACCOUNT_DISABLED"});
      if (!current.user.emailVerified) throw new AuthServerError("Verify your email to continue.",{code:"EMAIL_UNVERIFIED"});
      if (verificationPaths.has(path)) {
        const failure = await repository.mfaFailures(current.user.id);
        if (failure && failure.count >= 5 && Date.now() - failure.windowStart < 900000)
          throw new AuthServerError("Too many attempts. Try again in 15 minutes.",{status:429,code:"ACCOUNT_TEMPORARILY_LOCKED"});
        const body = await request.clone().json();
        if (body.trustDevice) throw new AuthServerError("Remembering verification is not enabled.",{status:400,code:"INVALID_INPUT"});
        return;
      }
      if (["/two-factor/enable","/two-factor/get-totp-uri"].includes(path) && !current.user.twoFactorEnabled) return;
      try {
        requireVerified(current);
        if (path === "/two-factor/disable" && current.role !== "CUSTOMER")
          throw new ServiceError("Shop team accounts must keep two-step verification enabled.",{status:403,code:"MFA_POLICY"});
        if (["/two-factor/enable","/two-factor/disable","/two-factor/generate-backup-codes","/change-password",
          "/link-social","/unlink-account"].includes(path) && current.user.twoFactorEnabled)
          requireFreshMfa(current);
      } catch (error) {
        if (error instanceof ServiceError) throw new AuthServerError(error.message,{status:error.status,code:error.code});
        throw error;
      }
    },
    async onMfaVerified(session,{request,path}) {
      const body = await request.clone().json();
      const digest = path === "/two-factor/verify-totp" ? await hashToken(String(body.code)) : null;
      try { await repository.mfaVerified(session,digest); }
      catch (error) {
        if (String(error.message).includes("UNIQUE"))
          throw new AuthServerError("That code was already used. Enter the next code.",{status:401,code:"CODE_ALREADY_USED"});
        throw error;
      }
    },
    onMfaFailed:session => session?.user ? repository.failMfa(session.user.id) : Promise.resolve(),
  });
  return {provider,principal,repository,shopId,sendEmail};
}
