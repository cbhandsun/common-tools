"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildOpenXmlDecks } = require("../packages/slideclone-core/pptx-openxml-dotnet");
const { writePng } = require("../packages/slideclone-core/png");
const { readZipEntries, readZipEntry } = require("../packages/slideclone-core/pptx-zip");

test("real OpenXML build reuses its stage and recovers from asset changes and corrupt cache", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-cache-recovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillRoot = path.resolve(__dirname, "../skills/pd-hifi-slideclone");
  const project = path.join(skillRoot, "dotnet/OpenXmlDeckBuilder");
  const exePath = path.join(project, "bin/Release/net8.0", process.platform === "win32" ? "OpenXmlDeckBuilder.exe" : "OpenXmlDeckBuilder");
  assert.ok(fs.existsSync(exePath), "run build:dotnet:locked before this integration test");
  const cacheDir = path.join(root, "cache");
  const irFile = path.join(root, "deck.json");
  const outFile = path.join(root, "deck.pptx");
  const asset = path.join(root, "asset.png");
  const context = { skillRoot, config: { openXmlBuilder: { exePath, cacheDir } }, metrics: {} };
  fs.writeFileSync(irFile, JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{
    pageIndex: 0, textBoxes: [], images: [{ id: "image", assetPath: asset, box: { x: 10, y: 10, w: 100, h: 100 } }]
  }] }));
  function pixels(red) {
    const data = Buffer.alloc(8 * 8 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = red; data[i + 3] = 255; }
    writePng(asset, { width: 8, height: 8, rgba: data });
  }
  async function build(hit) {
    // A previous output cannot masquerade as cache restoration or a fresh build.
    fs.rmSync(outFile, { force: true });
    await buildOpenXmlDecks([{ irFile, outFile }], context, project);
    assert.deepEqual(context.metrics.openXmlBuildCache, { enabled: true, hits: hit ? 1 : 0, misses: hit ? 0 : 1 });
    const buffer = fs.readFileSync(outFile);
    const media = readZipEntries(buffer).filter(entry => entry.name.startsWith("ppt/media/"));
    assert.equal(media.length, 1);
    assert.deepEqual(readZipEntry(buffer, media[0].name), fs.readFileSync(asset));
    return buffer;
  }
  pixels(10);
  const cold = await build(false);
  assert.deepEqual(await build(true), cold);
  pixels(220);
  const changed = await build(false);
  assert.notDeepEqual(changed, cold);
  assert.deepEqual(await build(true), changed);
  let corrupted = 0;
  for (const prefix of fs.readdirSync(cacheDir)) {
    if (!/^[a-f0-9]{2}$/.test(prefix)) continue;
    for (const key of fs.readdirSync(path.join(cacheDir, prefix))) {
      assert.match(key, /^[a-f0-9]{64}$/);
      fs.writeFileSync(path.join(cacheDir, prefix, key, "deck.pptx"), "corrupt-cache-fixture");
      corrupted += 1;
    }
  }
  assert.equal(corrupted, 2);
  const recovered = await build(false);
  assert.deepEqual(await build(true), recovered);
});
