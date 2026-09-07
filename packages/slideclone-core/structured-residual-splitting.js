"use strict";
const path = require("node:path");
const { cropPng, writePng } = require("./png");
const { pixel, roundRatio, round, saturation, luma, clamp, expandPtBox } = require("./raster-native-detection");
const { isGraphicForeground, pointInsidePxBox, boxesNear, residualSplitComponents, foregroundComponents, paleStructureComponents, trimResidualBandBox } = require("./residual-component-analysis");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function splitSparseVisualAtomErasedResidualCrop(image, residual, assetFile, irDir) {
  if (image?.source?.primitiveErased !== true || image?.source?.visualAtomObjectified !== true) return null;
  if (looksLikeScreenshotOrDocumentLayer(image, image.source?.layer || {}, image.source?.layer?.diagramUnderstanding || {})) return null;
  const stats = residualForegroundStats(residual);
  image.source = {
    ...(image.source || {}),
    residualForegroundRatioAfterVisualAtomErase: roundRatio(stats.foregroundRatio),
    residualForegroundPixelCountAfterVisualAtomErase: stats.foregroundPixelCount
  };
  if (shouldDropHighConfidenceGridVisualAtomResidual(image)) {
    image.source.dropErasedResidualAfterNativeRebuild = true;
    image.source.residualSplitDropped = true;
    image.source.residualSplitDropReason = "high-confidence-grid-visual-atoms-cover-residual";
    return [];
  }
  if (stats.foregroundRatio <= 0.006 && Number(image.source?.erasedPrimitiveCount || 0) >= 4) {
    image.source.dropErasedResidualAfterNativeRebuild = true;
    image.source.residualSplitDropped = true;
    image.source.residualSplitDropReason = "visual-atom-residual-mostly-empty";
    return [];
  }
  const components = residualSplitComponents(residual);
  if (components.length < 1 || components.length > 6) return null;
  const coverageDecision = residualForegroundCoverageDecision(residual, components, { minForegroundCoverage: 0.74 });
  if (!coverageDecision.use) return null;
  const fullArea = Math.max(1, residual.width * residual.height);
  const totalArea = components.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  const maxArea = Math.max(...components.map((component) => component.box.w * component.box.h / fullArea));
  if (totalArea > 0.38 || maxArea > 0.22) return null;
  image.source.residualSplitMode = "sparse-visual-atom-residual";
  return writeResidualSplitImages({
    image,
    residual,
    assetFile,
    irDir,
    components,
    detector: "visual-atom-erased-residual-crop",
    nonEditableReason: "small remaining residual component after visual atom native reconstruction",
    mode: "sparse-visual-atom-residual"
  });
}

function shouldDropHighConfidenceGridVisualAtomResidual(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  if (looksLikeScreenshotOrDocumentLayer(image, layer, understanding)) return false;
  if (layer.layerType !== "table-zone") return false;
  if (String(understanding.archetype || "") !== "matrix-or-grid") return false;
  if (Number(understanding.confidence || 0) < 0.88) return false;
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  if (atoms.some((atom) => atom?.residualCandidate === true)) return false;
  if (Number(source.objectifiedVisualAtoms || 0) < 12) return false;
  if (Number(source.erasedPrimitiveCount || 0) < 12) return false;
  const nativeGridAtoms = atoms.filter((atom) => atom?.nativeCandidate === true && String(atom?.kind || "") === "grid-line-candidate").length;
  return nativeGridAtoms >= 2 || Number(source.nativeVisualAtomCandidates || 0) >= 2;
}

function residualForegroundStats(residual) {
  let foregroundPixelCount = 0;
  let sampledPixelCount = 0;
  for (let y = 0; y < residual.height; y += 2) {
    for (let x = 0; x < residual.width; x += 2) {
      sampledPixelCount += 1;
      if (isGraphicForeground(pixel(residual, x, y))) foregroundPixelCount += 1;
    }
  }
  return {
    foregroundPixelCount,
    sampledPixelCount,
    foregroundRatio: foregroundPixelCount / Math.max(1, sampledPixelCount)
  };
}

function writeResidualSplitImages({ image, residual, assetFile, irDir, components, detector, nonEditableReason, mode }) {
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  return components.map((component, index) => {
    const crop = cropPng(residual, component.box);
    const file = path.join(outDir, `${base}-${mode || "residual"}-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(component.box, residual, image.box);
    const componentClass = classifyResidualSplitComponent(crop, component, detector);
    const componentDetector = componentClass?.detector || detector;
    return {
      id: `${image.id || "residual"}-${mode || "split"}-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      ...(shouldDrawResidualAfterShapes(detector, mode) ? { drawAfterShapes: true } : {}),
      source: {
        ...(image.source || {}),
        layer: splitResidualLayerSource(image.source?.layer, slideBox, componentDetector),
        detector: componentDetector,
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: mode || "component",
        ...(component.role ? { residualSplitRole: component.role } : {}),
        residualSplitIndex: index,
        residualSplitCount: components.length,
        originalCropBox: image.box,
        nonEditableReason: componentClass?.nonEditableReason || nonEditableReason
      }
    };
  });
}

function shouldDrawResidualAfterShapes(detector, mode) {
  const text = `${detector || ""} ${mode || ""}`.toLowerCase();
  return /structured-illustration-(?:sparse|atom)-residual/.test(text);
}

