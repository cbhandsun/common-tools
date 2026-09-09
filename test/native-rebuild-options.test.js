"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  isFlagEnabled,
  resolveComponentAssetIndex,
  resolveComponentStrategyIndex,
  resolveSmartNativeRebuildOptions,
  sanitizeCommandArgs,
  shouldVectorizeStatusIcons
} = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-options");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("native rebuild options can be resolved without loading the monolithic CLI entry", () => {
  assert.equal(isFlagEnabled(true), true);
  assert.equal(isFlagEnabled("true"), true);
  assert.equal(isFlagEnabled("1"), true);
  assert.equal(isFlagEnabled("yes"), true);
  assert.equal(isFlagEnabled("false"), false);

  const options = resolveSmartNativeRebuildOptions({
    "smart-native-layers": "true",
    "vectorize-status-icons": "true",
    "force-preserve-wms-route-graphic": "yes",
    "component-group-match-min-score": "72"
  });

  assert.equal(options.preserveGraphics, true);
  assert.equal(options.objectifyLayerContainers, true);
  assert.equal(options.vectorizeStatusIcons, true);
  assert.equal(options.forcePreserveWmsRouteGraphic, true);
  assert.equal(options.componentGroupMatchMinScore, 72);
  assert.equal(shouldVectorizeStatusIcons(options), true);
});

test("native rebuild options resolve component evidence indexes from bounded json files", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "native-rebuild-options-"));
  const strategyReport = path.join(workspace, "strategy.json");
  const assetManifest = path.join(workspace, "assets.json");
  writeJson(strategyReport, {
    layers: [{
      pageIndex: 1,
      imageIndex: 2,
      componentRenderStrategy: { mode: "native-shapes", confidence: 0.82 }
    }]
  });
  writeJson(assetManifest, {
    layers: [{
      pageIndex: 3,
      imageIndex: 4,
      box: { x: 1, y: 2, w: 3, h: 4 },
      asset: { id: "asset-1" }
    }]
  });

  const strategyIndex = resolveComponentStrategyIndex(strategyReport);
  const assetIndex = resolveComponentAssetIndex(assetManifest);

  assert.equal(strategyIndex.get("1:2").mode, "native-shapes");
  assert.equal(assetIndex.get("3:4").pageIndex, 3);
  assert.equal(assetIndex.get("3:4").imageIndex, 4);
  assert.equal(assetIndex.layersByPage.get(3).length, 1);
});

test("native rebuild command evidence redacts secret-shaped option values", () => {
  assert.deepEqual(
    sanitizeCommandArgs(["--token", "abc", "--out", "deck", "--cookie-value", "def", "--flag"]),
    ["--token", "[redacted]", "--out", "deck", "--cookie-value", "[redacted]", "--flag"]
  );
});
