#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

const {
  createComparisonMatrixShapes,
  createCollaborationFlowShapes,
  createDenseComplexDiagramScaffoldShapes,
  createDocumentVersionFolderFlowObjects,
  createEntropyChallengeFragmentShapes,
  createEntropyChallengeIslandShapes,
  createFourStepLandingPathObjects,
  createGenericNodeDiagramSkeletonShapes,
  createHorizontalStepChainShapes,
  createPageLevelSkillChainOverviewObjects,
  createProductBrainVisionObjects,
  createPrototypeValidationFlowShapes,
  createSaturatedDiagramTextShapes,
  createSemanticCycleDiagramShapes,
  createScaleLandingEvidenceObjects,
  createSkillsEngineCoverTriadObjects,
  createStructuredIllustrationCardShellShapes,
  createTopComplexDiagramTextShapes,
  createTwoPanelDiagramTextShapes,
  createValueBannerBackgroundShapes,
  createVisualClusterStackShapes,
  createWorkflowDemandUnderstandingAssistantObjects,
  createWorkflowPrdAutoGenerationObjects,
  createWmsRouteChainShapes
} = require("./rebuild-real-pptx-native");
const { classifyGraphicExpressionPolicy } = require("./lib/graphic-expression-policy");

function auditStructuralNativeReadiness(ir, options = {}) {
  const slideSize = ir?.slideSize || options.slideSize || DEFAULT_SLIDE;
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  const candidates = [];
  const totals = {
    pages: pages.length,
    candidates: 0,
    objectified: 0,
    coveredByProbe: 0,
    protectedCrops: 0,
    actionableGaps: 0
  };

  pages.forEach((page, pageIndex) => {
    const pageTextBoxes = Array.isArray(page?.textBoxes) ? page.textBoxes : [];
    const images = Array.isArray(page?.images) ? page.images : [];
    images.forEach((image, imageIndex) => {
      const score = scoreStructuralImageCandidate(image, slideSize);
      if (!score.isCandidate) return;
      const objectified = isImageObjectified(image);
      const protectedCrop = !objectified && isProtectedIntentionalCrop(image);
      const probe = objectified || protectedCrop
        ? { covered: false, detectors: [], shapeCount: 0, textBoxCount: 0 }
        : probeNativeRebuildCoverage({ page, image, pageTextBoxes, slideSize, irDir: options.irDir || null });
      const status = objectified
        ? "objectified"
        : protectedCrop
          ? "protected-crop"
          : probe.covered
            ? "covered-by-probe"
            : "actionable-gap";
      const item = {
        status,
        deck: options.deck || null,
        pageIndex,
        imageIndex,
        imageId: image?.id || null,
        detector: image?.source?.detector || null,
        layerType: image?.source?.layer?.layerType || null,
        expressionForm: image?.source?.expressionForm || null,
        expressionSubtype: image?.source?.expressionSubtype || null,
        score: score.score,
        reasons: score.reasons,
        probe
      };
      candidates.push(item);
      totals.candidates += 1;
      if (status === "objectified") totals.objectified += 1;
      if (status === "covered-by-probe") totals.coveredByProbe += 1;
      if (status === "protected-crop") totals.protectedCrops += 1;
      if (status === "actionable-gap") totals.actionableGaps += 1;
    });
  });

  return {
    ok: totals.actionableGaps === 0,
    totals,
    candidates,
    actionableCandidates: candidates.filter((item) => item.status === "actionable-gap"),
    coveredByProbeCandidates: candidates.filter((item) => item.status === "covered-by-probe"),
    protectedCandidates: candidates.filter((item) => item.status === "protected-crop")
  };
}

