"use strict";

const MAX_PAGE_NUMBER = 100000;

function parsePageSelection(value) {
  if (value == null || value === "" || value === false) return null;
  const tokens = Array.isArray(value) ? value : String(value).split(/[,\s]+/u).filter(Boolean);
  if (tokens.length > 10000) throw new RangeError("page selection contains too many tokens");
  const selected = new Set();
  for (const token of tokens) {
    const text = String(token || "").trim();
    if (!text) continue;
    const range = text.match(/^(\d+)\s*-\s*(\d+)$/u);
    if (range) {
      const start = pageNumber(range[1]);
      const end = pageNumber(range[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      if (max - min > 10000) throw new RangeError("page selection range is too large");
      for (let page = min; page <= max; page += 1) selected.add(page - 1);
      continue;
    }
    if (!/^\d+$/u.test(text)) throw new TypeError(`invalid page selection token: ${text.slice(0, 80)}`);
    selected.add(pageNumber(text) - 1);
  }
  return selected.size > 0 ? selected : null;
}

function shouldIncludePage(pageSelection, page = {}, pageIndex = 0) {
  if (!pageSelection || pageSelection.size === 0) return true;
  if (!(pageSelection instanceof Set)) throw new TypeError("pageSelection must be a Set or null");
  const indexes = [pageIndex, Number(page?.pageIndex)].filter((value) => Number.isSafeInteger(value) && value >= 0);
  return indexes.some((value) => pageSelection.has(value));
}

function planSelectedPages(pages, pageSelection) {
  if (!Array.isArray(pages) || pages.length > MAX_PAGE_NUMBER) throw new TypeError("pages must be a bounded array");
  const selected = [];
  pages.forEach((page, pageIndex) => {
    if (!shouldIncludePage(pageSelection, page, pageIndex)) return;
    selected.push(Object.freeze({ page, pageIndex, selectedPageOrdinal: selected.length }));
  });
  return selected;
}

function pageNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PAGE_NUMBER) throw new TypeError(`page number must be between 1 and ${MAX_PAGE_NUMBER}`);
  return number;
}

module.exports = { parsePageSelection, planSelectedPages, shouldIncludePage };
