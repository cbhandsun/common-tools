"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { expandRestrictedSvgGraphics } = require("../skills/pd-hifi-slideclone/scripts/lib/restricted-svg");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

const projectDirectory = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder");

test("restricted SVG carrier becomes editable DrawingML without embedding source media", (t) => {
  const builder = findBuilder();
  if (!builder) return t.skip("OpenXmlDeckBuilder must be built before the integration suite");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-restricted-svg-"));
  try {
    fs.writeFileSync(path.join(directory, "graphic.svg"), `<svg viewBox="0 0 100 100"><rect id="panel" x="5" y="5" width="35" height="50" rx="4" fill="#112233"/><path id="curve" d="M45 80 C55 10 80 10 95 80" fill="none" stroke="#2F80ED" stroke-width="2"/></svg>`, "utf8");
    const input = {
      version: "1.0",
      slideSize: { widthPt: 960, heightPt: 540 },
      pages: [{ pageIndex: 0, sourceImage: "", background: { fill: "#FFFFFF" }, textBoxes: [], shapes: [{ id: "carrier", type: "source_graphic", assetPath: "graphic.svg", box: { x: 80, y: 60, w: 500, h: 360 }, source: {} }], images: [], tables: [], charts: [], icons: [] }]
    };
    const expanded = expandRestrictedSvgGraphics(input, { baseDir: directory });
    const irFile = path.join(directory, "expanded.ir.json");
    const outFile = path.join(directory, "expanded.pptx");
    fs.writeFileSync(irFile, JSON.stringify(expanded), "utf8");
    const result = childProcess.spawnSync(builder.command, [...builder.args, "--ir", irFile, "--out", outFile], { encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const entries = listZipEntries(outFile).map((entry) => entry.name);
    assert.equal(entries.some((name) => /^ppt\/media\//.test(name)), false);
    const slideXml = readZipEntry(outFile, "ppt/slides/slide1.xml").toString("utf8");
    assert.match(slideXml, /name="panel"/);
    assert.match(slideXml, /name="curve"/);
    assert.match(slideXml, /<a:custGeom\b/);
    assert.match(slideXml, /<a:cubicBezTo\b/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function findBuilder() {
  const sourceMtime = fs.statSync(path.join(projectDirectory, "Program.cs")).mtimeMs;
  for (const configuration of ["Release", "Debug"]) {
    const directory = path.join(projectDirectory, "bin", configuration, "net8.0");
    const executable = path.join(directory, process.platform === "win32" ? "OpenXmlDeckBuilder.exe" : "OpenXmlDeckBuilder");
    if (fs.existsSync(executable) && fs.statSync(executable).mtimeMs >= sourceMtime) return { command: executable, args: [] };
    const dll = path.join(directory, "OpenXmlDeckBuilder.dll");
    if (fs.existsSync(dll) && fs.statSync(dll).mtimeMs >= sourceMtime) return { command: process.env.DOTNET_BIN || "dotnet", args: [dll] };
  }
  return null;
}
