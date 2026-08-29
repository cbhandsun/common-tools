"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ContentProviderError, ContentProviderRegistry, MAX_PROVIDER_REQUEST_BYTES, MAX_PROVIDER_RESPONSE_BYTES, createHttpsJsonContentProvider } = require("../packages/ppt-create-core/content-provider");
const { loadContentProviderConfig } = require("../packages/ppt-create-core/content-provider-config");
const { promptToPresentationAsync } = require("../packages/ppt-create-core/prompt");

function providerResult(request) {
  return { brief: { version: "1.0", title: "Provider deck", audience: request.audience, purpose: request.purpose, sections: [{ id: "facts", title: "Facts", points: [{ label: "Verified outcome" }] }] }, provenance: { providerId: "grounded-provider", model: "grounded-v1", requestId: "req-1", retrievedAt: "2026-08-28T12:00:00Z", sources: [{ id: "source-1", title: "Approved source", locator: "https://example.test/source", accessedAt: "2026-08-28" }] }, citationsBySection: { facts: ["source-1"] } };
}

test("content provider registry is bounded, explicit, and redacts provider failures", async () => {
  const registry = new ContentProviderRegistry([{ id: "grounded-provider", generate: async (request) => providerResult(request) }]);
  assert.deepEqual(registry.ids(), ["grounded-provider"]);
  const generated = await promptToPresentationAsync("Use approved facts", { audience: "Board", purpose: "Decision", contentProviderId: "grounded-provider", contentProviderRegistry: registry });
  assert.equal(generated.report.provider, "grounded-provider"); assert.equal(generated.spec.slides[1].citations[0].id, "source-1");
  await assert.rejects(() => registry.generate("missing-provider", {}), (error) => error instanceof ContentProviderError && error.code === "CONTENT_PROVIDER_UNAVAILABLE" && error.retryable === false);
  const failing = new ContentProviderRegistry([{ id: "failing-provider", generate: async () => { throw new Error("secret upstream detail"); } }]);
  await assert.rejects(() => failing.generate("failing-provider", {}), (error) => error instanceof ContentProviderError && error.code === "CONTENT_PROVIDER_REQUEST_FAILED" && error.retryable === true && error.cause === undefined && !JSON.stringify(error).includes("secret"));
  const oversized = new ContentProviderRegistry([{ id: "large-provider", generate: async () => ({ payload: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES) }) }]);
  await assert.rejects(() => oversized.generate("large-provider", {}), /response is invalid/u);
  assert.throws(() => new ContentProviderRegistry([{ id: "same-provider", generate() {} }, { id: "same-provider", generate() {} }]), /unique/u);
});

test("HTTPS JSON provider uses a no-redirect bounded contract and constructs trusted provenance", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    const body = Buffer.from(JSON.stringify({ brief: { version: "1.0", title: "Remote", audience: "Board", purpose: "Decision", sections: [{ id: "facts", title: "Facts", points: [{ label: "Result" }] }] }, requestId: "remote-1", sources: [{ id: "s1", title: "Source", locator: "https://example.test/source", accessedAt: "2026-08-28" }], citationsBySection: { facts: ["s1"] } }));
    return { ok: true, headers: { get: (name) => name === "content-type" ? "application/json; charset=utf-8" : name === "content-length" ? String(body.length) : null }, arrayBuffer: async () => body };
  };
  const provider = createHttpsJsonContentProvider({ id: "grounded-provider", endpoint: "https://provider.example.test/generate", model: "grounded-v1", token: "private-token", fetchImpl, timeoutMs: 5_000 });
  const result = await provider.generate({ version: "1.0", prompt: "facts", audience: "Board", purpose: "Decision", language: "en-US" });
  assert.equal(captured.url, "https://provider.example.test/generate"); assert.equal(captured.options.redirect, "error"); assert.equal(captured.options.headers.authorization, "Bearer private-token");
  assert.equal(result.provenance.providerId, "grounded-provider"); assert.equal(result.provenance.model, "grounded-v1"); assert.equal(result.provenance.requestId, "remote-1");
  assert.throws(() => createHttpsJsonContentProvider({ id: "provider", endpoint: "http://localhost/generate", model: "m", token: "t" }), /endpoint/u);
  assert.throws(() => createHttpsJsonContentProvider({ id: "provider", endpoint: "https://example.test/generate?key=secret", model: "m", token: "t" }), /endpoint/u);
});