function splitMixedDiagramSemanticCrops(image, residual, assetFile, irDir) {
  const components = mixedDiagramSemanticComponents(residual);
  const decision = residualForegroundCoverageDecision(residual, components, { minForegroundCoverage: 0.45 });
  if (!decision.use) {
    annotateResidualSplitRejection(image, {
      ...decision,
      reason: `mixed-diagram-semantic-${decision.reason}`,
      componentCount: components.length
    });
    return [];
  }
  image.source = {
    ...(image.source || {}),
    mixedDiagramSemanticSplit: true,
    mixedDiagramSemanticForegroundCoverage: roundRatio(decision.foregroundCoverage)
  };
  return writeResidualSplitImages({
    image,
    residual,
    assetFile,
    irDir,
    components,
    detector: "mixed-diagram-semantic-residual-crop",
    nonEditableReason: "mixed screenshot-flow diagram split into semantic local crops before deeper native reconstruction",
    mode: "mixed-diagram-semantic-residual"
  });
}

function mixedDiagramSemanticComponents(residual) {
  const w = Math.max(1, Number(residual?.width || 1));
  const h = Math.max(1, Number(residual?.height || 1));
  const raw = [
    { role: "input-source-cluster", box: { x: 0, y: h * 0.10, w: w * 0.33, h: h * 0.76 } },
    { role: "center-engine", box: { x: w * 0.34, y: h * 0.06, w: w * 0.34, h: h * 0.63 } },
    { role: "output-card-1", box: { x: w * 0.67, y: h * 0.02, w: w * 0.32, h: h * 0.19 } },
    { role: "output-card-2", box: { x: w * 0.67, y: h * 0.25, w: w * 0.32, h: h * 0.19 } },
    { role: "output-card-3", box: { x: w * 0.67, y: h * 0.48, w: w * 0.32, h: h * 0.20 } },
    { role: "output-card-4", box: { x: w * 0.67, y: h * 0.72, w: w * 0.32, h: h * 0.22 } },
    { role: "bottom-caption", box: { x: 0, y: h * 0.78, w: w * 0.42, h: h * 0.18 } }
  ];
  return raw
    .map((item) => ({
      box: clampLocalBox(expandLocalBox(item.box, 6, 6), residual),
      splitMode: "mixed-diagram-semantic-residual",
      role: item.role
    }))
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, w * h);
      return areaRatio >= 0.025 && areaRatio <= 0.36;
    });
}

function splitDenseStructuredCaseResidualCrops(image, residual, assetFile, irDir) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const residualAtoms = (understanding.visualAtoms || [])
    .filter((atom) => atom?.residualCandidate === true && atom.box)
    .map((atom) => ({
      atom,
      box: slidePtBoxToLocalPxBox(expandPtBox(atom.box, DEFAULT_SLIDE, 12, 10), image.box, residual)
    }))
    .filter((item) => isUsableVisualAtomResidualBox(item.box, residual));
  const components = denseResidualAtomComponents(residualAtoms, residual);
  const rowBandComponents = structuredCaseRowBandComponents(image, residual, understanding);
  let selectedComponents = components;
  let mode = "dense-structured-case-residual";
  let detector = "dense-structured-case-residual-crop";
  let minForegroundCoverage = 0.16;
  if (components.length === 0 || components.length > 14) {
    selectedComponents = rowBandComponents;
    mode = "structured-case-row-band-residual";
    detector = "structured-case-row-band-residual-crop";
    minForegroundCoverage = 0.42;
  }
  let coverageDecision = residualForegroundCoverageDecision(residual, selectedComponents, { minForegroundCoverage });
  if (!coverageDecision.use && rowBandComponents.length > 0) {
    const rowDecision = residualForegroundCoverageDecision(residual, rowBandComponents, { minForegroundCoverage: 0.42 });
    if (rowDecision.use || rowDecision.foregroundCoverage > coverageDecision.foregroundCoverage) {
      selectedComponents = rowBandComponents;
      coverageDecision = rowDecision;
      mode = "structured-case-row-band-residual";
      detector = "structured-case-row-band-residual-crop";
    }
  }
  if (selectedComponents.length === 0 || selectedComponents.length > 14) return [];
  if (!coverageDecision.use) {
    annotateResidualSplitRejection(image, {
      ...coverageDecision,
      reason: `dense-structured-case-${coverageDecision.reason}`,
      componentCount: selectedComponents.length
    });
    return [];
  }
  image.source = {
    ...(image.source || {}),
    denseStructuredCaseResidualSplit: true,
    denseStructuredCaseResidualForegroundCoverage: roundRatio(coverageDecision.foregroundCoverage)
  };
  return writeResidualSplitImages({
    image,
    residual,
    assetFile,
    irDir,
    components: selectedComponents,
    detector,
    nonEditableReason: "dense structured-case diagram residual icons preserved as local crops after native connectors and atoms were rebuilt",
    mode
  });
}

function structuredCaseRowBandComponents(image = {}, residual, understanding = {}) {
  const nodes = Array.isArray(understanding.nodes) ? understanding.nodes : [];
  const localNodes = nodes
    .filter((node) => node?.box)
    .map((node) => ({
      node,
      box: slidePtBoxToLocalPxBox(expandPtBox(node.box, DEFAULT_SLIDE, 18, 14), image.box, residual)
    }))
    .filter((item) => isUsableVisualAtomResidualBox(item.box, residual))
    .sort((a, b) => boxCenterY(a.box) - boxCenterY(b.box));
  if (localNodes.length < 5) return [];
  const rows = [];
  for (const item of localNodes) {
    const centerY = boxCenterY(item.box);
    const row = rows.find((candidate) => Math.abs(candidate.centerY - centerY) <= Math.max(26, residual.height * 0.085));
    if (row) {
      row.items.push(item);
      row.centerY = row.items.reduce((sum, entry) => sum + boxCenterY(entry.box), 0) / row.items.length;
      row.box = unionLocalBoxes(row.items.map((entry) => entry.box));
    } else {
      rows.push({ centerY, items: [item], box: item.box });
    }
  }
  return rows
    .filter((row) => row.items.length >= 2)
    .map((row) => {
      const rowBox = expandLocalBox({
        x: 0,
        y: row.box.y,
        w: residual.width,
        h: row.box.h
      }, 0, 12);
      return {
        box: clampLocalBox(rowBox, residual),
        splitMode: "structured-case-row-band-residual",
        nodeIds: row.items.map((item) => item.node?.id).filter(Boolean)
      };
    })
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.035 && areaRatio <= 0.28;
    })
    .sort((a, b) => a.box.y - b.box.y)
    .slice(0, 7);
}

