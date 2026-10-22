// One-time operator tasks for the isolated hosted demo. Never copies visitor history.
import {readFile,writeFile,rm} from "node:fs/promises";
import {writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {readProfile,root} from "./profiles.mjs";

const action=process.argv[2];
const privateDir=path.join(root,".demo-private");
const keep=["products","shopProfile","customPurities","themeConfig","features","paymentConfig","festivalFeed","campaignImageCleanup"];
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
async function main() {
  if(!["catalogue","accounts","secret"].includes(action))throw new Error("Choose catalogue, accounts or secret; this is one-time isolated-demo operator setup.");
  const {configPath,config,db}=await readProfile("demo",{remote:true});
  const cli=path.join(root,"node_modules/wrangler/bin/wrangler.js");
  const run=(args,extra={})=>{
    const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024,
      env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.account_id},...extra});
    if(result.error || result.status!==0) {
      writeFileSync(path.join(privateDir,"last-setup-error.json"),JSON.stringify({action,status:result.status,
        error:result.error?.message,stderr:result.stderr,stdout:result.stdout},null,2),{mode:0o600});
      throw new Error("Cloudflare operation failed. Private diagnostics saved in .demo-private/last-setup-error.json; no secret or personal-data response is printed.");
    }
    return result.stdout;
  };
  const query=(sql,{source=false}={})=>{
    const result=JSON.parse(run(["d1","execute","DB","--remote","--config",source?path.join(root,"wrangler.jsonc"):configPath,
      ...(source?["--env","test"]:[]),"--command",sql,"--json"]));
    if(result.some(item=>item.success===false))throw new Error("Database query failed.");
    return result.flatMap(item=>item.results||[]);
  };
  const apply=async sql=>{
    const file=path.join(privateDir,"bootstrap.sql");
    await writeFile(file,sql,{mode:0o600,flag:"wx"});
    try {run(["d1","execute","DB","--remote","--config",configPath,"--file",file,"--yes"]);}
    finally {await rm(file,{force:true});}
  };
  if(action==="catalogue") {
    if(query("SELECT count(*) AS count FROM records")[0].count)throw new Error("Target already contains records. Refusing to overwrite an active demo.");
    const rows=query(`SELECT resource,scope,id,data FROM records WHERE scope='shop' AND resource IN (${keep.map(quote).join(",")}) ORDER BY resource,id`,{source:true});
    if(!rows.some(row=>row.resource==="products"))throw new Error("Source catalogue is empty.");
    // D1 limits individual SQL statements; existing image-bearing JSON rows may
    // exceed that limit even though they fit in a D1 row. Assemble bounded chunks
    // inside SQLite instead of putting one huge literal in an INSERT statement.
    const statements=["CREATE TABLE demo_catalogue_import(k TEXT NOT NULL,p INTEGER NOT NULL,v TEXT NOT NULL,PRIMARY KEY(k,p));"];
    for(const row of rows) {
      const k=randomUUID();
      for(let offset=0,part=0;offset<row.data.length;offset+=8000,part++)
        statements.push(`INSERT INTO demo_catalogue_import(k,p,v) VALUES(${quote(k)},${part},${quote(row.data.slice(offset,offset+8000))});`);
      statements.push(`INSERT INTO records(resource,scope,id,data) VALUES(${[row.resource,row.scope,row.id].map(quote).join(",")},(SELECT group_concat(v,'') FROM (SELECT v FROM demo_catalogue_import WHERE k=${quote(k)} ORDER BY p)));`);
      statements.push(`DELETE FROM demo_catalogue_import WHERE k=${quote(k)};`);
    }
    statements.push("DROP TABLE demo_catalogue_import;","UPDATE data_version SET version=version+1 WHERE id=1;");
    await apply(statements.join("\n"));
    const copied=query("SELECT resource,scope,id,data FROM records ORDER BY resource,id");
    const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if(digest(rows)!==digest(copied))throw new Error("Catalogue checksum did not match; keep the demo in maintenance.");
    const report={database:db.database_name,source:"aurelia-test-db (catalogue/settings only)",products:rows.filter(row=>row.resource==="products").length,
      records:rows.length,catalogueChecksum:digest(rows),visitorHistoryCopied:false};
    await writeFile(path.join(privateDir,"catalogue-copy-report.json"),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));return;
  }
  if(action==="secret") {
    const names=JSON.parse(run(["secret","list","--config",configPath]));
    if(names.some(item=>item.name==="AUTH_SECRET")){console.log("Existing demo AUTH_SECRET preserved.");return;}
    run(["secret","put","AUTH_SECRET","--config",configPath],{input:randomBytes(48).toString("base64url")});
    console.log("Random demo AUTH_SECRET stored in Cloudflare; no local copy created.");return;
  }
  if(query("SELECT count(*) AS count FROM auth_user")[0].count)throw new Error("Auth users already exist. Refusing to replace credentials or create duplicate reusable accounts.");
  const {hashPassword}=await import(pathToFileURL(path.join(root,"node_modules/@snort-intelligence/auth-server/src/password.js")).href);
  const now=Date.now(),accounts=[],sql=[];
  for(const role of ["OWNER","STAFF","CUSTOMER"]) {
    const id=randomUUID(),email=`demo.${role.toLowerCase()}@aurelia.example`,password="Aa1!"+randomBytes(18).toString("base64url");
    const hash=await hashPassword(password);
    accounts.push({id,role,email,password,name:"Demo "+role[0]+role.slice(1).toLowerCase()});
    sql.push(`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt,twoFactorEnabled) VALUES(${[id,accounts.at(-1).name,email].map(quote).join(",")},1,${now},${now},0);`);
    sql.push(`INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(${[randomUUID(),id,"credential",id,hash].map(quote).join(",")},${now},${now});`);
    if(role!=="CUSTOMER") {
      const permissions=role==="STAFF"?["pos.create","inventory.view","customers.read","customers.create","customers.update","orders.read","orders.fulfil","payments.confirm"]:[];
      sql.push(`INSERT INTO app_access(userId,shopId,role,permissions,disabled,createdAt,updatedAt) VALUES(${[id,"aurelia",role,JSON.stringify(permissions)].map(quote).join(",")},0,${now},${now});`);
    }
  }
  // Operator-only handoff is ACL-protected/ignored, not runtime password storage.
  await writeFile(path.join(privateDir,"demo-access.json"),JSON.stringify({origin:config.vars.AUTH_BASE_URL,accounts},null,2),{flag:"wx",mode:0o600});
  await apply(sql.join("\n"));
  await writeFile(path.join(root,"demo-reset.config.json"),JSON.stringify({purpose:"disposable-demo",accountId:config.account_id,
    databaseName:db.database_name,databaseId:db.database_id,workerConfig:"wrangler.demo.json",retainUserIds:accounts.map(item=>item.id)},null,2),{flag:"wx",mode:0o600});
  console.log("Three fictional, verified reusable accounts created. Only password hashes are stored in D1. Credentials are in the Windows-user-restricted .demo-private folder; values were not printed. Owner/staff MFA enrollment remains mandatory.");
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
