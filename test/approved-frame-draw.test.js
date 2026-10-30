"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createApprovedApproxFrameDrawSession } = require("../packages/slideclone-core/scene-plan/approved-frame-draw.js");

function scope() {
  return { source: { width: 1086, height: 1448, sha256: "a".repeat(64) },
    slideSize: { widthPt: 960, heightPt: 1280 }, regionIds: ["region-n4", "region-n6", "region-n8"],
    approvalId: "user-20261023-approx-frame" };
}
function drafts(input = scope()) {
  return input.regionIds.map((id, index) => ({ status: "fitted", id, source: { ...input.source },
    geometry: { boxPx: { x: 27.5, y: 379 + index * 200, w: 1034.5, h: 180 }, radiusPx: 12,
      strokeWidthPx: 1, dashPx: { on: 4, off: 5, phase: null }, strokeColor: "#e9ded8", fill: "none" },
    approximation: { approvalId: input.approvalId, kind: "visible-rail-native-roundrect" } }));
}
function ready() {
  const session = createApprovedApproxFrameDrawSession(scope()), prepared = session.prepare(drafts());
  assert.equal(prepared.status, "prepared");
  return { session, prepared };
}
function rejectedDrafts(input) {
  assert.deepEqual(createApprovedApproxFrameDrawSession(scope()).prepare(input), { status: "rejected", code: "invalid-fit-drafts" });
}

test("three source-bound native frames use pt geometry, transparent fill and supported dash", () => {
  const { session, prepared } = ready(), scale = 960 / 1086;
  assert.equal(prepared.shapes.length, 3);
  assert.equal(prepared.shapes[0].id, "approved-approx-frame-region-n4");
  assert.equal(prepared.shapes[0].type, "roundRect");
  assert.equal(prepared.shapes[0].box.x, 27.5 * scale);
  assert.equal(prepared.shapes[0].style.radiusPt, 12 * scale);
  assert.equal(prepared.shapes[0].style.strokeWidthPt, scale);
  assert.equal(prepared.shapes[0].style.fill, "none");
  assert.equal(prepared.shapes[0].style.stroke, "#E9DED8");
  assert.equal(prepared.shapes[0].style.dash, "dash");
  const consumed = session.consume(prepared.receipt, prepared.shapes);
  assert.equal(consumed.status, "consumed");
  assert.equal(consumed.shapes[0], prepared.shapes[0]);
  assert.equal(consumed.sourceErasure, false);
  assert.deepEqual(session.consume(prepared.receipt, prepared.shapes), { status: "rejected", code: "invalid-draw-receipt" });
});

test('a trusted host may narrow fallback drawing without expanding or rewriting the approved scope',()=>{
 for(const ids of[[],['region-n4'],['region-n4','region-n8']]){
  const session=createApprovedApproxFrameDrawSession(scope()),bundle=drafts(),before=JSON.stringify(bundle);
  const result=session.prepare(bundle,ids);assert.equal(result.status,'prepared');assert.equal(result.shapes.length,ids.length);
  assert.deepEqual(result.shapes.map(s=>s.source.approximateFrame.regionId),ids);assert.equal(JSON.stringify(bundle),before);
  assert.equal(session.consume(result.receipt,result.shapes).status,'consumed');
 }
 for(const ids of[['region-n10'],['region-n4','region-n4'],new Array(1),null]){
  assert.equal(createApprovedApproxFrameDrawSession(scope()).prepare(drafts(),ids).status,'rejected');
 }
 const invalid=drafts();invalid[1].source.sha256='b'.repeat(64);
 assert.equal(createApprovedApproxFrameDrawSession(scope()).prepare(invalid,['region-n4']).status,'rejected','omitted drafts still require their original bindings');
 const session=createApprovedApproxFrameDrawSession(scope()),result=session.prepare(drafts(),['region-n4']);
 assert.equal(session.consume(result.receipt,structuredClone(result.shapes)).status,'rejected');
 assert.equal(session.consume(result.receipt,[...result.shapes,...ready().prepared.shapes]).status,'rejected');
 assert.equal(session.consume(result.receipt,result.shapes).status,'consumed');
});

test("output has separate approximation provenance and no strict memberships or capabilities", () => {
  const { prepared } = ready();
  for (const shape of prepared.shapes) {
    assert.equal(shape.source.approximateFrame.sourceErasure, false);
    assert.equal(shape.source.approximateFrame.sourceFootprint, false);
    assert.equal(shape.source.approximateFrame.strictMeasurement, false);
    assert.equal(shape.source.approximateFrame.dashBasis, "writer-preset-approximation-unknown-phase");
    for (const key of ["detector", "sceneRegionId", "sceneInventoryId", "nativeComponentGroupId", "semanticNativeStructure", "connector", "anchors"]) assert.equal(Object.hasOwn(shape.source, key), false);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.receipt)), {});
});

