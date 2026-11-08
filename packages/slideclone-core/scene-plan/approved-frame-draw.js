// @ts-check
"use strict";

const { createHash } = require("node:crypto");
const { types } = require("node:util");

/** @typedef {{width:number,height:number,sha256:string}} Source */
/** @typedef {{source:Source,slideSize:{widthPt:number,heightPt:number},regionIds:string[],approvalId:string}} Scope */
/** @typedef {{id:string,type:string,box:{x:number,y:number,w:number,h:number},style:{fill:string,stroke:string,strokeWidthPt:number,radiusPt:number,dash:string,opacity:number},source:{editable:boolean,approximateFrame:{policy:string,regionId:string,approvalId:string,sourceSha256:string,scopeFingerprint:string,strictMeasurement:boolean,sourceFootprint:boolean,sourceErasure:boolean,dashBasis:string,dashPx:{on:number,off:number},radiusPx:number}}}} Frame */

const POLICY = "approved-visible-edge-roundrect-v1";
const REGIONS = Object.freeze(["region-n4", "region-n6", "region-n8"]);

class BoundaryError extends Error {}
/** @returns {never} */
function invalid() { throw new BoundaryError("invalid-approx-frame-input"); }

/** Copy data descriptors without reading getters or triggering Proxy traps.
 * @param {unknown} value @returns {Record<string,unknown>} */
function record(value) {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) return invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null || Object.getOwnPropertySymbols(value).length) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length > 64) return invalid();
  /** @type {Record<string,unknown>} */
  const result = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return result;
}

/** @param {unknown} value @param {number} max @returns {unknown[]} */
function list(value, max) {
  if (value === null || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value)) return invalid();
  if (value.length > max) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const size = value.length;
  if (!Number.isInteger(size) || size < 0 || size > max || Object.getOwnPropertySymbols(value).length) return invalid();
  if (Object.keys(descriptors).length !== size + 1) return invalid();
  /** @type {unknown[]} */
  const copied = [];
  for (let index = 0; index < size; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) return invalid();
    copied.push(descriptor.value);
  }
  return copied;
}

/** @param {unknown} value @param {number} minimum @param {number} maximum */
function number(value, minimum, maximum) {
  const parsed = typeof value === "string" && value.length <= 24 && /^-?\d+(?:\.\d+)?$/u.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return invalid();
  return parsed;
}

/** @param {unknown} value */
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u.test(value)) return invalid();
  return value;
}

/** @param {unknown} value @returns {Source} */
function source(value) {
  const data = record(value);
  const width = number(data.width, 1, 32768), height = number(data.height, 1, 32768);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 40_000_000) return invalid();
  if (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(data.sha256)) return invalid();
  return { width, height, sha256: data.sha256 };
}

/** @param {unknown} value @returns {Scope} */
function parseScope(value) {
  const data = record(value), inputSource = source(data.source), slide = record(data.slideSize);
  const widthPt = number(slide.widthPt, 1, 20000), heightPt = number(slide.heightPt, 1, 20000);
  const regionIds = list(data.regionIds, 3).map(identifier).sort();
  if (regionIds.length !== 3 || regionIds.some((id, index) => id !== REGIONS[index])) return invalid();
  // The existing roundRect writer uses one circular radius. Reject stretching
  // rather than inventing a different corner model.
  const sx = widthPt / inputSource.width, sy = heightPt / inputSource.height;
  if (Math.abs(sx - sy) > Math.max(sx, sy) * 1e-8) return invalid();
  return { source: inputSource, slideSize: { widthPt, heightPt }, regionIds, approvalId: identifier(data.approvalId) };
}

/** Bounded canonical snapshots cover every actual member field, including
 * added fields. They never invoke user serialization hooks.
 * @param {unknown} value @returns {string} */
function snapshot(value) {
  let cells = 0;
  /** @param {unknown} item @param {number} depth @returns {unknown} */
  function copy(item, depth) {
    cells += 1;
    if (depth > 10 || cells > 512) return invalid();
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : invalid();
    if (typeof item === "string") return item.length <= 256 ? item : invalid();
    if (item !== null && typeof item === "object" && !types.isProxy(item) && Array.isArray(item)) return list(item, 64).map(v => copy(v, depth + 1));
    const data = record(item);
    return Object.fromEntries(Object.keys(data).sort().map(key => [key, copy(data[key], depth + 1)]));
  }
  return JSON.stringify(copy(value, 0));
}

