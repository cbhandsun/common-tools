"use strict";
const fs = require("node:fs"), path = require("node:path");
const { createTemporaryTestDirectory, removeTemporaryTestDirectory } = require("./temporary-directory.cjs");
const { writePng } = require("../../packages/slideclone-core/png");
const { digest } = require("../../packages/slideclone-core/scene-plan/approved-frame-application-files");
const { fingerprint } = require("../../packages/slideclone-core/scene-plan/approved-frame-application-input");
const { createApprovedFrameAssetApplication } = require("../../packages/slideclone-core/scene-plan/approved-frame-reconstruction");
const { finalizeWithApprovedFrames } = require("../../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle");

function fixture(t) {
  const root = createTemporaryTestDirectory("approved-frame-application-");
  t.after(() => removeTemporaryTestDirectory(root));
  fs.mkdirSync(path.join(root, "assets"));
  const png = (file, width, height, colour) => writePng(file, { width, height, rgba: Buffer.alloc(width * height * 4, colour) });
  const sourceFile = path.join(root, "assets/source.png"), original = path.join(root, "assets/original.png"), after = path.join(root, "after.png");
  png(sourceFile, 120, 120, 255); png(original, 6, 6, 80); png(after, 6, 6, 255);
  const hashFile = file => digest(fs.readFileSync(file));
  const source = { width: 120, height: 120, sha256: hashFile(sourceFile) };
  const retired = { id: "old-frame", type: "roundRect", box: { x: 1, y: 1, w: 100, h: 25 }, source: { editable: true } };
  const deck = { slideSize: { widthPt: 120, heightPt: 120 }, pages: [{
    source: { sourceScene: { strict: "unchanged" } }, shapes: [retired, { id: "kept", type: "line" }],
    images: [{ id: "crop", assetPath: "assets/original.png", style: { assetPath: "assets/original.png" } },
      { id: "unrelated", assetPath: "assets/source.png" }], textBoxes: [{ id: "text", text: "keep" }]
  }], meta: { sourceSceneCompilation: { resolvedRelations: 11, rejected: ["strict-rejection"] }, unrelated: true } };
  const review = { approvalId: "user-20261023-approx-frame", source,
    fits: ["region-n4", "region-n6", "region-n8"].map((id, i) => ({ status: "fitted", id, source: { ...source },
      geometry: { boxPx: { x: 10, y: 10 + i * 30, w: 100, h: 25 }, radiusPx: 5, strokeWidthPx: 1,
        dashPx: { on: 4, off: 5, phase: null }, strokeColor: "#E9DED8", fill: "none" },
      approximation: { approvalId: "user-20261023-approx-frame", kind: "visible-rail-native-roundrect" } })),
    assets: [{ imageId: "crop", beforeSha256: hashFile(original), afterSha256: hashFile(after), afterFile: after }],
    retirements: [{ id: retired.id, fingerprint: fingerprint(retired) }] };
  const context = { deck, root, sourceFile, isCancellationRequested: async () => false };
  return { root, deck, review, context, original, after, hashFile, png,
    directories: () => fs.readdirSync(path.join(root, "assets")).filter(name => name.startsWith("approved-frames-")),
    run: finalize => finalizeWithApprovedFrames(createApprovedFrameAssetApplication(review), context, finalize || (() => deck)) };
}
module.exports = { fixture };
