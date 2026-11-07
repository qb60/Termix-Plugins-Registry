import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const schema = JSON.parse(
  fs.readFileSync(
    new URL("../schemas/registry-index-schema.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const check = ajv.compile(schema);
export function validateIndex(index) {
  if (!check(index))
    throw new Error(
      `Invalid registry index: ${ajv.errorsText(check.errors, { separator: "; " })}`,
    );
  if (!/^[A-Za-z0-9+/]{43}=$/.test(index.publicKey ?? ""))
    throw new Error("Custom registry requires a public key");
  return index;
}
