#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readZipEntryText } = require("./lib/pptx-zip");

function parseArgs(argv = process.argv) {
  const args = {
    before: "",
    after: "",
    plan: "",
    out: "",
    failOnRegression: false,
    minPictureReduction: 1,
    minNativeIncrease: 1
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--before" && next) {
      args.before = next;
      index += 1;
    } else if (arg === "--after" && next) {
      args.after = next;
      index += 1;
    } else if (arg === "--plan" && next) {
      args.plan = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--fail-on-regression") {
      args.failOnRegression = true;
    } else if (arg === "--min-picture-reduction" && next) {
      args.minPictureReduction = Number(next);
      index += 1;
    } else if (arg === "--min-native-increase" && next) {
      args.minNativeIncrease = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-ir-replacement-object-audit argument: ${arg}`);
    }
  }
  if (!args.before) throw new Error("--before is required.");
  if (!args.after) throw new Error("--after is required.");
  if (!args.plan) throw new Error("--plan is required.");
  return args;
}

function runComponentIrReplacementObjectAudit(options = {}) {
  const args = normalizeOptions(options);
  const plan = readJson(args.plan);
  const slides = collectTargetSlides(plan);
  const targetNamesBySlide = collectTargetNamesBySlide(plan);
  const perSlide = slides.map((slide) => compareSlideXml(args.before, args.after, slide, targetNamesBySlide.get(slide) || []));
  const totals = summarizeSlides(perSlide);
  const findings = evaluateFindings(totals, args);
  const report = {
    provider: "component-ir-replacement-object-audit-v1",
    createdAt: new Date().toISOString(),
    before: path.resolve(args.before),
    after: path.resolve(args.after),
    plan: path.resolve(args.plan),
    out: args.out ? path.resolve(args.out) : null,
    targetSlideCount: slides.length,
    targetSlides: slides,
    thresholds: {
      minPictureReduction: args.minPictureReduction,
      minNativeIncrease: args.minNativeIncrease
    },
    totals,
    perSlide,
    findings,
    passed: findings.length === 0
  };
  if (args.out) writeJson(args.out, report);
  if (args.failOnRegression && findings.length) {
    const error = new Error(`Component IR replacement object audit failed with ${findings.length} finding(s).`);
    error.report = report;
    throw error;
  }
  return report;
}

function normalizeOptions(options) {
  const args = {
    ...options,
    before: String(options.before || ""),
    after: String(options.after || ""),
    plan: String(options.plan || ""),
    out: options.out ? String(options.out) : "",
    failOnRegression: options.failOnRegression === true,
    minPictureReduction: Number.isFinite(Number(options.minPictureReduction))
      ? Number(options.minPictureReduction)
      : 1,
    minNativeIncrease: Number.isFinite(Number(options.minNativeIncrease))
      ? Number(options.minNativeIncrease)
      : 1
  };
  if (!args.before) throw new Error("before is required.");
  if (!args.after) throw new Error("after is required.");
  if (!args.plan) throw new Error("plan is required.");
  return args;
}

function collectTargetSlides(plan) {
  const slides = new Set();
  for (const operation of Array.isArray(plan.operations) ? plan.operations : []) {
    for (const slide of Array.isArray(operation.slides) ? operation.slides : []) {
      if (Number.isInteger(Number(slide)) && Number(slide) > 0) slides.add(Number(slide));
    }
    const targetSlide = operation.target?.slide;
    if (Number.isInteger(Number(targetSlide)) && Number(targetSlide) > 0) slides.add(Number(targetSlide));
  }
  return [...slides].sort((left, right) => left - right);
}

function collectTargetNamesBySlide(plan) {
  const bySlide = new Map();
  for (const operation of Array.isArray(plan.operations) ? plan.operations : []) {
    const slides = new Set();
    for (const slide of Array.isArray(operation.slides) ? operation.slides : []) {
      if (Number.isInteger(Number(slide)) && Number(slide) > 0) slides.add(Number(slide));
    }
    const targetSlide = operation.target?.slide;
    if (Number.isInteger(Number(targetSlide)) && Number(targetSlide) > 0) slides.add(Number(targetSlide));
    const names = [
      ...safeArray(operation.drawingNames),
      operation.target?.imageId,
      operation.imageId
    ].map(safeString).filter(Boolean);
    for (const slide of slides) {
      if (!bySlide.has(slide)) bySlide.set(slide, new Set());
      const set = bySlide.get(slide);
      for (const name of names) set.add(name);
    }
  }
  return new Map([...bySlide.entries()].map(([slide, names]) => [slide, [...names].sort((a, b) => a.localeCompare(b))]));
}

function compareSlideXml(beforePptx, afterPptx, slide, targetNames = []) {
  const entryName = `ppt/slides/slide${slide}.xml`;
  const beforeXml = readZipEntryText(beforePptx, entryName);
  const afterXml = readZipEntryText(afterPptx, entryName);
  const before = countSlideObjects(beforeXml || "");
  const after = countSlideObjects(afterXml || "");
  const remainingTargetNames = targetNames.filter((name) => xmlContainsDrawingName(afterXml || "", name));
  return {
    slide,
    entryName,
    targetNames,
    before,
    after,
    delta: {
      pictures: after.pictures - before.pictures,
      shapes: after.shapes - before.shapes,
      groups: after.groups - before.groups,
      nativeObjects: after.nativeObjects - before.nativeObjects,
      targetUnderlayNames: after.targetUnderlayNames - before.targetUnderlayNames,
      componentEvidence: after.componentEvidence - before.componentEvidence
    },
    remainingTargetNames,
    missingBeforeXml: beforeXml === null,
    missingAfterXml: afterXml === null
  };
}

function countSlideObjects(xml) {
  const shapes = countMatches(xml, /<p:sp\b/g);
  const groups = countMatches(xml, /<p:grpSp\b/g);
  return {
    pictures: countMatches(xml, /<p:pic\b/g),
    shapes,
    groups,
    nativeObjects: shapes + groups,
    targetUnderlayNames: countMatches(xml, /native-graphic-[^"<]*underlay/g),
    componentEvidence: countMatches(xml, /OfficePLUS|officeplus|MatlComponent/g)
  };
}

function summarizeSlides(perSlide) {
  return perSlide.reduce((totals, slide) => {
    totals.beforePictures += slide.before.pictures;
    totals.afterPictures += slide.after.pictures;
    totals.pictureReduction += Math.max(0, slide.before.pictures - slide.after.pictures);
    totals.beforeNativeObjects += slide.before.nativeObjects;
    totals.afterNativeObjects += slide.after.nativeObjects;
    totals.nativeIncrease += Math.max(0, slide.after.nativeObjects - slide.before.nativeObjects);
    totals.afterComponentEvidence += slide.after.componentEvidence;
    totals.remainingTargetNames += slide.remainingTargetNames.length;
    if (slide.missingBeforeXml || slide.missingAfterXml) totals.missingSlideXml += 1;
    return totals;
  }, {
    beforePictures: 0,
    afterPictures: 0,
    pictureReduction: 0,
    beforeNativeObjects: 0,
    afterNativeObjects: 0,
    nativeIncrease: 0,
    afterComponentEvidence: 0,
    remainingTargetNames: 0,
    missingSlideXml: 0
  });
}

function evaluateFindings(totals, args) {
  const findings = [];
  if (totals.missingSlideXml > 0) {
    findings.push({
      severity: "error",
      code: "missing-slide-xml",
      message: `${totals.missingSlideXml} target slide XML entries could not be read.`
    });
  }
  if (totals.pictureReduction < args.minPictureReduction) {
    findings.push({
      severity: "error",
      code: "insufficient-picture-reduction",
      message: `Expected at least ${args.minPictureReduction} removed picture object(s), got ${totals.pictureReduction}.`
    });
  }
  if (totals.nativeIncrease < args.minNativeIncrease) {
    findings.push({
      severity: "error",
      code: "insufficient-native-increase",
      message: `Expected at least ${args.minNativeIncrease} added native object(s), got ${totals.nativeIncrease}.`
    });
  }
  if (totals.remainingTargetNames > 0) {
    findings.push({
      severity: "error",
      code: "target-underlay-still-present",
      message: `${totals.remainingTargetNames} target underlay drawing name(s) still remain after component replacement.`
    });
  }
  return findings;
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function xmlContainsDrawingName(xml, name) {
  const target = safeString(name);
  if (!target) return false;
  return extractDrawingNames(xml).has(target);
}

function extractDrawingNames(xml) {
  const names = new Set();
  const pattern = /<p:cNvPr\b[^>]*\bname=(['"])(.*?)\1/gi;
  for (const match of String(xml || "").matchAll(pattern)) {
    const value = unescapeXmlAttribute(match[2]);
    if (value) names.add(value);
  }
  return names;
}

function unescapeXmlAttribute(value) {
  return safeString(value)
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function writeJson(file, payload) {
  const out = path.resolve(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

if (require.main === module) {
  try {
    const report = runComponentIrReplacementObjectAudit(parseArgs(process.argv));
    process.stdout.write(`${JSON.stringify({
      passed: report.passed,
      totals: report.totals,
      findings: report.findings,
      out: report.out
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  runComponentIrReplacementObjectAudit,
  collectTargetNamesBySlide,
  collectTargetSlides,
  countSlideObjects,
  extractDrawingNames,
  compareSlideXml,
  evaluateFindings
};
