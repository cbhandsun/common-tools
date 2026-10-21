"use strict";
const {types}=require("node:util");
const {unresolvedReviewedGraphicCount}=require("./source-scene-reviewed-graphics");
const {auditSceneInventory}=require('./source-scene-observed-inventory');

const MAX_PAGES = 50;
const MAX_OBJECTS_PER_PAGE = 10000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
    &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);
}

function validPixelBox(value) {
  return isRecord(value) && [value.x, value.y, value.w, value.h].every(Number.isFinite) && value.w > 0 && value.h > 0;
}

function validReferenceSize(value) {
  return isRecord(value) && Number.isFinite(value.width) && value.width > 0 && Number.isFinite(value.height) && value.height > 0;
}

function auditConnector(shape, pageIndex, findings) {
  const style = isRecord(shape.style) ? shape.style : {};
  const hasStart = typeof style.startArrow === "string" && style.startArrow.length > 0;
  const hasEnd = typeof style.endArrow === "string" && style.endArrow.length > 0;
  if (!hasStart && !hasEnd) return;
  const location = { pageIndex, elementId: typeof shape.id === "string" ? shape.id : null };
  if (!Number.isFinite(style.strokeWidthPt) || style.strokeWidthPt <= 0) findings.push({ code: "arrow-line-width-missing", ...location });
  if (style.lineCap !== "round") findings.push({ code: "arrow-line-cap-not-round", ...location });
  if (hasStart && (!style.startArrowWidth || !style.startArrowLength)) findings.push({ code: "start-arrow-size-missing", ...location });
  if (hasEnd && (!style.endArrowWidth || !style.endArrowLength)) findings.push({ code: "end-arrow-size-missing", ...location });
  if (shape.type === "arc") {
    if (style.fill !== "none") findings.push({ code: "arc-fill-must-be-none", ...location });
    if (hasStart === hasEnd) findings.push({ code: "arc-must-have-one-arrow-end", ...location });
  }
}

function auditMinimumUnitCrop(image, pageIndex, findings) {
  if (image?.source?.protectedMinimumUnit !== true || image?.source?.cropEvidenceRequired !== true) return;
  const source = image.source;
  const location = { pageIndex, elementId: typeof image.id === "string" ? image.id : null };
  if (!validPixelBox(source.originalPixelBox)) findings.push({ code: "crop-original-pixel-box-missing", ...location });
  if (!validReferenceSize(source.coordinateReferenceSizePx)) findings.push({ code: "crop-reference-size-missing", ...location });
  if (!validPixelBox(source.mappedPixelBox)) findings.push({ code: "crop-mapped-pixel-box-missing", ...location });
  if (!validPixelBox(source.tightenedPixelBox)) findings.push({ code: "crop-tightened-pixel-box-missing", ...location });
  if (!Number.isSafeInteger(source.removedNeighborPixels) || source.removedNeighborPixels < 0) findings.push({ code: "crop-removed-neighbor-evidence-missing", ...location });
  if (!Number.isSafeInteger(source.retainedDetailComponents) || source.retainedDetailComponents < 0) findings.push({ code: "crop-retained-detail-evidence-missing", ...location });
}

function isIgnoredPixelPrimitive(shape) {
  const detector = typeof shape?.source?.detector === "string" ? shape.source.detector : "";
  const id = typeof shape?.id === "string" ? shape.id : "";
  const qualityIgnored = shape?.source?.componentQualityIgnore === true;
  return shape?.source?.componentQualityIgnore === true
    && (detector === "native-residual-primitive-rect"
      || detector === "text-fidelity-native-primitive"
      || detector === "component-fidelity-native-primitive"
      || id.startsWith("component-fidelity-native-run-")
      || id.startsWith("text-fidelity-native-run-")
      || id.startsWith("native-residual-")
      || (qualityIgnored && detector === "" && shape?.type === "rect"));
}

