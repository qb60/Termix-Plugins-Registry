import fs from "node:fs";
import { validateIndex } from "./schema.mjs";
validateIndex(
  JSON.parse(fs.readFileSync(process.argv[2] ?? "public/index.json", "utf8")),
);
console.log("Registry schema validation passed");
