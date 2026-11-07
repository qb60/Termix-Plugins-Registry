import crypto from "node:crypto";
import semver from "semver";
import { changelogSection } from "@termix-ssh/plugin-sdk/changelog";
import { inspectPackage } from "./archive.mjs";
import { validateIndex } from "./schema.mjs";

const RESERVED = [
  "admin",
  "hosts",
  "credentials",
  "core",
  "termix",
  "plugin",
  "plugins",
  "onboarding",
  "users",
  "system",
  "sdk",
];
export function publicKeyObject(value) {
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
    Buffer.from(value, "base64").toString("base64") !== value
  )
    throw new Error("Expected a canonical base64 Ed25519 public key");
  return crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(value, "base64"),
    ]),
    format: "der",
    type: "spki",
  });
}
export function verifyPackage(buffer, signature, publicKey) {
  const digest = crypto.createHash("sha256").update(buffer).digest();
  if (
    !/^[A-Za-z0-9+/]{86}==$/.test(signature) ||
    Buffer.from(signature, "base64").toString("base64") !== signature ||
    !crypto.verify(
      null,
      digest,
      publicKeyObject(publicKey),
      Buffer.from(signature, "base64"),
    )
  )
    throw new Error("Package signature does not match registry key");
  return digest.toString("hex");
}
export function validateConfig(config) {
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(config.registry ?? "") ||
    !config.name?.trim() ||
    !Array.isArray(config.plugins)
  )
    throw new Error("Invalid registry configuration");
  const repos = new Set();
  for (const { repository } of config.plugins) {
    if (
      !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository ?? "") ||
      repository.includes("GITHUB_USERNAME")
    )
      throw new Error("Configure a real GitHub repository");
    if (repos.has(repository.toLowerCase()))
      throw new Error("Duplicate configured repository");
    repos.add(repository.toLowerCase());
  }
}
const allVersions = (p) => [
  ...p.versions,
  ...(p.prereleases ?? []),
  ...(p.gated ?? []),
];