test("HTTPS JSON provider bounds requests and streamed responses with classified errors", async () => {
  const requestProvider = createHttpsJsonContentProvider({ id: "bounded-provider", endpoint: "https://provider.example.test/generate", model: "m", token: "t", fetchImpl: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(() => requestProvider.generate({ prompt: "x".repeat(MAX_PROVIDER_REQUEST_BYTES) }), (error) => error.code === "CONTENT_PROVIDER_REQUEST_INVALID" && error.providerId === "bounded-provider" && error.cause === undefined);
  let reads = 0;
  const streamProvider = createHttpsJsonContentProvider({ id: "stream-provider", endpoint: "https://provider.example.test/generate", model: "m", token: "t", fetchImpl: async () => ({ ok: true, headers: { get: (name) => name === "content-type" ? "application/json" : null }, body: { getReader: () => ({ read: async () => reads++ === 0 ? { done: false, value: Buffer.alloc(MAX_PROVIDER_RESPONSE_BYTES) } : { done: false, value: Buffer.alloc(1) }, releaseLock() {} }) } }) });
  await assert.rejects(() => streamProvider.generate({ prompt: "safe" }), (error) => error.code === "CONTENT_PROVIDER_RESPONSE_INVALID" && error.providerId === "stream-provider" && error.cause === undefined);
  const rejected = createHttpsJsonContentProvider({ id: "retry-provider", endpoint: "https://provider.example.test/generate", model: "m", token: "t", fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => rejected.generate({ prompt: "safe" }), (error) => error.code === "CONTENT_PROVIDER_REJECTED" && error.retryable === true);
});

test("content provider deployment overlay mounts a file token only into the PPT creation worker", () => {
  const overlay = fs.readFileSync(path.join(__dirname, "..", "deploy", "compose.team-ppt-create-provider.yaml"), "utf8");
  assert.match(overlay, /ppt-create-worker:/u); assert.match(overlay, /COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_TOKEN_FILE: \/run\/secrets\//u);
  assert.match(overlay, /COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_TOKEN: !reset null/u); assert.doesNotMatch(overlay, /COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_TOKEN: \$\{/u);
  assert.equal((overlay.match(/common_tools_ppt_create_content_provider_token:/gu) || []).length, 1);
});

test("content provider config loads multiple bounded providers with file-only secrets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-content-providers-"));
  try {
    fs.writeFileSync(path.join(root, "alpha.token"), "alpha-secret\n");
    fs.writeFileSync(path.join(root, "beta.token"), "beta-secret\n");
    fs.writeFileSync(path.join(root, "providers.json"), JSON.stringify({ version: "1.0", providers: [
      { id: "alpha", endpoint: "https://alpha.example.test/generate", model: "a1", tokenFile: "alpha.token", timeoutMs: 5000 },
      { id: "beta", endpoint: "https://beta.example.test/generate", model: "b1", tokenFile: "beta.token" }
    ] }));
    const registry = loadContentProviderConfig({ configFile: "providers.json", allowedRoot: root, fetchImpl: async () => { throw new Error("not called"); } });
    assert.deepEqual(registry.ids(), ["alpha", "beta"]);
    assert.throws(() => loadContentProviderConfig({ configFile: "../outside.json", allowedRoot: root }), /outside/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("content provider config resolves real paths and blocks parent-symlink escapes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-provider-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-provider-outside-"));
  try {
    fs.writeFileSync(path.join(outside, "providers.json"), JSON.stringify({ version: "1.0", providers: [] }));
    fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => loadContentProviderConfig({ configFile: "linked/providers.json", allowedRoot: root }), /outside the approved root/u);
    assert.throws(() => loadContentProviderConfig({ configFile: "missing.json", allowedRoot: root }), (error) => error.message === "content provider config is unavailable" && !error.message.includes(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
