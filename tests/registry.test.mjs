import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { gzipSync, gunzipSync } from "node:zlib";
import { fixture, input, keys, signing, fixtureConfig } from "./fixtures.mjs";
import { generateRegistry, verifyPackage } from "../scripts/registry.mjs";
import { inspectPackage, readArchive } from "../scripts/archive.mjs";
import { validateIndex } from "../scripts/schema.mjs";
const require = createRequire(import.meta.url);
const cli = path.resolve(
  path.dirname(require.resolve("@termix-ssh/plugin-sdk/manifest")),
  "../cli/index.mjs",
);

test("reads an official-format signed package and validates the complete official schema", async () => {
  const f = fixture({ capabilities: ["hosts:read", "ui:surface"] });
  const { index } = await generateRegistry(input([f]));
  validateIndex(index);
  const version = index.plugins[0].versions[0];
  assert.deepEqual(version.capabilities, f.manifest.capabilities);
  assert.equal(version.sha256, signing.sha256(f.buffer).toString("hex"));
  assert.equal(version.size, f.buffer.length);
  assert.equal(version.signature, f.signature);
  assert.match(version.notes, /Test notes/);
  assert.equal(inspectPackage(f.buffer).manifest.id, "fixture-one");
});
test("official CLI sign and verify interoperate with the registry", async () => {
  const f = fixture(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "termix-sign-test-"));
  try {
    const file = path.join(dir, "fixture-one-1.0.0.tmxplug");
    fs.writeFileSync(file, f.buffer);
    execFileSync(process.execPath, [cli, "sign", file], {
      env: { ...process.env, TERMIX_PLUGIN_SIGNING_KEY: keys.privateKey },
      stdio: "pipe",
    });
    const sig = fs.readFileSync(`${file}.sig`, "utf8").trim();
    assert.equal(
      verifyPackage(f.buffer, sig, keys.publicKey),
      signing.sha256(f.buffer).toString("hex"),
    );
    execFileSync(
      process.execPath,
      [cli, "verify", file, "--key", keys.publicKey],
      { stdio: "pipe" },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("supports multiple repositories and preserves stable version history in sorted order", async () => {
  const f = [
    fixture({ version: "1.0.0" }),
    fixture({ version: "1.2.0" }),
    fixture({
      id: "fixture-two",
      repository: "example/Plugin-Two",
      version: "2.0.0",
    }),
  ];
  const config = {
    ...fixtureConfig,
    plugins: [{ repository: "example/Plugin-Two" }, ...fixtureConfig.plugins],
  };
  const one = await generateRegistry(input(f, { config }));
  const two = await generateRegistry(
    input([...f].reverse(), { config, previous: one.index }),
  );
  assert.deepEqual(one.index, two.index);
  assert.deepEqual(
    one.index.plugins.map((p) => p.id),
    ["fixture-one", "fixture-two"],
  );
  assert.deepEqual(
    one.index.plugins[0].versions.map((v) => v.version),
    ["1.2.0", "1.0.0"],
  );
});
test("separates prereleases, drops obsolete betas and gates new Termix requirements", async () => {
  const f = [
    fixture(),
    fixture({ version: "1.0.0-beta.1" }),
    fixture({ version: "1.1.0-beta.2" }),
    fixture({ version: "2.0.0-beta.1", engine: ">=26.10.3" }),
  ];
  const { index } = await generateRegistry(input(f));
  const p = index.plugins[0];
  assert.equal(p.versions.length, 1);
  assert.equal(p.prereleases[0].version, "1.1.0-beta.2");
  assert.equal(p.gated[0].version, "2.0.0-beta.1");
});
test("ignores draft releases", async () => {
  const f = fixture();
  f.release.draft = true;
  assert.equal((await generateRegistry(input([f]))).index.plugins.length, 0);
});
test("rejects unsigned releases", async () => {
  const f = fixture();
  f.release.assets.pop();
  await assert.rejects(generateRegistry(input([f])), /detached signature/);
});
test("rejects a wrong signing identity", async () => {
  await assert.rejects(
    generateRegistry(
      input([fixture()], { publicKey: signing.generateKeyPair().publicKey }),
    ),
    /signature/,
  );
});
test("rejects corrupt and mismatched artifacts before parsing", async () => {
  const f = fixture();
  f.buffer[0] ^= 1;
  await assert.rejects(generateRegistry(input([f])), /signature/);
  const a = fixture(),
    b = fixture({ version: "2.0.0" });
  a.assets.set(
    a.release.assets[1].browser_download_url,
    Buffer.from(b.signature),
  );
  await assert.rejects(generateRegistry(input([a])), /signature/);
});
test("rejects a signed corrupt archive", async () => {
  const f = fixture(),
    bad = Buffer.from("not a gzip file");
  f.assets.set(f.release.assets[0].browser_download_url, bad);
  f.assets.set(
    f.release.assets[1].browser_download_url,
    Buffer.from(
      signing.signArtifact(bad, signing.loadPrivateKey(keys.privateKey)),
    ),
  );
  f.release.assets[0].size = bad.length;
  delete f.release.assets[0].digest;
  await assert.rejects(generateRegistry(input([f])), /header|gzip|incorrect/i);
});
test("rejects wrong release tags, prerelease flags, sizes and digests", async () => {
  for (const change of [
    (f) => (f.release.prerelease = true),
    (f) => f.release.assets[0].size++,
    (f) => (f.release.assets[0].digest = `sha256:${"0".repeat(64)}`),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(generateRegistry(input([f])));
  }
  const f = fixture();
  f.release.tag_name = "v2.0.0";
  await assert.rejects(generateRegistry(input([f])), /URL|version/);
});
test("rejects official IDs and identities claimed by two repositories", async () => {
  await assert.rejects(
    generateRegistry(input([fixture({ id: "web-endpoint" })])),
    /Reserved/,
  );
  const config = {
    ...fixtureConfig,
    plugins: [...fixtureConfig.plugins, { repository: "example/Plugin-Two" }],
  };
  await assert.rejects(
    generateRegistry(
      input([fixture(), fixture({ repository: "example/Plugin-Two" })], {
        config,
      }),
    ),
    /Duplicate plugin ID/,
  );
});
test("pins a repository identity across synchronization runs", async () => {
  const { index } = await generateRegistry(input());
  await assert.rejects(
    generateRegistry(
      input([fixture({ id: "changed-identity" })], { previous: index }),
    ),
    /identity/,
  );
});
test("rejects overwritten and deleted published releases", async () => {
  const f = fixture(),
    { index } = await generateRegistry(input([f]));
  await assert.rejects(
    generateRegistry(input([], { previous: index })),
    /disappeared/,
  );
  const changed = fixture({ extra: { description: "Changed artifact" } });
  await assert.rejects(
    generateRegistry(input([changed], { previous: index })),
    /replaced/,
  );
});
test("rejects repository mismatches, duplicate versions and unsafe asset URLs", async () => {
  const mismatch = fixture({
    extra: { repository: "https://github.com/example/Wrong" },
  });
  await assert.rejects(
    generateRegistry(
      input([mismatch], { releasesFor: async () => [mismatch.release] }),
    ),
    /does not match source/i,
  );
  const f = fixture();
  await assert.rejects(
    generateRegistry(input([f, f])),
    /Duplicate plugin version/,
  );
  f.release.assets[0].browser_download_url =
    "https://evil.example/package.tmxplug";
  await assert.rejects(generateRegistry(input([f])), /URL/);
});
test("rejects invalid manifest capabilities even if signed", async () => {
  await assert.rejects(
    generateRegistry(
      input([fixture({ capabilities: ["imaginary:capability"] })]),
    ),
    /manifest/,
  );
});
test("rejects schema violations and missing public keys", async () => {
  const { index } = await generateRegistry(input());
  for (const bad of [
    { ...index, publicKey: "fake" },
    { ...index, unexpected: true },
    { ...index, apiVersion: 2 },
  ])
    assert.throws(() => validateIndex(bad));
});
test("rejects archive checksum errors, traversal, links, duplicates and missing entry points", () => {
  const f = fixture();
  const tar = gunzipSync(f.buffer);
  tar[10] ^= 1;
  assert.throws(() => readArchive(gzipSync(tar)), /checksum/);
  for (const alter of [
    (b) => {
      b.fill(0, 0, 100);
      b.write("../manifest.json", 0);
    },
    (b) => {
      b[156] = 50;
    },
  ]) {
    const b = gunzipSync(f.buffer);
    alter(b);
    b.fill(32, 148, 156);
    const sum = [...b.subarray(0, 512)].reduce((a, v) => a + v, 0);
    b.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    assert.throws(() => readArchive(gzipSync(b)), /Unsafe|links/);
  }
  const b = gunzipSync(f.buffer),
    firstSize = parseInt(b.subarray(124, 136).toString(), 8);
  const firstEntry = b.subarray(0, 512 + Math.ceil(firstSize / 512) * 512);
  assert.throws(
    () => readArchive(gzipSync(Buffer.concat([firstEntry, b]))),
    /Duplicate/,
  );
  assert.throws(
    () => readArchive(gzipSync(b.subarray(0, b.length - 512))),
    /archive|terminator/,
  );
  assert.throws(
    () =>
      inspectPackage(fixture({ extra: { backend: "dist/missing.js" } }).buffer),
    /Missing entry point/,
  );
});

test("a newly configured repository cannot take over an existing plugin ID", async () => {
  const { index } = await generateRegistry(input());
  const next = fixture({ repository: "example/Plugin-Two" });
  const config = {
    ...fixtureConfig,
    plugins: [{ repository: "example/Plugin-Two" }],
  };
  await assert.rejects(
    generateRegistry(input([next], { config, previous: index })),
    /previously owned/,
  );
});

test("validates cross-field manifest permissions using the official SDK parser", async () => {
  const f = fixture({
    extra: {
      contributes: {
        actions: [
          {
            id: "fixture-one.do",
            titleKey: "do",
            handler: "do",
            permission: "fixture-one.use",
          },
        ],
      },
    },
  });
  await assert.rejects(generateRegistry(input([f])), /not declared|manifest/);
});

test("updatedAt changes only when registry contents change", async () => {
  const f = fixture();
  const first = (
    await generateRegistry(input([f], { now: "2026-11-01T00:00:00.000Z" }))
  ).index;
  const second = (
    await generateRegistry(
      input([f], { previous: first, now: "2026-11-02T00:00:00.000Z" }),
    )
  ).index;
  assert.equal(second.updatedAt, first.updatedAt);
  const third = (
    await generateRegistry(
      input([f], {
        previous: second,
        config: { ...fixtureConfig, name: "Updated display name" },
        now: "2026-11-03T00:00:00.000Z",
      }),
    )
  ).index;
  assert.equal(third.updatedAt, "2026-11-03T00:00:00.000Z");
});