function boxCenterY(box = {}) {
  return Number(box.y || 0) + Number(box.h || 0) / 2;
}

function denseResidualAtomComponents(items = [], residual) {
  const sorted = items
    .map((item) => ({ ...item, box: clampLocalBox(item.box, residual) }))
    .filter((item) => item.box.w >= 2 && item.box.h >= 2)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const clusters = [];
  for (const item of sorted) {
    const existing = clusters.find((cluster) => boxesNear(cluster.box, item.box, 26, 22));
    if (existing) {
      existing.items.push(item);
      existing.box = unionLocalBoxes([existing.box, item.box]);
    } else {
      clusters.push({ items: [item], box: item.box });
    }
  }
  return clusters
    .map((cluster) => ({
      box: clampLocalBox(expandLocalBox(cluster.box, 8, 8), residual),
      splitMode: "dense-structured-case-residual",
      atomIds: cluster.items.map((item) => item.atom?.id).filter(Boolean)
    }))
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.0002 && areaRatio <= 0.18;
    })
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .slice(0, 12);
}

function unionLocalBoxes(boxes = []) {
  const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
  if (valid.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  const x1 = Math.min(...valid.map((box) => Number(box.x || 0)));
  const y1 = Math.min(...valid.map((box) => Number(box.y || 0)));
  const x2 = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
  const y2 = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

function expandLocalBox(box = {}, padX = 0, padY = padX) {
  return {
    x: Math.floor(Number(box.x || 0) - padX),
    y: Math.floor(Number(box.y || 0) - padY),
    w: Math.ceil(Number(box.w || 0) + padX * 2),
    h: Math.ceil(Number(box.h || 0) + padY * 2)
  };
}

function clampLocalBox(box = {}, residual) {
  const width = Math.max(1, Number(residual?.width || 1));
  const height = Math.max(1, Number(residual?.height || 1));
  const x = Math.max(0, Math.min(width - 1, Math.round(Number(box.x || 0))));
  const y = Math.max(0, Math.min(height - 1, Math.round(Number(box.y || 0))));
  const w = Math.max(1, Math.min(width - x, Math.round(Number(box.w || 1))));
  const h = Math.max(1, Math.min(height - y, Math.round(Number(box.h || 1))));
  return { x, y, w, h };
}

function splitStructuredIllustrationCardResidualCrops(image, residual, assetFile, irDir) {
  if (image?.source?.structuredIllustrationShellObjectified === true && image?.source?.primitiveErased !== true) {
    const cardIllustrationComponents = structuredIllustrationCardIllustrationResidualComponents(image, residual);
    if (cardIllustrationComponents.length >= 2) {
      image.source = {
        ...(image.source || {}),
        structuredIllustrationCardIllustrationSplit: true
      };
      return writeResidualSplitImages({
        image,
        residual,
        assetFile,
        irDir,
        components: cardIllustrationComponents,
        detector: "structured-illustration-card-illustration-residual-crop",
        nonEditableReason: "card illustration interiors preserved as local crops while card shells and text are rebuilt natively",
        mode: "structured-illustration-card-illustration"
      });
    }
  }
  const atomComponents = structuredIllustrationCardAtomResidualComponents(image, residual);
  if (atomComponents.length >= 2) {
    const coverageDecision = residualForegroundCoverageDecision(residual, atomComponents, { minForegroundCoverage: 0.68 });
    if (coverageDecision.use) {
      image.source = {
        ...(image.source || {}),
        structuredIllustrationAtomResidualSplit: true,
        structuredIllustrationAtomResidualForegroundCoverage: roundRatio(coverageDecision.foregroundCoverage)
      };
      return writeResidualSplitImages({
        image,
        residual,
        assetFile,
        irDir,
        components: atomComponents,
        detector: "structured-illustration-atom-residual-crop",
        nonEditableReason: "structured illustration unsafe atoms preserved as small local crops after native card/text/shape extraction",
        mode: "structured-illustration-atom-residual"
      });
    }
    image.source = {
      ...(image.source || {}),
      structuredIllustrationAtomResidualRejected: {
        reason: coverageDecision.reason,
        componentCount: coverageDecision.componentCount,
      foregroundCoverage: roundRatio(coverageDecision.foregroundCoverage || 0)
      }
    };
  }
  const sparseResiduals = splitSparseVisualAtomErasedResidualCrop(image, residual, assetFile, irDir);
  if (sparseResiduals !== null) return sparseResiduals;
  const sparseCardResiduals = splitStructuredIllustrationSparseResidualCrops(image, residual, assetFile, irDir);
  if (sparseCardResiduals.length > 0) return sparseCardResiduals;
  const components = structuredIllustrationCardResidualComponents(image, residual);
  if (components.length < 2) {
    annotateResidualSplitRejection(image, {
      reason: "structured-illustration-card-split-too-few-components",
      componentCount: components.length
    });
    return [];
  }
  return writeResidualSplitImages({
    image,
    residual,
    assetFile,
    irDir,
    components,
    detector: "structured-illustration-card-residual-crop",
    nonEditableReason: "structured illustration split into card-level fidelity crops after safe native primitive extraction",
    mode: "structured-illustration-card"
  });
}

function splitStructuredIllustrationSparseResidualCrops(image, residual, assetFile, irDir) {
  const components = structuredIllustrationSparseResidualComponents(residual);
  const bandComponents = components.length < 2
    ? structuredIllustrationCardBandSparseResidualComponents(image, residual)
    : [];
  const candidateComponents = components.length >= 2 ? components : bandComponents;
  if (candidateComponents.length < 2) {
    image.source = {
      ...(image.source || {}),
      structuredIllustrationSparseResidualRejected: {
        reason: "too-few-structured-sparse-components",
        componentCount: candidateComponents.length
      }
    };
    return [];
  }
  const coverageDecision = residualForegroundCoverageDecision(residual, candidateComponents, { minForegroundCoverage: 0.62 });
  if (!coverageDecision.use) {
    image.source = {
      ...(image.source || {}),
      structuredIllustrationSparseResidualRejected: {
        reason: coverageDecision.reason,
        componentCount: coverageDecision.componentCount,
        foregroundCoverage: roundRatio(coverageDecision.foregroundCoverage || 0)
      }
    };
    return [];
  }
  image.source = {
    ...(image.source || {}),
    structuredIllustrationSparseResidualSplit: true,
    structuredIllustrationSparseResidualForegroundCoverage: roundRatio(coverageDecision.foregroundCoverage)
  };
  return writeResidualSplitImages({
    image,
    residual,
    assetFile,
    irDir,
    components: candidateComponents,
    detector: "structured-illustration-sparse-residual-crop",
    nonEditableReason: "sparse unsafe illustration residual component preserved after native card/text/shape extraction",
    mode: "structured-illustration-sparse-residual"
  });
}

function structuredIllustrationCardIllustrationResidualComponents(image, residual) {
  const bands = structuredIllustrationCardColumnBands(image, residual);
  if (bands.length < 2) return [];
  return bands
    .map((band, index) => {
      const localBox = {
        x: band.box.x + band.box.w * 0.09,
        y: band.box.y + band.box.h * 0.14,
        w: band.box.w * 0.82,
        h: band.box.h * 0.50
      };
      return {
        box: clampLocalBox(expandLocalBox(localBox, 4, 4), residual),
        splitMode: "structured-illustration-card-illustration",
        role: `card-illustration-${index + 1}`
      };
    })
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.10 && areaRatio <= 0.28;
    })
    .slice(0, 5);
}

