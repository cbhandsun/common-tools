"use strict";

const assert = require("assert/strict");
const test = require("node:test");

const {
  mapLimited,
  processPages,
  resolvePageConcurrency
} = require("../skills/pd-hifi-slideclone/scripts/lib/page-pipeline");

test("page pipeline preserves source order while processing concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const ocr = async (input) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await delay((4 - input.pageIndex) * 5);
    active -= 1;
    return { ok: true, data: { text: String(input.pageIndex) } };
  };
  ocr.maxConcurrency = 3;
  const vision = async (input) => ({
    ok: true,
    data: { textBoxes: [{ id: String(input.pageIndex), text: input.ocr.text }] }
  });
  vision.maxConcurrency = 4;

  const result = await processPages({
    pages: ["a.png", "b.png", "c.png", "d.png"],
    slideSize: { widthPt: 960, heightPt: 540 },
    ocr,
    vision,
    context: {},
    requestedConcurrency: 3
  });

  assert.equal(result.concurrency, 3);
  assert.equal(maxActive, 3);
  assert.deepEqual(result.pages.map((page) => page.sourceImage), ["a.png", "b.png", "c.png", "d.png"]);
});

test("page pipeline caps concurrency to the least capable adapter", () => {
  const parallel = Object.assign(async () => {}, { maxConcurrency: 8 });
  const serial = Object.assign(async () => {}, { maxConcurrency: 1 });
  assert.equal(resolvePageConcurrency(8, [parallel, serial]), 1);
  assert.equal(resolvePageConcurrency(4, [parallel, parallel]), 4);
});

test("page pipeline handles empty input and rejects invalid boundaries", async () => {
  const adapter = Object.assign(async () => ({ ok: true, data: {} }), { maxConcurrency: 4 });
  assert.deepEqual(await mapLimited([], 2, adapter), []);
  await assert.rejects(processPages({
    pages: [{ sourceImage: "" }],
    slideSize: {},
    ocr: adapter,
    vision: adapter,
    requestedConcurrency: 2
  }), /missing sourceImage/);
  assert.throws(() => resolvePageConcurrency(99, [adapter]), /integer from 1 to 8/);
});

test("page pipeline surfaces adapter failures with their page index", async () => {
  const ocr = Object.assign(async () => ({ ok: false, error: "engine unavailable" }), { maxConcurrency: 2 });
  const vision = Object.assign(async () => ({ ok: true, data: {} }), { maxConcurrency: 2 });
  await assert.rejects(processPages({
    pages: ["page.png"],
    slideSize: {},
    ocr,
    vision,
    requestedConcurrency: 2
  }), /ocr page 0 failed: engine unavailable/);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