/** All-or-nothing: any bad release prevents creation of a publishable index. */
export async function generateRegistry({
  config,
  publicKey,
  releasesFor,
  download,
  officialIds,
  previous = null,
  now = new Date().toISOString(),
}) {
  validateConfig(config);
  publicKeyObject(publicKey);
  if (!Array.isArray(officialIds) || !officialIds.length)
    throw new Error("Official reserved ID list is unavailable");
  if (previous) {
    validateIndex(previous);
    if (
      previous.registry !== config.registry ||
      previous.publicKey !== publicKey
    )
      throw new Error(
        "Previous registry identity/key differs; explicit recovery is required",
      );
  }
  const reserved = new Set([...RESERVED, ...officialIds]);
  const previousOwners = new Map(
    (previous?.plugins ?? []).map((plugin) => [
      plugin.id,
      plugin.repository.toLowerCase(),
    ]),
  );
  const seen = new Map(),
    plugins = [],
    pins = {};
  for (const source of [...config.plugins].sort((a, b) =>
    a.repository.localeCompare(b.repository, "en"),
  )) {
    const repository = `https://github.com/${source.repository}`;
    const old = previous?.plugins.find(
      (p) => p.repository.toLowerCase() === repository.toLowerCase(),
    );
    let id = old?.id;
    const found = [],
      versions = new Set();
    for (const release of await releasesFor(source.repository)) {
      if (release.draft) continue;
      const artifacts = release.assets.filter((a) =>
        a.name.endsWith(".tmxplug"),
      );
      if (!artifacts.length) continue;
      if (artifacts.length !== 1)
        throw new Error(
          `${source.repository}@${release.tag_name}: expected exactly one package`,
        );
      const artifact = artifacts[0];
      const signatures = release.assets.filter(
        (a) => a.name === `${artifact.name}.sig`,
      );
      if (signatures.length !== 1)
        throw new Error(
          `${artifact.name}: missing or ambiguous detached signature`,
        );
      if (
        release.html_url !==
        `${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`
      )
        throw new Error("Release URL does not match repository");
      const expectedPrefix = `${repository}/releases/download/${encodeURIComponent(release.tag_name)}/`;
      for (const asset of [artifact, signatures[0]]) {
        if (
          asset.browser_download_url !==
          expectedPrefix + encodeURIComponent(asset.name)
        )
          throw new Error("Asset URL does not match its release");
      }
      const buffer = await download(
        artifact.browser_download_url,
        32 * 1024 * 1024,
      );
      const signature = (
        await download(signatures[0].browser_download_url, 4096)
      )
        .toString("utf8")
        .trim();
      const sha256 = verifyPackage(buffer, signature, publicKey);
      if (artifact.size !== buffer.length)
        throw new Error("Artifact size differs from GitHub metadata");
      if (artifact.digest && artifact.digest !== `sha256:${sha256}`)
        throw new Error("Artifact digest differs from GitHub metadata");
      const { manifest, changelog } = inspectPackage(buffer);
      if (!semver.valid(manifest.version) || manifest.version.includes("+"))
        throw new Error("Unsupported release version");
      if (
        release.tag_name !== `v${manifest.version}` ||
        artifact.name !== `${manifest.id}-${manifest.version}.tmxplug`
      )
        throw new Error("Package identity/version does not match release");
      if (
        Boolean(semver.prerelease(manifest.version)) !==
        Boolean(release.prerelease)
      )
        throw new Error("Prerelease flag differs from manifest version");
      if (reserved.has(manifest.id))
        throw new Error(`Reserved official plugin ID: ${manifest.id}`);
      if (id && id !== manifest.id)
        throw new Error("A repository changed its plugin identity");
      id = manifest.id;
      if (
        previousOwners.has(id) &&
        previousOwners.get(id) !== repository.toLowerCase()
      )
        throw new Error(
          "Plugin ID was previously owned by a different repository",
        );
      if (seen.has(id) && seen.get(id) !== source.repository)
        throw new Error(`Duplicate plugin ID across repositories: ${id}`);
      seen.set(id, source.repository);
      if (versions.has(manifest.version))
        throw new Error("Duplicate plugin version");
      versions.add(manifest.version);
      const prior =
        old && allVersions(old).find((v) => v.version === manifest.version);
      if (prior && prior.sha256 !== sha256)
        throw new Error(
          `Published artifact was replaced: ${id}@${manifest.version}; publish a new version`,
        );
      if (
        manifest.repository?.replace(/\/$/, "").toLowerCase() !==
        repository.toLowerCase()
      )
        throw new Error("Manifest repository does not match source repository");
      if (
        semver.validRange(manifest.engine.api) === null ||
        semver.validRange(manifest.engine.termix) === null
      )
        throw new Error("Invalid engine ranges");
      const notes = changelogSection(changelog, manifest.version);
      if (!notes)
        throw new Error("Release notes missing from packaged changelog");
      const entry = {
        version: manifest.version,
        api: String(manifest.engine.api).match(/\d+/)?.[0] ?? "",
        url: artifact.browser_download_url,
        sha256,
        signature,
        size: buffer.length,
        capabilities: manifest.capabilities,
        engine: manifest.engine,
        ...(manifest.dependencies
          ? { dependencies: manifest.dependencies }
          : {}),
        releaseNotesUrl: release.html_url,
        notes: notes.slice(0, 20000),
        publishedAt: new Date(release.published_at).toISOString(),
      };
      found.push({ manifest, entry });
    }
    if (old)
      for (const version of allVersions(old))
        if (!versions.has(version.version))
          throw new Error(
            `Previously published release disappeared: ${old.id}@${version.version}. Restore the release or follow explicit recovery procedure`,
          );
    if (!found.length) continue;
    found.sort((a, b) => semver.rcompare(a.entry.version, b.entry.version));
    const stable = found.find((v) => !semver.prerelease(v.entry.version));
    const latest = stable ?? found[0],
      manifest = latest.manifest;
    const plugin = {
      id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author.name,
      category: manifest.category,
      repository,
      icon: manifest.icon ?? "Puzzle",
      ...Object.fromEntries(
        ["features", "docs", "video"]
          .filter((key) => manifest[key] !== undefined)
          .map((key) => [key, manifest[key]]),
      ),
      contributes: Object.keys(manifest.contributes ?? {}).sort(),
      versions: [],
    };
    for (const { entry } of found) {
      const beta = Boolean(semver.prerelease(entry.version));
      if (beta && stable && !semver.gt(entry.version, stable.entry.version))
        continue;
      const channel = !semver.satisfies("26.10.2", entry.engine.termix)
        ? "gated"
        : beta
          ? "prereleases"
          : "versions";
      (plugin[channel] ??= []).push(entry);
    }
    plugins.push(plugin);
    pins[source.repository] = id;
  }
  plugins.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const index = {
    registry: config.registry,
    name: config.name,
    apiVersion: 1,
    publicKey,
    updatedAt: now,
    plugins,
  };
  // Deterministic timestamp: preserve the previous timestamp if content is identical.
  if (
    previous &&
    JSON.stringify({ ...previous, updatedAt: now }) === JSON.stringify(index)
  )
    index.updatedAt = previous.updatedAt;
  validateIndex(index);
  return { index, pins };
}
