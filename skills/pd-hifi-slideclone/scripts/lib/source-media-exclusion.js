"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readImageSizeBuffer } = require("./image-size");
const { readPng, readPngBuffer } = require("./png");
const { listZipEntries, readZipEntry } = require("./pptx-inventory");

const MEDIA_PATTERN = /^ppt\/media\/(.+\.(?:png|jpe?g|gif|bmp|tiff?|webp))$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function auditSourceMediaExclusion({ ir, pptxFile, baseDir, options = {} }) {
  const maxMatches = boundedInteger(options.maxMatches, 1, 500, 100);
  const perceptualDistance = boundedInteger(options.perceptualDistance, 0, 20, 4);
  const report = {
    provider: "source-media-exclusion-v1",
    status: "passed",
    passed: true,
    pptxFile: pptxFile ? path.basename(pptxFile) : null,
    canonicalSources: [],
    mediaCount: 0,
    matches: [],
    disallowedMatches: 0,
    exactMatches: 0,
    perceptualMatches: 0,
    errors: []
  };
  let sources;
  try {
    sources = collectCanonicalSources(ir, baseDir);
    report.canonicalSources = sources.map(publicSourceRecord);
  } catch (error) {
    return failReport(report, sanitizeError(error));
  }
  if (!pptxFile) return failReport(report, "PPTX file is required for source-media exclusion audit");
  const resolvedPptx = path.resolve(pptxFile);
  const stat = fs.statSync(resolvedPptx, { throwIfNoEntry: false });
  if (!stat?.isFile()) return failReport(report, "PPTX file does not exist");
  if (sources.length === 0) return failReport(report, "No canonical source images were available for exclusion audit");

  try {
    const archive = fs.readFileSync(resolvedPptx);
    const entries = listZipEntries(archive, {
      maxArchiveBytes: boundedInteger(options.maxArchiveBytes, 1024, 1024 * 1024 * 1024, 512 * 1024 * 1024),
      maxEntries: boundedInteger(options.maxEntries, 1, 65_534, 20_000),
      maxEntryBytes: boundedInteger(options.maxEntryBytes, 1024, 512 * 1024 * 1024, 128 * 1024 * 1024)
    }).filter((entry) => MEDIA_PATTERN.test(entry.name));
    report.mediaCount = entries.length;
    for (const entry of entries) {
      const data = readZipEntry(archive, entry.name, { maxBytes: options.maxEntryBytes || 128 * 1024 * 1024 });
      if (!data) continue;
      const media = mediaFingerprint(entry.name, data);
      for (const source of sources) {
        const match = compareSourceAndMedia(source, media, perceptualDistance);
        if (!match) continue;
        const allowed = source.allowCanonicalMedia === true;
        const record = {
          pageIndex: source.pageIndex,
          sourceRef: `page-${source.pageIndex + 1}`,
          mediaPart: entry.name,
          matchType: match.type,
          sha256: media.sha256,
          hammingDistance: match.hammingDistance ?? null,
          allowed,
          allowReasonRecorded: allowed && source.allowCanonicalMediaReason.length > 0
        };
        if (report.matches.length < maxMatches) report.matches.push(record);
        if (match.type === "exact") report.exactMatches += 1;
        else report.perceptualMatches += 1;
        if (!allowed) report.disallowedMatches += 1;
      }
    }
  } catch (error) {
    return failReport(report, sanitizeError(error));
  }
  report.passed = report.disallowedMatches === 0;
  report.status = report.passed ? "passed" : "failed";
  return report;
}