function structuredIllustrationCardColumnBands(image, residual) {
  const shellCards = structuredIllustrationCardShellBoxes(image, DEFAULT_SLIDE)
    .map((card) => slidePtBoxToLocalPxBox(card, image.box, residual))
    .filter(Boolean)
    .map((box) => ({ box: clampLocalBox(box, residual) }))
    .filter((band) => band.box.w >= residual.width * 0.18 && band.box.w <= residual.width * 0.46);
  if (shellCards.length >= 2) return shellCards;
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms;
  if (!Array.isArray(atoms) || !image?.box || !residual) return [];
  const separatorCenters = atoms
    .filter((atom) => atom?.kind === "grid-line-candidate" && atom?.axis === "v" && atom?.box)
    .filter((atom) => Number(atom.box.h || 0) >= Number(image.box.h || 0) * 0.72)
    .map((atom) => slidePtBoxToLocalPxBox(atom.box, image.box, residual))
    .filter((box) => box && box.h >= residual.height * 0.72 && box.x > residual.width * 0.12 && box.x < residual.width * 0.88)
    .map((box) => box.x + box.w / 2)
    .sort((a, b) => a - b);
  if (separatorCenters.length < 1) return [];
  const groups = [];
  for (const center of separatorCenters) {
    const last = groups[groups.length - 1];
    if (last && center - last[last.length - 1] <= residual.width * 0.035) last.push(center);
    else groups.push([center]);
  }
  const cuts = groups
    .map((group) => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length))
    .filter((cut, index, list) => cut > residual.width * 0.16
      && cut < residual.width * 0.84
      && (index === 0 || cut - list[index - 1] >= residual.width * 0.18))
    .slice(0, 4);
  if (cuts.length < 1) return [];
  const bands = [];
  let start = 0;
  for (const cut of cuts) {
    bands.push({ box: { x: start, y: 0, w: Math.max(1, cut - start), h: residual.height } });
    start = cut;
  }
  bands.push({ box: { x: start, y: 0, w: Math.max(1, residual.width - start), h: residual.height } });
  return bands.filter((band) => band.box.w >= residual.width * 0.18 && band.box.w <= residual.width * 0.46);
}

function structuredIllustrationCardBandSparseResidualComponents(image, residual) {
  const bands = structuredIllustrationCardResidualComponents(image, residual);
  if (bands.length < 2) return [];
  const components = [];
  for (const band of bands) {
    const crop = cropPng(residual, band.box);
    const localComponents = structuredIllustrationSparseResidualComponents(crop)
      .filter((component) => {
        const areaRatio = Number(component.box?.w || 0) * Number(component.box?.h || 0) / Math.max(1, band.box.w * band.box.h);
        return areaRatio <= 0.24;
      })
      .slice(0, 8);
    for (const component of localComponents) {
      components.push({
        ...component,
        box: {
          x: band.box.x + component.box.x,
          y: band.box.y + component.box.y,
          w: component.box.w,
          h: component.box.h
        },
        splitMode: "structured-illustration-sparse-residual"
      });
    }
  }
  const fullArea = Math.max(1, residual.width * residual.height);
  const totalArea = components.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  if (components.length < 2 || components.length > 24 || totalArea > 0.46) return [];
  return components.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function structuredIllustrationSparseResidualComponents(residual) {
  if (!residual) return [];
  const raw = [...foregroundComponents(residual, []), ...paleStructureComponents(residual), ...structuredIllustrationLooseResidualComponents(residual)]
    .filter((component) => isUsefulStructuredIllustrationSparseComponent(component, residual))
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h));
  const merged = [];
  for (const component of raw) {
    const match = merged.find((item) => boxesNearPx(item.box, component.box, 8, 8));
    if (match) {
      match.box = expandStructuredResidualPxBox(unionPxBox(match.box, component.box), residual, 0, 0);
      match.sampledCount += Number(component.sampledCount || 0);
    } else {
      merged.push({ ...component, splitMode: "structured-illustration-sparse-residual" });
    }
  }
  const fullArea = Math.max(1, residual.width * residual.height);
  const useful = merged
    .filter((component) => isUsefulStructuredIllustrationSparseComponent(component, residual))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x))
    .slice(0, 24);
  const totalArea = useful.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  const maxArea = useful.length
    ? Math.max(...useful.map((component) => component.box.w * component.box.h / fullArea))
    : 0;
  if (totalArea > 0.42 || maxArea > 0.22) {
    return [];
  }
  return useful;
}

