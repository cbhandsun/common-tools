"use strict";

function applyPrototypeValidationScreenshotPolicy(page = {}) {
  const shapes = Array.isArray(page.shapes) ? page.shapes : [];
  const images = Array.isArray(page.images) ? page.images : [];
  const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
  const screenshotRegions = [];

  for (const image of images) {
    if (image?.source?.prototypeValidationFlowObjectified !== true || image?.source?.residualSplit === true) continue;
    const layerId = String(image.id || "");
    const layerShapes = shapes.filter((shape) => String(shape?.source?.layerSourceId || "") === layerId);
    const regions = [
      regionFromShape(layerShapes, "prototype-validation-flow-native-intent-card", "intent-document-screenshot"),
      regionFromShape(layerShapes, "prototype-validation-flow-native-live-card", "live-ui-screenshot"),
      regionFromShape(layerShapes, "prototype-validation-flow-native-webpage", "webpage-ui-screenshot")
    ].filter(Boolean);
    if (regions.length === 0) continue;
    const existing = Array.isArray(image.source.prototypeValidationResidualBoxes)
      ? image.source.prototypeValidationResidualBoxes
      : [];
    image.source = {
      ...(image.source || {}),
      prototypeValidationResidualBoxes: mergeRegions(existing, regions),
      dropErasedResidualAfterNativeRebuild: false,
      screenshotMinimumUnitsDetected: regions.map((region) => region.name)
    };
    const layerRegions = regions.map((region) => ({ ...region, layerId }));
    screenshotRegions.push(...layerRegions);
    if (Array.isArray(image.source.prototypeValidationNativeTextBoxes)) {
      image.source.prototypeValidationNativeTextBoxes = image.source.prototypeValidationNativeTextBoxes
        .filter((textBox) => !isDuplicatedScreenshotText(textBox, layerRegions))
        .map(annotateTextComponent);
    }
  }

  page.shapes = shapes
    .filter((shape) => !isScreenshotPlaceholder(shape, screenshotRegions))
    .map(annotateShapeComponent);
  page.textBoxes = textBoxes
    .filter((textBox) => !isDuplicatedScreenshotText(textBox, screenshotRegions))
    .map(annotateTextComponent);
  page.images = images.map(annotateImageComponent);
  page.source = {
    ...(page.source || {}),
    prototypeValidationScreenshotPolicy: {
      screenshotRegionCount: screenshotRegions.length,
      mode: "preserve-ui-screenshots-with-native-routes"
    }
  };
  return { screenshotRegionCount: screenshotRegions.length };
}

function regionFromShape(shapes, detector, name) {
  const shape = shapes.find((item) => item?.source?.detector === detector && validBox(item.box));
  return shape ? { name, box: { ...shape.box }, role: "preserve-ui-screenshot" } : null;
}

function mergeRegions(existing, additions) {
  const byName = new Map();
  for (const region of [...existing, ...additions]) {
    if (!region?.name || !validBox(region.box)) continue;
    byName.set(String(region.name), { ...region, box: { ...region.box } });
  }
  return [...byName.values()];
}

function isScreenshotPlaceholder(shape, regions) {
  const detector = String(shape?.source?.detector || "");
  const layerId = String(shape?.source?.layerSourceId || "");
  if (!layerId || !validBox(shape?.box)) return false;
  const isPlaceholder = /^prototype-validation-flow-native-(?:intent-(?:card|header|title-line|body-line)|live-card(?:-header)?|ui-placeholder|webpage(?:-|$))/.test(detector);
  if (!isPlaceholder) return false;
  if (/^prototype-validation-flow-native-intent-(?:card|header|title-line|body-line)/.test(detector)) {
    return regions.some((region) => region.layerId === layerId && region.name === "intent-document-screenshot");
  }
  return regions.some((region) => region.layerId === layerId && centerInside(shape.box, region.box));
}

function isDuplicatedScreenshotText(textBox, regions) {
  const detector = String(textBox?.source?.detector || "");
  if (detector !== "prototype-validation-flow-native-live-label" || !validBox(textBox?.box)) return false;
  return regions.some((region) => region.name === "live-ui-screenshot" && centerInside(textBox.box, region.box));
}

function annotateShapeComponent(shape) {
  const detector = String(shape?.source?.detector || "");
  let role = "";
  if (/native-intent-(?:label-pill|connector)/.test(detector) || shape?.source?.role === "intent-output-connector") role = "intent";
  else if (detector === "prototype-validation-flow-native-label") role = /捕获/.test(String(shape?.source?.label || "")) ? "output" : "transform";
  else if (detector === "prototype-validation-flow-native-connector") role = "routes";
  if (!role) return shape;
  return { ...shape, source: { ...(shape.source || {}), ...component(role, detector) } };
}

function annotateTextComponent(textBox) {
  if (textBox?.source?.detector !== "prototype-validation-flow-native-label-text") return textBox;
  const role = /捕获/.test(String(textBox.text || "")) ? "output" : "transform";
  const meta = component(role, "label-text");
  return {
    ...textBox,
    style: { ...(textBox.style || {}), nativeComponentGroupId: meta.nativeComponentGroupId },
    source: { ...(textBox.source || {}), ...meta }
  };
}

function annotateImageComponent(image) {
  if (image?.source?.detector !== "prototype-validation-flow-residual-crop") return image;
  const value = `${image.id || ""} ${image.source?.expressionSubtype || ""}`;
  const role = /intent-document/.test(value) ? "intent"
    : /live-ui/.test(value) ? "live"
      : /webpage-ui/.test(value) ? "output"
        : /wand|magic-wand/.test(value) ? "transform" : "";
  if (!role) return image;
  return { ...image, source: { ...(image.source || {}), ...component(role, "preserved-visual") } };
}

function component(role, part) {
  return {
    nativeComponentGroupId: `prototype-validation-${role}`,
    nativeComponentParentId: "prototype-validation-flow",
    nativeComponentArchetype: role === "routes" ? "flow-connectors" : role === "transform" ? "visual-transform" : "ui-screenshot-stage",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part || "detail"
  };
}

function centerInside(inner, outer) {
  const x = Number(inner.x) + Number(inner.w) / 2;
  const y = Number(inner.y) + Number(inner.h) / 2;
  return x >= Number(outer.x) && x <= Number(outer.x) + Number(outer.w)
    && y >= Number(outer.y) && y <= Number(outer.y) + Number(outer.h);
}

function validBox(box) {
  return box && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0 && Number(box.h) > 0;
}

module.exports = { applyPrototypeValidationScreenshotPolicy };
