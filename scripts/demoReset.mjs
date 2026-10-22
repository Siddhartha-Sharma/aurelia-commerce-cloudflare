import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createInterface} from "node:readline/promises";
import {selectProfile,readProfile} from "./profiles.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2), command=args.shift();
const options=new Map(args.map(value=>{const at=value.indexOf("=");return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
const help=`After each demo, run ONE command from the API repository:
  npm run demo:reset

Review the displayed dedicated demo target and type RESET when asked.
Validation, maintenance, cleanup, stock restore and result checks run together.

Administrator setup/optional diagnostics:
  npm run demo:baseline -- --confirm=<demo-database-name>
  npm run demo:status
  npm run demo:reset -- --dry-run
  npm run demo:reset -- --resume=<maintenance-id>

First copy demo-reset.config.example.json to demo-reset.config.json and
wrangler.demo.example.json to wrangler.demo.json. Use a NEW, dedicated demo DB.
No data backup/export is created. --dry-run performs reads only.
See docs/DEMO-RESET.md. These commands never target the configured test/prod DB.`;
const keepResources=["products","shopProfile","customPurities","themeConfig","features","paymentConfig","festivalFeed","campaignImageCleanup"];
const clearResources=["customers","orders","payments","inventoryMovements","addresses","sharedProducts","stockAlerts","cart","wishlist","profile","productViews"];
const authTables=["auth_user","auth_session","auth_account","auth_verification","auth_two_factor","auth_rate_limit",
  "app_access","app_session_assurance","app_mfa_replay","app_mfa_failures","app_invitations","app_audit","app_support","app_guest_claims","app_pos_drafts"];
const clearTables=["app_session_assurance","auth_session","auth_verification","auth_rate_limit","app_mfa_replay","app_mfa_failures",
  "app_invitations","app_audit","app_support","app_guest_claims","app_pos_drafts"];
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const list=values=>values.map(quote).join(",");

async function main() {
  if(options.has("--help") || command==="help") { console.log(help);return; }
  if(!["status","baseline","reset"].includes(command))throw new Error(help);
  for(const key of options.keys())if(!["--config","--dry-run","--confirm","--resume","--replace","--profile"].includes(key))throw new Error("Unknown option: "+key);
  const profile=selectProfile(options.get("--profile"),"demo");
  if(profile!=="demo")throw new Error("Reset is available only in the demo profile. Dev/prod data cannot be reset with this command.");
  const selected=await readProfile(profile,{remote:true});
  const configPath=path.resolve(root,String(options.get("--config")||"demo-reset.config.json"));
  let config;
  try { config=JSON.parse(await readFile(configPath,"utf8")); }
  catch { throw new Error("Create the dedicated demo configuration first. See docs/DEMO-RESET.md. No database was modified."); }
  const workerPath=path.resolve(root,config.workerConfig||"");
  if(workerPath!==selected.configPath)throw new Error("Reset configuration must use the selected dedicated demo profile.");
  if(workerPath===path.join(root,"wrangler.jsonc"))throw new Error("The normal application config is forbidden. Use the dedicated demo config.");
  const worker=JSON.parse(await readFile(workerPath,"utf8"));
  const binding=worker.d1_databases?.find(item=>item.binding==="DB");
  if(config.purpose!=="disposable-demo" || !/^[a-f0-9]{32}$/i.test(config.accountId||"") ||
      !/^[0-9a-f-]{36}$/i.test(config.databaseId||"") || /^0{8}-/.test(config.databaseId) ||
      !/^aurelia-[a-z0-9-]*demo[a-z0-9-]*$/.test(config.databaseName||"") ||
      !/^aurelia-[a-z0-9-]*demo[a-z0-9-]*$/.test(worker.name||"") || worker.env ||
      worker.vars?.APP_PROFILE!=="demo" || worker.vars?.DEMO_RESET_ENABLED!=="true" || binding?.database_id!==config.databaseId ||
      binding?.database_name!==config.databaseName || worker.account_id!==config.accountId)
    throw new Error("Refusing target: purpose, dedicated demo names, account, DB binding/UUID and reset opt-in must all match.");
  // This repository's ordinary deployment targets are explicitly excluded.
  const stable=await readFile(path.join(root,"wrangler.jsonc"),"utf8");
  if(stable.toLowerCase().includes(config.databaseId.toLowerCase()) || stable.includes('"'+config.databaseName+'"'))
    throw new Error("Refusing the application's existing test/production database.");
  const retained=config.retainUserIds;
  if(!Array.isArray(retained) || !retained.length || retained.length>10 ||
      retained.some(id=>typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) || new Set(retained).size!==retained.length)
    throw new Error("List 1–10 explicit synthetic demo user IDs to retain. Do not use visitor accounts.");
  const fingerprint=createHash("sha256").update([...retained].sort().join("\n")).digest("hex");
  const invoke=(extra)=>{
    const result=spawnSync(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),"d1","execute","DB",
      "--remote","--config",workerPath,...extra],{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024,
      env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.accountId}});
    if(result.error || result.status!==0)throw new Error("Wrangler failed. Check Cloudflare access, demo configuration or SQL constraints. If maintenance started, leave it locked and use the documented resume procedure; do not start a demo.");
    return result.stdout;
  };
  const query=sql=>{
    const payload=JSON.parse(invoke(["--command",sql,"--json"]));
    if(!Array.isArray(payload) || payload.some(result=>result.success===false))throw new Error("Demo database query failed.");
    return payload.flatMap(result=>result.results||[]);
  };
  const execute=async sql=>{
    const dir=await mkdtemp(path.join(tmpdir(),"aurelia-demo-reset-"));
    try {const file=path.join(dir,"maintenance.sql");await writeFile(file,sql,{mode:0o600});invoke(["--file",file,"--yes"]);}
    finally {await rm(dir,{recursive:true,force:true});}
  };
  const schema=query("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name);
  if(["records","data_version","commit_guard",...authTables].some(table=>!schema.includes(table)))
    throw new Error("Apply auth/domain migrations 0001–0004 to the NEW demo DB first.");
  const resources=query("SELECT resource,count(*) AS count FROM records GROUP BY resource ORDER BY resource");
  if(resources.some(row=>![...keepResources,...clearResources].includes(row.resource)))
    throw new Error("An unknown resource exists. Review its retention policy before resetting; nothing was deleted.");
  const users=query(`SELECT id FROM auth_user WHERE id IN (${list(retained)})`);
  if(users.length!==retained.length)throw new Error("A retained demo account is missing. Create the reusable accounts first.");
  const owner=query(`SELECT count(*) AS count FROM app_access WHERE role='OWNER' AND disabled=0 AND userId IN (${list(retained)})`)[0];
  if(!owner?.count)throw new Error("Retain at least one active demo owner account.");
  let state=schema.includes("demo_reset_state")?query("SELECT * FROM demo_reset_state WHERE id=1")[0]:null;
  if(state && (state.databaseId!==config.databaseId || state.retainedFingerprint!==fingerprint))
    throw new Error("Baseline identity/target does not match this configuration. Do not repoint a reset config.");
  const disposable=query(`SELECT count(*) AS count FROM auth_user WHERE id NOT IN (${list(retained)})`)[0].count;
  console.log(JSON.stringify({database:config.databaseName,mode:"remote isolated demo",maintenance:state?.phase||"not initialized",
    baselineSaved:Boolean(state?.baselineAt),productsPreserved:resources.find(row=>row.resource==="products")?.count||0,
    reusableAccounts:retained.length,visitorAccountsToDelete:disposable,
    visitorRecordsToDelete:resources.filter(row=>clearResources.includes(row.resource)),
    personalDataBackup:false},null,2));
  if(command==="status" || options.has("--dry-run"))return;
  if(command==="reset" && !state?.baselineAt)throw new Error("Save the approved clean baseline before the first demo.");
  if(options.has("--confirm") && options.get("--confirm")!==config.databaseName)
    throw new Error("No write performed. The confirmation does not match the dedicated demo database.");
  if(!options.has("--confirm")) {
    if(command!=="reset" || !process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error("Explicit confirmation is required. Use an interactive terminal or --confirm="+config.databaseName);
    const prompt=createInterface({input:process.stdin,output:process.stdout});
    let answer;
    try { answer=await prompt.question("Permanently clear visitor data and orders from "+config.databaseName+"? Products stay. Type RESET to continue: "); }
    finally { prompt.close(); }
    if(answer.trim()!=="RESET") { console.log("Cancelled. No database changes were made.");return; }
  }
  if(command==="baseline" && state?.baselineAt && !options.has("--replace"))throw new Error("Baseline already exists. --replace is only for an explicitly approved clean catalogue/settings update.");
  if(command==="baseline" && (disposable || resources.some(row=>["orders","payments","inventoryMovements"].includes(row.resource) && row.count>0)))
    throw new Error("Save a baseline only before visitor signup/orders/stock testing. Use a clean approved demo database; do not capture sold stock as the starting stock.");
  if(!state) {
    await execute(`CREATE TABLE demo_reset_state(id INTEGER PRIMARY KEY CHECK(id=1),databaseId TEXT NOT NULL,retainedFingerprint TEXT NOT NULL,phase TEXT NOT NULL,token TEXT,baselineAt INTEGER,baselineId TEXT);
      CREATE TABLE demo_reset_catalog(batchId TEXT NOT NULL,resource TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(batchId,resource,scope,id));
      INSERT INTO demo_reset_state VALUES(1,${quote(config.databaseId)},${quote(fingerprint)},'idle',NULL,NULL,NULL);`);
    state=query("SELECT * FROM demo_reset_state WHERE id=1")[0];
  }
  const token=randomUUID();
  const acquired=state.phase==="idle" ? query(`UPDATE demo_reset_state SET phase='locked',token=${quote(token)} WHERE id=1 AND phase='idle' RETURNING id`) :
    options.get("--resume")===state.token ? query(`UPDATE demo_reset_state SET token=${quote(token)} WHERE id=1 AND token=${quote(state.token)} RETURNING id`) : [];
  if(!acquired.length)throw new Error("Maintenance already active. Ensure the previous process has stopped; resume with --resume="+state.token);
  console.log("Maintenance ID: "+token+". Close demo tabs; new requests will be refused until completion.");
  const guard=`EXISTS(SELECT 1 FROM demo_reset_state WHERE id=1 AND phase='locked' AND token=${quote(token)})`;
  try {
    // Application D1 transactions are blocked at commit, including reads begun before the lock.
    // Provider/team INSERT and UPDATE operations are blocked; reset only deletes those rows.
    await execute(`CREATE TRIGGER IF NOT EXISTS demo_reset_block_commit BEFORE INSERT ON commit_guard WHEN EXISTS(SELECT 1 FROM demo_reset_state WHERE phase='locked') BEGIN SELECT RAISE(ABORT,'DEMO_RESET_IN_PROGRESS'); END;
      ${authTables.flatMap(table=>["INSERT","UPDATE"].map(event=>`CREATE TRIGGER IF NOT EXISTS demo_reset_block_${table}_${event.toLowerCase()} BEFORE ${event} ON ${table} WHEN EXISTS(SELECT 1 FROM demo_reset_state WHERE phase='locked') BEGIN SELECT RAISE(ABORT,'DEMO_RESET_IN_PROGRESS'); END;`)).join("\n")}`);
    if(command==="baseline") {
      if(!resources.some(row=>row.resource==="products" && row.count>0))throw new Error("Cannot save an empty product baseline.");
      // Stage a complete snapshot in one statement before switching the active pointer.
      // A failed replacement cannot erase the previous approved baseline.
      await execute(`INSERT INTO demo_reset_catalog SELECT ${quote(token)},resource,scope,id,data FROM records WHERE resource IN (${list(keepResources)}) AND ${guard};
        UPDATE demo_reset_state SET baselineAt=${Date.now()},baselineId=${quote(token)} WHERE id=1 AND ${guard};
        DELETE FROM demo_reset_catalog WHERE batchId != (SELECT baselineId FROM demo_reset_state WHERE id=1) AND ${guard};`);
    } else {
      const unknownTables=schema.filter(name=>!name.startsWith("_") && !name.startsWith("sqlite_") && !["d1_migrations","records","data_version","commit_guard","demo_reset_state","demo_reset_catalog",...authTables].includes(name));
      if(unknownTables.length)throw new Error("Unknown tables need retention review: "+unknownTables.join(", "));
      const beforeProducts=query("SELECT count(*) AS count FROM records WHERE resource='products'")[0].count;
      await execute(`${clearTables.map(table=>`DELETE FROM ${table} WHERE ${guard};`).join("\n")}
        DELETE FROM auth_user WHERE id NOT IN (${list(retained)}) AND ${guard};
        DELETE FROM records WHERE resource IN (${list(clearResources)}) AND ${guard};
        DELETE FROM records WHERE resource IN (${list(keepResources.filter(resource=>resource!=="products"))})
          AND NOT EXISTS(SELECT 1 FROM demo_reset_catalog b WHERE b.batchId=(SELECT baselineId FROM demo_reset_state WHERE id=1)
            AND b.resource=records.resource AND b.scope=records.scope AND b.id=records.id) AND ${guard};
        INSERT INTO records(resource,scope,id,data) SELECT resource,scope,id,data FROM demo_reset_catalog WHERE batchId=(SELECT baselineId FROM demo_reset_state WHERE id=1) AND ${guard}
          ON CONFLICT(resource,scope,id) DO UPDATE SET data=excluded.data;
        UPDATE data_version SET version=version+1 WHERE id=1 AND ${guard};`);
      const after=query(`SELECT (SELECT count(*) FROM records WHERE resource='products') AS products,
        (SELECT count(*) FROM auth_user WHERE id NOT IN (${list(retained)})) AS visitors,
        (SELECT count(*) FROM records WHERE resource IN (${list(clearResources)})) AS activity`)[0];
      if(after.products<beforeProducts || after.visitors || after.activity)throw new Error("Post-reset counts need review; maintenance remains active.");
    }
    const released=query(`UPDATE demo_reset_state SET phase='idle',token=NULL WHERE id=1 AND token=${quote(token)} RETURNING id`);
    if(!released.length)throw new Error("Maintenance ownership changed. Do not start another demo.");
    console.log(command==="baseline"?"Clean catalogue/settings baseline saved. No visitor backup was created.":"Reset complete. Products retained/restored, visitor data removed, all sessions signed out. Start a fresh login.");
  } catch(error) {
    throw new Error(error.message+" Maintenance remains LOCKED. After fixing the cause and stopping the previous process, rerun with --resume="+token);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