function structuredIllustrationLooseResidualComponents(residual) {
  if (!residual) return [];
  const step = 2;
  const gridW = Math.ceil(residual.width / step);
  const gridH = Math.ceil(residual.height / step);
  const visited = new Uint8Array(gridW * gridH);
  const components = [];
  for (let gy = 0; gy < gridH; gy += 1) {
    for (let gx = 0; gx < gridW; gx += 1) {
      const index = gy * gridW + gx;
      if (visited[index]) continue;
      const x = Math.min(residual.width - 1, gx * step);
      const y = Math.min(residual.height - 1, gy * step);
      if (!isStructuredIllustrationLooseResidualPixel(pixel(residual, x, y))) continue;
      const queue = [[gx, gy]];
      visited[index] = 1;
      let cursor = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let sampledCount = 0;
      while (cursor < queue.length && sampledCount < 80000) {
        const [cx, cy] = queue[cursor++];
        const px = Math.min(residual.width - 1, cx * step);
        const py = Math.min(residual.height - 1, cy * step);
        sampledCount += 1;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
          const nextIndex = ny * gridW + nx;
          if (visited[nextIndex]) continue;
          const candidateX = Math.min(residual.width - 1, nx * step);
          const candidateY = Math.min(residual.height - 1, ny * step);
          if (!isStructuredIllustrationLooseResidualPixel(pixel(residual, candidateX, candidateY))) continue;
          visited[nextIndex] = 1;
          queue.push([nx, ny]);
        }
      }
      const box = expandStructuredResidualPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, residual, 5, 5);
      components.push({ box, sampledCount, looseResidual: true, splitMode: "structured-illustration-sparse-residual" });
    }
  }
  return components;
}

function expandStructuredResidualPxBox(box, image, padX, padY) {
  const x = clamp(Math.floor(Number(box.x || 0) - Number(padX || 0)), 0, Math.max(0, Number(image?.width || 1) - 1));
  const y = clamp(Math.floor(Number(box.y || 0) - Number(padY || 0)), 0, Math.max(0, Number(image?.height || 1) - 1));
  const right = clamp(Math.ceil(Number(box.x || 0) + Number(box.w || 0) + Number(padX || 0)), x + 1, Number(image?.width || 1));
  const bottom = clamp(Math.ceil(Number(box.y || 0) + Number(box.h || 0) + Number(padY || 0)), y + 1, Number(image?.height || 1));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function isStructuredIllustrationLooseResidualPixel(color) {
  if (!color || color.a < 64) return false;
  const lightness = luma(color);
  const sat = saturation(color);
  if (lightness > 252 && sat < 0.18) return false;
  if (lightness >= 244 && sat < 0.08) return false;
  return true;
}

function isUsefulStructuredIllustrationSparseComponent(component, residual) {
  const box = component?.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const fullArea = Math.max(1, Number(residual?.width || 0) * Number(residual?.height || 0));
  const areaRatio = w * h / fullArea;
  if (areaRatio < 0.0007 || areaRatio > 0.22) return false;
  if (w < 10 || h < 6) return false;
  if (w > Number(residual?.width || 0) * 0.92 && h > Number(residual?.height || 0) * 0.7) return false;
  const lineLike = w >= 42 && h <= Math.max(18, Number(residual?.height || 0) * 0.06);
  const compactGraphic = w >= 18 && h >= 18;
  return lineLike || compactGraphic;
}

function structuredIllustrationCardAtomResidualComponents(image, residual) {
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms;
  if (!Array.isArray(atoms) || !image?.box || !residual) return [];
  const components = atoms
    .filter((atom) => shouldKeepStructuredIllustrationAtomAsResidual(atom, image))
    .map((atom) => {
      const pad = atom.kind === "grid-line-candidate" || atom.kind === "connector-line-candidate" ? 4 : 7;
      const box = slidePtBoxToLocalPxBox(expandPtBox(atom.box, DEFAULT_SLIDE, pad, pad), image.box, residual);
      if (!box) return null;
      return {
        box,
        sampledCount: Math.max(1, box.w * box.h),
        splitMode: "structured-illustration-atom-residual",
        atomId: atom.id || null,
        atomKind: atom.kind || null
      };
    })
    .filter(Boolean)
    .filter((component) => isUsableStructuredIllustrationAtomResidualBox(component.box, residual));
  return mergeStructuredIllustrationAtomComponents(components, residual).slice(0, 32);
}

function shouldKeepStructuredIllustrationAtomAsResidual(atom = {}, image = {}) {
  if (!atom?.box) return false;
  const kind = String(atom.kind || "");
  if (atom.residualCandidate === true) return true;
  if (kind === "grid-line-candidate") {
    const box = atom.box || {};
    const fullHeightSeparator = atom.axis === "v"
      && Number(box.h || 0) >= Number(image?.box?.h || 0) * 0.72;
    return !fullHeightSeparator;
  }
  return kind === "complex-shape-crop-candidate";
}

function isUsableStructuredIllustrationAtomResidualBox(box, residual) {
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, Number(residual.width || 0) * Number(residual.height || 0));
  if (areaRatio < 0.0008 || areaRatio > 0.18) return false;
  if (Number(box.w || 0) < 8 || Number(box.h || 0) < 8) return false;
  return true;
}

