"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readZipEntries, readZipEntry: readZipBufferEntry, rewriteZipEntries } = require("../../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");
const projectFile = path.join(__dirname, "..", "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "OpenXmlDeckBuilder.csproj");
const builderDll = path.join(path.dirname(projectFile), "bin", "Debug", "net8.0", "OpenXmlDeckBuilder.dll");

function resolveDotnet() {
  if (process.env.DOTNET_BIN) return process.env.DOTNET_BIN;
  const local = path.join(__dirname, "..", "..", ".tools", "dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  return fs.existsSync(local) ? local : "dotnet";
}

function runBuilder(args) {
  const result = invokeBuilder(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function invokeBuilder(args) {
  const invocationArgs = freshBuilderDll()
    ? [builderDll, ...args]
    : ["run", "--project", projectFile, "--", ...args];
  return spawnSync(resolveDotnet(), invocationArgs, {
    cwd: path.dirname(projectFile),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
}

function freshBuilderDll() {
  if (!fs.existsSync(builderDll)) return false;
  const dllMtime = fs.statSync(builderDll).mtimeMs;
  const sourceFiles = fs.readdirSync(path.dirname(projectFile))
    .filter((name) => name.endsWith(".cs") || name.endsWith(".csproj"))
    .map((name) => path.join(path.dirname(projectFile), name));
  return sourceFiles.every((file) => fs.statSync(file).mtimeMs <= dllMtime);
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function assertNear(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function createMinimalDeckIr(text) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [{
        id: "title",
        role: "title",
        text,
        box: { x: 100, y: 100, w: 400, h: 60 },
        font: { family: "Arial", sizePt: 24, weight: "bold", color: "#111111", align: "left", valign: "top", lineHeightMultiple: 1 },
        style: {}
      }],
      images: [],
      tables: [],
      charts: []
    }]
  };
}

function createComponentDeckIr({ anchor = false, sample = false } = {}) {
  const replacementPlan = {
    sourceProvider: "local",
    componentKind: "component",
    componentId: "portable-card",
    layerKey: "0:0",
    suitabilityTier: "strong",
    suitabilityScore: 99
  };
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: {},
      shapes: anchor ? [{
        id: "portable-anchor",
        type: "rect",
        box: { x: 120, y: 100, w: 360, h: 220 },
        style: { fill: "#E8EEF7" },
        source: { componentReplacementPlan: replacementPlan }
      }] : sample ? [{
        id: "portable-sample-shape",
        type: "roundrect",
        box: { x: 20, y: 20, w: 300, h: 160 },
        style: { fill: "#2F80ED", lineColor: "#165BAA" },
        source: {}
      }] : [],
      textBoxes: sample ? [{
        id: "portable-sample-text",
        text: "Portable editable text",
        box: { x: 60, y: 70, w: 220, h: 40 },
        font: { family: "Arial", sizePt: 20, weight: "bold", color: "#FFFFFF", align: "center", valign: "mid", lineHeightMultiple: 1 },
        style: {}
      }] : [],
      images: [],
      tables: [],
      charts: []
    }]
  };
}

function createComponentReplacementFixture(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const samplePptx = path.join(tmp, "sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  fs.writeFileSync(sampleIr, JSON.stringify(createComponentDeckIr({ sample: true })), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", samplePptx]);
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [{
      operation: "replace-anchor-group-with-component-sample",
      status: "ready",
      groupKey: "local:component:portable-card:0:0",
      provider: "local",
      componentId: "portable-card",
      layer: "0:0",
      slides: [1],
      target: { slide: 1, box: { x: 120, y: 100, w: 360, h: 220 } },
      sample: { provider: "local", path: samplePptx }
    }]
  }), "utf8");
  return { tmp, targetPptx, samplePptx, outPptx, planFile };
}

function addSlideShapeTiming(sourcePptx, outputPptx, drawingName) {
  const source = fs.readFileSync(sourcePptx);
  const slideEntry = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 })
    .map((entry) => entry.name)
    .find((name) => /ppt\/slides\/slide1\.xml$/i.test(name));
  assert.ok(slideEntry);
  const slideXml = readZipBufferEntry(source, slideEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8");
  const escapedName = drawingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shapeId = new RegExp(`<p:cNvPr[^>]*id="(\\d+)"[^>]*name="${escapedName}"`).exec(slideXml)?.[1]
    || new RegExp(`<p:cNvPr[^>]*name="${escapedName}"[^>]*id="(\\d+)"`).exec(slideXml)?.[1];
  assert.ok(shapeId, `missing shape id for ${drawingName}`);
  const timing = `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:childTnLst><p:set><p:cBhvr><p:cTn id="4" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  const animated = /<p:extLst>/.test(slideXml)
    ? slideXml.replace(/<p:extLst>/, `${timing}<p:extLst>`)
    : slideXml.replace(/<\/p:sld>$/, `${timing}</p:sld>`);
  assert.notEqual(animated, slideXml);
  rewriteZipEntries(sourcePptx, outputPptx, { [slideEntry]: Buffer.from(animated) });
}

module.exports = { resolveDotnet, runBuilder, invokeBuilder, freshBuilderDll, countMatches, assertNear, createMinimalDeckIr, createComponentDeckIr, createComponentReplacementFixture, addSlideShapeTiming };
