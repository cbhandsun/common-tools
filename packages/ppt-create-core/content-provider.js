"use strict";

const MAX_PROVIDER_RESPONSE_BYTES = 512 * 1024;
const MAX_PROVIDER_REQUEST_BYTES = 256 * 1024;
const PROVIDER_ID = /^[a-z][a-z0-9._-]{1,79}$/u;

class ContentProviderError extends Error {
  constructor(message, { code, providerId, retryable = false } = {}) {
    super(message);
    this.name = "ContentProviderError";
    this.code = code;
    this.providerId = providerId;
    this.retryable = retryable;
  }
}

function boundedString(value, label, maximum) {
  const hasControlCharacter = typeof value === "string"
    && [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    });
  if (typeof value !== "string" || !value.trim() || value.length > maximum || hasControlCharacter) throw new TypeError(`${label} is invalid`);
  return value.trim();
}

function encodeProviderRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new ContentProviderError("content provider request is invalid", { code: "CONTENT_PROVIDER_REQUEST_INVALID" });
  let body;
  try { body = JSON.stringify(request); } catch { throw new ContentProviderError("content provider request is invalid", { code: "CONTENT_PROVIDER_REQUEST_INVALID" }); }
  if (!body || Buffer.byteLength(body) > MAX_PROVIDER_REQUEST_BYTES) throw new ContentProviderError("content provider request is invalid", { code: "CONTENT_PROVIDER_REQUEST_INVALID" });
  return body;
}

async function readBoundedResponse(response) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader(); const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value); total += chunk.length;
        if (total > MAX_PROVIDER_RESPONSE_BYTES) throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID" });
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, total);
    } catch (error) {
      try { await reader.cancel?.(); } catch { /* Preserve the classified read failure. */ }
      throw error;
    } finally { reader.releaseLock?.(); }
  }
  if (typeof response.arrayBuffer !== "function") throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID" });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PROVIDER_RESPONSE_BYTES) throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID" });
  return bytes;
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider) || Object.keys(provider).some((key) => !["id", "generate"].includes(key))) throw new TypeError("content provider is invalid");
  const id = boundedString(provider.id, "content provider id", 80);
  if (!PROVIDER_ID.test(id) || id === "deterministic-local" || typeof provider.generate !== "function") throw new TypeError("content provider is invalid");
  return Object.freeze({ id, generate: provider.generate });
}

class ContentProviderRegistry {
  #providers;

  constructor(providers = []) {
    if (!Array.isArray(providers) || providers.length > 8) throw new TypeError("content providers are invalid");
    this.#providers = new Map();
    for (const value of providers) {
      const provider = normalizeProvider(value);
      if (this.#providers.has(provider.id)) throw new TypeError("content provider ids must be unique");
      this.#providers.set(provider.id, provider);
    }
    Object.freeze(this);
  }

  ids() { return Object.freeze([...this.#providers.keys()].sort()); }

  async generate(providerId, request) {
    const id = boundedString(providerId, "content provider id", 80);
    const provider = this.#providers.get(id);
    if (!provider) throw new ContentProviderError("requested content provider is unavailable", { code: "CONTENT_PROVIDER_UNAVAILABLE", providerId: id });
    let result;
    try { result = await provider.generate(request); } catch (error) {
      if (error instanceof ContentProviderError) throw error;
      throw new ContentProviderError("content provider request failed", { code: "CONTENT_PROVIDER_REQUEST_FAILED", providerId: id, retryable: true });
    }
    let encoded;
    try { encoded = JSON.stringify(result); } catch { throw new ContentProviderError("content provider response is invalid", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId: id }); }
    if (!encoded || Buffer.byteLength(encoded) > MAX_PROVIDER_RESPONSE_BYTES) throw new ContentProviderError("content provider response is invalid", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId: id });
    return result;
  }
}

function createHttpsJsonContentProvider({ id, endpoint, model, token, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const providerId = boundedString(id, "content provider id", 80); const modelId = boundedString(model, "content provider model", 120); const bearerToken = boundedString(token, "content provider token", 16_384);
  if (!PROVIDER_ID.test(providerId) || typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new TypeError("content provider configuration is invalid");
  let url; try { url = new URL(endpoint); } catch { throw new TypeError("content provider endpoint is invalid"); }
  if (url.href.length > 2048 || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new TypeError("content provider endpoint is invalid");
  return normalizeProvider({ id: providerId, async generate(request) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = encodeProviderRequest({ version: "1.0", model: modelId, request });
      const response = await fetchImpl(url.href, { method: "POST", redirect: "error", signal: controller.signal, headers: { accept: "application/json", authorization: `Bearer ${bearerToken}`, "content-type": "application/json" }, body });
      if (!response || response.ok !== true) throw new ContentProviderError("content provider rejected the request", { code: "CONTENT_PROVIDER_REJECTED", providerId, retryable: Number(response?.status) === 429 || Number(response?.status) >= 500 });
      const contentType = response.headers?.get?.("content-type") || ""; const declaredLength = Number(response.headers?.get?.("content-length") || 0);
      if (!/^application\/json(?:\s*;|$)/iu.test(contentType) || !Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId });
      const bytes = await readBoundedResponse(response);
      if (bytes.length < 2 || bytes.length > MAX_PROVIDER_RESPONSE_BYTES) throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId });
      let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId }); }
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["brief", "citationsBySection", "requestId", "sources"].includes(key))) throw new ContentProviderError("content provider returned an invalid response", { code: "CONTENT_PROVIDER_RESPONSE_INVALID", providerId });
      return { brief: value.brief, provenance: { providerId, model: modelId, requestId: boundedString(value.requestId, "content provider request id", 160), retrievedAt: new Date().toISOString(), sources: value.sources }, citationsBySection: value.citationsBySection };
    } catch (error) {
      if (error instanceof ContentProviderError) {
        if (error.providerId) throw error;
        throw new ContentProviderError(error.message, { code: error.code, providerId, retryable: error.retryable });
      }
      if (controller.signal.aborted) throw new ContentProviderError("content provider request timed out", { code: "CONTENT_PROVIDER_TIMEOUT", providerId, retryable: true });
      throw new ContentProviderError("content provider request failed", { code: "CONTENT_PROVIDER_REQUEST_FAILED", providerId, retryable: true });
    } finally { clearTimeout(timeout); }
  } });
}

module.exports = { ContentProviderError, ContentProviderRegistry, MAX_PROVIDER_REQUEST_BYTES, MAX_PROVIDER_RESPONSE_BYTES, createHttpsJsonContentProvider, normalizeProvider, readBoundedResponse };
