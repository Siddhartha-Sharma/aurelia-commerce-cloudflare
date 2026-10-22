// Explicit operator verification of the isolated demo, using synthetic data only.
import assert from "node:assert/strict";
import {readFile,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {createRequire} from "node:module";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {base32} from "@better-auth/utils/base32";
import {createOTP} from "@better-auth/utils/otp";
import {readProfile,root} from "./profiles.mjs";

async function main() {
  if(process.argv[2]!=="--confirm=aurelia-demo-db")throw new Error("This creates synthetic demo activity and then resets it. Explicit --confirm=aurelia-demo-db required.");
  const {configPath,config}=await readProfile("demo",{remote:true});
  const dir=path.join(root,".demo-private"),file=path.join(dir,"demo-access.json");
  const access=JSON.parse(await readFile(file,"utf8"));
  assert.equal(access.origin,config.vars.AUTH_BASE_URL);
  const base=access.origin,report={origin:base,checks:[],startedAt:new Date().toISOString()};
  const pass=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log("PASS "+name);};
  const persist=()=>writeFile(file,JSON.stringify(access,null,2),{mode:0o600});
  const run=args=>{const result=spawnSync(process.execPath,args,{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.account_id}});
    if(result.error || result.status!==0)throw new Error("Isolated demo operator step failed; inspect Cloudflare or the maintenance state.");return result.stdout;};
  const cli=path.join(root,"node_modules/wrangler/bin/wrangler.js");
  const query=sql=>JSON.parse(run([cli,"d1","execute","DB","--remote","--config",configPath,"--command",sql,"--json"])).flatMap(item=>item.results||[]);
  function browser() {
    const cookies=new Map();
    return {async call(route,body,{expected=200,profile="demo"}={}) {
      const started=Date.now();
      const response=await fetch(base+route,{method:body===undefined?"GET":"POST",redirect:"error",signal:AbortSignal.timeout(30000),
        headers:{Origin:base,"X-Aurelia-Profile":profile,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"}),
          Cookie:[...cookies].map(([key,value])=>key+"="+value).join("; ")},...(body===undefined?{}:{body:JSON.stringify(body)})});
      for(const cookie of response.headers.getSetCookie()) {
        const pair=cookie.split(";")[0],at=pair.indexOf("=");
        if(/max-age=0\b/i.test(cookie))cookies.delete(pair.slice(0,at));else cookies.set(pair.slice(0,at),pair.slice(at+1));
      }
      const payload=await response.json();
      assert.equal(response.status,expected,route+" failed: "+(payload.error?.code||"unexpected response"));
      if(expected===200)assert.equal(response.headers.get("X-Aurelia-Profile"),"demo");
      return {data:payload.data,error:payload.error,ms:Date.now()-started};
    },service(operation,input={},options){return this.call("/api/v1/services",{operation,input},options);}};
  }
  const anonymous=browser();
  const html=await fetch(base+"/login",{redirect:"error"});assert.equal(html.status,200);assert.match(await html.text(),/<script[^>]+src=/);
  await anonymous.call("/api/v1/health");pass("Hosted login page and same-origin API gateway");
  const anon=(await anonymous.call("/api/v1/auth/context")).data;
  assert.equal(anon.enabled,true);assert.equal(anon.providers.google,false);assert.equal(anon.emailDeliveryConfigured,false);
  await anonymous.service("orders.list",{}, {expected:401});
  await anonymous.service("products.list",{}, {expected:409,profile:"prod"});pass("Anonymous order access and wrong-profile requests denied");
  const logins={};
  for(const role of ["CUSTOMER","OWNER","STAFF"]) {
    const account=access.accounts.find(item=>item.role===role),client=browser();
    const login=await client.call("/api/v1/auth/sign-in/email",{email:account.email,password:account.password});
    if(role!=="CUSTOMER") {
      if(!account.mfa) {
        const context=(await client.call("/api/v1/auth/context")).data;
        assert.equal(context.needsMfaEnrollment,true);
        const enrollment=(await client.call("/api/v1/auth/two-factor/enable",{password:account.password})).data;
        account.mfa={totpURI:enrollment.totpURI,recoveryCodes:enrollment.backupCodes};await persist();
      }
      const secret=new URL(account.mfa.totpURI).searchParams.get("secret");
      const otp=createOTP(new TextDecoder().decode(base32.decode(secret)));
      let code=await otp.totp();
      const digest=createHash("sha256").update(code).digest("hex");
      if(query(`SELECT count(*) AS count FROM app_mfa_replay WHERE userId='${account.id}' AND codeHash='${digest}' AND expiresAt>${Date.now()}`)[0].count) {
        console.log("Waiting for the next authenticator interval; replay protection stays enabled.");
        await new Promise(resolve=>setTimeout(resolve,30250-Date.now()%30000));code=await otp.totp();
      }
      await client.call("/api/v1/auth/two-factor/verify-totp",{code});
    }
    const context=(await client.call("/api/v1/auth/context")).data;
    assert.equal(context.role,role);assert.equal(context.needsMfaEnrollment,false);assert.equal(context.needsMfaVerification,false);
    logins[role]=client;pass(role+" password login"+(role!=="CUSTOMER"?" and authenticator verification":""),{loginRoundTripMs:login.ms});
  }
  const customer=logins.CUSTOMER,owner=logins.OWNER,staff=logins.STAFF;
  const page=(await customer.service("products.list",{view:"storefront",page:1,pageSize:200})).data;
  assert.equal(page.total,89);
  const product=page.items.find(item=>item.stock>0 && item.price>0 && !item.hidePrice);assert.ok(product,"Need an in-stock priced product.");
  await customer.service("cart.save",{data:[{productId:product.id,qty:1}]});
  const order=(await customer.service("orders.place",{requestId:"demo-verification-"+randomUUID(),channel:"ONLINE",paymentMethod:"COD",
    items:[{productId:product.id,qty:1}],customer:{name:"Disposable Demo Buyer",phone:"9000000099",address:"123 Demo Street",city:"Demo City",state:"Bihar",pincode:"800001"}})).data;
  const orderPage=(await owner.service("orders.list")).data,orders=Array.isArray(orderPage)?orderPage:orderPage.items;
  assert.ok(orders.some(item=>item.id===order.id));
  await staff.service("orders.status",{id:order.id,status:"PROCESSING"});
  await owner.service("orders.status",{id:order.id,status:"DELIVERED"});
  await owner.service("payments.confirm",{orderId:order.id,amountReceived:order.total});
  await customer.service("customers.list",{}, {expected:403});
  await staff.service("products.remove",{id:product.id},{expected:403});
  await customer.service("cart.save",{data:[{productId:product.id,qty:1}]});
  await customer.service("wishlist.save",{data:[product.id]});
  await owner.service("campaignImageCleanup.save",{data:false});
  pass("Customer cart/COD order, owner review/payment, staff fulfilment and permission restrictions");

  const visitorId=randomUUID(),at=Date.now();
  const visitorSql=`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt,twoFactorEnabled) VALUES('${visitorId}','Disposable Reset Visitor','reset-${visitorId}@aurelia.example',1,${at},${at},0);`;
  const visitorFile=path.join(dir,"disposable-verification.sql");await writeFile(visitorFile,visitorSql,{mode:0o600});
  try {run([cli,"d1","execute","DB","--remote","--config",configPath,"--file",visitorFile,"--yes"]);}finally{await rm(visitorFile,{force:true});}
  const baseline=JSON.parse(await readFile(path.join(dir,"catalogue-copy-report.json"),"utf8"));
  run([path.join(root,"scripts/demoReset.mjs"),"reset","--confirm=aurelia-demo-db"]);
  const restored=query("SELECT resource,scope,id,data FROM records ORDER BY resource,id");
  assert.equal(createHash("sha256").update(JSON.stringify(restored)).digest("hex"),baseline.catalogueChecksum);
  assert.equal(query("SELECT count(*) AS count FROM auth_user")[0].count,3);
  assert.equal(query(`SELECT count(*) AS count FROM auth_user WHERE id='${visitorId}'`)[0].count,0);
  assert.equal(query("SELECT count(*) AS count FROM auth_session")[0].count,0);
  assert.equal((await customer.call("/api/v1/auth/context")).data.user,null);
  pass("Remote reset: visitor removed, activity cleared, sessions revoked, full catalogue/settings checksum restored");

  const require=createRequire(path.join(root,"../aurelia-commerce-ui/package.json")),QRCode=require("qrcode");
  for(const account of access.accounts.filter(item=>item.mfa))await QRCode.toFile(path.join(dir,account.role.toLowerCase()+"-authenticator.png"),account.mfa.totpURI,{width:320,margin:2});
  const lines=["# Hosted demo access — private operator handoff", "", "Demo: "+base,"", "Keep this file private. These are fictional test identities, not client accounts.",""];
  for(const account of access.accounts){lines.push("## "+account.role,"", "Email: `"+account.email+"`", "", "Password: `"+account.password+"`", "");
    if(account.mfa)lines.push("Authenticator setup: scan `"+account.role.toLowerCase()+"-authenticator.png` in this folder with Google/Microsoft Authenticator. It is a private reusable demo MFA key.","", "Recovery codes: `"+account.mfa.recoveryCodes.join("`, `")+"`","");}
  lines.push("Owner/staff: /login. Customer: /shop/sign-in.","", "After each demo, run `npm run demo:reset` in the API repository and confirm RESET. Products are retained. Google/new email signup/reset are unavailable until providers are configured.");
  await writeFile(path.join(dir,"DEMO-ACCESS.md"),lines.join("\n"),{mode:0o600});
  report.finishedAt=new Date().toISOString();report.productsPreserved=89;report.emailAndGoogleConfigured=false;
  await writeFile(path.join(dir,"hosted-demo-validation.json"),JSON.stringify(report,null,2));
  console.log("Hosted demo verification completed; clean state restored. Private credentials/authenticator QR handoff written without printing secrets.");
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
