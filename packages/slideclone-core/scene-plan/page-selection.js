// @ts-check
"use strict";

const MAX_PAGE_NUMBER = 100000;
const MAX_TOKENS = 10000;
const MAX_INPUT_LENGTH = 1024 * 1024;

/** @param {unknown} value @returns {Set<number> | null} */
function parsePageSelection(value) {
  if (value == null || value === "" || value === false) return null;
  /** @type {unknown[]} */
  let tokens;
  if (Array.isArray(value)) tokens = value;
  else if (typeof value === "string" && value.length <= MAX_INPUT_LENGTH) tokens = value.split(/[,\s]+/u).filter(Boolean);
  else if (typeof value === "number" && Number.isSafeInteger(value)) tokens = [value];
  else throw new TypeError("invalid page selection input");
  if (tokens.length > MAX_TOKENS) throw new RangeError("page selection contains too many tokens");
  const selected = new Set();
  for (const token of tokens) {
    if (typeof token !== "string" && typeof token !== "number") throw new TypeError("invalid page selection token");
    if (typeof token === "string" && token.length > 64) throw new RangeError("page selection token is too large");
    const text = String(token).trim();
    if (!text) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/u.exec(text);
    if (range) {
      const start = pageNumber(range[1]); const end = pageNumber(range[2]);
      const min = Math.min(start, end); const max = Math.max(start, end);
      if (max - min > MAX_TOKENS) throw new RangeError("page selection range is too large");
      for (let page = min; page <= max; page += 1) selected.add(page - 1);
    } else {
      if (!/^\d+$/u.test(text)) throw new TypeError("invalid page selection token");
      selected.add(pageNumber(text) - 1);
    }
  }
  return selected.size > 0 ? selected : null;
}

/** @param {unknown} value @returns {asserts value is Set<number> | null | undefined} */
function assertPageSelection(value) {
  if (value == null) return;
  if (!(value instanceof Set) || value.size > MAX_PAGE_NUMBER) throw new TypeError("pageSelection must be a bounded Set or null");
  for (const index of value) {
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= MAX_PAGE_NUMBER) throw new TypeError("pageSelection contains an invalid index");
  }
}

/** @param {Set<number> | null | undefined} selection @param {unknown} page @param {number} index */
function included(selection, page, index) {
  if (!selection || selection.size === 0) return true;
  if (selection.has(index)) return true;
  const rawIndex = page && typeof page === "object" && "pageIndex" in page ? page.pageIndex : undefined;
  // Only scalar numeric metadata can participate in matching; never coerce objects.
  const metadataIndex = typeof rawIndex === "number" || typeof rawIndex === "string" ? Number(rawIndex) : NaN;
  return Number.isSafeInteger(metadataIndex) && metadataIndex >= 0 && selection.has(metadataIndex);
}

/** @param {unknown} pageSelection @param {unknown} page @param {number} pageIndex */
function shouldIncludePage(pageSelection, page = {}, pageIndex = 0) {
  assertPageSelection(pageSelection);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= MAX_PAGE_NUMBER) throw new TypeError("page index is invalid");
  return included(pageSelection, page, pageIndex);
}

/** @template T @param {T[]} pages @param {unknown} pageSelection @returns {Readonly<{page: T, pageIndex: number, selectedPageOrdinal: number}>[]} */
function planSelectedPages(pages, pageSelection) {
  if (!Array.isArray(pages) || pages.length > MAX_PAGE_NUMBER) throw new TypeError("pages must be a bounded array");
  assertPageSelection(pageSelection);
  /** @type {Readonly<{page: T, pageIndex: number, selectedPageOrdinal: number}>[]} */
  const selected = [];
  pages.forEach((page, pageIndex) => {
    if (included(pageSelection, page, pageIndex)) selected.push(Object.freeze({ page, pageIndex, selectedPageOrdinal: selected.length }));
  });
  return selected;
}

/** @param {unknown} value @returns {number} */
function pageNumber(value) {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PAGE_NUMBER) throw new TypeError(`page number must be between 1 and ${MAX_PAGE_NUMBER}`);
  return number;
}

module.exports = { parsePageSelection, planSelectedPages, shouldIncludePage };
