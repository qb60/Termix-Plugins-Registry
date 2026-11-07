import { gunzipSync } from "node:zlib";
import { parseManifest } from "@termix-ssh/plugin-sdk/manifest";

export const MAX_PACKAGE = 32 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;
/** Strict ustar/PAX reader. Never extracts files or executes plugin code. */
export function readArchive(buffer) {
  if (buffer.length > MAX_PACKAGE)
    throw new Error("Package exceeds 32 MiB limit");
  const tar = gunzipSync(buffer, { maxOutputLength: MAX_EXPANDED });
  if (tar.length % 512) throw new Error("Truncated tar archive");
  const files = new Map();
  let offset = 0,
    pending = {},
    ended = false,
    count = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((v) => v === 0)) {
      if (
        offset + 1024 > tar.length ||
        !tar.subarray(offset).every((v) => v === 0)
      )
        throw new Error("Invalid tar terminator");
      ended = true;
      break;
    }
    if (++count > 10000) throw new Error("Too many archive entries");
    const str = (start, length) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const octal = (start, length) => {
      const s = str(start, length).trim();
      if (!/^[0-7]+$/.test(s)) throw new Error("Invalid tar number");
      return Number.parseInt(s, 8);
    };
    const sum = [...header].reduce(
      (n, byte, i) => n + (i >= 148 && i < 156 ? 32 : byte),
      0,
    );
    if (sum !== octal(148, 8)) throw new Error("Invalid tar checksum");
    if (!str(257, 6).startsWith("ustar"))
      throw new Error("Unsupported tar format");
    const size = octal(124, 12),
      start = offset + 512;
    if (start + size > tar.length) throw new Error("Truncated tar entry");
    const data = tar.subarray(start, start + size),
      type = str(156, 1);
    offset = start + Math.ceil(size / 512) * 512;
    if (type === "x") {
      pending = {};
      for (let cursor = 0; cursor < data.length;) {
        const space = data.indexOf(32, cursor),
          length = Number(data.subarray(cursor, space).toString());
        if (
          space < cursor ||
          !Number.isInteger(length) ||
          length <= space - cursor + 1 ||
          cursor + length > data.length
        )
          throw new Error("Invalid PAX record");
        const record = data
          .subarray(space + 1, cursor + length - 1)
          .toString("utf8");
        const equal = record.indexOf("=");
        if (equal < 1 || data[cursor + length - 1] !== 10)
          throw new Error("Invalid PAX record");
        pending[record.slice(0, equal)] = record.slice(equal + 1);
        cursor += length;
      }
      continue;
    }
    const prefix = str(345, 155);
    const name = (
      pending.path ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100))
    ).replace(/^\.\//, "");
    if (pending.size !== undefined && Number(pending.size) !== size)
      throw new Error("Unsupported PAX size override");
    pending = {};
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      name.split("/").includes(".") ||
      Array.from(name).some((char) => char.charCodeAt(0) < 32)
    )
      throw new Error("Unsafe archive path");
    if (type === "5") continue;
    if (type !== "0" && type !== "")
      throw new Error("Archive links and special files are forbidden");
    if (files.has(name)) throw new Error(`Duplicate archive entry: ${name}`);
    files.set(name, data);
  }
  if (!ended || Object.keys(pending).length)
    throw new Error("Incomplete archive");
  return files;
}
export function inspectPackage(buffer) {
  const files = readArchive(buffer);
  const raw = files.get("manifest.json");
  if (!raw || raw.length > 1024 * 1024)
    throw new Error("Missing or oversized manifest.json");
  const manifest = JSON.parse(raw.toString("utf8"));
  const { errors } = parseManifest(manifest);
  if (errors.length)
    throw new Error(`Invalid package manifest: ${errors.join("; ")}`);
  const entries = [manifest.backend ?? "dist/backend.js"];
  if (manifest.frontend || files.has("dist/frontend.js"))
    entries.push(manifest.frontend ?? "dist/frontend.js");
  for (const entry of entries) {
    if (!files.get(entry)?.length)
      throw new Error(`Missing entry point: ${entry}`);
  }
  if (!files.has("CHANGELOG.md")) throw new Error("Missing CHANGELOG.md");
  const changelog = files.get("CHANGELOG.md").toString("utf8");
  return { manifest, changelog };
}
