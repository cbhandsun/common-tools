"use strict";

function createResidualCropLifecycleFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    isProtectedFidelityDiagramDetector,
    localResidualPxBox,
    path,
    ptBoxOverlapAreaValue,
    ptToPxBox,
    recordResidualDropDecision,
    residualSplitDecision,
    resolveAssetPathForIr,
    resolveResidualDropDecision,
    shouldDeferNativeRebuildForComponentStrategy,
    shouldDropResidual,
    shouldDropResidualCoveredByNativeTablePeers,
    shouldKeepFunnelHubDiagramText,
    shouldKeepFunnelHubTextInResidualCrop,
    shouldKeepStructuredVisualAtomLayerText,
    shouldPreserveProtectedMinimumUnitCrop,
    shouldRemoveHighRiskInternalOverlayText,
    splitErasedResidualCrop,
    writePng
  } = dependencies;

  function objectifyLayerTextCrops({ page, sourceImage, textBoxes, slideSize, irDir, structuredVisualAtomTextOnly = false }) {
    if (!sourceImage || !page || !Array.isArray(page.images)) return;
    for (const image of page.images) {
      const canObjectify = structuredVisualAtomTextOnly === true
        ? shouldKeepStructuredVisualAtomLayerText(image)
        : shouldObjectifyLayerText(image);
      if (!canObjectify) continue;
      const internalTextBoxes = (textBoxes || []).filter((textBox) =>
        boxCenterInside(textBox.box, image.box)
        && !(shouldKeepFunnelHubDiagramText(image) && shouldKeepFunnelHubTextInResidualCrop(textBox, image))
      );
      if (internalTextBoxes.length < 2) continue;
      const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
      if (!assetFile) continue;
      const masks = internalTextBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 9));
      const erased = eraseMasks(sourceImage, masks);
      const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
      ensureDir(path.dirname(assetFile));
      writePng(assetFile, crop);
      image.source = {
        ...(image.source || {}),
        residualCrop: true,
        textObjectified: true,
        objectifiedTextBoxes: internalTextBoxes.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; internal text objectified as native textboxes`
      };
    }
  }
  
  function shouldObjectifyLayerText(image) {
    const layer = image?.source?.layer || {};
    const layerType = layer.layerType;
    const action = layer.recommendedAction;
    if (shouldDeferNativeRebuildForComponentStrategy(image)) return false;
    if (isProtectedFidelityDiagramDetector(image?.source?.detector)) return false;
    if (shouldKeepFunnelHubDiagramText(image)) return true;
    if (shouldKeepStructuredVisualAtomLayerText(image)) return true;
    if (shouldRemoveHighRiskInternalOverlayText(image)) return false;
    return image?.source?.editable !== true
      && (layerType === "diagram-zone" || layerType === "table-zone")
      && (action === "attempt-native-reconstruction" || action === "split-native-with-residual-crop");
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  function splitErasedResidualCrops({ page, irDir }) {
    if (!page || !Array.isArray(page.images)) return;
    const nextImages = [];
    for (const image of page.images) {
      const replacement = splitErasedResidualCrop(image, irDir);
      if (replacement.length > 0) {
        for (const item of replacement) {
          const decision = resolveResidualDropDecision([
            {
              matched: shouldDropResidualWithNativeVisualAtomPeer(item, page),
              owner: "visual-atom",
              reasonCode: "residual.native-visual-atom-covered"
            },
            {
              matched: shouldDropResidualCoveredByNativeTableShapes(item, page),
              owner: "table-zone",
              reasonCode: "residual.native-table-shapes-covered"
            }
          ]);
          if (decision.dropResidual) {
            recordResidualDropDecision(item, decision);
          } else {
            nextImages.push(item);
          }
        }
      }
      else {
        const decision = resolveResidualDropDecision([
          { matched: shouldDropResidual(image), owner: "native-rebuilder-registry", reasonCode: "residual.owner-claim" },
          { matched: shouldDropResidualWithNativeVisualAtomPeer(image, page), owner: "visual-atom", reasonCode: "residual.native-visual-atom-covered" },
          { matched: shouldDropResidualCoveredByNativeTableShapes(image, page), owner: "table-zone", reasonCode: "residual.native-table-shapes-covered" },
          { matched: shouldDropResidualCoveredByNativeTablePeers(image, page), owner: "table-zone", reasonCode: "residual.native-table-peers-covered" },
          { matched: shouldDropObjectifiedTableZoneResidual(image, page), owner: "table-zone", reasonCode: "residual.objectified-table-zone" }
        ]);
        if (decision.dropResidual) recordResidualDropDecision(image, decision);
        else nextImages.push(image);
      }
    }
    page.images = nextImages;
  }
  
  function shouldDropResidualCoveredByNativeTableShapes(image = {}, page = {}) {
    const source = image?.source || {};
    if (String(source.detector || "") !== "split-erased-residual-crop") return false;
    if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
    const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
    if (!parentImageId || !image?.box) return false;
    const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
    const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
    const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
    if (!(/table|matrix|grid/.test(expressionForm) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
    if (/screenshot|photo|prototype|webpage|ui/.test(`${expressionForm} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase())) return false;
    const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
    if (!Number.isFinite(imageArea) || imageArea <= 0) return false;
    const nativeShapeDetectors = /^(?:table-zone-native-cell-fill|table-zone-native-grid-line|visual-atom-native-(?:right-arrow|rect|chevron|parallelogram|triangle|diamond|connector))$/;
    const overlaps = (page.shapes || [])
      .filter((shape) => shape?.box && String(shape?.source?.layerSourceId || "") === parentImageId)
      .filter((shape) => nativeShapeDetectors.test(String(shape?.source?.detector || "")))
      .map((shape) => ({
        detector: String(shape?.source?.detector || ""),
        area: ptBoxOverlapAreaValue(image.box, shape.box)
      }))
      .filter((item) => item.area > 0);
    if (overlaps.length === 0) return false;
    const maxCoverRatio = Math.max(...overlaps.map((item) => item.area / imageArea));
    const totalCoverRatio = overlaps.reduce((sum, item) => sum + item.area, 0) / imageArea;
    const hasSolidNativeCover = overlaps.some((item) =>
      /^(?:table-zone-native-cell-fill|visual-atom-native-(?:right-arrow|rect|chevron|parallelogram))$/.test(item.detector)
    );
    return hasSolidNativeCover && (maxCoverRatio >= 0.62 || totalCoverRatio >= 0.9);
  }
  
  function dropResidualsCoveredByNativeTableShapes(page = {}) {
    if (!Array.isArray(page.images) || page.images.length === 0 || !Array.isArray(page.shapes) || page.shapes.length === 0) {
      return page;
    }
    page.images = page.images.filter((image) => {
      if (!shouldDropResidualCoveredByNativeTableShapes(image, page)) return true;
      if (image.source && typeof image.source === "object") image.source.residualSplitDropped = true;
      return false;
    });
    return page;
  }
  
  
  
  
  
  function createTableMatrixResidualObjects(page = {}, semanticTextBoxes = []) {
    const shapes = [];
    const textBoxes = [];
    const images = Array.isArray(page.images) ? page.images : [];
    const pageForEvidence = {
      ...page,
      textBoxes: [
        ...(page.textBoxes || []),
        ...(Array.isArray(semanticTextBoxes) ? semanticTextBoxes : [])
      ]
    };
    const sourceFor = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      expressionForm: "table-or-matrix",
      expressionSubtype: "residual-native-replacement",
      confidence: 0.78,
      ...extra
    });
    for (const image of images) {
      if (!isTableMatrixResidualImage(image)) continue;
      const prdLabels = tableMatrixResidualPrdLabels(image, pageForEvidence);
      if (prdLabels.length >= 2) {
        prdLabels.forEach((label, index) => {
          const b = label.box || {};
          const box = {
            x: Number(b.x || 0) - 6,
            y: Number(b.y || 0) - 3.5,
            w: Math.max(34, Number(b.w || 0) + 12),
            h: Math.max(18, Number(b.h || 0) + 7)
          };
          shapes.push({
            id: `${image.id || "table-matrix-residual"}-native-prd-pill-${index}`,
            type: "rect",
            box,
            style: { fill: "#F7F7F7", stroke: "#A8A8A8", strokeWidthPt: 1.2, radiusPt: 5 },
            source: sourceFor("table-matrix-residual-native-prd-pill", {
              layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
              residualImageId: image.id,
              text: label.text
            })
          });
        });
        markTableMatrixResidualObjectified(image, "rebuilt PRD pill residuals as native rounded rectangles");
        continue;
      }
      if (isTableMatrixResidualImagePlaceholder(image, pageForEvidence)) {
        const box = image.box || {};
        const x = Number(box.x || 0);
        const y = Number(box.y || 0);
        const w = Number(box.w || 0);
        const h = Number(box.h || 0);
        const gap = Math.max(8, w * 0.08);
        const slotW = (w - gap) / 2;
        const slotH = Math.max(16, h * 0.88);
        const slotY = y + (h - slotH) / 2;
        [0, 1].forEach((index) => {
          const slotX = x + index * (slotW + gap);
          const slot = { x: slotX, y: slotY, w: slotW, h: slotH };
          shapes.push({
            id: `${image.id || "table-matrix-residual"}-native-placeholder-${index}`,
            type: "rect",
            box: slot,
            style: { fill: "#F8F8F8", stroke: "#A8A8A8", strokeWidthPt: 1.25 },
            source: sourceFor("table-matrix-residual-native-image-placeholder", {
              layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
              residualImageId: image.id,
              part: "frame",
              index
            })
          });
          shapes.push({
            id: `${image.id || "table-matrix-residual"}-native-placeholder-diag-a-${index}`,
            type: "line",
            box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
            style: { stroke: "#B5B5B5", strokeWidthPt: 1.05, connectorType: "straight" },
            source: sourceFor("table-matrix-residual-native-image-placeholder", {
              layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
              residualImageId: image.id,
              part: "diagonal-a",
              index
            })
          });
          shapes.push({
            id: `${image.id || "table-matrix-residual"}-native-placeholder-diag-b-${index}`,
            type: "line",
            box: { x: slot.x + slot.w, y: slot.y, w: -slot.w, h: slot.h },
            style: { stroke: "#B5B5B5", strokeWidthPt: 1.05, connectorType: "straight" },
            source: sourceFor("table-matrix-residual-native-image-placeholder", {
              layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
              residualImageId: image.id,
              part: "diagonal-b",
              index
            })
          });
        });
        markTableMatrixResidualObjectified(image, "rebuilt image placeholder residual as native frames and diagonals");
      }
    }
    return { shapes, textBoxes };
  }
  
  
  
  function isTableMatrixResidualImage(image = {}) {
    const source = image.source || {};
    const detector = String(source.detector || "");
    if (!/^(?:split-erased-residual-crop|icon-residual-crop)$/.test(detector)) return false;
    const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
    const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || "").toLowerCase();
    const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
    const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
    if (!(/table|matrix|grid/.test(`${expressionForm} ${expressionSubtype}`) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
    if (shouldPreserveProtectedMinimumUnitCrop(image) && !/table|matrix|grid/.test(`${expressionForm} ${expressionSubtype} ${layerType} ${archetype}`)) return false;
    const box = image.box || {};
    const area = Number(box.w || 0) * Number(box.h || 0);
    return Number.isFinite(area) && area > 0 && area <= 9000;
  }
  
  function tableMatrixResidualPrdLabels(image = {}, page = {}) {
    const parentImageId = String(image.source?.parentImageId || image.source?.layer?.parentImageId || "");
    const expanded = expandPtBox(image.box, 18);
    return (page.textBoxes || [])
      .filter((textBox) => textBox?.box && String(textBox?.source?.detector || "") === "table-zone-semantic-native-visible-label")
      .filter((textBox) => !parentImageId || String(textBox?.source?.layerSourceId || "") === parentImageId)
      .filter((textBox) => textBox?.source?.textErasedFromCrop === true)
      .filter((textBox) => /^PRD\s*\d+$/i.test(String(textBox.text || "").trim()))
      .filter((textBox) => {
        if (ptBoxOverlapAreaValue(expanded, textBox.box) > 0) return true;
        const imageCenterY = Number(image.box?.y || 0) + Number(image.box?.h || 0) / 2;
        const textCenterY = Number(textBox.box?.y || 0) + Number(textBox.box?.h || 0) / 2;
        const textCenterX = Number(textBox.box?.x || 0) + Number(textBox.box?.w || 0) / 2;
        return Math.abs(textCenterY - imageCenterY) <= Number(image.box?.h || 0) * 0.75
          && textCenterX >= Number(image.box?.x || 0) - 8
          && textCenterX <= Number(image.box?.x || 0) + Number(image.box?.w || 0) + 8;
      });
  }
  
  function isTableMatrixResidualImagePlaceholder(image = {}, page = {}) {
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    if (w / h < 2.1 || w / h > 3.8) return false;
    const expanded = expandPtBox(box, 8);
    const nearbyText = (page.textBoxes || []).filter((textBox) =>
      textBox?.box && ptBoxOverlapAreaValue(expanded, textBox.box) > 0
    );
    if (nearbyText.length > 0) return false;
    return true;
  }
  
  function markTableMatrixResidualObjectified(image = {}, reason = "rebuilt table/matrix residual as native shapes") {
    image.source = {
      ...(image.source || {}),
      tableMatrixResidualObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      preserveResidualCropUnderNativeRebuild: false,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "table/matrix residual crop"}; ${reason}`
    };
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  function shouldDropResidualWithNativeVisualAtomPeer(image = {}, page = {}) {
    const source = image?.source || {};
    const detector = String(source.detector || "");
    if (!/^(?:icon-residual-crop|visual-atom-residual-crop)$/.test(detector)) return false;
    const atomId = String(source.visualAtomId || "");
    const parentImageId = String(source.parentImageId || "");
    if (!atomId || !parentImageId) return false;
    if (!/^(?:icon-crop-candidate|complex-shape-crop-candidate)$/.test(String(source.visualAtomKind || ""))) return false;
    return (page.shapes || []).some((shape) => {
      const shapeSource = shape?.source || {};
      return String(shapeSource.layerSourceId || "") === parentImageId
        && String(shapeSource.atomId || "") === atomId
        && /^visual-atom-native-(?:right-arrow|chevron|parallelogram|triangle|diamond)$/.test(String(shapeSource.detector || ""));
    });
  }
  
  function shouldDropObjectifiedTableZoneResidual(image = {}, page = {}) {
    const source = image?.source || {};
    const detector = String(source.detector || "");
    if (!/^(?:foreground-graphic-underlay-crop|structured-case-graphic-underlay-crop|content-foreground-graphic-underlay-crop)$/.test(detector)) {
      return false;
    }
    if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
    const expressionForm = String(source.expressionForm || "").toLowerCase();
    if (/screenshot|document|icon|illustration|photo/.test(expressionForm)) return false;
    const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
    const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
    const looksStructuredTableZone = layerType === "table-zone"
      || /table|matrix|grid/.test(expressionForm)
      || /matrix|grid|table/.test(archetype)
      || source.tableGridObjectified === true;
    if (!looksStructuredTableZone) return false;
    if (source.visualAtomObjectified !== true || source.tableZoneSemanticTextObjectified !== true) return false;
    const imageId = String(image.id || "");
    const nativeShapes = (page.shapes || []).filter((shape) => {
      const shapeSource = shape?.source || {};
      return String(shapeSource.layerSourceId || "") === imageId
        && /^visual-atom-native-/.test(String(shapeSource.detector || ""));
    }).length;
    const semanticTextBoxes = (page.textBoxes || []).filter((textBox) => {
      const textSource = textBox?.source || {};
      return String(textSource.layerSourceId || "") === imageId
        && textSource.semanticTextSource === true
        && textSource.textErasedFromCrop === true;
    }).length;
    const declaredAtoms = Number(source.objectifiedVisualAtoms || 0);
    const declaredSemanticLabels = Number(source.objectifiedTableZoneSemanticTextBoxes || 0);
    if (Math.max(nativeShapes, declaredAtoms) < 24) return false;
    if (Math.max(semanticTextBoxes, declaredSemanticLabels) < 6) return false;
    const rejected = source.residualSplitRejected || {};
    const splitCouldNotFindIndependentUnits = String(rejected.reason || "") === "too-few-components"
      && String(rejected.tableGridSplitRejected || "") === "too-few-table-grid-components"
      && String(rejected.bandSplitRejected || "") === "too-few-band-components";
    if (!splitCouldNotFindIndependentUnits) return false;
    source.dropErasedResidualAfterNativeRebuild = true;
    source.dropReason = "table-zone residual covered by native visual atoms and semantic text boxes";
    return true;
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  function eraseToolGapPlatformResidualText(residual, image) {
    const boxes = Array.isArray(image?.source?.toolGapPlatformTextEraseBoxes)
      ? image.source.toolGapPlatformTextEraseBoxes
      : [];
    if (boxes.length === 0) return residual;
    const masks = boxes.map((box) => localResidualPxBox(expandPtBox(box, DEFAULT_SLIDE, 5, 5), image.box, residual));
    return eraseMasks(residual, masks);
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  function shouldUseResidualSplit(components, residual) {
    return residualSplitDecision(components, residual).use;
  }

  return {
    createTableMatrixResidualObjects,
    dropResidualsCoveredByNativeTableShapes,
    eraseToolGapPlatformResidualText,
    objectifyLayerTextCrops,
    shouldDropObjectifiedTableZoneResidual,
    shouldDropResidualCoveredByNativeTableShapes,
    shouldDropResidualWithNativeVisualAtomPeer,
    shouldObjectifyLayerText,
    shouldUseResidualSplit,
    splitErasedResidualCrops
  };
}

module.exports = { createResidualCropLifecycleFactory };
