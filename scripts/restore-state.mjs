import fs from "node:fs/promises";
import { validateIndex } from "./schema.mjs";
const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
if (!owner || !repository) throw new Error("GITHUB_REPOSITORY is required");
const url = `https://${owner}.github.io/${repository}/index.json`;
const response = await fetch(url, {
  signal: AbortSignal.timeout(60000),
  cache: "no-store",
});
if (response.status === 404) {
  console.log(
    "No previously deployed index (HTTP 404); starting first deployment",
  );
} else {
  if (!response.ok)
    throw new Error(
      `Cannot restore previous registry: HTTP ${response.status}`,
    );
  const previous = validateIndex(await response.json());
  await fs.mkdir("state", { recursive: true });
  await fs.writeFile("state/index.json", JSON.stringify(previous));
  console.log(
    "Previous registry restored for identity and immutability checks",
  );
}
