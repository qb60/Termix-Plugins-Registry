import fs from "node:fs";
import { publicKeyObject } from "./registry.mjs";
const [owner, keyFile] = process.argv.slice(2);
if (
  !/^[A-Za-z0-9-]+$/.test(owner ?? "") ||
  owner === "GITHUB_USERNAME" ||
  !keyFile
)
  throw new Error("Usage: npm run configure -- OWNER /path/to/registry.pub");
const publicKey = fs.readFileSync(keyFile, "utf8").trim();
publicKeyObject(publicKey);
const config = JSON.parse(fs.readFileSync("plugins.json", "utf8"));
config.plugins = [{ repository: `${owner}/Termix-Plugin-Host-Web-Launcher` }];
fs.writeFileSync("registry.pub", publicKey + "\n");
fs.writeFileSync("plugins.json", JSON.stringify(config, null, 2) + "\n");
console.log(
  `Registry URL: https://${owner}.github.io/Termix-Plugins-Registry/index.json`,
);
