"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { rebuildDeckFromWorkDir } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
const { writePng } = require("../packages/slideclone-core/png");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-page-lifecycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const irDir = path.join(root, "ir"); fs.mkdirSync(irDir);
  const image = path.join(root, "source.png");
  writePng(image, { width: 96, height: 54, rgba: Buffer.alloc(96 * 54 * 4, 255) });
  fs.writeFileSync(path.join(irDir, "deck.json"), JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, sourceImage: image,
    textBoxes: [{ id: "label", text: "Lifecycle fixture", box: { x: 20, y: 20, w: 220, h: 30 }, font: { sizePt: 20 } }], shapes: [], images: [] }] }));
  const cache = path.join(root, "cache");
  const events = [], stats = {}, timings = [];
  const options = { irDir, finalPageCacheDir: cache, reuseFinalPageCache: true, finalPageCacheStats: stats, pageTimings: timings, progressReporter: { emit: event => events.push(event) } };
  return { root, image, cache, events, stats, timings, options };
}

test("real page reconstruction and cache hit each finish once with identical editable content", t => {
  const f = fixture(t);
  const cold = rebuildDeckFromWorkDir(f.root, f.options);
  assert.deepEqual(f.stats, { misses: 1, writes: 1 });
  assert.deepEqual(f.events.map(event => event.status), ["start", "done"]);
  assert.equal(f.timings.length, 1);
  assert.equal(f.events[1].cached, false);
  assert.ok(cold.pages[0].textBoxes.some(box => box.text === "Lifecycle fixture"));
  const warm = rebuildDeckFromWorkDir(f.root, f.options);
  assert.deepEqual(f.stats, { misses: 1, writes: 1, hits: 1 });
  assert.deepEqual(f.events.map(event => event.status), ["start", "done", "start", "done"]);
  assert.equal(f.timings.length, 2);
  assert.equal(f.events[3].cached, true);
  assert.deepEqual(JSON.parse(JSON.stringify(warm)), JSON.parse(JSON.stringify(cold)));
});

test("real page decode failure cannot publish cache or completion and can recover after repair", t => {
  const f = fixture(t);
  const source = fs.readFileSync(f.image);
  fs.writeFileSync(f.image, "invalid png fixture");
  assert.throws(() => rebuildDeckFromWorkDir(f.root, f.options));
  assert.equal(fs.existsSync(f.cache), false);
  assert.deepEqual(f.events.map(event => event.status), ["start"]);
  assert.equal(f.timings.length, 0);
  assert.equal(f.stats.writes, undefined);
  fs.writeFileSync(f.image, source);
  const recovered = rebuildDeckFromWorkDir(f.root, f.options);
  assert.ok(recovered.pages[0].textBoxes.some(box => box.text === "Lifecycle fixture"));
  assert.deepEqual(f.events.map(event => event.status), ["start", "start", "done"]);
  assert.equal(f.stats.writes, 1);
});

test("real cache publication failure prevents completion and leaves the source unchanged", t => {
  const f = fixture(t);
  const source = fs.readFileSync(f.image);
  fs.writeFileSync(f.cache, "cache path is a file");
  assert.throws(() => rebuildDeckFromWorkDir(f.root, f.options));
  assert.equal(f.stats.misses, 1, "cache lookup completed before publication failed");
  assert.deepEqual(f.events.map(event => event.status), ["start"]);
  assert.equal(f.timings.length, 0);
  assert.equal(f.stats.writes, undefined);
  assert.deepEqual(fs.readFileSync(f.image), source);
  assert.equal(fs.readFileSync(f.cache, "utf8"), "cache path is a file");
});
