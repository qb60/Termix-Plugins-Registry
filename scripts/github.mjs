export async function fetchBuffer(url, limit, { api = false } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Only HTTPS downloads are accepted");
  const headers = api
    ? {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      }
    : {};
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}: ${parsed.origin}${parsed.pathname}`,
    );
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Download exceeds size limit");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) {
      await response.body.cancel().catch(() => {});
      throw new Error("Download exceeds size limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function releasesFor(repository) {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = JSON.parse(
      (
        await fetchBuffer(
          `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
          16 * 1024 * 1024,
          { api: true },
        )
      ).toString(),
    );
    if (!Array.isArray(batch))
      throw new Error("GitHub returned invalid release data");
    releases.push(...batch);
    if (batch.length < 100) return releases;
    if (page >= 100) throw new Error("Too many release pages");
  }
}
