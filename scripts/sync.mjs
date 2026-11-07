import fs from "node:fs/promises";
import { generateRegistry } from "./registry.mjs";
import { fetchBuffer, releasesFor } from "./github.mjs";
import { validateIndex } from "./schema.mjs";
const config = JSON.parse(await fs.readFile("plugins.json", "utf8"));
const publicKey = (await fs.readFile(config.publicKeyFile, "utf8")).trim();
const official = validateIndex(
  JSON.parse(
    (
      await fetchBuffer(
        "https://raw.githubusercontent.com/Termix-SSH/Termix-Registry/main/official/index.json",
        32 * 1024 * 1024,
      )
    ).toString(),
  ),
);
let previous = null;
try {
  previous = JSON.parse(await fs.readFile("state/index.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const { index } = await generateRegistry({
  config,
  publicKey,
  officialIds: official.plugins.map((p) => p.id),
  releasesFor,
  download: fetchBuffer,
  previous,
});
if (!index.plugins.length)
  throw new Error(
    "No signed releases found. Publish the first release before deploying",
  );
await fs.mkdir("public", { recursive: true });
await fs.writeFile(
  "public/index.json.tmp",
  JSON.stringify(index, null, 2) + "\n",
);
await fs.rename("public/index.json.tmp", "public/index.json");
console.log(
  `Verified ${index.plugins.length} plugin(s); index ready for deployment`,
);
