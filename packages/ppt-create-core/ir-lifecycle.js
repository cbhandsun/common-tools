"use strict";

const path = require("node:path");

const MAX_OBJECTS_PER_PAGE = 2_000;
const NEW_OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  if (!plainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} is invalid`);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function pageObjectCount(page, collections) { return collections.reduce((total, collection) => total + (page[collection] || []).length, 0); }
function newObjectId(page, collections, value) {
  if (typeof value !== "string" || !NEW_OBJECT_ID.test(value) || collections.some((collection) => (page[collection] || []).some((item) => item.id === value))) throw new TypeError("editable object id is invalid");
  return value;
}
function location(page, collections, objectId) {
  if (typeof objectId !== "string") throw new TypeError("editable patch target is invalid");
  for (const collection of collections) {
    const index = (page[collection] || []).findIndex((candidate) => candidate.id === objectId);
    if (index >= 0) return { collection, index, item: page[collection][index] };
  }
  throw new TypeError("editable patch target does not exist");
}
function targetPage(ir, pageIndex) {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= ir.pages.length) throw new TypeError("editable patch target is invalid");
  return ir.pages[pageIndex];
}

function applyObjectLifecycleOperation(ir, operation, index, { collections, validateBox, boundedText }) {
  const label = `editable IR operation ${index + 1}`;
  if (operation.type === "add-text-object") {
    exactKeys(operation, ["type", "pageIndex", "objectId", "box", "value"], label);
    const page = targetPage(ir, operation.pageIndex);
    if (pageObjectCount(page, collections) >= MAX_OBJECTS_PER_PAGE) throw new TypeError("editable page object limit exceeded");
    const objectId = newObjectId(page, collections, operation.objectId);
    page.textBoxes ||= [];
    page.textBoxes.push({ id: objectId, role: "body", text: boundedText(operation.value), box: { ...validateBox(operation.box, ir.slideSize) }, font: { family: "Arial", sizePt: 16, color: "#111827", weight: "normal", align: "left" }, style: { fill: "none", stroke: "none", opacity: 1 } });
    return true;
  }
  if (operation.type === "add-shape-object") {
    exactKeys(operation, ["type", "pageIndex", "objectId", "box", "shapeType"], label);
    const page = targetPage(ir, operation.pageIndex);
    if (pageObjectCount(page, collections) >= MAX_OBJECTS_PER_PAGE) throw new TypeError("editable page object limit exceeded");
    const objectId = newObjectId(page, collections, operation.objectId);
    if (!["rect", "roundRect", "ellipse", "line"].includes(operation.shapeType)) throw new TypeError("editable shape type is invalid");
    page.shapes ||= [];
    page.shapes.push({ id: objectId, type: operation.shapeType, box: { ...validateBox(operation.box, ir.slideSize) }, style: { fill: operation.shapeType === "line" ? "none" : "#E0F2FE", stroke: "#0284C7", opacity: 1, strokeWidthPt: 1 } });
    return true;
  }
  if (operation.type === "duplicate-object") {
    exactKeys(operation, ["type", "pageIndex", "objectId", "newObjectId", "offsetXPt", "offsetYPt"], label);
    const page = targetPage(ir, operation.pageIndex);
    if (pageObjectCount(page, collections) >= MAX_OBJECTS_PER_PAGE) throw new TypeError("editable page object limit exceeded");
    const source = location(page, collections, operation.objectId);
    const objectId = newObjectId(page, collections, operation.newObjectId);
    for (const offset of [operation.offsetXPt, operation.offsetYPt]) if (typeof offset !== "number" || !Number.isFinite(offset) || offset < -4_000 || offset > 4_000) throw new TypeError("editable duplicate offset is invalid");
    const duplicate = clone(source.item); duplicate.id = objectId; duplicate.box = { ...duplicate.box, x: duplicate.box.x + operation.offsetXPt, y: duplicate.box.y + operation.offsetYPt };
    validateBox(duplicate.box, ir.slideSize); page[source.collection].splice(source.index + 1, 0, duplicate);
    return true;
  }
  if (operation.type === "delete-object") {
    exactKeys(operation, ["type", "pageIndex", "objectId"], label);
    const page = targetPage(ir, operation.pageIndex); const target = location(page, collections, operation.objectId);
    page[target.collection].splice(target.index, 1);
    return true;
  }
  if (operation.type === "set-image-asset") {
    exactKeys(operation, ["type", "pageIndex", "objectId", "assetPath"], label);
    const page = targetPage(ir, operation.pageIndex); const target = location(page, collections, operation.objectId);
    const assetPath = typeof operation.assetPath === "string" ? operation.assetPath.trim() : "";
    if (target.collection !== "images" || !assetPath || assetPath.length > 1024 || [...assetPath].some((character) => { const code = character.codePointAt(0); return code <= 0x1f || code === 0x7f; }) || /^(?:data|file|https?|javascript):/iu.test(assetPath) || ![".png", ".jpg", ".jpeg"].includes(path.extname(assetPath).toLowerCase())) throw new TypeError("editable image asset path is invalid");
    target.item.assetPath = assetPath;
    return true;
  }
  return false;
}

module.exports = { MAX_OBJECTS_PER_PAGE, NEW_OBJECT_ID, applyObjectLifecycleOperation };
