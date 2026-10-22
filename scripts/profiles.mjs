import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const profiles=Object.freeze({dev:{port:8787},demo:{port:8788},prod:{port:8789}});
export function selectProfile(value,fallback="dev") {
  const selected=value || process.env.AURELIA_PROFILE || fallback;
  if(!Object.hasOwn(profiles,selected))throw new Error("Choose profile dev, demo or prod.");
  return selected;
}
export async function readProfile(profile,{remote=false}={}) {
  const configPath=path.join(root,`wrangler.${profile}.json`);
  let config;
  try {config=JSON.parse(await readFile(configPath,"utf8"));}
  catch {throw new Error(`Configure wrangler.${profile}.json first using its example. No environment was changed.`);}
  const db=config.d1_databases?.find(item=>item.binding==="DB");
  if(config.vars?.APP_PROFILE!==profile || config.name!==`aurelia-api-${profile}` || config.env ||
      db?.database_name!==`aurelia-${profile}-db` || (profile!=="demo" && config.vars?.DEMO_RESET_ENABLED!=="false"))
    throw new Error("Profile marker, Worker name, database name or reset policy does not match the selected profile.");
  if(profile==="prod" && (config.vars?.DEMO_MODE!=="false" || config.vars?.AUTH_ENABLED!=="true"))
    throw new Error("Production requires authentication and disables demo header identities.");
  if(remote) {
    if(!/^[a-f0-9]{32}$/i.test(config.account_id||"") || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(db?.database_id||"") || /^0{8}-/.test(db.database_id))
      throw new Error("Configure the real account and dedicated database UUID before a remote profile operation.");
    const legacy=await readFile(path.join(root,"wrangler.jsonc"),"utf8");
    if(legacy.toLowerCase().includes(db.database_id.toLowerCase()))
      throw new Error("Profile database must be separate from the existing legacy/test bindings.");
    for(const other of Object.keys(profiles).filter(item=>item!==profile)) {
      let peer;
      try {peer=JSON.parse(await readFile(path.join(root,`wrangler.${other}.json`),"utf8"));}
      catch(error){if(error.code==="ENOENT")continue;throw new Error("Cannot validate the other profile configuration: "+other);}
      if(peer.d1_databases?.some(item=>item.database_id===db.database_id))
        throw new Error("Profiles cannot share a database UUID.");
    }
    if(config.vars?.AUTH_ENABLED!=="true" || config.vars?.DEMO_MODE!=="false")
      throw new Error("Remote profile deployment requires configured authentication. Enable it only after provider/migration setup.");
  }
  return {configPath,config,db,port:profiles[profile].port};
}