/** @param {unknown} draft @param {Scope} scope @param {string} fingerprint @returns {Frame} */
function frame(draft, scope, fingerprint) {
  const data = record(draft), fitSource = source(data.source), geometry = record(data.geometry), approximation = record(data.approximation);
  const id = identifier(data.id);
  if (data.status !== "fitted" || !scope.regionIds.includes(id) || snapshot(fitSource) !== snapshot(scope.source)
      || approximation.approvalId !== scope.approvalId || approximation.kind !== "visible-rail-native-roundrect") return invalid();
  const bounds = record(geometry.boxPx), dash = record(geometry.dashPx);
  const x = number(bounds.x, 0, scope.source.width), y = number(bounds.y, 0, scope.source.height);
  const w = number(bounds.w, 0.01, scope.source.width), h = number(bounds.h, 0.01, scope.source.height);
  if (x + w > scope.source.width || y + h > scope.source.height || geometry.fill !== "none") return invalid();
  const radiusPx = number(geometry.radiusPx, 0.01, Math.min(w, h) / 2);
  const strokeWidthPx = number(geometry.strokeWidthPx, 0.01, Math.min(6, w, h));
  const on = number(dash.on, 0.01, 48), off = number(dash.off, 0.01, 48);
  if (dash.phase !== null || typeof geometry.strokeColor !== "string" || !/^#[a-fA-F0-9]{6}$/u.test(geometry.strokeColor)) return invalid();
  const scale = scope.slideSize.widthPt / scope.source.width;
  return {
    id: `approved-approx-frame-${id}`, type: "roundRect",
    box: { x: x * scale, y: y * scale, w: w * scale, h: h * scale },
    style: { fill: "none", stroke: geometry.strokeColor.toUpperCase(), strokeWidthPt: strokeWidthPx * scale,
      radiusPt: radiusPx * scale, dash: "dash", opacity: 1 },
    source: { editable: true, approximateFrame: { policy: POLICY, regionId: id, approvalId: scope.approvalId,
      sourceSha256: scope.source.sha256, scopeFingerprint: fingerprint, strictMeasurement: false, sourceFootprint: false,
      sourceErasure: false, dashBasis: "writer-preset-approximation-unknown-phase", dashPx: { on, off }, radiusPx } }
  };
}

/** The scope is supplied by the trusted host after actual user authorization.
 * A serialized approvalId is only a binding; this factory does not authenticate
 * user permission. No returned object grants source erasure or strict completion.
 * @param {unknown} input */
function createApprovedApproxFrameDrawSession(input) {
  /** @type {Scope} */
  let scope;
  try { scope = parseScope(input); }
  catch (error) { if (error instanceof BoundaryError) throw new TypeError("invalid-approx-frame-scope", { cause: error }); throw error; }
  const scopeFingerprint = createHash("sha256").update(snapshot(scope)).digest("hex");
  /** @type {WeakMap<object,{members:Frame[],snapshots:string[],scopeFingerprint:string}>} */
  const receipts = new WeakMap();
  let issued = false;
  return Object.freeze({
    policy: POLICY,
    scopeFingerprint,
    /** Validate the complete approved bundle even when the host needs fewer
     * fallback frames after source measurement improves. Selection can only
     * reduce the existing scope; it grants no strict measurement authority.
     * @param {unknown} drafts @param {unknown} [selectedRegionIds] */
    prepare(drafts, selectedRegionIds) {
      if (issued) return { status: "rejected", code: "draw-already-prepared" };
      try {
        const reviewed = list(drafts, 3).map(draft => frame(draft, scope, scopeFingerprint));
        if (reviewed.length !== 3 || new Set(reviewed.map(shape => shape.id)).size !== 3) return invalid();
        const selected = selectedRegionIds === undefined ? scope.regionIds : list(selectedRegionIds, 3).map(identifier);
        if (new Set(selected).size !== selected.length || selected.some(id => !scope.regionIds.includes(id))) return invalid();
        const shapes = reviewed.filter(shape => selected.includes(shape.source.approximateFrame.regionId));
        shapes.sort((a, b) => a.id.localeCompare(b.id));
        const receipt = Object.freeze(Object.create(null));
        receipts.set(receipt, { members: shapes.slice(), snapshots: shapes.map(snapshot), scopeFingerprint });
        issued = true;
        return { status: "prepared", shapes, receipt, scopeFingerprint };
      } catch (error) {
        if (error instanceof BoundaryError) return { status: "rejected", code: "invalid-fit-drafts" };
        throw error;
      }
    },
    /** Consume once against the actual objects prepared by this session.
     * Call before final normalization/sealing. Copies are not actual members.
     * @param {unknown} token @param {unknown} actualMembers */
    consume(token, actualMembers) {
      if (token === null || typeof token !== "object" || types.isProxy(token)) return { status: "rejected", code: "invalid-draw-receipt" };
      const proof = receipts.get(token);
      if (!proof || proof.scopeFingerprint !== scopeFingerprint) return { status: "rejected", code: "invalid-draw-receipt" };
      try {
        const members = list(actualMembers, 3);
        if (members.length !== proof.members.length || proof.members.some((member, index) => members[index] !== member || snapshot(member) !== proof.snapshots[index])) return invalid();
        receipts.delete(token);
        return { status: "consumed", scopeFingerprint, shapes: proof.members.slice(), memberIds: proof.members.map(member => member.id),
          strictMeasurement: false, sourceFootprint: false, sourceErasure: false };
      } catch (error) {
        if (error instanceof BoundaryError) return { status: "rejected", code: "draw-members-changed" };
        throw error;
      }
    }
  });
}

module.exports = { createApprovedApproxFrameDrawSession };
