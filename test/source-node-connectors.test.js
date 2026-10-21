"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { restoreSourceNodeConnectors } = require("../packages/slideclone-core/source-node-connectors");

function fixture(native = false) {
  const image = { width: 600, height: 600, rgba: Buffer.alloc(600 * 600 * 4, 255) };
  for (let y = 302; y <= 376; y++) for (let x = 302; x <= 376; x++) {
    if (Math.abs(x - y) <= 2) image.rgba.set([20, 85, 230, 255], (y * 600 + x) * 4);
  }
  const hub = { id: "hub", type: "roundRect", box: { x: 220, y: 220, w: 80, h: 80 },
    style: { stroke: "#1455e6" }, source: { semanticNativeStructure: true } };
  const pictorial = { id: "icon", type: native ? "freeform" : "fidelity-crop", box: { x: 380, y: 380, w: 40, h: 40 },
    style: { fill: "#1455e6" }, source: native ? { semanticPictorialNative: true } : { intentionalMinimumUnitCrop: true } };
  return { image, slideSize: { widthPt: 600, heightPt: 600 }, page: { shapes: [hub, ...(native ? [pictorial] : [])], images: native ? [] : [pictorial] } };
}

test("source relationships use the same boundary contract for crops and native shapes", () => {
  for (const native of [false, true]) {
    const input = fixture(native), before = structuredClone(input.page);
    const result = restoreSourceNodeConnectors(input);
    assert.equal(result.evidence.added, 1);
    assert.deepEqual(input.page, before);
    const line = result.page.shapes.at(-1);
    assert.equal(line.type, "freeform");
    assert.ok(line.style.freeformSegments.length <= 120);
    assert.deepEqual(line.source.sourceNodeIds, [["hub"], ["icon"]]);
    const again = restoreSourceNodeConnectors({ ...input, page: result.page });
    assert.equal(again.evidence.added, 0);
    assert.equal(again.evidence.duplicates, 1);
  }
});

test("mixed one-native and three-crop nodes retain all source-backed relationships without a template", () => {
  const input = fixture(); input.image.rgba.fill(255);
  input.page.shapes[0].box = { x: 260, y: 260, w: 80, h: 80 };
  input.page.images = [];
  for (const [index, [x, y]] of [[120, 120], [440, 120], [120, 440], [440, 440]].entries()) {
    const item = { id: `pictorial-${index}`, type: index === 0 ? "freeform" : "fidelity-crop", box: { x, y, w: 40, h: 40 },
      style: { fill: "#1455e6" }, source: index === 0 ? { semanticPictorialNative: true } : { intentionalMinimumUnitCrop: true } };
    (index === 0 ? input.page.shapes : input.page.images).push(item);
  }
  for (let y = 162; y < 438; y++) for (let x = 162; x < 438; x++) {
    const outside = (x < 259 || x > 341) && (y < 259 || y > 341);
    if (outside && (Math.abs(x - y) <= 2 || Math.abs(599 - x - y) <= 2)) input.image.rgba.set([20, 85, 230, 255], (y * 600 + x) * 4);
  }
  const result = restoreSourceNodeConnectors(input);
  assert.equal(result.evidence.nodes, 5);
  assert.equal(result.evidence.added, 4);
  assert.equal(new Set(result.page.shapes.map(item => item.id)).size, result.page.shapes.length);
});

test("no source ink, disconnected ink or unapproved crops do not invent relationships", () => {
  for (const mode of ["blank", "disconnected", "unapproved"]) {
    const input = fixture();
    if (mode === "blank") input.image.rgba.fill(255);
    if (mode === "disconnected") for (let y = 320; y < 355; y++) for (let x = 300; x < 380; x++) input.image.rgba.set([255, 255, 255, 255], (y * 600 + x) * 4);
    if (mode === "unapproved") input.page.images[0].source = {};
    assert.equal(restoreSourceNodeConnectors(input).evidence.added, 0);
  }
  const empty = fixture(); empty.page = {};
  assert.equal(restoreSourceNodeConnectors(empty).evidence.added, 0);
});

test("native component parts do not become duplicate endpoint nodes", () => {
  const input = fixture(true);
  input.page.shapes.push({ ...structuredClone(input.page.shapes[1]), id: "second-part" });
  const result = restoreSourceNodeConnectors(input);
  assert.equal(result.evidence.nodes, 2);
  assert.equal(result.evidence.added, 1);
  assert.equal(result.page.shapes.at(-1).source.sourceNodeIds[1].length, 2);
});

test("source connector boundaries reject invalid and oversized requests without mutation", () => {
  const input = fixture(), before = structuredClone(input.page);
  for (const bad of [null, {}, { ...input, image: { ...input.image, rgba: Buffer.alloc(1) } },
    { ...input, image: { ...input.image, width: Infinity } }, { ...input, slideSize: { widthPt: "600", heightPt: 600 } },
    { ...input, page: { shapes: {} } }, { ...input, page: { images: Array(10001).fill(null) } }]) {
    assert.throws(() => restoreSourceNodeConnectors(bad), /invalid|boundary/);
  }
  assert.deepEqual(input.page, before);
});

test("conflicting output identities fail closed rather than overwrite existing objects", () => {
  const input = fixture();
  input.page.shapes.push({ id: "source-node-connector-1-2" });
  assert.throws(() => restoreSourceNodeConnectors(input), /identity/);
  assert.equal(input.page.shapes.length, 2);
});

test("source endpoint evidence rejects unsafe ids and bounds native node work", () => {
  const unsafe = fixture(); unsafe.page.images[0].id = "unsafe\nidentifier";
  assert.equal(restoreSourceNodeConnectors(unsafe).evidence.added, 0);
  const extreme = fixture();
  extreme.page.shapes = Array.from({ length: 97 }, (_, index) => ({ ...structuredClone(extreme.page.shapes[0]), id: `node-${index}` }));
  assert.throws(() => restoreSourceNodeConnectors(extreme), /node count/);
});

test("production source edge refinement enables representation-independent connectors explicitly", () => {
  const { refineSourceNativeEdges } = require("../packages/slideclone-core/source-native-edge-refinement");
  const input = fixture();
  const enabled = refineSourceNativeEdges({ ...input, enableSourceNodeConnectors: true });
  assert.equal(enabled.evidence.sourceNodeConnectors.added, 1);
  assert.equal(refineSourceNativeEdges(input).evidence.sourceNodeConnectors, undefined);
  assert.throws(() => refineSourceNativeEdges({ ...input, enableSourceNodeConnectors: "true" }), /mode/);
});
