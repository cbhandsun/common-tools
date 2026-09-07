// @ts-check
"use strict";

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("editable deck object structure is invalid");
  return /** @type {Record<string, unknown>} */ (value);
}

/** .NET model binding is case-insensitive; the admission contract uses camelCase.
 * @param {Record<string, unknown>} value @param {string[]} names */
function canonicalFields(value, names) {
  const canonical = new Map(names.map(name => [name.toLowerCase(), name]));
  for (const key of Object.keys(value)) {
    const expected = canonical.get(key.toLowerCase());
    if (expected !== undefined && expected !== key) throw new TypeError("editable deck field casing is invalid");
  }
}

/** @param {Record<string, unknown>} value @param {string[]} names */
function stringFields(value, names) {
  for (const name of names) {
    if (value[name] != null && typeof value[name] !== "string") throw new TypeError("editable deck text field is invalid");
  }
}

/** @param {unknown} value */
function font(value) {
  if (value == null) return;
  const entry = object(value);
  const strings = ["family", "weight", "color", "align", "valign"];
  const numbers = ["sizePt", "lineHeightMultiple", "opacity"];
  canonicalFields(entry, [...strings, ...numbers]);
  stringFields(entry, strings);
  for (const name of numbers) {
    const number = entry[name];
    if (number != null && (typeof number !== "number" || !Number.isFinite(number))) throw new TypeError("editable deck font number is invalid");
  }
}

/** @param {Record<string, unknown>} entry */
function textData(entry) {
  font(entry.font);
  stringFields(entry, ["role"]);
  if (entry.wrap != null && typeof entry.wrap !== "boolean") throw new TypeError("editable deck text wrap is invalid");
  if (entry.rotation != null && (typeof entry.rotation !== "number" || !Number.isFinite(entry.rotation))) throw new TypeError("editable deck text rotation is invalid");
  if (entry.runs != null) {
    for (const value of list(entry.runs, 10000)) {
      const run = object(value);
      canonicalFields(run, ["text", "font"]);
      stringFields(run, ["text"]);
      font(run.font);
    }
  }
}

/** @param {Record<string, unknown>} value @param {string[]} names */
function integers(value, names) {
  for (const name of names) {
    const number = value[name];
    if (number != null && (typeof number !== "number" || !Number.isInteger(number) || number < -2147483648 || number > 2147483647)) throw new TypeError("editable deck integer field is invalid");
  }
}

/** @param {Record<string, unknown>} page */
function pageMetadata(page) {
  // The builder replaces per-page dimensions with the deck dimensions, but
  // deserializes this public model property first. Preserve absent defaults.
  if (page.slideSize != null) {
    const dimensions = object(page.slideSize);
    canonicalFields(dimensions, ["widthPt", "heightPt"]);
    for (const name of ["widthPt", "heightPt"]) {
      if (dimensions[name] !== undefined && (typeof dimensions[name] !== "number" || !Number.isFinite(dimensions[name]))) throw new TypeError("editable deck page dimensions are invalid");
    }
  }
  stringFields(page, ["sourceImage", "speakerNotes"]);
  if (page.preserveTemplateSlide != null && typeof page.preserveTemplateSlide !== "boolean") throw new TypeError("editable deck template flag is invalid");
  if (page.citations != null) {
    const fields = ["id", "title", "locator", "accessedAt", "license"];
    for (const value of list(page.citations, 10000)) {
      const citation = object(value);
      canonicalFields(citation, fields);
      stringFields(citation, fields);
    }
  }
  if (page.intent != null) {
    const intent = object(page.intent);
    const fields = ["templateLayoutId", "templateLayoutName", "templateLayoutFit", "templateLayoutMode"];
    const counts = ["templatePlaceholderCapacity", "templateLayoutDemand"];
    canonicalFields(intent, [...fields, ...counts, "templatePlaceholderBindings"]);
    stringFields(intent, fields);
    integers(intent, counts);
    if (intent.templatePlaceholderBindings != null) {
      const strings = ["objectId", "collection", "role", "placeholderType"];
      const bindings = list(intent.templatePlaceholderBindings, 128);
      const objectKeys = new Set();
      const placeholderKeys = new Set();
      for (const value of bindings) {
        const binding = object(value);
        canonicalFields(binding, [...strings, "placeholderIndex"]);
        stringFields(binding, strings);
        integers(binding, ["placeholderIndex"]);
        const objectId = binding.objectId;
        const collection = binding.collection;
        const placeholderType = binding.placeholderType;
        const placeholderIndex = binding.placeholderIndex;
        const normalizedPlaceholderType = typeof placeholderType === "string" ? placeholderType.trim().toLowerCase() : "";
        if (typeof objectId !== "string" || !objectId.trim() || objectId.length > 256
          || typeof collection !== "string" || !["textBoxes", "images", "tables", "charts"].includes(collection)
          || typeof placeholderType !== "string" || !["title", "ctrtitle", "summary", "subtitle", "obj", "pic", "tbl", "chart", "page-number", "section-number", "body", "item-title", "item-detail", "takeaway", "value"].includes(normalizedPlaceholderType)
          || typeof placeholderIndex !== "number" || placeholderIndex < 0 || placeholderIndex > 65535) throw new TypeError("editable deck template placeholder binding is invalid");
        const objectKey = `${collection}:${objectId}`;
        const placeholderKey = `${placeholderType}:${placeholderIndex}`;
        if (objectKeys.has(objectKey) || placeholderKeys.has(placeholderKey)) throw new TypeError("editable deck template placeholder binding is invalid");
        objectKeys.add(objectKey);
        placeholderKeys.add(placeholderKey);
      }
    }
  }
}

