"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

function finalizePrdSegmentedFlowComponents(page = {}, options = {}) {
  const images = Array.isArray(page.images) ? page.images : [];
  const segments = images
    .filter((image) => image?.source?.prdGenerationSegmentCropPreserved === true && validBox(image.box))
    .sort((a, b) => Number(a.box.x) - Number(b.box.x));
  if (segments.length !== 3) return page;
  const [input, skill, output] = segments;
  const title = (Array.isArray(page.textBoxes) ? page.textBoxes : [])
    .find((item) => /PRD\s*自动生成/.test(String(item?.text || "")));
  if (!title) return page;

  const restoredInput = restoreSegmentCrop(input, options);
  const restoredOutput = restoreSegmentCrop(output, options);
  applyComponent(input, "input", "screenshot", restoredInput);
  applyComponent(skill, "skill", "icon", true);
  applyComponent(output, "output", "screenshot", restoredOutput);

  page.shapes = (Array.isArray(page.shapes) ? page.shapes : []).map((shape) => {
    const detector = String(shape?.source?.detector || "");
    if (detector === "title-accent") return withComponent(shape, component("title", "accent"));
    if (detector !== "prd-generation-flow-native-connector") return shape;
    const centerX = Number(shape?.box?.x || 0) + Number(shape?.box?.w || 0) / 2;
    const skillCenterX = Number(skill.box.x) + Number(skill.box.w) / 2;
    return withComponent(shape, component(centerX <= skillCenterX ? "input" : "skill", "connector"));
  });

  page.textBoxes = (Array.isArray(page.textBoxes) ? page.textBoxes : [])
    .filter((textBox) => {
      if (!validBox(textBox?.box)) return true;
      if (restoredInput && boxCenterInside(textBox.box, input.box)) return false;
      if (restoredOutput && boxCenterInside(textBox.box, output.box)) return false;
      return true;
    })
    .map((textBox) => /PRD\s*自动生成/.test(String(textBox?.text || ""))
      ? withComponent(textBox, component("title", "label"), true)
      : textBox);
  return page;
}

function applyComponent(image, role, subtype, textBakedInCrop) {
  image.source = {
    ...(image.source || {}),
    ...component(role, subtype),
    expressionForm: role === "skill" ? "icon-or-illustration" : "screenshot-or-document",
    expressionSubtype: role === "skill" ? "prd-generation-engine-icon" : "ui-screenshot",
    recommendedAction: "keep-local-crop",
    intentionalMinimumUnitCrop: true,
    protectedMinimumUnit: true,
    skipVisualAtomRebuild: true,
    prdGenerationScreenshotTextBakedInCrop: role !== "skill" && textBakedInCrop === true
  };
}

function component(role, part) {
  return {
    nativeComponentGroupId: `prd-segmented-flow-${role}`,
    nativeComponentParentId: "prd-segmented-flow",
    nativeComponentArchetype: role === "title" ? "section-title" : "screenshot-mediated-flow-stage",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part || "detail"
  };
}

function withComponent(item, metadata, textBox = false) {
  return {
    ...item,
    ...(textBox ? { style: { ...(item.style || {}), nativeComponentGroupId: metadata.nativeComponentGroupId } } : {}),
    source: { ...(item.source || {}), ...metadata }
  };
}

function restoreSegmentCrop(image, options) {
  const sourceImage = options?.sourceImage;
  const slideSize = options?.slideSize;
  const irDir = typeof options?.irDir === "string" ? path.resolve(options.irDir) : null;
  if (!sourceImage?.rgba || !validBox(image?.box) || !irDir || !image?.assetPath) return false;
  const assetFile = path.resolve(irDir, String(image.assetPath));
  if (!isWithin(irDir, assetFile)) return false;
  const pxBox = ptToPxBox(image.box, sourceImage, slideSize);
  if (!pxBox) return false;
  fs.mkdirSync(path.dirname(assetFile), { recursive: true });
  writePng(assetFile, cropPng(sourceImage, pxBox));
  return true;
}

function ptToPxBox(box, image, slideSize = {}) {
  const widthPt = finitePositive(slideSize.widthPt, 960);
  const heightPt = finitePositive(slideSize.heightPt, 540);
  const x = Math.max(0, Math.floor(Number(box.x) / widthPt * image.width));
  const y = Math.max(0, Math.floor(Number(box.y) / heightPt * image.height));
  const right = Math.min(image.width, Math.ceil((Number(box.x) + Number(box.w)) / widthPt * image.width));
  const bottom = Math.min(image.height, Math.ceil((Number(box.y) + Number(box.h)) / heightPt * image.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function boxCenterInside(inner, outer) {
  const x = Number(inner.x) + Number(inner.w) / 2;
  const y = Number(inner.y) + Number(inner.h) / 2;
  return x >= Number(outer.x) && x <= Number(outer.x) + Number(outer.w)
    && y >= Number(outer.y) && y <= Number(outer.y) + Number(outer.h);
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0 && Number(box.h) > 0;
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

module.exports = { finalizePrdSegmentedFlowComponents };