function mergeStructuredIllustrationAtomComponents(components, residual) {
  const merged = [];
  const ordered = [...components].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const padX = Math.max(4, Math.round(Number(residual.width || 0) * 0.012));
  const padY = Math.max(4, Math.round(Number(residual.height || 0) * 0.018));
  for (const component of ordered) {
    const match = merged.find((item) => boxesNearPx(item.box, component.box, padX, padY));
    if (match) {
      match.box = unionPxBox(match.box, component.box);
      match.sampledCount = Math.max(1, match.box.w * match.box.h);
      match.atomIds = [...(match.atomIds || []), component.atomId].filter(Boolean);
      match.atomKinds = [...new Set([...(match.atomKinds || []), component.atomKind].filter(Boolean))];
    } else {
      merged.push({
        ...component,
        atomIds: component.atomId ? [component.atomId] : [],
        atomKinds: component.atomKind ? [component.atomKind] : []
      });
    }
  }
  return merged
    .filter((component) => isUsableStructuredIllustrationAtomResidualBox(component.box, residual))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function structuredIllustrationCardResidualComponents(image, residual) {
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms;
  if (!Array.isArray(atoms) || !image?.box || !residual) return [];
  const separatorCenters = atoms
    .filter((atom) => atom?.kind === "grid-line-candidate" && atom?.axis === "v" && atom?.box)
    .filter((atom) => Number(atom.box.h || 0) >= Number(image.box.h || 0) * 0.72)
    .map((atom) => slidePtBoxToLocalPxBox(atom.box, image.box, residual))
    .filter((box) => box && box.h >= residual.height * 0.72 && box.x > residual.width * 0.12 && box.x < residual.width * 0.88)
    .map((box) => box.x + box.w / 2)
    .sort((a, b) => a - b);
  if (separatorCenters.length < 2) return [];
  const groups = [];
  for (const center of separatorCenters) {
    const last = groups[groups.length - 1];
    if (last && center - last[last.length - 1] <= residual.width * 0.035) last.push(center);
    else groups.push([center]);
  }
  const cuts = groups
    .map((group) => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length))
    .filter((cut, index, list) => cut > residual.width * 0.16
      && cut < residual.width * 0.84
      && (index === 0 || cut - list[index - 1] >= residual.width * 0.18))
    .slice(0, 4);
  if (cuts.length < 1) return [];
  const bands = [];
  let start = 0;
  for (const cut of cuts) {
    bands.push({ x: start, y: 0, w: Math.max(1, cut - start), h: residual.height });
    start = cut;
  }
  bands.push({ x: start, y: 0, w: Math.max(1, residual.width - start), h: residual.height });
  return bands
    .map((band) => trimResidualBandBox(residual, band))
    .filter(Boolean)
    .map((box) => ({
      box,
      sampledCount: Math.max(1, box.w * box.h),
      splitMode: "structured-illustration-card"
    }))
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.08 && areaRatio <= 0.44 && component.box.w >= residual.width * 0.18;
    })
    .slice(0, 5);
}

function isUsableVisualAtomResidualBox(box, residual) {
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, Number(residual.width || 0) * Number(residual.height || 0));
  if (areaRatio < 0.0025 || areaRatio > 0.32) return false;
  if (Number(box.w || 0) < 14 || Number(box.h || 0) < 14) return false;
  if (Number(box.w || 0) > Number(residual.width || 0) * 0.82 && Number(box.h || 0) > Number(residual.height || 0) * 0.62) return false;
  return true;
}

function classifyResidualSplitComponent(crop, component = {}, detector = "split-erased-residual-crop") {
  if (!crop || detector !== "split-erased-residual-crop") return null;
  const w = Number(crop.width || component.box?.w || 0);
  const h = Number(crop.height || component.box?.h || 0);
  if (w < 24 || h < 24 || w > 280 || h > 280) return null;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  if (aspect > 1.65) return null;
  let sampled = 0;
  let foreground = 0;
  let saturated = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const color = pixel(crop, x, y);
      sampled += 1;
      const sat = saturation(color);
      const lum = luma(color);
      const isForeground = lum < 244 || sat > 0.12;
      if (!isForeground) continue;
      foreground += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (sat > 0.28 && lum < 245) saturated += 1;
    }
  }
  const foregroundRatio = foreground / Math.max(1, sampled);
  const saturatedRatio = saturated / Math.max(1, sampled);
  const foregroundBoundsArea = Math.max(1, (maxX - minX + 2) * (maxY - minY + 2) / 4);
  const foregroundFillRatio = foreground / foregroundBoundsArea;
  if (foregroundFillRatio > 0.92) return null;
  if (foregroundRatio < 0.18 || foregroundRatio > 0.86) return null;
  if (saturatedRatio < 0.16 && foregroundFillRatio > 0.82) return null;
  return {
    detector: "icon-residual-crop",
    nonEditableReason: "small icon preserved as local fidelity crop after native primitive erasure"
  };
}

