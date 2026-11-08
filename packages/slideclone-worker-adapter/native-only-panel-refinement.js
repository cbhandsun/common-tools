"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { rollbackRegressedPanels } = require("./panel-candidate-rollback");

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

// Fit jointly before rendering: source fill evidence can establish safe underlay ownership.
function createNativeOnlyPanelRefiner({ readPng, fitGeometry, fitFills, validateDeck, auditSemantic, qualityRendered, qualityAcceptable, maxPptxBytes }) {
  if (![readPng, fitGeometry, fitFills, validateDeck, auditSemantic, qualityRendered, qualityAcceptable].every(fn => typeof fn === "function")
    || !Number.isSafeInteger(maxPptxBytes) || maxPptxBytes < 1) throw new TypeError("Invalid native panel dependencies");
  return async function refineNativeOnlyPanels(request) {
    if (!record(request) || !record(request.baseline) || !record(request.baseline.deck)
      || !Array.isArray(request.sourceImages) || request.sourceImages.length < 1 || request.sourceImages.length > 50
      || typeof request.root !== "string" || !path.isAbsolute(request.root)
      || typeof request.runBuild !== "function" || typeof request.rawImageQualityVerifier !== "function"
      || typeof request.isCancellationRequested !== "function") throw new TypeError("Invalid native panel request");
    const { root, baseline, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested } = request;
    if (!qualityRendered(baseline.quality) || baseline.quality?.passed === true) return null;
    const cancelled = async () => {
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    };
    await cancelled();
    validateDeck(baseline.deck, root);
    if (!Array.isArray(baseline.deck.pages) || baseline.deck.pages.length !== sourceImages.length) throw new TypeError("Invalid native panel page inputs");
    const realRoot = fs.realpathSync(root);
    const pageImages = sourceImages.map(file => {
      if (typeof file !== "string" || !path.isAbsolute(file) || fs.lstatSync(file).isSymbolicLink()) throw new TypeError("Invalid native panel source");
      const relative = path.relative(realRoot, fs.realpathSync(file));
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError("Invalid native panel source");
      return readPng(file);
    });
    const geometry = fitGeometry(baseline.deck, { pageImages, allowTextAnchorGeometry: false });
    const fills = fitFills(geometry.deck, { pageImages });
    const ownership = fitGeometry(fills.deck, { pageImages, allowTextAnchorGeometry: false });
    if (geometry.changedShapes + fills.changedShapes + ownership.changedShapes < 1) return null;
    let deck = ownership.deck;
    validateDeck(deck, root);
    if (!auditSemantic(deck).passed) return null;
    await cancelled();
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `native-only-panel-${token}.json`);
    const pptxFile = path.join(root, `native-only-panel-${token}.pptx`);
    const owned = [];
    let adopted = false;
    try {
      fs.writeFileSync(deckFile, JSON.stringify(deck), { encoding: "utf8", flag: "wx" });
      owned.push(deckFile);
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      owned.push(pptxFile);
      await runBuild({ deckFile, pptxFile });
      await cancelled();
      const stat = fs.lstatSync(pptxFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxPptxBytes) throw new Error("Invalid native panel artifact");
      let renderedImages = [];
      const verify = () => rawImageQualityVerifier({ root, deck, pptxFile, sourceImages, isCancellationRequested, referenceQuality: baseline.quality,
        collectRenderedPages: pages => { if (Array.isArray(pages)) renderedImages.push(...pages); } });
      let quality = await verify();
      await cancelled();
      let rolledBackPanels = 0;
      if (!qualityRendered(quality)) return null;
      if (!qualityAcceptable({ baselineQuality: baseline.quality, candidateQuality: quality })) {
        if (!Array.isArray(quality.componentReferenceMetrics)) return null;
        const rollback = rollbackRegressedPanels({ baselineDeck: baseline.deck, candidateDeck: deck,
          baselineQuality: baseline.quality, candidateQuality: quality });
        if (rollback.rolledBackPanels < 1 || rollback.retainedChanges < 1) return null;
        deck = rollback.deck;
        rolledBackPanels = rollback.rolledBackPanels;
        validateDeck(deck, root);
        if (!auditSemantic(deck).passed) return null;
        await cancelled();
        fs.writeFileSync(deckFile, JSON.stringify(deck), "utf8");
        await runBuild({ deckFile, pptxFile });
        await cancelled();
        const rebuilt = fs.lstatSync(pptxFile);
        if (!rebuilt.isFile() || rebuilt.isSymbolicLink() || rebuilt.size < 1 || rebuilt.size > maxPptxBytes) throw new Error("Invalid native panel artifact");
        renderedImages = [];
        quality = await verify();
        await cancelled();
        if (!qualityRendered(quality) || !qualityAcceptable({ baselineQuality: baseline.quality, candidateQuality: quality })) return null;
      }
      adopted = true;
      const removedBackgrounds = baseline.deck.pages.reduce((total, page, pageIndex) => {
        const ids = new Set(deck.pages[pageIndex].shapes.map(shape => shape.id));
        return total + page.shapes.filter(shape => !ids.has(shape.id) && shape.source?.visualFallbackPrimitive === true).length;
      }, 0);
      return { ...baseline, deck, deckFile, pptxFile, renderedImages, quality: { ...quality, metrics: { ...quality.metrics,
        "native-only-panel-refinement-accepted": 1,
        "native-only-panel-operations-rolled-back": rolledBackPanels,
        "native-only-panel-fill-shapes-proposed": fills.changedShapes,
        "native-only-panel-geometry-shapes-proposed": geometry.changedShapes + ownership.changedShapes,
        "native-only-panel-backgrounds-removed": removedBackgrounds
      } } };
    } finally {
      if (!adopted) for (const file of owned) fs.rmSync(file, { force: true });
    }
  };
}

module.exports = { createNativeOnlyPanelRefiner };