function auditNativeComponentQuality(deck) {
  if (!isRecord(deck) || !Array.isArray(deck.pages) || deck.pages.length < 1 || deck.pages.length > MAX_PAGES) {
    throw new TypeError("native component quality deck is invalid");
  }
  const findings = [];
  let connectors = 0;
  let minimumUnitCrops = 0;
  let evidencedMinimumUnitCrops = 0;
  let unverifiedMinimumUnitCrops = 0;
  let residualViolations = 0;
  if (isRecord(deck.meta) && Object.hasOwn(deck.meta, "residualBranchRejected")) {
    residualViolations++;
    findings.push({ code: "source-residual-ownership-rejected" });
  }
  let ignoredPixelPrimitives = 0;
  const reviewCount=deck.meta===undefined?0:isRecord(deck.meta)?unresolvedReviewedGraphicCount(deck.meta.sourceSceneReview):null;
  let unresolvedSceneComponents = 0, pageReviewCount=0;
  if(reviewCount===null||reviewCount>0)findings.push({code:reviewCount===null?"scene-reviewed-graphic-evidence-invalid":"scene-reviewed-graphics-unresolved"});
  for (const [pageIndex, page] of deck.pages.entries()) {
    if (!isRecord(page)) throw new TypeError(`native component quality page ${pageIndex + 1} is invalid`);
    const sourceValid=page.source===undefined||isRecord(page.source);
    const graphics=sourceValid&&page.source!==undefined?page.source.sourceSceneReviewedGraphics:undefined;
    if(graphics!==undefined){
      const count=isRecord(graphics)&&graphics.version===1&&typeof graphics.sourceHash==="string"&&/^[a-f0-9]{64}$/u.test(graphics.sourceHash)
        ?unresolvedReviewedGraphicCount(graphics):null;
      pageReviewCount+=count===null?1:count;
      if(count===null||count>0)findings.push({code:count===null?"scene-reviewed-graphic-evidence-invalid":"scene-reviewed-graphics-unresolved",pageIndex,elementId:null});
    }
    const scene=sourceValid&&page.source!==undefined?page.source.sourceScene:undefined;
    if(!sourceValid||scene!==undefined){
      const valid=sourceValid&&isRecord(scene)&&scene.version===1&&!types.isProxy(scene.unresolved)&&Array.isArray(scene.unresolved)&&scene.unresolved.length<=112
        &&Object.getPrototypeOf(scene.unresolved)===Array.prototype&&Reflect.ownKeys(scene.unresolved).length===scene.unresolved.length+1
        &&Object.values(Object.getOwnPropertyDescriptors(scene.unresolved)).every(property=>"value" in property)
        &&scene.unresolved.every(item=>isRecord(item)&&typeof item.id==="string"&&typeof item.reason==="string");
      const unresolved=valid?scene.unresolved.length:1;
      unresolvedSceneComponents+=unresolved;
      if(unresolved)findings.push({code:valid?"source-scene-unresolved":"source-scene-evidence-invalid",pageIndex,elementId:null});
    }
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const images = Array.isArray(page.images) ? page.images : [];
    if(isRecord(scene)&&scene.observedInventory!==undefined){
      const inventoryFindings=auditSceneInventory(scene.observedInventory,shapes,images,scene.sourceHash,page.textBoxes??[]);
      unresolvedSceneComponents+=inventoryFindings.length;
      for(const item of inventoryFindings)findings.push({code:item.reason==='evidence-invalid'?'source-scene-inventory-invalid':'source-scene-inventory-incomplete',
        pageIndex,elementId:null,...item});
    }
    if (shapes.length + images.length > MAX_OBJECTS_PER_PAGE) throw new RangeError(`native component quality page ${pageIndex + 1} exceeds the object limit`);
    for (const shape of shapes) {
      if (!isRecord(shape)) throw new TypeError(`native component quality shape on page ${pageIndex + 1} is invalid`);
      const hasArrow = Boolean(shape.style?.startArrow || shape.style?.endArrow);
      if (hasArrow) { connectors += 1; auditConnector(shape, pageIndex, findings); }
      if (shape.type === "triangle" && shape.source?.role === "relationship") findings.push({ code: "standalone-relationship-arrow", pageIndex, elementId: shape.id ?? null });
      if (isIgnoredPixelPrimitive(shape)) {
        ignoredPixelPrimitives += 1;
        if (findings.length < 100) findings.push({ code: "ignored-pixel-primitive-present", pageIndex, elementId: shape.id ?? null });
      }
    }
    for (const image of images) {
      if (!isRecord(image)) throw new TypeError(`native component quality image on page ${pageIndex + 1} is invalid`);
      if (image.source?.protectedMinimumUnit === true) {
        minimumUnitCrops += 1;
        if (image.source?.cropEvidenceRequired === true) { evidencedMinimumUnitCrops += 1; auditMinimumUnitCrop(image, pageIndex, findings); }
        else unverifiedMinimumUnitCrops += 1;
      }
      if (deck.meta?.fullSlideResidualOmitted === true && image.source?.strategy === "full-slide-residual") {
        residualViolations += 1;
        findings.push({ code: "full-slide-residual-present-after-omission", pageIndex, elementId: image.id ?? null });
      }
    }
  }
  unresolvedSceneComponents+=Math.max(pageReviewCount,reviewCount===null?1:reviewCount);
  const checks = [
    { name: "native-connector-integrity", passed: !findings.some((item) => item.code.includes("arrow") || item.code.startsWith("arc-")) },
    { name: "minimum-unit-crop-evidence", passed: !findings.some((item) => item.code.startsWith("crop-")) },
    { name: "minimum-unit-crops-verified", passed: unverifiedMinimumUnitCrops === 0 },
    { name: "residual-omission-integrity", passed: residualViolations === 0 },
    { name: "semantic-native-primitive-integrity", passed: ignoredPixelPrimitives === 0 },
    { name: "source-scene-completion", passed: unresolvedSceneComponents === 0 },
  ];
  return Object.freeze({
    passed: checks.every((check) => check.passed),
    checks: Object.freeze(checks.map(Object.freeze)),
    metrics: Object.freeze({ connectors, minimumUnitCrops, evidencedMinimumUnitCrops, unverifiedMinimumUnitCrops, residualViolations, ignoredPixelPrimitives, unresolvedSceneComponents, findings: findings.length }),
    findings: Object.freeze(findings.slice(0, 100).map(Object.freeze)),
  });
}

module.exports = { auditNativeComponentQuality };
