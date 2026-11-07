import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const sdk = path.resolve(
  path.dirname(require.resolve("@termix-ssh/plugin-sdk/manifest")),
  "..",
);
// Use the exact official package writer and signing implementation in fixtures.
const { createTmxplug, collectFiles } = await import(
  pathToFileURL(path.join(sdk, "cli/lib/tmxplug.mjs"))
);
export const signing = await import(
  pathToFileURL(path.join(sdk, "cli/lib/signing.mjs"))
);
export const keys = signing.generateKeyPair();
export const fixtureConfig = {
  registry: "test-custom",
  name: "Test Custom Registry",
  plugins: [{ repository: "example/Plugin-One" }],
};
export function fixture({
  id = "fixture-one",
  version = "1.0.0",
  repository = "example/Plugin-One",
  engine = ">=26.10.0",
  capabilities = ["ui:surface"],
  extra = {},
} = {}) {
  const manifest = {
    id,
    name: "Fixture Plugin",
    version,
    description: "Signed local test fixture",
    author: { name: "Test" },
    license: "Apache-2.0",
    repository: `https://github.com/${repository}`,
    category: "Productivity",
    icon: "Globe",
    engine: { api: "^1.2", termix: engine },
    capabilities,
    ...extra,
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termix-fixture-"));
  let buffer;
  try {
    fs.mkdirSync(path.join(dir, "dist"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(dir, "CHANGELOG.md"),
      `# Changelog\n\n## ${version}\n\n### Added\n\n- Test notes.\n`,
    );
    fs.writeFileSync(
      path.join(dir, "dist/backend.js"),
      "export function activate() {}\n",
    );
    buffer = createTmxplug(dir, collectFiles(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const name = `${id}-${version}.tmxplug`,
    tag = `v${version}`;
  const base = `https://github.com/${repository}/releases/download/${tag}/`;
  const signature = signing.signArtifact(
    buffer,
    signing.loadPrivateKey(keys.privateKey),
  );
  const release = {
    tag_name: tag,
    draft: false,
    prerelease: version.includes("-"),
    published_at: "2026-11-01T12:00:00Z",
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: [
      {
        name,
        browser_download_url: base + name,
        size: buffer.length,
        digest: `sha256:${signing.sha256(buffer).toString("hex")}`,
      },
      {
        name: `${name}.sig`,
        browser_download_url: `${base}${name}.sig`,
        size: 89,
      },
    ],
  };
  return {
    manifest,
    buffer,
    signature,
    release,
    assets: new Map([
      [base + name, buffer],
      [`${base}${name}.sig`, Buffer.from(signature + "\n")],
    ]),
  };
}
export function input(fixtures = [fixture()], extra = {}) {
  return {
    config: fixtureConfig,
    publicKey: keys.publicKey,
    officialIds: ["web-endpoint", "tunnels"],
    releasesFor: async (repository) =>
      fixtures
        .filter(
          (f) => f.manifest.repository === `https://github.com/${repository}`,
        )
        .map((f) => f.release),
    download: async (url) => {
      for (const f of fixtures) if (f.assets.has(url)) return f.assets.get(url);
      throw new Error(`Fixture download missing: ${url}`);
    },
    ...extra,
  };
}
