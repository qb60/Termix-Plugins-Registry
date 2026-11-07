import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBuffer, releasesFor } from "../scripts/github.mjs";

test("release discovery paginates beyond 100 releases", async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response(
      JSON.stringify(
        calls.length === 1
          ? Array.from({ length: 100 }, (_, id) => ({ id }))
          : [{ id: 100 }],
      ),
    );
  };
  assert.equal((await releasesFor("owner/repository")).length, 101);
  assert.match(calls[1], /page=2$/);
});
test("API credentials are sent only to API requests", async (t) => {
  const original = globalThis.fetch,
    token = process.env.GITHUB_TOKEN;
  t.after(() => {
    globalThis.fetch = original;
    if (token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = token;
  });
  process.env.GITHUB_TOKEN = "test-token-not-a-secret";
  const headers = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(options.headers);
    return new Response("ok");
  };
  await fetchBuffer("https://api.github.com/test", 32, { api: true });
  await fetchBuffer(
    "https://github.com/owner/repo/releases/download/v1/file.tmxplug",
    32,
  );
  assert.equal(headers[0].Authorization, "Bearer test-token-not-a-secret");
  assert.equal(headers[1].Authorization, undefined);
});
test("downloads fail clearly on API errors and size limits", async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  globalThis.fetch = async () => new Response("denied", { status: 403 });
  await assert.rejects(
    fetchBuffer("https://api.github.com/test", 32),
    /HTTP 403/,
  );
  globalThis.fetch = async () => new Response("12345");
  await assert.rejects(fetchBuffer("https://github.com/file", 4), /size limit/);
  globalThis.fetch = async () =>
    new Response("1", { headers: { "content-length": "100" } });
  await assert.rejects(fetchBuffer("https://github.com/file", 4), /size limit/);
  await assert.rejects(fetchBuffer("http://github.com/file", 4), /HTTPS/);
});
