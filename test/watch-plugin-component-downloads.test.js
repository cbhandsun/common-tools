"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  diffSnapshots,
  inferProviderForPath,
  parseArgs,
  resolveWatchRoots,
  screenChangedComponentFiles,
  snapshotRoots,
  watchPluginComponentDownloads
} = require("../skills/pd-hifi-slideclone/scripts/watch-plugin-component-downloads");

test("watch plugin component downloads parses bounded arguments", () => {
  const args = parseArgs([
    "node",
    "watch-plugin-component-downloads.js",
    "--out",
    "runs/watch",
    "--provider",
    "officeplus",
    "--root",
    "C:/OfficePLUS/Temp",
    "--file",
    "C:/Decks/current.pptx",
    "--duration-ms",
    "250",
    "--poll-ms",
    "100",
    "--max-files",
    "3",
    "--no-default-roots",
    "--active-powerpoint"
  ]);

  assert.equal(args.out, "runs/watch");
  assert.equal(args.provider, "officeplus");
  assert.deepEqual(args.roots, ["C:/OfficePLUS/Temp"]);
  assert.deepEqual(args.files, ["C:/Decks/current.pptx"]);
  assert.equal(args.durationMs, 250);
  assert.equal(args.pollMs, 100);
  assert.equal(args.maxFiles, 3);
  assert.equal(args.includeDefaultRoots, false);
  assert.equal(args.activePowerPoint, true);
});

test("watch plugin component downloads detects changed PPTX files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-snapshot-"));
  const before = snapshotRoots([tmp]);
  const pptx = path.join(tmp, "MatlComponentContent-1.pptx");
  writeTinyPptx(pptx, "officeplus component");
  const after = snapshotRoots([tmp]);
  const changed = diffSnapshots(before, after);

  assert.equal(changed.length, 1);
  assert.equal(changed[0].path, pptx);
});

test("watch plugin component downloads can watch a directly modified PPTX file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-file-"));
  const deck = path.join(tmp, "active-islide-deck.pptx");
  const out = path.join(tmp, "out");
  writeTinyPptx(deck, "before");
  setTimeout(() => {
    writeTinyPptx(deck, "after islide applied component");
  }, 80);

  const report = await watchPluginComponentDownloads({
    out,
    provider: "islide",
    files: [deck],
    includeDefaultRoots: false,
    durationMs: 250,
    pollMs: 50,
    maxFiles: 5
  });

  assert.equal(report.changedCount, 1);
  assert.equal(report.changedFiles[0].path, deck);
  assert.equal(report.harvests.length, 1);
  assert.equal(report.harvests[0].provider, "islide");
  assert.equal(report.harvests[0].copiedCount, 1);
  assert.equal(fs.existsSync(path.join(out, "islide", "manifest.json")), true);
});

test("watch plugin component downloads can resolve and watch the active PowerPoint file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-active-ppt-"));
  const deck = path.join(tmp, "active-islide-deck.pptx");
  const out = path.join(tmp, "out");
  writeTinyPptx(deck, "before");
  setTimeout(() => {
    writeTinyPptx(deck, "after active PowerPoint iSlide component");
  }, 80);

  const report = await watchPluginComponentDownloads({
    out,
    provider: "islide",
    activePowerPoint: true,
    includeDefaultRoots: false,
    durationMs: 250,
    pollMs: 50,
    maxFiles: 5,
    runner: ({ script }) => {
      assert.match(script, /Get-SlideclonePowerPointApplication/);
      assert.doesNotMatch(script, /AllowCreate \$true/);
      return {
        status: 0,
        stdout: JSON.stringify({ path: deck, error: "" }),
        stderr: ""
      };
    }
  });

  assert.equal(report.activePowerPointFile.path, deck);
  assert.equal(report.activePowerPointFile.error, "");
  assert.equal(report.changedCount, 1);
  assert.equal(report.changedFiles[0].path, deck);
  assert.equal(report.harvests[0].provider, "islide");
  assert.equal(report.harvests[0].copiedCount, 1);
});

test("watch plugin component downloads reports a safe message when active PowerPoint is unavailable", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-no-active-ppt-"));
  const report = await watchPluginComponentDownloads({
    out: path.join(tmp, "out"),
    provider: "officeplus",
    activePowerPoint: true,
    includeDefaultRoots: false,
    durationMs: 0,
    maxFiles: 5,
    runner: () => ({
      status: 0,
      stdout: JSON.stringify({ path: "", error: "No running PowerPoint application was found." }),
      stderr: ""
    })
  });

  assert.equal(report.activePowerPointFile.path, "");
  assert.equal(report.activePowerPointFile.error, "No running PowerPoint application was found.");
  assert.equal(report.changedCount, 0);
});

test("watch plugin component downloads harvests files created during the watch window", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-harvest-"));
  const officeRoot = path.join(tmp, "OfficePLUS", "Temp");
  const out = path.join(tmp, "out");
  fs.mkdirSync(officeRoot, { recursive: true });
  setTimeout(() => {
    writeTinyPptx(path.join(officeRoot, "MatlComponentContent-11189.pptx"), "officeplus downloaded component");
  }, 80);

  const report = await watchPluginComponentDownloads({
    out,
    provider: "officeplus",
    roots: [officeRoot],
    includeDefaultRoots: false,
    durationMs: 250,
    pollMs: 50,
    maxFiles: 5
  });

  assert.equal(report.changedCount, 1);
  assert.equal(report.harvests.length, 1);
  assert.equal(report.harvests[0].provider, "officeplus");
  assert.equal(report.harvests[0].copiedCount, 1);
  assert.equal(fs.existsSync(path.join(out, "officeplus", "manifest.json")), true);
});

test("watch plugin component downloads resolves default roots when present and infers providers", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-roots-"));
  const roots = resolveWatchRoots({
    provider: "all",
    roots: [tmp],
    includeDefaultRoots: false
  });

  assert.deepEqual(roots, [tmp]);
  assert.equal(inferProviderForPath("C:/Users/me/AppData/Local/OfficePLUS/Temp/a.pptx"), "officeplus");
  assert.equal(inferProviderForPath("C:/Temp/iSlide Tools/site/content/file/a.pptx"), "islide");
});

test("watch plugin component downloads rejects incomplete packages and deduplicates cross-plugin copies", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-watch-screen-"));
  const valid = path.join(tmp, "iSlide Tools", "component.pptx");
  const duplicate = path.join(tmp, "OfficePLUS", "component.pptx");
  const incomplete = path.join(tmp, "OfficePLUS", "partial.pptx");
  writeTinyPptx(valid, "same component");
  fs.mkdirSync(path.dirname(duplicate), { recursive: true });
  fs.copyFileSync(valid, duplicate);
  fs.writeFileSync(incomplete, "incomplete download");

  const screened = screenChangedComponentFiles([
    { provider: "islide", path: valid, size: fs.statSync(valid).size },
    { provider: "officeplus", path: duplicate, size: fs.statSync(duplicate).size },
    { provider: "officeplus", path: incomplete, size: fs.statSync(incomplete).size }
  ]);

  assert.equal(screened.accepted.length, 1);
  assert.equal(screened.ignored.length, 2);
  assert.equal(screened.ignored[0].reason, "duplicate-content");
  assert.equal(screened.ignored[1].reason, "incomplete-openxml-package");
});

function writeTinyPptx(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const name = Buffer.from("[Content_Types].xml");
  const data = Buffer.from(`<Types>${text}</Types>`);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  fs.writeFileSync(file, Buffer.concat([local, name, data, central, name, eocd]));
}