test("bounded decimal coercion and deterministic region order preserve input data", () => {
  const input = scope(), fit = drafts(input), before = JSON.stringify(fit);
  input.source.width = "1086";
  input.slideSize.heightPt = "1280";
  fit[0].geometry.boxPx.x = "27.5";
  const session = createApprovedApproxFrameDrawSession(input);
  const prepared = session.prepare(fit.slice().reverse());
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(prepared.shapes.map(item => item.source.approximateFrame.regionId), ["region-n4", "region-n6", "region-n8"]);
  fit[0].geometry.boxPx.x = 27.5;
  assert.equal(JSON.stringify(fit), before);
  assert.deepEqual(session.prepare(fit), { status: "rejected", code: "draw-already-prepared" });
});

test("scope rejects empty, malformed, mismatched and extreme boundaries with fixed errors", () => {
  for (const input of [undefined, null, {}, [], "user-secret-content"]) assert.throws(() => createApprovedApproxFrameDrawSession(input), /^TypeError: invalid-approx-frame-scope$/u);
  const changes = [input => { input.source.width = 0; }, input => { input.source.width = Infinity; },
    input => { input.source.height = 32769; }, input => { input.source.width = 32768; input.source.height = 32768; },
    input => { input.source.sha256 = "bad"; }, input => { input.approvalId = "unsafe\ncontent"; },
    input => { input.regionIds = ["region-n4", "region-n6"]; }, input => { input.regionIds[2] = "region-n6"; },
    input => { input.regionIds[2] = "region-n9"; }, input => { input.slideSize.widthPt = 20001; },
    input => { input.slideSize.heightPt = 1000; }];
  for (const change of changes) { const input = scope(); change(input); assert.throws(() => createApprovedApproxFrameDrawSession(input), /^TypeError: invalid-approx-frame-scope$/u); }
});

test("proxy and getter scope inputs never invoke attacker code", () => {
  let calls = 0;
  const traps = { get() { calls += 1; throw new Error("secret"); }, ownKeys() { calls += 1; throw new Error("secret"); }, getPrototypeOf() { calls += 1; throw new Error("secret"); } };
  assert.throws(() => createApprovedApproxFrameDrawSession(new Proxy(scope(), traps)), /invalid-approx-frame-scope/u);
  const nested = scope(); nested.source = new Proxy(nested.source, traps);
  assert.throws(() => createApprovedApproxFrameDrawSession(nested), /invalid-approx-frame-scope/u);
  const getter = scope(); Object.defineProperty(getter, "approvalId", { get() { calls += 1; throw new Error("secret"); } });
  assert.throws(() => createApprovedApproxFrameDrawSession(getter), /invalid-approx-frame-scope/u);
  assert.equal(calls, 0);
});

test("empty, missing, duplicate, sparse, extra and oversized draft inventories reject atomically", () => {
  const one = drafts()[0], extra = drafts(); extra.extra = "ignored-is-not-allowed";
  for (const input of [null, {}, [], [one], [one, one, one], new Array(3), [...drafts(), one], new Array(1_000_000), extra]) rejectedDrafts(input);
});

test("invalid draft geometry, source, approval, style and phase reject", () => {
  const changes = [item => { item.source.sha256 = "b".repeat(64); }, item => { item.id = "region-n9"; },
    item => { item.status = "strict"; }, item => { item.approximation.approvalId = "other"; },
    item => { item.approximation.kind = "source-scene-outline"; }, item => { item.geometry.fill = "#FFFFFF"; },
    item => { item.geometry.boxPx.x = -1; }, item => { item.geometry.boxPx.x = NaN; },
    item => { item.geometry.boxPx.w = 0; }, item => { item.geometry.boxPx.w = 2000; },
    item => { item.geometry.radiusPx = 0; }, item => { item.geometry.radiusPx = 1000; },
    item => { item.geometry.strokeWidthPx = 7; }, item => { item.geometry.strokeWidthPx = Infinity; },
    item => { item.geometry.strokeColor = "url(secret)"; }, item => { item.geometry.dashPx.on = 0; },
    item => { item.geometry.dashPx.off = 49; }, item => { item.geometry.dashPx.phase = 0; }];
  for (const change of changes) { const fit = drafts(); change(fit[0]); rejectedDrafts(fit); }
});

