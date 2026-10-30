// @ts-check
"use strict";

/** @typedef {Record<string, number | boolean | string>} ProgressEvent */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Read data only: metadata accessors must not execute while projecting diagnostics.
 * @param {unknown} value @param {string} key @returns {unknown}
 */
function dataField(value, key) {
  if (!isRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

/** @param {unknown} value @param {string} label @param {number} minimum */
function boundedIndex(value, label, minimum = 0) {
  const number = typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < minimum || number > 100000) {
    throw new TypeError(`${label} is invalid`);
  }
  return number;
}

/** @param {unknown} value @returns {Record<string, number | boolean>} */
function safeProgressMetadata(value) {
  /** @type {Record<string, number | boolean>} */
  const result = {};
  for (const key of ["cached", "nativePassthrough"]) {
    const item = dataField(value, key);
    if (typeof item === "boolean") result[key] = item;
  }
  for (const key of ["imageDecodeMs", "visualFeatureCacheHits", "visualFeatureCacheMisses", "visualFeatureCacheEntries", "pngReadCacheHits", "pngReadCacheMisses", "pngReadCacheEntries", "pngReadCacheBytes"]) {
    const item = dataField(value, key);
    if (typeof item === "number" && Number.isSafeInteger(item) && item >= 0 && item <= 1_000_000_000) result[key] = item;
  }
  return result;
}

/** @param {unknown} page @param {string} field */
function collectionCount(page, field) {
  const value = dataField(page, field);
  return Array.isArray(value) ? Math.min(value.length, 1_000_000_000) : 0;
}

/** Page diagnostics accept unknown drafts without projecting their content.
 * @param {unknown} input
 */
function createPageProgressLifecycle(input = {}) {
  if (!isRecord(input)) throw new TypeError("page progress options are invalid");
  const reporter = input.progressReporter;
  if (!isRecord(reporter) || typeof reporter.emit !== "function") throw new TypeError("progress reporter is invalid");
  const emit = reporter.emit.bind(reporter);
  const sourcePageNumber = boundedIndex(input.pageIndex, "page index") + 1;
  const ordinal = boundedIndex(input.selectedPageOrdinal, "selected page ordinal") + 1;
  const total = boundedIndex(input.selectedPageTotal, "page total", 1);
  if (ordinal > total) throw new TypeError("selected page ordinal exceeds page total");
  const pageTimings = input.pageTimings;
  const startedAt = performance.now();
  emit({ phase: "page", status: "start", page: sourcePageNumber, pageIndex: ordinal, pageTotal: total });
  let completed = false;

  /** @template T @param {T} pageDraft @param {unknown} metadata @returns {T} */
  function complete(pageDraft, metadata = {}) {
    if (completed) throw new Error("page progress lifecycle is already complete");
    // A failing sink must not permit duplicate terminal events on retry.
    completed = true;
    const elapsedMs = Math.min(1_000_000_000, Math.max(0, Math.floor(performance.now() - startedAt)));
    const safeMetadata = safeProgressMetadata(metadata);
    /** @type {ProgressEvent} */
    const projection = {
      phase: "page", status: "done", page: sourcePageNumber, pageIndex: ordinal, pageTotal: total,
      elapsedMs, images: collectionCount(pageDraft, "images"), shapes: collectionCount(pageDraft, "shapes"),
      textBoxes: collectionCount(pageDraft, "textBoxes"), ...safeMetadata
    };
    emit(projection);
    if (Array.isArray(pageTimings)) pageTimings.push({ page: sourcePageNumber, elapsedMs, ...safeMetadata });
    return pageDraft;
  }
  return Object.freeze({ complete });
}

module.exports = { createPageProgressLifecycle };
