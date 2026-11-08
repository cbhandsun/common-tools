"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readPng, writePng } = require("../png");
const { sampleMaskBackgroundColor } = require("../scene-plan/raster-native-detection");

function validBox(box) {
  return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key])) && box.w > 0 && box.h > 0;
}

function intersectionArea(left, right) {
  return Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
}

function inside(inner, outer) {
  return inner.x >= outer.x + 2 && inner.y >= outer.y + 2
    && inner.x + inner.w <= outer.x + outer.w - 2
    && inner.y + inner.h <= outer.y + outer.h - 2;
}

function textMask(textBox, image, bitmap) {
  const box = textBox.box;
  const crop = image.box;
  const x = Math.floor((box.x - crop.x) * bitmap.width / crop.w) - 1;
  const y = Math.floor((box.y - crop.y) * bitmap.height / crop.h) - 1;
  const w = Math.ceil(box.w * bitmap.width / crop.w) + 2;
  const h = Math.ceil(box.h * bitmap.height / crop.h) + 2;
  if (x < 3 || y < 3 || x + w > bitmap.width - 3 || y + h > bitmap.height - 3) return null;
  return { x, y, w, h };
}

function hasUniformMargin(bitmap, mask) {
  const samples = [];
  for (let x = mask.x - 2; x <= mask.x + mask.w + 1; x += 2) {
    samples.push([x, mask.y - 2], [x, mask.y + mask.h + 1]);
  }
  for (let y = mask.y; y < mask.y + mask.h; y += 2) {
    samples.push([mask.x - 2, y], [mask.x + mask.w + 1, y]);
  }
  const colors = samples.map(([x, y]) => {
    const offset = (y * bitmap.width + x) * 4;
    return [bitmap.rgba[offset], bitmap.rgba[offset + 1], bitmap.rgba[offset + 2], bitmap.rgba[offset + 3]];
  });
  if (colors.some((color) => color[3] < 240)) return false;
  const reference = colors[Math.floor(colors.length / 2)];
  return colors.filter((color) => Math.max(...color.slice(0, 3).map((value, channel) => Math.abs(value - reference[channel]))) <= 24).length >= colors.length * 0.8;
}

