import {spawn,spawnSync} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";
import {root,selectProfile,readProfile} from "./profiles.mjs";

const args=process.argv.slice(2),action=args.shift();
const help="Use npm run start -- --profile=dev locally, npm run build/deploy/db:migrate -- --profile=dev|demo|prod. Demo/prod run on hosted deployments. AURELIA_PROFILE is supported. Remote deploy/migration needs an explicit profile; dev migration is local.";
async function main() {
  if(args.includes("--help")){console.log(help);return;}
  if(!["start","build","deploy","migrate","seed"].includes(action) || args.some(arg=>!arg.startsWith("--profile=")))throw new Error(help);
  if(args.length>1)throw new Error("Select one profile only.");
  const explicit=args[0]?.slice("--profile=".length) || process.env.AURELIA_PROFILE;
  if(["deploy","migrate"].includes(action) && !explicit)throw new Error("Select the deployment/migration profile explicitly. "+help);
  const profile=selectProfile(explicit);
  if(action==="start" && profile!=="dev")throw new Error("Use build/deploy for hosted demo/prod. Local start uses dev; demo reset targets the hosted demo database.");
  if(action==="seed" && profile!=="dev")throw new Error("Seed is local dev only. Import an approved catalogue separately into demo/prod.");
  const remote=action==="deploy" || (action==="migrate" && profile!=="dev");
  const {configPath,config,port}=await readProfile(profile,{remote});
  console.log(`API profile: ${profile}; Worker: ${config.name}; ${action==="start"?"local isolated D1":"configured D1 binding"}`);
  const persistence=path.join(root,".wrangler/profiles",profile);
  if(action==="seed") {
    const result=spawnSync(process.execPath,[path.join(root,"scripts/createSeed.mjs")],{cwd:root,stdio:"inherit"});
    if(result.error || result.status!==0)throw new Error("Could not prepare local development seed.");
  }
  const command=action==="start"?["dev","--local","--port",String(port),"--persist-to",persistence]:
    action==="build"?["deploy","--dry-run","--outdir",path.join(root,"outputs/profile-build",profile)]:
    action==="migrate"?["d1","migrations","apply","DB",...(remote?["--remote"]:["--local","--persist-to",persistence])]:
    action==="seed"?["d1","execute","DB","--local","--persist-to",persistence,"--file",path.join(root,"seed.sql")]:["deploy"];
  // Explicit env-file prevents Wrangler from falling back to shared .dev.vars/.env.
  let secretsFile=path.join(root,"config/profile-empty.env");
  if(action==="start") {
    const candidate=path.join(root,`.dev.vars.${profile}`);
    try {await access(candidate);secretsFile=candidate;}catch(error){if(error.code!=="ENOENT")throw error;}
  }
  const childEnv={...process.env,AURELIA_PROFILE:profile,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:action==="start"?"true":"false",
    CLOUDFLARE_INCLUDE_PROCESS_ENV:"false",...(config.account_id?{CLOUDFLARE_ACCOUNT_ID:config.account_id}:{})};
  delete childEnv.CLOUDFLARE_ENV;
  const child=spawn(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),...command,"--config",configPath,"--env-file",secretsFile],{
    cwd:root,stdio:"inherit",env:childEnv});
  child.on("error",()=>{console.error("Cannot start Wrangler. Run npm ci first.");process.exitCode=1;});
  child.on("exit",code=>{process.exitCode=code??1;});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
