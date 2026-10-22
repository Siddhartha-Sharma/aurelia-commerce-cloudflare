import {ServiceError} from "../domain/serviceError.js";

/** Replaceable delivery adapter; no plaintext token logging or browser mail credentials. */
export function createMailSender(env) {
  return async ({to,subject,text}) => {
    if (!env.AUTH_EMAIL_FROM || !env.RESEND_API_KEY)
      throw new ServiceError("Email delivery is not configured. Contact the shop owner.",
        {status:503,code:"EMAIL_NOT_CONFIGURED"});
    const response = await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer " + env.RESEND_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({from:env.AUTH_EMAIL_FROM,to:[to],subject,text}),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ServiceError("Email could not be sent. Please try again.",
      {status:503,code:"EMAIL_DELIVERY_FAILED"});
  };
}