function foregroundColor(bitmap, mask, fallback) {
  const background = sampleMaskBackgroundColor(bitmap, mask);
  const buckets = new Map();
  for (let y = mask.y; y < mask.y + mask.h; y += 1) {
    for (let x = mask.x; x < mask.x + mask.w; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      const channels = [...bitmap.rgba.subarray(offset, offset + 3)];
      if (bitmap.rgba[offset + 3] < 240
        || Math.max(...channels.map((value, index) => Math.abs(value - [background.r, background.g, background.b][index]))) < 72) continue;
      const key = channels.map((value) => Math.round(value / 32)).join(":");
      const bucket = buckets.get(key) || { count: 0, sum: [0, 0, 0] };
      bucket.count += 1;
      channels.forEach((value, index) => { bucket.sum[index] += value; });
      buckets.set(key, bucket);
    }
  }
  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant || dominant.count < 3) return fallback;
  return `#${dominant.sum.map((sum) => Math.round(sum / dominant.count).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function eraseTextForegroundMasks(bitmap, masks) {
  const next = { width: bitmap.width, height: bitmap.height, rgba: Buffer.from(bitmap.rgba) };
  for (const mask of masks) {
    const fill = sampleMaskBackgroundColor(bitmap, mask);
    for (let y = Math.max(0, mask.y); y < Math.min(bitmap.height, mask.y + mask.h); y += 1) {
      for (let x = Math.max(0, mask.x); x < Math.min(bitmap.width, mask.x + mask.w); x += 1) {
        const offset = (y * bitmap.width + x) * 4;
        if (bitmap.rgba[offset + 3] < 240) continue;
        const distance = Math.max(
          Math.abs(bitmap.rgba[offset] - fill.r),
          Math.abs(bitmap.rgba[offset + 1] - fill.g),
          Math.abs(bitmap.rgba[offset + 2] - fill.b)
        );
        if (distance < 48) continue;
        next.rgba[offset] = fill.r;
        next.rgba[offset + 1] = fill.g;
        next.rgba[offset + 2] = fill.b;
        next.rgba[offset + 3] = 255;
      }
    }
  }
  return next;
}

function assetFile(root, assetPath) {
  if (typeof assetPath !== "string" || !/^assets\/[a-zA-Z0-9/_-]+\.png$/u.test(assetPath) || assetPath.split("/").includes("..")) {
    throw new Error("OCR crop asset path is invalid");
  }
  const file = path.resolve(root, ...assetPath.split("/"));
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("OCR crop asset path escapes the workspace");
  try {
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || !fs.realpathSync.native(file).startsWith(`${fs.realpathSync.native(root)}${path.sep}`)) {
      throw new Error("OCR crop asset is invalid");
    }
  } catch { throw new Error("OCR crop asset is invalid"); }
  return file;
}

function recoverMissingOcrText({ page, sourceTextBoxes, slideSize, root, preserveLocalFidelityImages, allowedCropIds }) {
  if (!page || !Array.isArray(page.images) || !Array.isArray(page.textBoxes) || !Array.isArray(sourceTextBoxes)
    || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)
    || typeof root !== "string" || !path.isAbsolute(root) || typeof preserveLocalFidelityImages !== "boolean"
    || (allowedCropIds !== undefined && (!Array.isArray(allowedCropIds) || allowedCropIds.length > 32
      || allowedCropIds.some((id) => typeof id !== "string" || !id || id.length > 128)))) {
    throw new TypeError("OCR crop recovery input is invalid");
  }
  const pageArea = slideSize.widthPt * slideSize.heightPt;
  if (pageArea <= 0) throw new RangeError("OCR crop recovery slide is invalid");
  if (!preserveLocalFidelityImages) return Object.freeze({ recovered: 0, cropsErased: 0 });
  const allowed = allowedCropIds === undefined ? null : new Set(allowedCropIds);
  const crops = page.images.filter((image) => image?.source?.detector === "foreground-graphic-crop"
    && (allowed === null || allowed.has(image.id))
    && validBox(image.box) && image.box.w * image.box.h / pageArea >= 0.08);
  if (crops.length === 0) return Object.freeze({ recovered: 0, cropsErased: 0 });
  const existingIds = new Set(page.textBoxes.map((item) => String(item.id)));
  const candidates = sourceTextBoxes.filter((item) => validBox(item?.box) && typeof item.text === "string"
    && item.text.trim().length >= 2 && Number(item.source?.confidence) >= 0.8
    && !existingIds.has(String(item.id))
    && !page.textBoxes.some((existing) => validBox(existing?.box)
      && intersectionArea(existing.box, item.box) / (item.box.w * item.box.h) >= 0.45));
  const cropText = new Map(crops.map((crop) => [crop, candidates.filter((item) => inside(item.box, crop.box))]));
  const eligible = crops.filter((crop) => cropText.get(crop).length >= 5);
  if (eligible.length === 0) return Object.freeze({ recovered: 0, cropsErased: 0 });
  const bitmaps = new Map();
  for (const crop of eligible) {
    const file = assetFile(root, crop.assetPath);
    bitmaps.set(crop, { file, bitmap: readPng(file) });
  }
  const masksByCrop = new Map(eligible.map((crop) => [crop, []]));
  const recovered = [];
  for (const item of candidates) {
    const owners = eligible.filter((image) => validBox(image?.box) && inside(item.box, image.box));
    if (owners.length === 0 || owners.some((image) => !eligible.includes(image))) continue;
    const masks = owners.map((crop) => {
      const mask = textMask(item, crop, bitmaps.get(crop).bitmap);
      return mask && hasUniformMargin(bitmaps.get(crop).bitmap, mask) ? mask : null;
    });
    if (masks.some((mask) => !mask)) continue;
    const color = foregroundColor(bitmaps.get(owners[0]).bitmap, masks[0], item.font?.color || "#111111");
    recovered.push({
      ...item,
      font: { ...item.font, color, opacity: 1 },
      style: { ...item.style, visibility: "visible", opacity: 1, wrap: false, fit: "shrink" },
      source: { ...item.source, editable: true, nativeRebuild: true, overlayVisibility: "visible", ocrRecoveredFromCrop: true }
    });
    owners.forEach((crop, index) => { if (masks[index]) masksByCrop.get(crop).push(masks[index]); });
  }
  for (const [crop, masks] of masksByCrop) {
    if (masks.length === 0) continue;
    const { file, bitmap } = bitmaps.get(crop);
    writePng(file, eraseTextForegroundMasks(bitmap, masks));
    crop.source = { ...crop.source, textObjectified: true, textErasedFromCrop: true, recoveredOcrLines: masks.length };
  }
  page.textBoxes.push(...recovered);
  return Object.freeze({ recovered: recovered.length, cropsErased: [...masksByCrop.values()].filter((masks) => masks.length > 0).length });
}

module.exports = { recoverMissingOcrText };
