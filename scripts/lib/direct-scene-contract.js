"use strict";

// Experimental scene proposal admission. This grants no source, erase or
// publication authority. Diagnostics contain schema paths, never input values.
const { decodeNativeFreeformPath } = require("../../packages/slideclone-core/native-freeform-path");

class SceneContractError extends TypeError {
  constructor(path, reason) {
    super("DIRECT_SCENE_CONTRACT");
    Object.defineProperty(this, "diagnostic", {
      value: Object.freeze({ code: "DIRECT_SCENE_CONTRACT", path, reason })
    });
  }
}
function fail(path, reason) { throw new SceneContractError(path, reason); }
function diagnosticFor(error) {
  return error instanceof SceneContractError ? { ...error.diagnostic } : null;
}

// Admission accepts JSON data, not arbitrary executable object graphs. Inspect
// descriptors before copying so accessors/toJSON cannot run in validation.
function copyJson(value) {
  let nodes = 0;
  function copy(input, depth) {
    if (++nodes > 100000 || depth > 16) fail("$", "input_complexity");
    if (typeof input === "string" && input.length > 1048576) fail("$", "input_size");
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (!input || typeof input !== "object") fail("$", "invalid_json_data");
    const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array))
      fail("$", "invalid_json_data");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (array && (input.length > 100000 || Reflect.ownKeys(descriptors).length !== input.length + 1))
      fail("$", "invalid_json_data");
    const result = array ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
        fail("$", "invalid_json_data");
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length))
        fail("$", "invalid_json_data");
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, writable: true });
    }
    if (array && result.length !== input.length) fail("$", "invalid_json_data");
    return result;
  }
  const result = copy(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > 1048576) fail("$", "input_size");
  return result;
}