/** @param {unknown} value */
function points(value) {
  if (value == null) return;
  for (const item of list(value, 10000)) {
    const point = object(item);
    canonicalFields(point, ["x", "y"]);
    if (typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError("editable deck point is invalid");
  }
}

/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError("editable deck data collection is invalid");
  return value;
}

/** @param {unknown} value */
function numbers(value) {
  for (const item of list(value, 10000)) {
    if (typeof item !== "number" || !Number.isFinite(item) || Math.abs(item) > 100000) throw new TypeError("editable deck chart value is invalid");
  }
}

/** @param {Record<string, unknown>} entry */
function chartData(entry) {
  if (entry.categories != null) {
    for (const label of list(entry.categories, 10000)) {
      if (typeof label !== "string" || label.length > 4096) throw new TypeError("editable deck chart label is invalid");
    }
  }
  if (entry.values != null) numbers(entry.values);
  if (entry.series != null) {
    for (const value of list(entry.series, 64)) {
      const series = object(value);
      canonicalFields(series, ["name", "values"]);
      if (series.name != null && (typeof series.name !== "string" || series.name.length > 4096)) throw new TypeError("editable deck chart series name is invalid");
      numbers(series.values);
    }
  }
}

/** Validate the shared object structure while preserving optional legacy fields.
 * Per-kind geometry, chart data and reconstruction metadata need their own contracts.
 * @param {unknown} pages */
function validateDeckPageStructures(pages) {
  if (!Array.isArray(pages)) throw new TypeError("editable deck pages are invalid");
  const pageIndices = new Set();
  for (const value of pages) {
    const page = object(value);
    canonicalFields(page, ["pageIndex", "slideSize", "sourceImage", "textBoxes", "shapes", "images", "tables", "charts", "icons", "background", "reconstruction", "intent", "citations", "speakerNotes", "preserveTemplateSlide"]);
    pageMetadata(page);
    if (page.reconstruction != null) object(page.reconstruction);
    const pageIndex = page.pageIndex === undefined ? 0 : page.pageIndex;
    if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= 10000 || pageIndices.has(pageIndex)) throw new TypeError("editable deck page index is invalid");
    pageIndices.add(pageIndex);
    for (const key of ["textBoxes", "shapes", "images", "tables", "charts", "icons"]) {
      const items = page[key];
      if (items === undefined) continue;
      if (!Array.isArray(items)) throw new TypeError("editable deck object collection is invalid");
      for (const item of items) {
        const entry = object(item);
        canonicalFields(entry, ["id", "type", "text", "box", "font", "style", "rotation", "source", "wrap", "runs", "role", "assetPath", "rows", "categories", "values", "series", "nativePayload", "points"]);
        stringFields(entry, ["id", "type"]);
        if (key === "textBoxes") textData(entry);
        if (["shapes", "images", "tables"].includes(key)) points(entry.points);
        // OpenXML's rendered element models dereference Box; unlike page
        // collections, it has no absent-value fallback. Icons are legacy metadata.
        if (key !== "icons" && entry.box === undefined) throw new TypeError("editable deck object box is required");
        if (entry.source != null) {
          const source = object(entry.source);
          if (source.reconstruction != null) object(source.reconstruction);
        }
        // Shapes, images and tables all deserialize as VisualElementIr.
        if (["shapes", "images", "tables"].includes(key) && entry.rows != null) {
          for (const row of list(entry.rows, 10000)) {
            if (list(row, 10000).some(cell => typeof cell !== "string")) throw new TypeError("editable deck table cell is invalid");
          }
        }
        if (key === "charts") chartData(entry);
        if (entry.box !== undefined) {
          const box = object(entry.box);
          // The builder treats line extents as directed endpoint offsets and
          // converts their signs into connector flips. Other boxes are areas.
          const directedLine = key === "shapes" && typeof entry.type === "string" && entry.type.toLowerCase() === "line";
          for (const coordinate of ["x", "y", "w", "h"]) {
            const number = box[coordinate];
            if (typeof number !== "number" || !Number.isFinite(number) || Math.abs(number) > 100000
              || (!directedLine && (coordinate === "w" || coordinate === "h") && number < 0)) throw new TypeError("editable deck object box is invalid");
          }
        }
        if (key === "textBoxes" && entry.text !== undefined && typeof entry.text !== "string") throw new TypeError("editable deck text is invalid");
      }
    }
  }
}

module.exports = { validateDeckPageStructures };
