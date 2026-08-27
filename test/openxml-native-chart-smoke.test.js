"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promoteNativeChartPayload } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-payload");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const { readZipEntries } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

const projectDirectory = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder");

test("OpenXML builder emits a real ChartPart with an embedded editable workbook", (t) => {
  const builder = findBuilder();
  if (!builder) return t.skip("OpenXmlDeckBuilder must be built before the integration suite");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-native-chart-"));
  try {
    const chart = {
      id: "chart-sales",
      type: "column",
      box: { x: 80, y: 80, w: 600, h: 320 },
      style: { barFill: "#2F80ED", textColor: "#111111" },
      categories: ["Q1", "Q2", "Q3"],
      series: [{ name: "Revenue", values: [12.5, 19, 24] }, { name: "Margin", values: [4, 6, 9] }]
    };
    chart.nativePayload = promoteNativeChartPayload(chart);
    const ir = {
      version: "1.0",
      slideSize: { widthPt: 960, heightPt: 540 },
      pages: [{ pageIndex: 0, sourceImage: "", background: { fill: "#FFFFFF" }, textBoxes: [], shapes: [], images: [], tables: [], charts: [chart], icons: [] }]
    };
    const irFile = path.join(directory, "chart.ir.json");
    const outFile = path.join(directory, "chart.pptx");
    fs.writeFileSync(irFile, JSON.stringify(ir), "utf8");
    const result = childProcess.spawnSync(builder.command, [...builder.args, "--ir", irFile, "--out", outFile], { encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const entries = listZipEntries(outFile).map((entry) => entry.name);
    const chartPart = entries.find((name) => /\/charts\/chart\d+\.xml$/.test(name));
    const workbookPart = entries.find((name) => /\/embeddings\//.test(name));
    assert.ok(chartPart, "native ChartPart is missing");
    assert.ok(workbookPart, "embedded workbook is missing");
    const chartXml = readZipEntry(outFile, chartPart).toString("utf8");
    assert.match(chartXml, /<c:(?:bar|line|pie|doughnut)Chart>/);
    assert.match(chartXml, /<c:externalData/);
    assert.match(chartXml, /Revenue/);
    const workbookEntries = readZipEntries(readZipEntry(outFile, workbookPart)).map((entry) => entry.name);
    assert.ok(workbookEntries.includes("xl/workbook.xml"));
    assert.ok(workbookEntries.includes("xl/worksheets/sheet1.xml"));
    const slideRelationships = readZipEntry(outFile, "ppt/slides/_rels/slide1.xml.rels").toString("utf8");
    assert.match(slideRelationships, /relationships\/chart/);

    chart.series[0].values[0] = 999;
    fs.writeFileSync(irFile, JSON.stringify(ir), "utf8");
    const stale = childProcess.spawnSync(builder.command, [...builder.args, "--ir", irFile, "--out", path.join(directory, "stale.pptx")], { encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.notEqual(stale.status, 0);
    assert.match(`${stale.stderr}\n${stale.stdout}`, /nativePayload is stale|fallback hash is invalid/);
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
