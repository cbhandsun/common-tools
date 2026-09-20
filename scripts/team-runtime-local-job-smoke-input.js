#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createPptCreateArchive } = require("../packages/ppt-create-core/team-archive");
const { crc32 } = require("../packages/ppt-quality-core");
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

function storedZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const content = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const checksum = crc32(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([header, nameBytes, content]);
    local.push(localEntry);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(content.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, nameBytes]));
    offset += localEntry.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, eocd]);
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

function preparePptxAuditInput({ temporaryRoot, defaultArtifactName, defaultJobOptions }) {
  const deck = path.join(temporaryRoot, "deck.pptx");
  const pptx = storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:sp/><p:pic/><a:tbl/></p:sld>'],
    ["ppt/media/orphan.png", Buffer.from([137, 80, 78, 71])]
  ]);
  fs.writeFileSync(deck, pptx, { mode: 0o600, flag: "wx" });
  return Object.freeze({
    inputFile: deck,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    defaultArtifactName,
    ...(defaultJobOptions ? { defaultJobOptions: Object.freeze(defaultJobOptions) } : {})
  });
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
  if (selectedCapability === "ppt-quality") return preparePptxAuditInput({ temporaryRoot: root, defaultArtifactName: "ppt-quality-report.json" });
  if (selectedCapability === "ppt-improve") return preparePptxAuditInput({ temporaryRoot: root, defaultArtifactName: "ppt-improve-report.json", defaultJobOptions: { repairProfile: "safe-package" } });
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
