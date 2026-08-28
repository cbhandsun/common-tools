"use strict";

const MAX_PROVIDER_RESPONSE_BYTES = 512 * 1024;
const PROVIDER_ID = /^[a-z][a-z0-9._-]{1,79}$/u;

function boundedString(value, label, maximum) {
  const hasControlCharacter = typeof value === "string"
    && [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    });
  if (typeof value !== "string" || !value.trim() || value.length > maximum || hasControlCharacter) throw new TypeError(`${label} is invalid`);
  return value.trim();
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
    if (!provider) throw new Error("requested content provider is unavailable");
    let result;
    try { result = await provider.generate(request); } catch (error) { throw new Error("content provider request failed", { cause: error }); }
    let encoded;
    try { encoded = JSON.stringify(result); } catch (error) { throw new Error("content provider response is invalid", { cause: error }); }
    if (!encoded || Buffer.byteLength(encoded) > MAX_PROVIDER_RESPONSE_BYTES) throw new Error("content provider response is invalid");
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
      const response = await fetchImpl(url.href, { method: "POST", redirect: "error", signal: controller.signal, headers: { accept: "application/json", authorization: `Bearer ${bearerToken}`, "content-type": "application/json" }, body: JSON.stringify({ version: "1.0", model: modelId, request }) });
      if (!response || response.ok !== true || typeof response.arrayBuffer !== "function") throw new Error("provider rejected the request");
      const contentType = response.headers?.get?.("content-type") || ""; const declaredLength = Number(response.headers?.get?.("content-length") || 0);
      if (!/^application\/json(?:\s*;|$)/iu.test(contentType) || !Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new Error("provider returned an invalid response");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 2 || bytes.length > MAX_PROVIDER_RESPONSE_BYTES) throw new Error("provider returned an invalid response");
      let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("provider returned an invalid response"); }
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["brief", "citationsBySection", "requestId", "sources"].includes(key))) throw new Error("provider returned an invalid response");
      return { brief: value.brief, provenance: { providerId, model: modelId, requestId: boundedString(value.requestId, "content provider request id", 160), retrievedAt: new Date().toISOString(), sources: value.sources }, citationsBySection: value.citationsBySection };
    } finally { clearTimeout(timeout); }
  } });
}

module.exports = { ContentProviderRegistry, MAX_PROVIDER_RESPONSE_BYTES, createHttpsJsonContentProvider, normalizeProvider };