/** @param {unknown} input @param {number} labelCount */
function admit(input, labelCount) {
  if (!Number.isSafeInteger(labelCount) || labelCount < 0 || labelCount > 512)
    fail("$", "invalid_label_count");
  const raw = copyJson(input);
  const list = (value, path, max) => Array.isArray(value) && value.length <= max ? value : fail(path, "list_limit_or_type");
  const tuple = (value, path, length) => Array.isArray(value) && value.length === length ? value : fail(path, "tuple_length");
  const num = (value, path, lo = 0, hi = 1000) => typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi ? value : fail(path, "number_range");
  const count = (value, path, hi) => Number.isSafeInteger(value) ? num(value, path, 0, hi) : fail(path, "integer_required");
  const color = (value, path) => typeof value === "string" && /^(#[a-fA-F0-9]{6}|none)$/.test(value) ? value : fail(path, "invalid_color");
  const box = (value, path) => {
    tuple(value, path, 4); value.forEach((n, i) => num(n, `${path}[${i}]`));
    if (value[2] <= 0 || value[3] <= 0 || value[0] + value[2] > 1000.001 || value[1] + value[3] > 1000.001)
      fail(path, "invalid_box");
    return [...value];
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).sort().join(",") !== "background,complete,edges,objects,omissions,regions")
    fail("$", "root_keys");
  if (typeof raw.complete !== "boolean") fail("$.complete", "boolean_required");
  const omissions = list(raw.omissions, "$.omissions", 96);
  omissions.forEach((value, i) => {
    if (typeof value !== "string" || value.length > 160 || Array.from(value).some((char) => char.charCodeAt(0) < 32)) fail(`$.omissions[${i}]`, "invalid_omission");
  });
  const background = color(raw.background, "$.background");
  if (background === "none") fail("$.background", "background_required");
  const all = new Set(), labels = new Set();
  const unique = (value, path) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) fail(path, "invalid_id");
    if (all.has(value)) fail(path, "duplicate_id");
    all.add(value); return value;
  };
  const regions = list(raw.regions, "$.regions", 24).map((value, index) => {
    const path = `$.regions[${index}]`;
    tuple(value, path, 5); const [rid, bounds, oc, ec, refs] = value;
    unique(rid, `${path}[0]`); box(bounds, `${path}[1]`); count(oc, `${path}[2]`, 96); count(ec, `${path}[3]`, 48);
    list(refs, `${path}[4]`, 512).forEach((ref, i) => {
      count(ref, `${path}[4][${i}]`, labelCount - 1);
      if (labels.has(ref)) fail(`${path}[4][${i}]`, "duplicate_label");
      labels.add(ref);
    });
    return [rid, [...bounds], oc, ec, [...refs]];
  });
  const owners = new Map(regions.map((region) => [region[0], region]));
  let iconCount = 0, totalParts = 0;
  const objects = list(raw.objects, "$.objects", 96).map((value, index) => {
    const path = `$.objects[${index}]`;
    tuple(value, path, 5); const [oid, rid, kind, bounds, parts] = value;
    unique(oid, `${path}[0]`);
    if (!owners.has(rid)) fail(`${path}[1]`, "unknown_region");
    if (!["container", "icon"].includes(kind)) fail(`${path}[2]`, "invalid_kind");
    box(bounds, `${path}[3]`);
    if (kind === "icon" && ++iconCount > 32) fail(`${path}[2]`, "icon_limit");
    const parsed = list(parts, `${path}[4]`, 32).map((part, i) => {
      const p = `${path}[4][${i}]`;
      tuple(part, p, 7); const [type, pb, fill, stroke, width, dash, commands] = part;
      if (!["rect", "roundRect", "ellipse", "line", "freeform"].includes(type)) fail(`${p}[0]`, "invalid_part_type");
      box(pb, `${p}[1]`); color(fill, `${p}[2]`); color(stroke, `${p}[3]`); num(width, `${p}[4]`, 0, 20);
      if (!["solid", "dash"].includes(dash)) fail(`${p}[5]`, "invalid_dash");
      if (type === "freeform") {
        if (!Array.isArray(commands)) fail(`${p}[6]`, "invalid_freeform");
        try { decodeNativeFreeformPath(JSON.stringify(commands)); } catch { fail(`${p}[6]`, "invalid_freeform"); }
      } else if (commands !== null) fail(`${p}[6]`, "unexpected_path");
      if (pb[0] < bounds[0] || pb[1] < bounds[1] || pb[0] + pb[2] > bounds[0] + bounds[2] + .001 || pb[1] + pb[3] > bounds[1] + bounds[3] + .001)
        fail(`${p}[1]`, "part_outside_object");
      return [type, [...pb], fill, stroke, width, dash, commands === null ? null : structuredClone(commands)];
    });
    if (!parsed.length) fail(`${path}[4]`, "parts_required");
    totalParts += parsed.length; return [oid, rid, kind, [...bounds], parsed];
  });
  const byId = new Map(objects.map((object) => [object[0], object]));
  const edges = list(raw.edges, "$.edges", 48).map((value, index) => {
    const path = `$.edges[${index}]`;
    tuple(value, path, 9); const [eid, rid, from, to, points, stroke, width, dash, arrow] = value;
    unique(eid, `${path}[0]`);
    if (!owners.has(rid)) fail(`${path}[1]`, "unknown_region");
    if (from === to || !byId.has(from) || !byId.has(to) || byId.get(from)[1] !== rid || byId.get(to)[1] !== rid)
      fail(path, "invalid_endpoints");
    const ps = list(points, `${path}[4]`, 32).map((point, i) => {
      const p = `${path}[4][${i}]`; tuple(point, p, 2); point.forEach((n, j) => num(n, `${p}[${j}]`)); return [...point];
    });
    if (ps.length < 2) fail(`${path}[4]`, "points_required");
    for (let i = 1; i < ps.length; i++) if (Math.hypot(ps[i][0] - ps[i-1][0], ps[i][1] - ps[i-1][1]) < .01)
      fail(`${path}[4][${i}]`, "degenerate_segment");
    color(stroke, `${path}[5]`); if (stroke === "none") fail(`${path}[5]`, "stroke_required");
    num(width, `${path}[6]`, .1, 20);
    if (!["solid", "dash"].includes(dash)) fail(`${path}[7]`, "invalid_dash");
    if (!["none", "forward", "both"].includes(arrow)) fail(`${path}[8]`, "invalid_arrow");
    return [eid, rid, from, to, ps, stroke, width, dash, arrow];
  });
  const inventory = regions.every((region) => objects.filter((object) => object[1] === region[0]).length === region[2] && edges.filter((edge) => edge[1] === region[0]).length === region[3]);
  const complete = raw.complete && omissions.length === 0 && regions.length > 0 && inventory && labels.size === labelCount;
  return { plan: { background, regions, objects, edges }, complete, omissionCount: omissions.length, labelCoverage: labels.size, totalParts, inventory };
}

module.exports = { admit, diagnosticFor };
