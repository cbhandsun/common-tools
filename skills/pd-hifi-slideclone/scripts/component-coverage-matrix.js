"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildComponentCoverageMatrix,
  resolveLatestReports
} = require("./lib/component-coverage-matrix");
const { normalizeTargetMotif: normalizeKnownTargetMotif } = require("./lib/component-motifs");

function parseArgs(argv) {
  const args = {
    reports: [],
    root: "runs",
    out: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--report" && next) {
      args.reports.push(next);
      index += 1;
    } else if (arg === "--reports" && next) {
      args.reports.push(...next.split(/[;,]/).map((item) => item.trim()).filter(Boolean));
      index += 1;
    } else if (arg === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--coverage-manifest" && next) {
      args.coverageManifest = next;
      index += 1;
    } else if (arg === "--expected-decks" && next) {
      args.expectedDecks = next;
      index += 1;
    } else if (arg === "--expected-deck-names" && next) {
      args.expectedDeckNames = next;
      index += 1;
    } else if (arg === "--min-component-asset-local-coverage-ratio" && next) {
      args.minComponentAssetLocalCoverageRatio = next;
      index += 1;
    } else if (arg === "--min-component-asset-local-matches" && next) {
      args.minComponentAssetLocalMatches = next;
      index += 1;
    } else if (arg === "--min-component-asset-high-reusable-groups" && next) {
      args.minComponentAssetHighReusableGroups = next;
      index += 1;
    } else if (arg === "--min-component-replacement-plan-shapes" && next) {
      args.minComponentReplacementPlanShapes = next;
      index += 1;
    } else if (arg === "--min-component-replacement-plan-text-boxes" && next) {
      args.minComponentReplacementPlanTextBoxes = next;
      index += 1;
    } else if (arg === "--min-component-template-applied-shapes" && next) {
      args.minComponentTemplateAppliedShapes = next;
      index += 1;
    } else if (arg === "--min-component-template-applied-text-boxes" && next) {
      args.minComponentTemplateAppliedTextBoxes = next;
      index += 1;
    } else if (arg === "--min-component-template-applied-pictures" && next) {
      args.minComponentTemplateAppliedPictures = next;
      index += 1;
    } else if (arg === "--min-component-template-motif-ready-shapes" && next) {
      args.minComponentTemplateMotifReadyShapes = next;
      index += 1;
    } else if (arg === "--min-component-template-structure-fit-shapes" && next) {
      args.minComponentTemplateStructureFitShapes = next;
      index += 1;
    } else if (arg === "--min-component-template-structure-fit-shape-ratio" && next) {
      args.minComponentTemplateStructureFitShapeRatio = next;
      index += 1;
    } else if (arg === "--min-component-template-structure-fit-text-boxes" && next) {
      args.minComponentTemplateStructureFitTextBoxes = next;
      index += 1;
    } else if (arg === "--min-component-template-structure-fit-pictures" && next) {
      args.minComponentTemplateStructureFitPictures = next;
      index += 1;
    } else if (arg === "--min-component-template-motif-ready-target-counts" && next) {
      args.minComponentTemplateMotifReadyTargetCounts = next;
      index += 1;
    } else if (arg === "--min-component-template-motif-ready-target-types" && next) {
      args.minComponentTemplateMotifReadyTargetTypes = next;
      index += 1;
    } else if (arg === "--min-visual-atom-topology-connectors" && next) {
      args.minVisualAtomTopologyConnectors = next;
      index += 1;
    } else if (arg === "--min-visual-atom-container-nodes" && next) {
      args.minVisualAtomContainerNodes = next;
      index += 1;
    } else if (arg === "--min-visual-atom-contained-nodes" && next) {
      args.minVisualAtomContainedNodes = next;
      index += 1;
    } else if (arg === "--require-no-actionable-residuals") {
      args.requireNoActionableResiduals = true;
    } else if (arg === "--require-no-expression-policy-violations") {
      args.requireNoExpressionPolicyViolations = true;
    } else if (arg === "--require-no-expression-policy-classification-needed") {
      args.requireNoExpressionPolicyClassificationNeeded = true;
    } else if (arg === "--fail-on-coverage-gap") {
      args.failOnCoverageGap = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = args.coverageManifest ? readCoverageManifest(args.coverageManifest) : null;
  const reports = manifest?.reports?.length > 0
    ? manifest.reports.map((file) => path.resolve(file))
    : args.reports.length > 0
    ? args.reports.map((file) => path.resolve(file))
    : resolveLatestReports(args.root);
  const matrix = buildComponentCoverageMatrix({ reports });
  applyCoverageGates(matrix, {
    requireNoActionableResiduals: args.requireNoActionableResiduals === true
      || manifest?.gates?.requireNoActionableResiduals === true,
    requireNoExpressionPolicyViolations: args.requireNoExpressionPolicyViolations === true
      || manifest?.gates?.requireNoExpressionPolicyViolations === true,
    requireNoExpressionPolicyClassificationNeeded: args.requireNoExpressionPolicyClassificationNeeded === true
      || manifest?.gates?.requireNoExpressionPolicyClassificationNeeded === true,
    expectedDecks: args.expectedDecks ?? manifest?.gates?.expectedDecks,
    expectedDeckNames: args.expectedDeckNames ?? manifest?.gates?.expectedDeckNames,
    expectedPageCounts: manifest?.gates?.expectedPageCounts,
    minComponentAssetLocalCoverageRatio: args.minComponentAssetLocalCoverageRatio
      ?? manifest?.gates?.minComponentAssetLocalCoverageRatio,
    minComponentAssetLocalMatches: args.minComponentAssetLocalMatches
      ?? manifest?.gates?.minComponentAssetLocalMatches,
    minComponentAssetHighReusableGroups: args.minComponentAssetHighReusableGroups
      ?? manifest?.gates?.minComponentAssetHighReusableGroups,
    minComponentReplacementPlanShapes: args.minComponentReplacementPlanShapes
      ?? manifest?.gates?.minComponentReplacementPlanShapes,
    minComponentReplacementPlanTextBoxes: args.minComponentReplacementPlanTextBoxes
      ?? manifest?.gates?.minComponentReplacementPlanTextBoxes,
    minComponentTemplateAppliedShapes: args.minComponentTemplateAppliedShapes
      ?? manifest?.gates?.minComponentTemplateAppliedShapes,
    minComponentTemplateAppliedTextBoxes: args.minComponentTemplateAppliedTextBoxes
      ?? manifest?.gates?.minComponentTemplateAppliedTextBoxes,
    minComponentTemplateAppliedPictures: args.minComponentTemplateAppliedPictures
      ?? manifest?.gates?.minComponentTemplateAppliedPictures,
    minComponentTemplateMotifReadyShapes: args.minComponentTemplateMotifReadyShapes
      ?? manifest?.gates?.minComponentTemplateMotifReadyShapes,
    minComponentTemplateStructureFitShapes: args.minComponentTemplateStructureFitShapes
      ?? manifest?.gates?.minComponentTemplateStructureFitShapes,
    minComponentTemplateStructureFitShapeRatio: args.minComponentTemplateStructureFitShapeRatio
      ?? manifest?.gates?.minComponentTemplateStructureFitShapeRatio,
    minComponentTemplateStructureFitTextBoxes: args.minComponentTemplateStructureFitTextBoxes
      ?? manifest?.gates?.minComponentTemplateStructureFitTextBoxes,
    minComponentTemplateStructureFitPictures: args.minComponentTemplateStructureFitPictures
      ?? manifest?.gates?.minComponentTemplateStructureFitPictures,
    minComponentTemplateMotifReadyTargetCounts: args.minComponentTemplateMotifReadyTargetCounts
      ?? manifest?.gates?.minComponentTemplateMotifReadyTargetCounts,
    minComponentTemplateMotifReadyTargetTypes: args.minComponentTemplateMotifReadyTargetTypes
      ?? manifest?.gates?.minComponentTemplateMotifReadyTargetTypes,
    minVisualAtomTopologyConnectors: args.minVisualAtomTopologyConnectors
      ?? manifest?.gates?.minVisualAtomTopologyConnectors,
    minVisualAtomContainerNodes: args.minVisualAtomContainerNodes
      ?? manifest?.gates?.minVisualAtomContainerNodes,
    minVisualAtomContainedNodes: args.minVisualAtomContainedNodes
      ?? manifest?.gates?.minVisualAtomContainedNodes,
    requireOutputPptxExists: manifest?.gates?.requireOutputPptxExists,
    requireOutputPptxZip: manifest?.gates?.requireOutputPptxZip,
    requireOutputPptxOpenXml: manifest?.gates?.requireOutputPptxOpenXml
  });
  if (manifest?.id) matrix.manifestId = manifest.id;
  if (manifest?.description) matrix.description = manifest.description;
  const body = `${JSON.stringify(matrix, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, body, "utf8");
  }
  process.stdout.write(body);
  if (args.failOnCoverageGap && matrix.passed !== true) process.exitCode = 1;
}

function applyCoverageGates(matrix, options = {}) {
  const expectedDecks = optionalPositiveInteger(options.expectedDecks);
  const uniqueDecks = Number(matrix?.totals?.uniqueDecks ?? matrix?.totals?.decks ?? 0);
  const duplicateDecks = Array.isArray(matrix?.totals?.duplicateDecks) ? matrix.totals.duplicateDecks : [];
  const expectedDeckCountMet = expectedDecks === null || uniqueDecks === expectedDecks;
  const expectedDeckNames = normalizeExpectedDeckNames(options.expectedDeckNames);
  const deckSetComparison = compareDeckNameSets(matrix?.totals?.deckNames || [], expectedDeckNames);
  const expectedDeckNamesMet = deckSetComparison === null
    || (deckSetComparison.missing.length === 0 && deckSetComparison.unexpected.length === 0);
  const expectedPageCounts = normalizeExpectedPageCounts(options.expectedPageCounts);
  const pageCountMismatches = comparePageCounts(matrix?.rows || [], expectedPageCounts);
  const minComponentAssetLocalCoverageRatio = optionalNonNegativeNumber(options.minComponentAssetLocalCoverageRatio);
  const minComponentAssetLocalMatches = optionalPositiveInteger(options.minComponentAssetLocalMatches);
  const minComponentAssetHighReusableGroups = optionalPositiveInteger(options.minComponentAssetHighReusableGroups);
  const minComponentReplacementPlanShapes = optionalPositiveInteger(options.minComponentReplacementPlanShapes);
  const minComponentReplacementPlanTextBoxes = optionalPositiveInteger(options.minComponentReplacementPlanTextBoxes);
  const minComponentTemplateAppliedShapes = optionalPositiveInteger(options.minComponentTemplateAppliedShapes);
  const minComponentTemplateAppliedTextBoxes = optionalPositiveInteger(options.minComponentTemplateAppliedTextBoxes);
  const minComponentTemplateAppliedPictures = optionalPositiveInteger(options.minComponentTemplateAppliedPictures);
  const minComponentTemplateMotifReadyShapes = optionalPositiveInteger(options.minComponentTemplateMotifReadyShapes);
  const minComponentTemplateStructureFitShapes = optionalPositiveInteger(options.minComponentTemplateStructureFitShapes);
  const minComponentTemplateStructureFitShapeRatio = optionalNonNegativeNumber(options.minComponentTemplateStructureFitShapeRatio);
  const minComponentTemplateStructureFitTextBoxes = optionalPositiveInteger(options.minComponentTemplateStructureFitTextBoxes);
  const minComponentTemplateStructureFitPictures = optionalPositiveInteger(options.minComponentTemplateStructureFitPictures);
  const minComponentTemplateMotifReadyTargetCounts = normalizeMotifTargetMinimums(options.minComponentTemplateMotifReadyTargetCounts);
  const minComponentTemplateMotifReadyTargetTypes = optionalPositiveInteger(options.minComponentTemplateMotifReadyTargetTypes);
  const minVisualAtomTopologyConnectors = optionalPositiveInteger(options.minVisualAtomTopologyConnectors);
  const minVisualAtomContainerNodes = optionalPositiveInteger(options.minVisualAtomContainerNodes);
  const minVisualAtomContainedNodes = optionalPositiveInteger(options.minVisualAtomContainedNodes);
  const componentAssetLocalCoverageRatioMet = minComponentAssetLocalCoverageRatio === null
    || Number(matrix?.totals?.componentAssetLocalCoverageRatio || 0) >= minComponentAssetLocalCoverageRatio;
  const componentAssetLocalMatchesMet = minComponentAssetLocalMatches === null
    || Number(matrix?.totals?.componentAssetLocalMatches || 0) >= minComponentAssetLocalMatches;
  const componentAssetHighReusableGroupsMet = minComponentAssetHighReusableGroups === null
    || Number(matrix?.totals?.componentAssetHighReusableGroups || 0) >= minComponentAssetHighReusableGroups;
  const componentReplacementPlanShapesMet = minComponentReplacementPlanShapes === null
    || Number(matrix?.totals?.componentReplacementPlanShapes || 0) >= minComponentReplacementPlanShapes;
  const componentReplacementPlanTextBoxesMet = minComponentReplacementPlanTextBoxes === null
    || Number(matrix?.totals?.componentReplacementPlanTextBoxes || 0) >= minComponentReplacementPlanTextBoxes;
  const componentTemplateAppliedShapesMet = minComponentTemplateAppliedShapes === null
    || Number(matrix?.totals?.componentTemplateAppliedShapes || 0) >= minComponentTemplateAppliedShapes;
  const componentTemplateAppliedTextBoxesMet = minComponentTemplateAppliedTextBoxes === null
    || Number(matrix?.totals?.componentTemplateAppliedTextBoxes || 0) >= minComponentTemplateAppliedTextBoxes;
  const componentTemplateAppliedPicturesMet = minComponentTemplateAppliedPictures === null
    || Number(matrix?.totals?.componentTemplateAppliedPictures || 0) >= minComponentTemplateAppliedPictures;
  const componentTemplateMotifReadyShapesMet = minComponentTemplateMotifReadyShapes === null
    || Number(matrix?.totals?.componentTemplateMotifReadyShapes || 0) >= minComponentTemplateMotifReadyShapes;
  const componentTemplateStructureFitShapesMet = minComponentTemplateStructureFitShapes === null
    || Number(matrix?.totals?.componentTemplateStructureFitShapes || 0) >= minComponentTemplateStructureFitShapes;
  const componentTemplateStructureFitShapeRatioMet = minComponentTemplateStructureFitShapeRatio === null
    || Number(matrix?.totals?.componentTemplateStructureFitShapeRatio || 0) >= minComponentTemplateStructureFitShapeRatio;
  const componentTemplateStructureFitTextBoxesMet = minComponentTemplateStructureFitTextBoxes === null
    || Number(matrix?.totals?.componentTemplateStructureFitTextBoxes || 0) >= minComponentTemplateStructureFitTextBoxes;
  const componentTemplateStructureFitPicturesMet = minComponentTemplateStructureFitPictures === null
    || Number(matrix?.totals?.componentTemplateStructureFitPictures || 0) >= minComponentTemplateStructureFitPictures;
  const componentTemplateMotifReadyTargetCountsMet = Object.entries(minComponentTemplateMotifReadyTargetCounts)
    .every(([motif, minimum]) => Number(matrix?.totals?.componentTemplateMotifReadyTargetCounts?.[motif] || 0) >= minimum);
  const componentTemplateMotifReadyTargetTypes = countPositiveMotifs(matrix?.totals?.componentTemplateMotifReadyTargetCounts);
  const componentTemplateMotifReadyTargetTypesMet = minComponentTemplateMotifReadyTargetTypes === null
    || componentTemplateMotifReadyTargetTypes >= minComponentTemplateMotifReadyTargetTypes;
  const visualAtomTopologyConnectorsMet = minVisualAtomTopologyConnectors === null
    || Number(matrix?.totals?.visualAtomTopologyConnectors || 0) >= minVisualAtomTopologyConnectors;
  const visualAtomContainerNodesMet = minVisualAtomContainerNodes === null
    || Number(matrix?.totals?.visualAtomContainerNodes || 0) >= minVisualAtomContainerNodes;
  const visualAtomContainedNodesMet = minVisualAtomContainedNodes === null
    || Number(matrix?.totals?.visualAtomContainedNodes || 0) >= minVisualAtomContainedNodes;
  const requireOutputPptxExists = options.requireOutputPptxExists === true;
  const outputPptxExistsMet = !requireOutputPptxExists
    || !Array.isArray(matrix?.totals?.missingOutputPptx)
    || matrix.totals.missingOutputPptx.length === 0;
  const requireOutputPptxZip = options.requireOutputPptxZip === true;
  const outputPptxZipMet = !requireOutputPptxZip
    || !Array.isArray(matrix?.totals?.invalidOutputPptx)
    || matrix.totals.invalidOutputPptx.length === 0;
  const requireOutputPptxOpenXml = options.requireOutputPptxOpenXml === true;
  const outputPptxOpenXmlMet = !requireOutputPptxOpenXml
    || !Array.isArray(matrix?.totals?.invalidOpenXmlPptx)
    || matrix.totals.invalidOpenXmlPptx.length === 0;
  matrix.gates = {
    requireNoActionableResiduals: options.requireNoActionableResiduals === true,
    requireNoExpressionPolicyViolations: options.requireNoExpressionPolicyViolations === true,
    requireNoExpressionPolicyClassificationNeeded: options.requireNoExpressionPolicyClassificationNeeded === true,
    requireOutputPptxExists,
    requireOutputPptxZip,
    requireOutputPptxOpenXml,
    expectedDecks,
    expectedDeckNames,
    expectedPageCounts,
    minComponentAssetLocalCoverageRatio,
    minComponentAssetLocalMatches,
    minComponentAssetHighReusableGroups,
    minComponentReplacementPlanShapes,
    minComponentReplacementPlanTextBoxes,
    minComponentTemplateAppliedShapes,
    minComponentTemplateAppliedTextBoxes,
    minComponentTemplateAppliedPictures,
    minComponentTemplateMotifReadyShapes,
    minComponentTemplateStructureFitShapes,
    minComponentTemplateStructureFitShapeRatio,
    minComponentTemplateStructureFitTextBoxes,
    minComponentTemplateStructureFitPictures,
    minComponentTemplateMotifReadyTargetCounts,
    minComponentTemplateMotifReadyTargetTypes,
    minVisualAtomTopologyConnectors,
    minVisualAtomContainerNodes,
    minVisualAtomContainedNodes
  };
  matrix.passed = (!matrix.gates.requireNoActionableResiduals
    || Number(matrix.totals?.actionableResidualLayers || 0) === 0)
    && (!matrix.gates.requireNoExpressionPolicyViolations
      || Number(matrix.totals?.expressionPolicyViolationLayers || 0) === 0)
    && (!matrix.gates.requireNoExpressionPolicyClassificationNeeded
      || Number(matrix.totals?.expressionPolicyUnitDispositionCounts?.["classification-needed"] || 0) === 0)
    && expectedDeckCountMet
    && expectedDeckNamesMet
    && pageCountMismatches.length === 0
    && componentAssetLocalCoverageRatioMet
    && componentAssetLocalMatchesMet
    && componentAssetHighReusableGroupsMet
    && componentReplacementPlanShapesMet
    && componentReplacementPlanTextBoxesMet
    && componentTemplateAppliedShapesMet
    && componentTemplateAppliedTextBoxesMet
    && componentTemplateAppliedPicturesMet
    && componentTemplateMotifReadyShapesMet
    && componentTemplateStructureFitShapesMet
    && componentTemplateStructureFitShapeRatioMet
    && componentTemplateStructureFitTextBoxesMet
    && componentTemplateStructureFitPicturesMet
    && componentTemplateMotifReadyTargetCountsMet
    && componentTemplateMotifReadyTargetTypesMet
    && visualAtomTopologyConnectorsMet
    && visualAtomContainerNodesMet
    && visualAtomContainedNodesMet
    && outputPptxExistsMet
    && outputPptxZipMet
    && outputPptxOpenXmlMet
    && duplicateDecks.length === 0;
  matrix.totals.expectedDeckCountMet = expectedDeckCountMet;
  matrix.totals.expressionPolicyViolationsMet = !matrix.gates.requireNoExpressionPolicyViolations
    || Number(matrix.totals?.expressionPolicyViolationLayers || 0) === 0;
  matrix.totals.expressionPolicyClassificationNeededMet = !matrix.gates.requireNoExpressionPolicyClassificationNeeded
    || Number(matrix.totals?.expressionPolicyUnitDispositionCounts?.["classification-needed"] || 0) === 0;
  matrix.totals.expectedDeckNamesMet = expectedDeckNamesMet;
  matrix.totals.missingExpectedDecks = deckSetComparison?.missing || [];
  matrix.totals.unexpectedDecks = deckSetComparison?.unexpected || [];
  matrix.totals.pageCountMismatches = pageCountMismatches;
  matrix.totals.componentAssetLocalCoverageRatioMet = componentAssetLocalCoverageRatioMet;
  matrix.totals.componentAssetLocalMatchesMet = componentAssetLocalMatchesMet;
  matrix.totals.componentAssetHighReusableGroupsMet = componentAssetHighReusableGroupsMet;
  matrix.totals.componentReplacementPlanShapesMet = componentReplacementPlanShapesMet;
  matrix.totals.componentReplacementPlanTextBoxesMet = componentReplacementPlanTextBoxesMet;
  matrix.totals.componentTemplateAppliedShapesMet = componentTemplateAppliedShapesMet;
  matrix.totals.componentTemplateAppliedTextBoxesMet = componentTemplateAppliedTextBoxesMet;
  matrix.totals.componentTemplateAppliedPicturesMet = componentTemplateAppliedPicturesMet;
  matrix.totals.componentTemplateMotifReadyShapesMet = componentTemplateMotifReadyShapesMet;
  matrix.totals.componentTemplateStructureFitShapesMet = componentTemplateStructureFitShapesMet;
  matrix.totals.componentTemplateStructureFitShapeRatioMet = componentTemplateStructureFitShapeRatioMet;
  matrix.totals.componentTemplateStructureFitTextBoxesMet = componentTemplateStructureFitTextBoxesMet;
  matrix.totals.componentTemplateStructureFitPicturesMet = componentTemplateStructureFitPicturesMet;
  matrix.totals.componentTemplateMotifReadyTargetCountsMet = componentTemplateMotifReadyTargetCountsMet;
  matrix.totals.componentTemplateMotifReadyTargetTypes = componentTemplateMotifReadyTargetTypes;
  matrix.totals.componentTemplateMotifReadyTargetTypesMet = componentTemplateMotifReadyTargetTypesMet;
  matrix.totals.visualAtomTopologyConnectorsMet = visualAtomTopologyConnectorsMet;
  matrix.totals.visualAtomContainerNodesMet = visualAtomContainerNodesMet;
  matrix.totals.visualAtomContainedNodesMet = visualAtomContainedNodesMet;
  matrix.totals.missingComponentTemplateMotifReadyTargetCounts = missingMotifTargetMinimums(
    matrix?.totals?.componentTemplateMotifReadyTargetCounts,
    minComponentTemplateMotifReadyTargetCounts
  );
  matrix.totals.outputPptxExistsMet = outputPptxExistsMet;
  matrix.totals.outputPptxZipMet = outputPptxZipMet;
  matrix.totals.outputPptxOpenXmlMet = outputPptxOpenXmlMet;
  return matrix;
}

function countPositiveMotifs(counts = {}) {
  return Object.entries(counts || {})
    .filter(([motif, count]) => normalizeTargetMotif(motif) && Number(count || 0) > 0)
    .length;
}

function readCoverageManifest(file) {
  const manifestFile = path.resolve(file);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8").replace(/^\uFEFF/, ""));
  return {
    ...manifest,
    manifestFile,
    reports: Array.isArray(manifest.reports)
      ? manifest.reports.map((item) => String(item || "").trim()).filter(Boolean)
      : []
  };
}

function normalizeExpectedDeckNames(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[;,]/);
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function compareDeckNameSets(actualDeckNames = [], expectedDeckNames = []) {
  if (!Array.isArray(expectedDeckNames) || expectedDeckNames.length === 0) return null;
  const actual = new Set((Array.isArray(actualDeckNames) ? actualDeckNames : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean));
  return {
    missing: expectedDeckNames.filter((deck) => !actual.has(deck)),
    unexpected: [...actual].filter((deck) => !expectedDeckNames.includes(deck)).sort((a, b) => a.localeCompare(b))
  };
}

function normalizeExpectedPageCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [deck, rawPages] of Object.entries(value)) {
    const name = String(deck || "").trim();
    const pages = Number(rawPages);
    if (!name || !Number.isInteger(pages) || pages <= 0) continue;
    out[name] = pages;
  }
  return out;
}

function comparePageCounts(rows = [], expectedPageCounts = {}) {
  const expectedEntries = Object.entries(expectedPageCounts || {});
  if (expectedEntries.length === 0) return [];
  const byDeck = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.deck, row]));
  const mismatches = [];
  for (const [deck, expectedPages] of expectedEntries) {
    const row = byDeck.get(deck);
    if (!row) continue;
    const actualPages = Number(row.pages);
    if (actualPages !== expectedPages) {
      mismatches.push({
        deck,
        expectedPages,
        actualPages: Number.isFinite(actualPages) ? actualPages : null
      });
    }
  }
  return mismatches;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeMotifTargetMinimums(value) {
  if (value === undefined || value === null || value === "") return {};
  const entries = typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : String(value).split(/[;,]/).map((part) => {
      const [key, raw] = part.split("=");
      return [key, raw];
    });
  const out = {};
  for (const [key, rawValue] of entries) {
    const motif = normalizeTargetMotif(key);
    const number = Number(rawValue);
    if (!motif || !Number.isInteger(number) || number <= 0) continue;
    out[motif] = number;
  }
  return out;
}

function missingMotifTargetMinimums(actual = {}, minimums = {}) {
  const missing = {};
  for (const [motif, minimum] of Object.entries(minimums || {})) {
    const current = Number(actual?.[motif] || 0);
    if (!Number.isFinite(current) || current < minimum) {
      missing[motif] = { expected: minimum, actual: Number.isFinite(current) ? current : 0 };
    }
  }
  return missing;
}

function normalizeTargetMotif(value) {
  return normalizeKnownTargetMotif(value);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  applyCoverageGates,
  normalizeMotifTargetMinimums,
  parseArgs,
  readCoverageManifest
};