test("draft Proxy, nested getter, accessor array and prototype payload never execute", () => {
  let calls = 0;
  const handler = { get() { calls += 1; throw new Error("secret"); }, ownKeys() { calls += 1; throw new Error("secret"); } };
  rejectedDrafts(new Proxy(drafts(), handler));
  const proxy = drafts(); proxy[0].geometry = new Proxy(proxy[0].geometry, handler); rejectedDrafts(proxy);
  const getter = drafts(); Object.defineProperty(getter[0].geometry, "radiusPx", { get() { calls += 1; throw new Error("secret"); } }); rejectedDrafts(getter);
  const accessorArray = drafts(); Object.defineProperty(accessorArray, "0", { get() { calls += 1; throw new Error("secret"); } }); rejectedDrafts(accessorArray);
  const proto = drafts(); Object.setPrototypeOf(proto[0], { untrusted: true }); rejectedDrafts(proto);
  assert.equal(calls, 0);
});

test("forged, serialized and cross-session receipts grant no draw consumption", () => {
  const { session, prepared } = ready(), other = createApprovedApproxFrameDrawSession(scope());
  for (const token of [undefined, null, {}, JSON.parse(JSON.stringify(prepared.receipt)), new Proxy(prepared.receipt, {})]) assert.equal(session.consume(token, prepared.shapes).code, "invalid-draw-receipt");
  assert.equal(other.consume(prepared.receipt, prepared.shapes).code, "invalid-draw-receipt");
  const changed = scope(); changed.approvalId = "another-approval";
  assert.equal(createApprovedApproxFrameDrawSession(changed).consume(prepared.receipt, prepared.shapes).code, "invalid-draw-receipt");
  assert.equal(session.consume(prepared.receipt, prepared.shapes).status, "consumed");
});

test("actual members must retain exact identity, count and order", () => {
  for (const transform of [members => members.slice(0, 2), members => structuredClone(members),
    members => members.slice().reverse(), members => [...members, members[0]], members => [members[0], members[0], members[2]]]) {
    const { session, prepared } = ready();
    assert.equal(session.consume(prepared.receipt, transform(prepared.shapes)).code, "draw-members-changed");
  }
});

test("any member drawing/provenance change, including added fields, invalidates its receipt", () => {
  for (const change of [shape => { shape.box.x += 1; }, shape => { shape.style.dash = "solid"; },
    shape => { shape.source.approximateFrame.sourceErasure = true; }, shape => { shape.style.gradient = { type: "linear" }; },
    shape => { shape.source.sceneRegionId = "region-n4"; }, shape => { shape.id = "forged"; }]) {
    const { session, prepared } = ready(); change(prepared.shapes[0]);
    assert.equal(session.consume(prepared.receipt, prepared.shapes).code, "draw-members-changed");
  }
});

test("member getters and Proxies reject without code execution", () => {
  let calls = 0;
  const { session, prepared } = ready();
  Object.defineProperty(prepared.shapes[0].style, "fill", { get() { calls += 1; throw new Error("secret"); } });
  assert.equal(session.consume(prepared.receipt, prepared.shapes).code, "draw-members-changed");
  const next = ready();
  next.prepared.shapes[0].style = new Proxy(next.prepared.shapes[0].style, { ownKeys() { calls += 1; throw new Error("secret"); } });
  assert.equal(next.session.consume(next.prepared.receipt, next.prepared.shapes).code, "draw-members-changed");
  assert.equal(calls, 0);
});

test("trusted scope and draft mutations after prepare cannot change issued provenance", () => {
  const input = scope(), fit = drafts(input), session = createApprovedApproxFrameDrawSession(input), prepared = session.prepare(fit);
  input.approvalId = "changed"; input.source.sha256 = "b".repeat(64); fit[0].geometry.radiusPx = 999;
  assert.equal(prepared.shapes[0].source.approximateFrame.approvalId, "user-20261023-approx-frame");
  assert.equal(prepared.shapes[0].source.approximateFrame.sourceSha256, "a".repeat(64));
  assert.equal(session.consume(prepared.receipt, prepared.shapes).status, "consumed");
});

test("retained real fit drafts bind their source identity without temporary evidence paths", () => {
    const fit = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/approved-frames/fitted-frames.json"), "utf8"));
    const input = { ...scope(), source: fit[0].source };
    const session = createApprovedApproxFrameDrawSession(input), prepared = session.prepare(fit);
    assert.equal(prepared.status, "prepared");
    assert.deepEqual(prepared.shapes.map(shape => shape.style.stroke), ["#E9DED8", "#E1EBE6", "#D8E4E6"]);
    assert.ok(Math.abs(prepared.shapes[0].box.y - 379 * 960 / 1086) < 1e-10);
    assert.ok(Math.abs(prepared.shapes[1].style.radiusPt - 12.54 * 960 / 1086) < 1e-10);
    assert.equal(session.consume(prepared.receipt, prepared.shapes).status, "consumed");
});