function scoreStructuralImageCandidate(image = {}, slideSize = DEFAULT_SLIDE) {
  const expressionPolicy = classifyGraphicExpressionPolicy(image);
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const detector = String(source.detector || "");
  const layerType = String(layer.layerType || "");
  const expressionForm = String(source.expressionForm || "");
  const expressionSubtype = String(source.expressionSubtype || "");
  const recommendation = String(source.recommendedAction || "");
  const reason = String(source.reason || source.nonEditableReason || "");
  const visualAtoms = visualAtomList(image);
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (/(?:diagram|graphic|matrix|cluster|flow|underlay|case|chain|timeline|topology|network|funnel)/i.test(detector)) add(3, "structural-detector");
  if (/(?:diagram|illustration|content|graphic)-zone/i.test(layerType)) add(2, "structural-layer");
  if (/(?:diagram|chart|table|flow)/i.test(expressionForm)) add(2, "structural-expression");
  if (/(?:node|matrix|grid|cluster|flow|timeline|topology|funnel|version|architecture|process|entropy-challenge|illustration-fragment)/i.test(expressionSubtype)) add(2, "structural-subtype");
  if (Number(understanding.confidence || 0) >= 0.68) add(2, "diagram-understanding-confidence");
  if (Number(understanding.nodeCount || 0) >= 2 || nodeList(understanding).length >= 2) add(2, "semantic-nodes");
  if (Number(understanding.connectorCount || 0) >= 1 || connectorLikeAtomCount(visualAtoms) >= 1) add(2, "connectors");
  if (visualAtoms.length >= 4) add(2, "visual-atoms");
  if (source.nativeRebuild === true) add(2, "native-rebuild-flag");
  if (/replace-with-native-components|native-rebuild/i.test(recommendation)) add(2, "native-rebuild-recommendation");
  if (/(?:complex|diagram|table|grid|chart|graphic|underlay|component)/i.test(reason)) add(2, "structural-reason");
  if (/preserve-local-crop|preserve-crop|keep-local-crop|match-icon-library/i.test(recommendation) && /(?:diagram|illustration)-zone/i.test(layerType)) add(4, "intentional-protected-structural-crop");

  const areaRatio = imageAreaRatio(image, slideSize);
  if (areaRatio >= 0.05 && areaRatio <= 0.75) add(1, "bounded-structural-area");
  if (expressionPolicy.protectCrop && !expressionPolicy.allowNativeRebuild) {
    score += 1;
    reasons.push(`minimum-unit:${expressionPolicy.minimumUnitPolicy}`);
  } else if (isClearlyNonStructuralRaster(image)) {
    score -= 6;
    reasons.push("non-structural-raster");
  }

  return {
    isCandidate: score >= 6,
    score,
    reasons
  };
}