function annotateResidualSplitRejection(image, decision) {
  if (!image || !image.source || decision?.reason === "not-eligible") return;
  image.source.residualSplitRejected = {
    reason: decision.reason || "unknown",
    componentCount: decision.componentCount || 0,
    totalArea: roundRatio(decision.totalArea || 0),
    maxArea: roundRatio(decision.maxArea || 0),
    unionArea: roundRatio(decision.unionArea || 0),
    uncoveredPaleStructureRatio: roundRatio(decision.uncoveredPaleStructureRatio || 0),
    foregroundCoverage: roundRatio(decision.foregroundCoverage || 0),
    foregroundPixelCount: decision.foregroundPixelCount || 0,
    coveredForegroundPixelCount: decision.coveredForegroundPixelCount || 0,
    tableGridSplitRejected: decision.tableGridSplitRejected || null,
    tableGridComponentCount: decision.tableGridComponentCount || 0,
    bandSplitRejected: decision.bandSplitRejected || null,
    bandComponentCount: decision.bandComponentCount || 0
  };
}

function splitResidualLayerSource(layer, splitBox, detector = "split-erased-residual-crop") {
  if (!layer || typeof layer !== "object") return layer;
  const areaRatio = roundRatio((Number(splitBox.w || 0) * Number(splitBox.h || 0)) / (960 * 540));
  const isWideBand = detector === "split-wide-residual-crop";
  const isIcon = detector === "icon-residual-crop";
  const isSketchIllustration = /sketch|sticky/.test(detector);
  const isDiagramResidual = /diagram|flow|chain|network|triangle|topology|route|hierarchy|demand|review|skill/.test(detector);
  return {
    ...layer,
    layerType: (isIcon || isSketchIllustration) ? "illustration-zone" : isDiagramResidual ? "diagram-zone" : layer.layerType,
    detector,
    areaRatio,
    editBenefit: round(Math.min(Number(layer.editBenefit || 0), areaRatio * 1.5)),
    recommendedAction: "preserve-local-crop",
    reconstructionPlan: {
      status: "deferred",
      reason: (isIcon || isSketchIllustration)
        ? "small icon is preserved as a local fidelity crop"
        : isWideBand
        ? "wide mixed residual is split into local fidelity bands after native primitive erasure"
        : "remaining residual component is already isolated after native primitive erasure",
      regionBox: splitBox
    },
    explanation: (isIcon || isSketchIllustration)
      ? "icon-like residual preserved unless a confident editable vector match is available"
      : isWideBand
      ? "wide mixed visual layer preserved as movable local bands instead of one large raster crop"
      : "small residual component preserved after native primitive erasure"
  };
}

function residualForegroundCoverageDecision(residual, components, options = {}) {
  const boxes = Array.isArray(components)
    ? components.map((component) => component?.box).filter(Boolean)
    : [];
  if (!residual || boxes.length === 0) {
    return { use: false, reason: "missing-coverage-boxes", componentCount: 0 };
  }
  const minForegroundCoverage = Number(options.minForegroundCoverage || 0.78);
  let foregroundPixelCount = 0;
  let coveredForegroundPixelCount = 0;
  for (let y = 0; y < residual.height; y += 2) {
    for (let x = 0; x < residual.width; x += 2) {
      if (!isGraphicForeground(pixel(residual, x, y))) continue;
      foregroundPixelCount += 1;
      if (boxes.some((box) => pointInsidePxBox(x, y, box))) coveredForegroundPixelCount += 1;
    }
  }
  if (foregroundPixelCount < 12) {
    return {
      use: false,
      reason: "too-little-foreground-evidence",
      componentCount: boxes.length,
      foregroundPixelCount,
      coveredForegroundPixelCount,
      foregroundCoverage: 0
    };
  }
  const foregroundCoverage = coveredForegroundPixelCount / foregroundPixelCount;
  if (foregroundCoverage < minForegroundCoverage) {
    return {
      use: false,
      reason: "insufficient-foreground-coverage",
      componentCount: boxes.length,
      foregroundPixelCount,
      coveredForegroundPixelCount,
      foregroundCoverage
    };
  }
  return {
    use: true,
    reason: "accepted",
    componentCount: boxes.length,
    foregroundPixelCount,
    coveredForegroundPixelCount,
    foregroundCoverage
  };
}

function localPxBoxToSlidePt(localBox, residual, parentPtBox) {
  const sx = Number(parentPtBox.w || 0) / Math.max(1, residual.width);
  const sy = Number(parentPtBox.h || 0) / Math.max(1, residual.height);
  return {
    x: round(Number(parentPtBox.x || 0) + localBox.x * sx),
    y: round(Number(parentPtBox.y || 0) + localBox.y * sy),
    w: round(localBox.w * sx),
    h: round(localBox.h * sy)
  };
}

function slidePtBoxToLocalPxBox(ptBox, parentPtBox, residual) {
  const sx = residual.width / Math.max(1, Number(parentPtBox.w || 0));
  const sy = residual.height / Math.max(1, Number(parentPtBox.h || 0));
  const x = clamp(Math.floor((Number(ptBox.x || 0) - Number(parentPtBox.x || 0)) * sx), 0, residual.width - 1);
  const y = clamp(Math.floor((Number(ptBox.y || 0) - Number(parentPtBox.y || 0)) * sy), 0, residual.height - 1);
  const w = clamp(Math.ceil(Number(ptBox.w || 0) * sx), 1, residual.width - x);
  const h = clamp(Math.ceil(Number(ptBox.h || 0) * sy), 1, residual.height - y);
  return { x, y, w, h };
}

