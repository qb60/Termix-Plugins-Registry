import fs from "node:fs/promises";
import path from "node:path";
import { fixture, input } from "../tests/fixtures.mjs";
import { generateRegistry } from "./registry.mjs";
const out = process.argv[2];
if (!out || path.resolve(out) === path.resolve("public"))
  throw new Error("Pass an explicit non-production output directory");
const f = fixture();
const { index } = await generateRegistry(input([f]));
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, "index.json"),
  JSON.stringify(index, null, 2) + "\n",
);
await fs.writeFile(path.join(out, "fixture-one-1.0.0.tmxplug"), f.buffer);
await fs.writeFile(
  path.join(out, "fixture-one-1.0.0.tmxplug.sig"),
  f.signature + "\n",
);
await fs.writeFile(path.join(out, "registry.pub"), index.publicKey + "\n");
console.log(
  "Verified local fixture written. Do not publish or trust its ephemeral key in production.",
);