function collectCanonicalSources(ir, baseDir = process.cwd()) {
  const root = path.resolve(baseDir || process.cwd());
  const seen = new Set();
  const sources = [];
  for (const [ordinal, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const resolved = resolveExistingFile(root, page?.sourceImage);
    if (!resolved) continue;
    const sha256 = hashFile(resolved);
    const declared = String(page?.reconstruction?.canonicalPageSha256 || "").toLowerCase();
    if (declared && (!SHA256_PATTERN.test(declared) || declared !== sha256)) {
      throw new Error(`Canonical source hash mismatch for page ${page?.pageIndex ?? ordinal}`);
    }
    const key = `${page?.pageIndex ?? ordinal}:${sha256}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fingerprint = sourceFingerprint(resolved);
    sources.push({
      pageIndex: page?.pageIndex ?? ordinal,
      sourceImage: resolved,
      sha256,
      ...fingerprint,
      allowCanonicalMedia: page?.reconstruction?.allowCanonicalMedia === true,
      allowCanonicalMediaReason: String(page?.reconstruction?.allowCanonicalMediaReason || "").trim()
    });
  }
  return sources;
}

function compareSourceAndMedia(source, media, maxDistance) {
  if (source.sha256 === media.sha256) return { type: "exact" };
  if (!source.dhash || !media.dhash || source.visualSignal < 0.04 || media.visualSignal < 0.04) return null;
  if (!similarAspectRatio(source, media)) return null;
  const distance = hammingDistanceHex(source.dhash, media.dhash);
  return distance <= maxDistance ? { type: "perceptual", hammingDistance: distance } : null;
}

function sourceFingerprint(file) {
  if (path.extname(file).toLowerCase() !== ".png") return { dhash: "", visualSignal: 0, widthPx: null, heightPx: null };
  const image = readPng(file, { maxPixels: 50_000_000 });
  return { ...perceptualFingerprint(image), widthPx: image.width, heightPx: image.height };
}

function mediaFingerprint(name, data) {
  const ext = path.extname(name).toLowerCase();
  const size = readImageSizeBuffer(data, ext);
  const result = {
    sha256: hashBuffer(data),
    dhash: "",
    visualSignal: 0,
    widthPx: size.widthPx || null,
    heightPx: size.heightPx || null
  };
  if (ext !== ".png") return result;
  try {
    const image = readPngBuffer(data, { label: name, maxPixels: 50_000_000 });
    return { ...result, ...perceptualFingerprint(image), widthPx: image.width, heightPx: image.height };
  } catch {
    return result;
  }
}

function perceptualFingerprint(image) {
  const samples = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 9; x += 1) samples.push(sampleLuma(image, x, y, 9, 8));
  }
  let bits = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits = (bits << 1n) | BigInt(samples[y * 9 + x] > samples[y * 9 + x + 1] ? 1 : 0);
    }
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / samples.length;
  return {
    dhash: bits.toString(16).padStart(16, "0"),
    visualSignal: Math.min(1, Math.sqrt(variance) / 64)
  };
}

function sampleLuma(image, sampleX, sampleY, sampleWidth, sampleHeight) {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor((sampleX + 0.5) * image.width / sampleWidth)));
  const y = Math.min(image.height - 1, Math.max(0, Math.floor((sampleY + 0.5) * image.height / sampleHeight)));
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] / 255;
  const r = image.rgba[offset] * alpha + 255 * (1 - alpha);
  const g = image.rgba[offset + 1] * alpha + 255 * (1 - alpha);
  const b = image.rgba[offset + 2] * alpha + 255 * (1 - alpha);
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114);
}

function hammingDistanceHex(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function similarAspectRatio(left, right) {
  if (!left.widthPx || !left.heightPx || !right.widthPx || !right.heightPx) return false;
  const leftRatio = left.widthPx / left.heightPx;
  const rightRatio = right.widthPx / right.heightPx;
  return Math.abs(leftRatio - rightRatio) / Math.max(leftRatio, rightRatio) <= 0.01;
}

function publicSourceRecord(source) {
  return {
    pageIndex: source.pageIndex,
    sourceRef: `page-${source.pageIndex + 1}`,
    sha256: source.sha256,
    widthPx: source.widthPx,
    heightPx: source.heightPx,
    allowCanonicalMedia: source.allowCanonicalMedia,
    allowReasonRecorded: source.allowCanonicalMediaReason.length > 0
  };
}

function resolveExistingFile(baseDir, value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(baseDir, value);
  return fs.statSync(resolved, { throwIfNoEntry: false })?.isFile() ? resolved : null;
}

function hashFile(file) {
  return hashBuffer(fs.readFileSync(file));
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function failReport(report, message) {
  report.status = "error";
  report.passed = false;
  report.errors.push(message);
  return report;
}

function sanitizeError(error) {
  const value = String(error?.message || error || "source media audit failed");
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

module.exports = {
  auditSourceMediaExclusion,
  collectCanonicalSources,
  hammingDistanceHex,
  perceptualFingerprint
};
