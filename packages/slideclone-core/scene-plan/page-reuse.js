"use strict";
// @ts-check

/** @template T
 * @typedef {{ preserveNative: boolean, cacheEnabled: boolean, reuseCache: boolean,
 * stats?: unknown, services: { preserve: () => T, cacheKey: () => string,
 * read: (key: string) => T | null, normalize: (page: T) => T,
 * write: (key: string, page: T) => boolean } }} PageReuseInput
 */

/** @param {unknown} stats @param {"hits" | "misses" | "writes"} key */
function increment(stats, key) {
  if (stats === undefined || stats === null) return;
  if (typeof stats !== "object" || Array.isArray(stats)) throw new TypeError("page cache statistics are invalid");
  const descriptor = Object.getOwnPropertyDescriptor(stats, key);
  if (descriptor && (!("value" in descriptor) || !descriptor.writable)) throw new TypeError("page cache counter is invalid");
  const previous = descriptor?.value;
  const count = typeof previous === "number" && Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
  Object.defineProperty(stats, key, { value: Math.min(Number.MAX_SAFE_INTEGER, count + 1), writable: true, configurable: true, enumerable: true });
}

/** Resolve reuse before decoding; keep cache publication behind successful normalization.
 * @template T
 * @param {PageReuseInput<T>} input
 * @returns {{ kind: "reused", page: T, metadata: { nativePassthrough?: boolean, cached?: boolean } } | { kind: "rebuild", persist: (page: T) => T }}
 */
function resolvePageReuse(input) {
  if (!input || [input.preserveNative, input.cacheEnabled, input.reuseCache].some((flag) => typeof flag !== "boolean")) {
    throw new TypeError("page reuse flags are invalid");
  }
  const services = input.services;
  if (!services || [services.preserve, services.cacheKey, services.read, services.normalize, services.write].some((service) => typeof service !== "function")) {
    throw new TypeError("page reuse services are invalid");
  }
  if (input.preserveNative) return { kind: "reused", page: services.preserve(), metadata: { nativePassthrough: true } };
  const key = input.cacheEnabled ? services.cacheKey() : "";
  if (typeof key !== "string" || key.length > 4096) throw new TypeError("page cache key is invalid");
  if (key && input.reuseCache) {
    const cached = services.read(key);
    if (cached !== null) {
      const page = services.normalize(cached);
      increment(input.stats, "hits");
      return { kind: "reused", page, metadata: { cached: true } };
    }
  }
  if (key) increment(input.stats, "misses");
  let persisted = false;
  return { kind: "rebuild", persist(page) {
    if (persisted) throw new Error("page cache publication already attempted");
    persisted = true;
    const normalized = services.normalize(page);
    if (key && services.write(key, normalized)) increment(input.stats, "writes");
    return normalized;
  } };
}

module.exports = { resolvePageReuse };