function structuredIllustrationCardShellBoxes(image = {}, slideSize = DEFAULT_SLIDE) {
  const contentBox = image.box || {};
  const box = structuredIllustrationOuterCardShellBounds(contentBox, slideSize);
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms || [];
  if (!Array.isArray(atoms) || !box.w || !box.h) return [];
  const separatorCenters = atoms
    .filter((atom) => atom?.kind === "grid-line-candidate" && atom?.axis === "v" && atom?.box)
    .filter((atom) => Number(atom.box.h || 0) >= Number(box.h || 0) * 0.72)
    .map((atom) => Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2)
    .filter((center) => center > Number(box.x || 0) + Number(box.w || 0) * 0.12
      && center < Number(box.x || 0) + Number(box.w || 0) * 0.88)
    .sort((a, b) => a - b);
  if (separatorCenters.length < 2) return [];
  const groups = [];
  for (const center of separatorCenters) {
    const last = groups[groups.length - 1];
    if (last && center - last[last.length - 1] <= Number(box.w || 0) * 0.035) last.push(center);
    else groups.push([center]);
  }
  const cuts = groups
    .map((group) => round(group.reduce((sum, value) => sum + value, 0) / group.length))
    .filter((cut, index, list) => cut > box.x + box.w * 0.16
      && cut < box.x + box.w * 0.84
      && (index === 0 || cut - list[index - 1] >= box.w * 0.18))
    .slice(0, 4);
  if (cuts.length < 1) return [];
  const gap = Math.max(12, Math.min(26, box.w * 0.028));
  const cards = [];
  let start = box.x;
  for (const cut of cuts) {
    const end = cut - gap / 2;
    cards.push({ x: start, y: box.y, w: Math.max(1, end - start), h: box.h });
    start = cut + gap / 2;
  }
  cards.push({ x: start, y: box.y, w: Math.max(1, box.x + box.w - start), h: box.h });
  return cards
    .filter((card) => card.w >= box.w * 0.18 && card.w <= box.w * 0.46)
    .map((card) => ({
      x: round(card.x),
      y: round(card.y),
      w: round(card.w),
      h: round(card.h)
    }));
}

function structuredIllustrationOuterCardShellBounds(contentBox = {}, slideSize = DEFAULT_SLIDE) {
  if (!contentBox?.w || !contentBox?.h) return {};
  const slideW = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const slideH = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  return clampPtBoxToSlide({
    x: round(Math.min(Number(contentBox.x || 0) - 22, slideW * 0.045)),
    y: round(Math.min(Number(contentBox.y || 0) - 28, slideH * 0.085)),
    w: round(Math.max(Number(contentBox.w || 0) + 34, slideW * 0.90)),
    h: round(Math.max(Number(contentBox.h || 0) + 52, slideH * 0.82))
  }, slideSize);
}

function clampPtBoxToSlide(box = {}, slideSize = DEFAULT_SLIDE) {
  const x = clamp(Number(box.x || 0), 0, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt));
  const y = clamp(Number(box.y || 0), 0, Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  const w = clamp(Number(box.w || 0), 0.1, Math.max(0.1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - x));
  const h = clamp(Number(box.h || 0), 0.1, Math.max(0.1, Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - y));
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function looksLikeScreenshotOrDocumentLayer(image = {}, layer = {}, understanding = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(layer.layerType || "").toLowerCase();
  const action = String(layer.recommendedAction || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  if (layerType === "diagram-zone"
    && action === "split-native-with-residual-crop"
    && archetype === "process-with-screenshots"
    && !/screenshot|screen|ui[-_\s]?screenshot|user[-_\s]?interface|webpage|document|prd|prototype|截图|界面|文档/.test(detector)) {
    return false;
  }
  if (layerType === "illustration-zone"
    && (action === "split-native-with-residual-crop" || action === "attempt-native-reconstruction")
    && !/screenshot|screen|ui[-_\s]?screenshot|user[-_\s]?interface|webpage|document|prd|prototype|截图|界面|文档/.test(detector)) {
    return false;
  }
  const text = [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.nonEditableReason,
    layer.layerType,
    layer.recommendedAction,
    understanding.archetype,
    understanding.evidence?.expressionSubtype,
    understanding.evidence?.detector
  ].filter(Boolean).join(" ").toLowerCase();
  return /screenshot|screen|ui[-_\s]?screenshot|user[-_\s]?interface|webpage|document|prd|prototype|截图|界面|文档/.test(text);
}

function boxesNearPx(a, b, padX, padY) {
  return !(a.x + a.w + padX < b.x
    || b.x + b.w + padX < a.x
    || a.y + a.h + padY < b.y
    || b.y + b.h + padY < a.y);
}

function unionPxBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}

module.exports = { splitMixedDiagramSemanticCrops, mixedDiagramSemanticComponents, clampLocalBox, expandLocalBox, residualForegroundCoverageDecision, annotateResidualSplitRejection, writeResidualSplitImages, localPxBoxToSlidePt, classifyResidualSplitComponent, shouldDrawResidualAfterShapes, splitResidualLayerSource, splitDenseStructuredCaseResidualCrops, slidePtBoxToLocalPxBox, isUsableVisualAtomResidualBox, denseResidualAtomComponents, unionLocalBoxes, structuredCaseRowBandComponents, boxCenterY, splitStructuredIllustrationCardResidualCrops, structuredIllustrationCardIllustrationResidualComponents, structuredIllustrationCardColumnBands, structuredIllustrationCardShellBoxes, structuredIllustrationOuterCardShellBounds, clampPtBoxToSlide, structuredIllustrationCardAtomResidualComponents, shouldKeepStructuredIllustrationAtomAsResidual, isUsableStructuredIllustrationAtomResidualBox, mergeStructuredIllustrationAtomComponents, boxesNearPx, unionPxBox, splitSparseVisualAtomErasedResidualCrop, looksLikeScreenshotOrDocumentLayer, residualForegroundStats, shouldDropHighConfidenceGridVisualAtomResidual, splitStructuredIllustrationSparseResidualCrops, structuredIllustrationSparseResidualComponents, structuredIllustrationLooseResidualComponents, isStructuredIllustrationLooseResidualPixel, expandStructuredResidualPxBox, isUsefulStructuredIllustrationSparseComponent, structuredIllustrationCardBandSparseResidualComponents, structuredIllustrationCardResidualComponents };
