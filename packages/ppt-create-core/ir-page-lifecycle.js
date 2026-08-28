"use strict";

const MAX_PAGES = 100;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  if (!plainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} is invalid`);
}
function pageIndex(value, pages, label, { allowEnd = false } = {}) {
  const maximum = allowEnd ? pages.length : pages.length - 1;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(`${label} is invalid`);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function renumber(pages) { pages.forEach((page, index) => { page.pageIndex = index; }); }

function applyPageLifecycleOperation(ir, operation, index) {
  const label = `editable IR operation ${index + 1}`;
  if (operation.type === "add-blank-page") {
    exactKeys(operation, ["type", "insertAt"], label);
    if (ir.pages.length >= MAX_PAGES) throw new TypeError("editable deck page limit exceeded");
    const insertAt = pageIndex(operation.insertAt, ir.pages, "editable page insertion", { allowEnd: true });
    ir.pages.splice(insertAt, 0, { pageIndex: insertAt, background: { fill: "#FFFFFF" }, textBoxes: [], shapes: [], images: [], tables: [], charts: [], icons: [] });
    renumber(ir.pages);
    return true;
  }
  if (operation.type === "duplicate-page") {
    exactKeys(operation, ["type", "pageIndex", "insertAt"], label);
    if (ir.pages.length >= MAX_PAGES) throw new TypeError("editable deck page limit exceeded");
    const sourceIndex = pageIndex(operation.pageIndex, ir.pages, "editable page target");
    const insertAt = pageIndex(operation.insertAt, ir.pages, "editable page insertion", { allowEnd: true });
    ir.pages.splice(insertAt, 0, clone(ir.pages[sourceIndex]));
    renumber(ir.pages);
    return true;
  }
  if (operation.type === "delete-page") {
    exactKeys(operation, ["type", "pageIndex"], label);
    if (ir.pages.length === 1) throw new TypeError("editable deck must retain one page");
    ir.pages.splice(pageIndex(operation.pageIndex, ir.pages, "editable page target"), 1);
    renumber(ir.pages);
    return true;
  }
  if (operation.type === "move-page") {
    exactKeys(operation, ["type", "pageIndex", "toIndex"], label);
    const sourceIndex = pageIndex(operation.pageIndex, ir.pages, "editable page target");
    const toIndex = pageIndex(operation.toIndex, ir.pages, "editable page destination");
    ir.pages.splice(toIndex, 0, ir.pages.splice(sourceIndex, 1)[0]);
    renumber(ir.pages);
    return true;
  }
  return false;
}

module.exports = { MAX_PAGES, applyPageLifecycleOperation };
