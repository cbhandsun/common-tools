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
    const colorCases = [
      { input: "#F0F9FF", expected: "F0F9FF" },
      { input: "#abc", expected: "AABBCC" },
      { input: "", expected: "000000" },
      { input: '<unsafe value="red"/>', expected: "000000" },
      { input: "x".repeat(4096), expected: "000000" },
      { input: undefined, expected: null }
    ];
    for (const [index, colorCase] of colorCases.entries()) {
      const styled = structuredClone(chart);
      styled.id = `chart-color-${index}`;
      if (colorCase.input === undefined) delete styled.style.textColor;
      else styled.style.textColor = colorCase.input;
      styled.nativePayload = promoteNativeChartPayload(styled);
      ir.pages.push({ ...ir.pages[0], pageIndex: index + 1, charts: [styled] });
    }
    const lineChart = structuredClone(chart);
    lineChart.id = "edited-line-chart";
    lineChart.type = "line";
    lineChart.nativePayload = promoteNativeChartPayload(lineChart);
    ir.pages.push({ ...ir.pages[0], pageIndex: ir.pages.length, charts: [lineChart] });
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
    assert.match(chartXml, /<c:txPr><a:bodyPr\s*\/><a:lstStyle\s*\/><a:p><a:pPr><a:defRPr><a:solidFill><a:srgbClr val="111111"/u, "chart labels must inherit the explicit chart text color");
    const chartParts = entries.filter((name) => /\/charts\/chart\d+\.xml$/u.test(name));
    assert.equal(chartParts.length, colorCases.length + 2);
    for (const [index, colorCase] of colorCases.entries()) {
      const partXml = readZipEntry(outFile, chartParts[index + 1]).toString("utf8");
      const properties = partXml.match(/<c:txPr>([\s\S]*?)<\/c:txPr>/u)?.[1];
      if (colorCase.expected === null) assert.equal(properties, undefined, "unspecified color preserves chart defaults");
      else assert.ok(properties?.includes(`<a:srgbClr val="${colorCase.expected}"`), `color case ${index}`);
      assert.ok(!partXml.includes("<unsafe"));
    }
    const lineXml = readZipEntry(outFile, chartParts.at(-1)).toString("utf8");
    assert.match(lineXml, /<c:lineChart>/u);
    const lineSeries = [...lineXml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/gu)].map((match) => match[1]);
    assert.equal(lineSeries.length, 2);
    for (const [index, seriesXml] of lineSeries.entries()) {
      const expectedColor = index === 0 ? "2F80ED" : "56CCF2";
      assert.ok(seriesXml.includes(`<a:ln w="25400"><a:solidFill><a:srgbClr val="${expectedColor}"`), "line series must have a visible stroke in its own color");
      assert.doesNotMatch(seriesXml, /<a:ln[^>]*><a:noFill/u);
    }
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