function probeNativeRebuildCoverage({ page = {}, image = {}, pageTextBoxes = [], slideSize = DEFAULT_SLIDE, irDir = null } = {}) {
  const detectors = [];
  let shapeCount = 0;
  let textBoxCount = 0;
  const sourceImage = syntheticSourceImage(slideSize);
  const probePage = deepClone({
    ...page,
    images: [image],
    textBoxes: pageTextBoxes
  });
  const probeImage = probePage.images[0];
  const textBoxes = deepClone(pageTextBoxes);
  const probeKind = probeImageKind(probeImage, textBoxes);
  const imageList = [probeImage];
  const calls = [
    ["generic-node-diagram", /generic-node|multi-cluster|hub-spoke|foreground-graphic-crop/, () => createGenericNodeDiagramSkeletonShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["visual-cluster-stack", /visual-cluster/, () => createVisualClusterStackShapes(imageList, sourceImage, slideSize)],
    ["horizontal-step-chain", /horizontal-step|step-chain|sparse-(?:flow|matrix)|process-strip/, () => createHorizontalStepChainShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["comparison-matrix", /comparison|matrix|structured-case|grid-like|table-grid|table-or-matrix|table-zone/, () => createComparisonMatrixShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["saturated-diagram", /saturated-diagram/, () => createSaturatedDiagramTextShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["semantic-cycle-diagram", /saturated-multi-flow|saturated-diagram|PRD自动生成/, () => createSemanticCycleDiagramShapes(imageList, textBoxes, sourceImage, slideSize, irDir)],
    ["dense-complex-scaffold", /dense-complex|sparse-complex|foreground-aggregate|PM\s*Portal\s*Skills|全链路|原型与高仿|资产落盘|终局视野/, () => createDenseComplexDiagramScaffoldShapes(imageList, textBoxes, slideSize)],
    ["two-panel-diagram", /two-panel-diagram/, () => createTwoPanelDiagramTextShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["top-complex-diagram", /top-complex-diagram/, () => createTopComplexDiagramTextShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["wms-route-chain", /wms|route-chain/, () => createWmsRouteChainShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["collaboration-flow", /collaboration-flow/, () => createCollaborationFlowShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["document-version-folder-flow", /document-version|version-folder|foreground-graphic-crop/, () => createDocumentVersionFolderFlowObjects(imageList, textBoxes, sourceImage, slideSize)],
    ["structured-illustration-card-shell", /illustration-card|process-with-screenshots/, () => createStructuredIllustrationCardShellShapes(imageList, slideSize)],
    ["value-banner-background", /value-banner|bottom-banner/, () => createValueBannerBackgroundShapes(imageList, textBoxes, sourceImage, slideSize, irDir)],
    ["entropy-fragment-cloud", /entropy-challenge-crop/, () => createEntropyChallengeFragmentShapes(textBoxes, slideSize, sourceImage)],
    ["entropy-island", /entropy-challenge-island-crop|entropy-challenge-crop/, () => createEntropyChallengeIslandShapes(textBoxes, slideSize, sourceImage)],
    ["skills-engine-cover-triad", /PM\s*Portal\s*Skills|AI原生产品交付基座|cover-triad/, () => createSkillsEngineCoverTriadObjects(probePage, textBoxes, slideSize)],
    ["page-level-skill-chain", /全链路|Skills\s*工作流|链式编排|skill-chain/, () => createPageLevelSkillChainOverviewObjects(probePage, textBoxes, sourceImage, slideSize)],
    ["prototype-validation-flow", /原型与高仿|意图转界面|prototype|validation/, () => createPrototypeValidationFlowShapes(imageList, textBoxes, sourceImage, slideSize)],
    ["scale-landing-evidence", /资产落盘|组织级资产|单点技能产出|landing/, () => createScaleLandingEvidenceObjects(probePage, textBoxes, textBoxes, slideSize)],
    ["four-step-landing-path", /资产落盘|组织级资产|单点技能产出|landing/, () => createFourStepLandingPathObjects(probePage, textBoxes, textBoxes, slideSize)],
    ["product-brain-vision", /终局视野|企业级AI智能产品底座|产品版图|system\s*map/i, () => createProductBrainVisionObjects(probePage, slideSize, { allowHeuristicProductBrainVision: true, sourceImage })],
    ["workflow-prd-auto-generation", /(?:^|\s)(?:left-illustration-panel-crop|bottom-banner-crop)(?:\s|$)/, () => createWorkflowPrdAutoGenerationObjects(probePage, textBoxes, slideSize)],
    ["workflow-demand-understanding", /(?:^|\s)(?:left-illustration-panel-crop|bottom-banner-crop)(?:\s|$)/, () => createWorkflowDemandUnderstandingAssistantObjects(probePage, textBoxes, slideSize)]
  ];

  for (const [name, pattern, call] of calls) {
    if (!pattern.test(probeKind)) continue;
    try {
      const result = call();
      const shapes = Array.isArray(result) ? result : Array.isArray(result?.shapes) ? result.shapes : [];
      const boxes = Array.isArray(result?.textBoxes) ? result.textBoxes : [];
      if (shapes.length > 0 || boxes.length > 0 || isImageObjectified(probeImage)) {
        detectors.push(name);
        shapeCount += shapes.length;
        textBoxCount += boxes.length;
      }
    } catch (error) {
      detectors.push(`${name}:error:${safeErrorCode(error)}`);
    }
  }

  return {
    covered: shapeCount > 0 || textBoxCount > 0 || isImageObjectified(probeImage),
    detectors: detectors.filter((item) => !/:error:/.test(item)),
    errors: detectors.filter((item) => /:error:/.test(item)),
    shapeCount,
    textBoxCount
  };
}

function syntheticSourceImage(slideSize = DEFAULT_SLIDE) {
  const width = Math.max(1, Math.round(Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt)));
  const height = Math.max(1, Math.round(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt)));
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = 22;
    rgba[offset + 1] = 122;
    rgba[offset + 2] = 168;
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba, data: rgba };
}

function probeImageKind(image = {}, textBoxes = []) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const pageText = (textBoxes || []).map((item) => String(item?.text || "")).join(" ");
  return [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.reason,
    source.nonEditableReason,
    layer.layerType,
    understanding.archetype,
    pageText
  ].filter(Boolean).join(" ");
}

function isImageObjectified(image = {}) {
  const source = image.source || {};
  if (source.nativeRebuild === true && source.editable === true) return true;
  if (source.dropErasedResidualAfterNativeRebuild === true) return true;
  if (source.visualAtomObjectified === true) return true;
  return Object.keys(source).some((key) =>
    /(?:Objectified|objectified|NativeTextBoxes|componentTemplateGroupApplied|nativeCoverage|objectified[A-Z])/.test(key)
      && source[key]
  );
}

function isProtectedIntentionalCrop(image = {}) {
  const expressionPolicy = classifyGraphicExpressionPolicy(image);
  if (expressionPolicy.protectCrop && !expressionPolicy.allowNativeRebuild) return true;
  const source = image.source || {};
  const detector = String(source.detector || "");
  const layerType = String(source.layer?.layerType || "");
  const expressionForm = String(source.expressionForm || "");
  const expressionSubtype = String(source.expressionSubtype || "");
  const recommendation = String(source.recommendedAction || "");
  const text = `${detector} ${layerType} ${expressionForm} ${expressionSubtype} ${recommendation}`;
  const atoms = visualAtomList(image);
  const nodes = nodeList(source.layer?.diagramUnderstanding || source.diagramUnderstanding || {});
  if (/preserve-local-crop|preserve-crop|keep-local-crop|match-icon-library/i.test(recommendation)) return true;
  if (/screenshot|photo|logo|brand|avatar|portrait/i.test(detector)) return true;
  if (/screenshot|photo|background|decorative/i.test(layerType)) return true;
  if (/screenshot|photo|decorative|brand|logo/i.test(expressionForm)) return true;
  if (isObviousIconIllustrationRaster(text) && !/replace-with-native-components|native-rebuild/i.test(recommendation)) return true;
  if (/icon-or-illustration/i.test(expressionForm) && atoms.length === 0 && nodes.length === 0 && !/replace-with-native-components/i.test(recommendation)) return true;
  if (/screenshot|photo|icon|logo|illustration-fragment|entropy-challenge/i.test(expressionSubtype) && atoms.length === 0 && nodes.length === 0) return true;
  if (/entropy-challenge-crop-fragment-cloud/i.test(detector) && atoms.length === 0 && nodes.length === 0) return true;
  return false;
}

function isObviousIconIllustrationRaster(text = "") {
  return /(?:icon-or-illustration|illustration-zone|icon|logo|illustration|visual-example|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|插画|图标|截图|示意图)/i.test(String(text || ""));
}

function isClearlyNonStructuralRaster(image = {}) {
  const source = image.source || {};
  const detector = String(source.detector || "");
  const layerType = String(source.layer?.layerType || "");
  const expressionForm = String(source.expressionForm || "");
  const expressionSubtype = String(source.expressionSubtype || "");
  return /screenshot|photo|bitmap|background|texture|logo|avatar|portrait/i.test(`${detector} ${layerType} ${expressionForm} ${expressionSubtype}`);
}

function visualAtomList(image = {}) {
  const understanding = image?.source?.layer?.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  const atoms = understanding.visualAtoms || image?.source?.visualAtoms || [];
  return Array.isArray(atoms) ? atoms : [];
}

function nodeList(understanding = {}) {
  const nodes = understanding.nodes || understanding.visualNodes || [];
  return Array.isArray(nodes) ? nodes : [];
}

function connectorLikeAtomCount(atoms = []) {
  return atoms.filter((atom) => /connector|arrow|grid-line|native-(?:rect|ellipse|circle)/i.test(String(atom?.kind || ""))).length;
}

function imageAreaRatio(image = {}, slideSize = DEFAULT_SLIDE) {
  const box = image.box || {};
  return Number(box.w || 0) * Number(box.h || 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function safeErrorCode(error) {
  return String(error?.name || "Error").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "Error";
}

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.ir || args.input;
  if (!input) {
    process.stderr.write("Usage: node structural-native-audit.js --ir <deck.native.ir.json> [--out report.json]\n");
    process.exit(2);
  }
  const irFile = path.resolve(input);
  const report = auditStructuralNativeReadiness(readJson(irFile), {
    deck: path.basename(irFile),
    irDir: path.dirname(irFile)
  });
  if (args.out) {
    const outFile = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report.totals, null, 2)}\n`);
  if (args["fail-on-actionable-gap"] && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  auditStructuralNativeReadiness,
  classifyGraphicExpressionPolicy,
  imageAreaRatio,
  isImageObjectified,
  isProtectedIntentionalCrop,
  probeNativeRebuildCoverage,
  scoreStructuralImageCandidate
};
