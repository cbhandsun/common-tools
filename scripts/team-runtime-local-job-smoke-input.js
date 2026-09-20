#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createPptCreateArchive } = require("../packages/ppt-create-core/team-archive");
const { tarEntry } = require("../packages/slideclone-worker-adapter/team-raw-image-archive");

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`unexpected argument: ${item}`);
    const name = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[name] = next;
      index += 1;
    } else {
      result[name] = true;
    }
  }
  return result;
}

function assertDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute directory`);
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} is invalid`);
  return value;
}

function safeCapability(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("capability is invalid");
  return value;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function prepareImageToEditableInput({ temporaryRoot }) {
  const deckFile = path.join(temporaryRoot, "deck.json");
  const archive = path.join(temporaryRoot, "input.tar.gz");
  writeJson(deckFile, {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      background: { fill: "#FFFFFF" },
      textBoxes: [{
        id: "title",
        text: "Common Tools local authenticated smoke",
        box: { x: 48, y: 48, w: 720, h: 56 },
        font: { family: "Arial", sizePt: 28 }
      }],
      shapes: [{ id: "accent", type: "rect", box: { x: 48, y: 128, w: 240, h: 24 }, fill: "#4472C4" }],
      images: [],
      tables: [],
      charts: [],
      icons: []
    }]
  });
  const body = fs.readFileSync(deckFile);
  const packed = zlib.gzipSync(Buffer.concat([tarEntry("deck.json", body), Buffer.alloc(1024)]), { level: 9 });
  fs.writeFileSync(archive, packed, { mode: 0o600, flag: "wx" });
  return Object.freeze({ inputFile: archive, contentType: "application/gzip", defaultArtifactName: "deck.pptx" });
}

function preparePptCreateInput({ temporaryRoot }) {
  const specFile = path.join(temporaryRoot, "presentation.json");
  const archive = path.join(temporaryRoot, "input.tar.gz");
  writeJson(specFile, {
    version: "1.0",
    title: "Common Tools remote PPT create smoke",
    subtitle: "Authenticated team job path",
    audience: "Engineering",
    language: "en-US",
    theme: "clean-light-v1",
    slides: [
      {
        id: "cover",
        role: "cover",
        title: "Common Tools remote PPT create smoke",
        summary: "A bounded PresentationSpec packaged as a ppt-create archive"
      },
      {
        id: "facts",
        role: "metrics",
        title: "Verified team job outputs",
        items: [
          { id: "upload", label: "Upload", value: "MCP", detail: "create_team_upload_target" },
          { id: "artifact", label: "Artifact", value: "PPTX", detail: "deck.pptx target is retrievable" }
        ]
      },
      {
        id: "close",
        role: "closing",
        title: "Ready for remote execution",
        summary: "The same smoke exercises upload, job creation, wait, and artifact target lookup"
      }
    ]
  });
  createPptCreateArchive({ specFile, outputFile: archive });
  return Object.freeze({ inputFile: archive, contentType: "application/gzip", defaultArtifactName: "deck.pptx" });
}

function prepareLocalJobSmokeInput({ capability, temporaryRoot }) {
  const selectedCapability = safeCapability(capability);
  const root = assertDirectory(temporaryRoot, "temporary root");
  if (selectedCapability === "image-to-editable") return prepareImageToEditableInput({ temporaryRoot: root });
  if (selectedCapability === "ppt-create") return preparePptCreateInput({ temporaryRoot: root });
  throw new Error(`local job smoke input is not defined for capability: ${selectedCapability}`);
}

function main(argv = process.argv.slice(2)) {
  const args = parse(argv);
  const report = prepareLocalJobSmokeInput({
    capability: args.capability || "image-to-editable",
    temporaryRoot: args["temporary-root"]
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "local job smoke input preparation failed"}\n`);
    process.exitCode = 2;
  }
}

module.exports = { prepareLocalJobSmokeInput };
