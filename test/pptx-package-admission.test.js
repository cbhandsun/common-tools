"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const test = require("node:test");
const { readZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

const project = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "OpenXmlDeckBuilder.csproj");
const dll = path.join(path.dirname(project), "bin", "Debug", "net8.0", "OpenXmlDeckBuilder.dll");

test("PPTX admission rejects a high-ratio entry before Open XML parsing", { timeout: 60_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-package-bomb-"));
  const ir = path.join(root, "deck.json");
  const valid = path.join(root, "valid.pptx");
  const bomb = path.join(root, "bomb.pptx");
  const plan = path.join(root, "plan.json");
  const output = path.join(root, "out.pptx");
  fs.writeFileSync(ir, JSON.stringify(minimalDeck()), "utf8");
  runBuilder(["--ir", ir, "--out", valid]);
  const source = fs.readFileSync(valid);
  const entries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 }).map((entry) => ({ name: entry.name, data: readZipEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 }) }));
  entries.push({ name: "ppt/media/high-ratio.bin", data: Buffer.alloc(2 * 1024 * 1024), deflate: true });
  writeZip(bomb, entries);
  fs.writeFileSync(plan, JSON.stringify({ pptx: bomb, operations: [] }), "utf8");
  const result = invokeBuilder(["--apply-component-replacements-openxml", plan, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /suspiciously compressed ZIP entry/);
  assert.equal(fs.existsSync(output), false);
});

test("deck generation preserves an existing output when validation fails", { timeout: 60_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-atomic-output-"));
  const ir = path.join(root, "invalid.json");
  const output = path.join(root, "existing.pptx");
  const sentinel = Buffer.from("existing-output-must-survive");
  fs.writeFileSync(output, sentinel);
  fs.writeFileSync(ir, JSON.stringify({ version: "2.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [] }), "utf8");
  const result = invokeBuilder(["--ir", ir, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(output), sentinel);
  assert.equal(fs.readdirSync(root).some((name) => name.includes(".tmp-")), false);
});

function invokeBuilder(args) {
  const executable = process.env.DOTNET_BIN || "dotnet";
  const invocation = freshDll() ? [dll, ...args] : ["run", "--project", project, "--", ...args];
  return spawnSync(executable, invocation, { cwd: path.dirname(project), encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function runBuilder(args) { const result = invokeBuilder(args); assert.equal(result.status, 0, result.stderr || result.stdout); }
function freshDll() {
  if (!fs.existsSync(dll)) return false;
  const modified = fs.statSync(dll).mtimeMs;
  return fs.readdirSync(path.dirname(project)).filter((name) => /\.cs(proj)?$/u.test(name)).every((name) => fs.statSync(path.join(path.dirname(project), name)).mtimeMs <= modified);
}
function minimalDeck() {
  return { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, sourceImage: "", background: { fill: "#FFFFFF" }, shapes: [], textBoxes: [], images: [], tables: [], charts: [] }] };
}

function writeZip(file, entries) {
  const localParts = []; const centralParts = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8"); const data = Buffer.from(entry.data); const payload = entry.deflate ? zlib.deflateRawSync(data, { level: 9 }) : data; const method = entry.deflate ? 8 : 0; const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, payload);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name); offset += local.length + name.length + payload.length;
  }
  const central = Buffer.concat(centralParts); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, end]));
}
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
