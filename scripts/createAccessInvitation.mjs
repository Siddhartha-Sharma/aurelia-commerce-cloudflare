import {randomBytes,createHash,randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const at = value.indexOf("=");
  return [value.slice(0,at),value.slice(at+1)];
}));
const email = String(args["--email"] || "").trim().toLowerCase();
const role = args["--role"];
const base = args["--base-url"];
const output = args["--output"];
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["OWNER","DEVELOPER"].includes(role) || !base || !output)
  throw new Error("Use --email=controlled@example.com --role=OWNER|DEVELOPER --base-url=https://your-app --output=private-folder");
const origin = new URL(base);
if (origin.protocol !== "https:" && !["localhost","127.0.0.1"].includes(origin.hostname))
  throw new Error("Use HTTPS except for localhost.");
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const id = randomUUID(), now = Date.now(), shopId = args["--shop"] || "aurelia";
const quote = value => "'" + String(value).replaceAll("'","''") + "'";
const sql = "INSERT INTO app_invitations(id,shopId,email,role,permissions,tokenHash,createdBy,createdAt,expiresAt) VALUES(" +
  [id,shopId,email,role,"[]",hash,"controlled-bootstrap"].map(quote).join(",") + "," + now + "," + (now+86400000) + ");\n";
const url = new URL("/accept-invite",origin);
url.searchParams.set("token",token);
await mkdir(output,{recursive:true});
await writeFile(path.join(output,id + ".sql"),sql,{flag:"wx"});
await writeFile(path.join(output,id + "-private-link.txt"),url.href + "\n",{flag:"wx"});
console.log("Invitation SQL and private link created. No database commands were executed.");
console.log("Review and apply the SQL only to the intended configured database; send the private link to the controlled account.");
