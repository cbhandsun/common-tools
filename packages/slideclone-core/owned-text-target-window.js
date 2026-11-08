// @ts-check
"use strict";
const { types } = require("node:util");
const OWNED_TEXT_WINDOW_TARGET_LIMIT = 4;
const OWNED_TEXT_WINDOW_LIMIT = 3;
const OWNED_TEXT_SEARCH_PASS_LIMIT = 3;
const OWNED_TEXT_SEARCH_TARGET_LIMIT = OWNED_TEXT_WINDOW_TARGET_LIMIT * OWNED_TEXT_WINDOW_LIMIT * OWNED_TEXT_SEARCH_PASS_LIMIT;
/** @typedef {{pageIndex:number,id:string,textRevision:string,sourceHash:string}} TargetRevision */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {TargetRevision[]} */
function parseOwnedTextHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || types.isProxy(value) || value.length > OWNED_TEXT_SEARCH_TARGET_LIMIT) throw new TypeError("owned text target history is invalid");
  /** @type {TargetRevision[]} */ const result = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !("value" in property)) throw new TypeError("owned text target history entry is invalid");
    const item = property.value;
    if (!record(item) || typeof item.pageIndex !== "number" || !Number.isSafeInteger(item.pageIndex) || item.pageIndex < 0 || item.pageIndex >= 20
      || typeof item.id !== "string" || !item.id || item.id.length > 256 || [...item.id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      || typeof item.textRevision !== "string" || !/^[a-f0-9]{64}$/u.test(item.textRevision)
      || typeof item.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(item.sourceHash)) throw new TypeError("owned text target history entry is invalid");
    const entry = { pageIndex: item.pageIndex, id: item.id, textRevision: item.textRevision, sourceHash: item.sourceHash };
    const key = targetRevisionKey(entry);
    if (seen.has(key)) throw new TypeError("owned text target history is ambiguous");
    seen.add(key); result.push(entry);
  }
  return result;
}
/** @param {TargetRevision} value */
function targetRevisionKey(value) { return JSON.stringify([value.pageIndex, value.id, value.textRevision, value.sourceHash]); }
/** @template {TargetRevision} T @param {T[]} ranked @param {unknown} history @returns {T[]} */
function ownedTextTargetWindow(ranked, history) {
  const parsed = parseOwnedTextHistory(history);
  const attempted = new Set(parsed.map(targetRevisionKey));
  return ranked.filter(target => !attempted.has(targetRevisionKey(target)))
    .slice(0, Math.min(OWNED_TEXT_WINDOW_TARGET_LIMIT, OWNED_TEXT_SEARCH_TARGET_LIMIT - parsed.length));
}
module.exports = { ownedTextTargetWindow, parseOwnedTextHistory, OWNED_TEXT_WINDOW_TARGET_LIMIT,
  OWNED_TEXT_WINDOW_LIMIT, OWNED_TEXT_SEARCH_PASS_LIMIT, OWNED_TEXT_SEARCH_TARGET_LIMIT };
