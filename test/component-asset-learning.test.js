"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeLocalComponentAsset,
  summarizePptxTemplate,
  summarizeStyleJson,
  summarizeSvg,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning");
const {
  countPptxSlides,
  listZipEntries,
  readZipEntry
} = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

function roundBox(box = {}) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value) * 1000) / 1000]));
}

test("component asset learning extracts grouped shape signals from local pptx templates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-pptx-"));
  const pptx = path.join(tmp, "template.pptx");
  writeStoredZip(pptx, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": [
      '<p:sld xmlns:p="p" xmlns:a="a">',
      '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="demo group"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="12700" y="25400"/><a:ext cx="127000" cy="254000"/></a:xfrm></p:grpSpPr><p:sp><a:xfrm><a:off x="25400" y="50800"/><a:ext cx="25400" cy="50800"/></a:xfrm><a:t>One</a:t><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="74000"/></a:srgbClr></a:solidFill><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="00AAFF"/></a:gs></a:gsLst><a:lin ang="2700000"/></a:gradFill><a:ln w="12700"><a:noFill/></a:ln><a:effectLst><a:outerShdw blurRad="38100" dist="25400" dir="5400000"><a:srgbClr val="333333"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 36000"/></a:avLst></a:prstGeom></p:sp><p:cxnSp><a:xfrm><a:off x="76200" y="76200"/><a:ext cx="25400" cy="12700"/></a:xfrm><a:ln w="19050"><a:solidFill><a:srgbClr val="3366FF"/></a:solidFill><a:prstDash val="dash"/><a:headEnd type="triangle"/></a:ln></p:cxnSp></p:grpSp>',
      '<p:grpSp><p:sp/><p:pic/><p:cxnSp/></p:grpSp>',
      "</p:sld>"
    ].join(""),
    "ppt/slides/_rels/slide1.xml.rels": [
      '<Relationships>',
      '<Relationship Id="rId7" Type="image" Target="../media/image7.png"/>',
      '<Relationship Id="rIdExternal" Type="image" TargetMode="External" Target="https://example.com/x.png"/>',
      '</Relationships>'
    ].join(""),
    "ppt/media/image7.png": "png",
    "ppt/slides/slide2.xml": '<p:sld xmlns:p="p"><p:sp/><p:pic/><p:cxnSp/></p:sld>'
  });

  assert.equal(countPptxSlides(pptx), 2);
  assert.equal(listZipEntries(pptx).length, 5);
  assert.match(readZipEntry(pptx, "ppt/slides/slide1.xml").toString("utf8"), /grpSp/);

  const summary = summarizePptxTemplate(pptx);

  assert.equal(summary.status, "ok");
  assert.equal(summary.slides, 2);
  assert.equal(summary.totals.groups, 2);
  assert.equal(summary.totals.connectors, 3);
  assert.equal(summary.slideSummaries[0].maxGroupChildren >= 1, true);
  const demoGroup = summary.componentCatalog.find((item) => item.name === "demo group");
  assert.deepEqual(demoGroup.boundsPt, { x: 1, y: 2, w: 10, h: 20 });
  assert.deepEqual(demoGroup.structure, {
    kind: "mixed",
    roles: {
      background: 0,
      node: 0,
      connector: 1,
      textSlot: 1,
      pictureSlot: 0,
      decoration: 0
    },
    motifs: [],
    motifCounts: {},
    nodeCount: 0,
    connectorCount: 1,
    textSlotCount: 1,
    pictureSlotCount: 0
  });
  assert.equal(demoGroup.childLayout.childBoxCount, 2);
  assert.deepEqual(demoGroup.childLayout.children[0], {
    kind: "shape",
    box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    style: {
      fill: "#FF0000",
      stroke: "none",
      strokeWidthPt: 1,
      shapeType: "roundRect",
      adjustments: [0.36],
      opacity: 0.74,
      gradient: {
        type: "linear",
        angleDeg: 45,
        stops: [
          { position: 0, color: "#FF0000" },
          { position: 1, color: "#00AAFF" }
        ]
      },
      shadow: {
        color: "#333333",
        alpha: 0.35,
        blurPt: 3,
        distancePt: 2,
        angleDeg: 90
      },
      text: {
        placeholderText: "One"
      }
    }
  });
  assert.deepEqual(demoGroup.childLayout.children[1], {
    kind: "connector",
    box: { x: 0.5, y: 0.2, w: 0.2, h: 0.05 },
    style: {
      stroke: "#3366FF",
      strokeWidthPt: 1.5,
      endArrow: "triangle",
      dash: "dash",
      connectorType: "straight"
    }
  });
});

test("component asset learning preserves DrawingML arc guide angles", () => {
  const adjustments = _private.parsePresetGeometryAdjustments(
    '<a:prstGeom prst="arc"><a:avLst><a:gd name="adj1" fmla="val 16200000"/><a:gd name="adj2" fmla="val 5453193"/></a:avLst></a:prstGeom>',
    "arc"
  );

  assert.deepEqual(adjustments, [270, 90.8866]);
  assert.deepEqual(_private.parsePresetGeometryAdjustments(
    '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 36000"/></a:avLst></a:prstGeom>',
    "roundRect"
  ), [0.36]);
});

test("component asset learning retains OfficePLUS compound dashed outlines", () => {
  assert.equal(_private.parseLineDash('<a:ln><a:prstDash val="lgDashDot"/></a:ln>'), "largeDashDot");
  assert.equal(_private.parseLineDash('<a:ln><a:prstDash val="sysDashDot"/></a:ln>'), "systemDashDot");
});

test("component asset learning summarizes native Office chart templates without retaining chart data", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-crtx-"));
  const chart = path.join(tmp, "business-pie.crtx");
  writeStoredZip(chart, {
    "[Content_Types].xml": "<Types/>",
    "chart/chart.xml": [
      '<c:chartSpace xmlns:c="c">',
      '<c:chart><c:plotArea><c:pieChart>',
      '<c:ser><c:idx val="0"/><c:dPt/><c:dPt/></c:ser>',
      '<c:dLbls/><c:varyColors val="1"/>',
      '</c:pieChart></c:plotArea><c:legend/></c:chart>',
      '</c:chartSpace>'
    ].join(""),
    "chart/charts/style1.xml": "<c:style xmlns:c=\"c\"/>",
    "chart/charts/colors1.xml": "<c:colorStyle xmlns:c=\"c\"/>",
    "chart/theme/themeOverride1.xml": "<a:theme xmlns:a=\"a\"/>"
  });

  const summary = summarizeLocalComponentAsset({ path: chart, assetKind: "chart-template" });

  assert.equal(summary.status, "ok");
  assert.equal(summary.assetType, "chart-template");
  assert.equal(summary.chartType, "pie-chart");
  assert.deepEqual(summary.chartSummary, {
    seriesCount: 1,
    pointCount: 2,
    hasDataLabels: true,
    hasLegend: true,
    hasThemeOverride: true,
    hasStyle: true,
    hasColors: true
  });
  assert.deepEqual(summary.componentCatalog[0].structure.motifs, ["pie-share-chart"]);
});

test("component asset learning extracts editable freeform points from custom geometry", () => {
  const children = _private.parseDirectChildBoxes([
    '<p:sp xmlns:p="p" xmlns:a="a">',
    '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm>',
    '<a:solidFill><a:srgbClr val="FD6D25"/></a:solidFill>',
    '<a:custGeom><a:pathLst><a:path>',
    '<a:moveTo><a:pt x="10" y="10"/></a:moveTo>',
    '<a:lnTo><a:pt x="90" y="10"/></a:lnTo>',
    '<a:cubicBezTo><a:pt x="100" y="35"/><a:pt x="90" y="70"/><a:pt x="70" y="90"/></a:cubicBezTo>',
    '<a:lnTo><a:pt x="10" y="10"/></a:lnTo>',
    '<a:close/>',
    '</a:path></a:pathLst></a:custGeom>',
    '</p:sp>'
  ].join(""));

  assert.equal(children.length, 1);
  assert.equal(children[0].kind, "shape");
  assert.equal(children[0].style.fill, "#FD6D25");
  assert.deepEqual(children[0].style.freeform, {
    points: [
      { x: 0, y: 0 },
      { x: 0.8889, y: 0 },
      { x: 1, y: 0.3125 },
      { x: 0.8889, y: 0.75 },
      { x: 0.6667, y: 1 },
      { x: 0, y: 0 }
    ],
    segments: [
      { type: "moveTo", points: [{ x: 0, y: 0 }] },
      { type: "lnTo", points: [{ x: 0.8889, y: 0 }] },
      {
        type: "cubicBezTo",
        points: [
          { x: 1, y: 0.3125 },
          { x: 0.8889, y: 0.75 },
          { x: 0.6667, y: 1 }
        ]
      },
      { type: "lnTo", points: [{ x: 0, y: 0 }] },
      { type: "close", points: [] }
    ],
    closePath: true
  });
});

test("component asset learning retains East Asian vertical text semantics", () => {
  const children = _private.parseDirectChildBoxes([
    '<p:sp xmlns:p="p" xmlns:a="a">',
    '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="240000"/></a:xfrm>',
    '<a:solidFill><a:srgbClr val="44546A"/></a:solidFill>',
    '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>',
    '<p:txBody><a:bodyPr vert="eaVert" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1"/><a:t>新品上市整体策略</a:t></a:r></a:p></p:txBody>',
    '</p:sp>'
  ].join(""));

  assert.equal(children.length, 1);
  assert.equal(children[0].style.text.placeholderText, "新品上市整体策略");
  assert.equal(children[0].style.text.vertical, "eavert");
  assert.equal(children[0].style.text.valign, "middle");
  assert.equal(children[0].style.text.marginLeftPt, 7.2);
  assert.equal(children[0].style.text.marginRightPt, 7.2);
  assert.equal(children[0].style.text.marginTopPt, 3.6);
  assert.equal(children[0].style.text.marginBottomPt, 3.6);
});

test("component asset learning resolves theme font aliases to the source font scheme", () => {
  const themeFonts = _private.parseThemeFontsXml([
    '<a:theme xmlns:a="a"><a:themeElements><a:fontScheme>',
    '<a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:font script="Hans" typeface="DengXian Light"/></a:majorFont>',
    '<a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:font script="Hans" typeface="DengXian"/></a:minorFont>',
    '</a:fontScheme></a:themeElements></a:theme>'
  ].join(""));
  const children = _private.parseDirectChildBoxes([
    '<p:sp xmlns:p="p" xmlns:a="a">',
    '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm>',
    '<p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"><a:ea typeface="+mn-ea"/></a:rPr><a:t>主题字体</a:t></a:r></a:p></p:txBody>',
    '</p:sp>'
  ].join(""), {}, { themeFonts });

  assert.equal(children[0].style.text.family, "DengXian");
  assert.equal(_private.resolveThemeTypeface("+mj-ea", themeFonts), "DengXian Light");
});

test("component asset learning inherits text size weight alignment and theme color from level defaults", () => {
  const children = _private.parseDirectChildBoxes([
    '<p:sp xmlns:p="p" xmlns:a="a">',
    '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="240000"/></a:xfrm>',
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle>',
    '<a:lvl1pPr algn="ctr"><a:defRPr sz="7200" b="1"><a:gradFill><a:gsLst><a:gs pos="12000"><a:schemeClr val="accent1"><a:alpha val="70000"/></a:schemeClr></a:gs><a:gs pos="87000"><a:schemeClr val="accent1"><a:alpha val="0"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill><a:effectLst><a:reflection blurRad="12700" stA="60000" endA="900" endPos="48000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/></a:effectLst><a:ea typeface="Microsoft YaHei"/></a:defRPr></a:lvl1pPr>',
    '</a:lstStyle><a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="zh-CN"/><a:t>1</a:t></a:r></a:p></p:txBody>',
    '</p:sp>'
  ].join(""), {}, { themeColors: { accent1: "#156082" } });

  assert.equal(children.length, 1);
  assert.deepEqual(children[0].style.text, {
    placeholderText: "1",
    fontSizePt: 72,
    color: "#156082",
    gradient: {
      type: "linear",
      angleDeg: 90,
      stops: [
        { position: 0.12, color: "#156082", alpha: 0.7 },
        { position: 0.87, color: "#156082", alpha: 0 }
      ]
    },
    reflection: {
      blurPt: 1,
      startAlpha: 0.6,
      endAlpha: 0.009,
      endPosition: 0.48,
      directionDeg: 90,
      scaleY: -1,
      alignment: "bl",
      rotateWithShape: false
    },
    lineHeightMultiple: 1.5,
    weight: "bold",
    align: "center",
    valign: "bottom",
    marginLeftPt: 7.2,
    marginRightPt: 7.2,
    marginTopPt: 3.6,
    marginBottomPt: 3.6,
    family: "Microsoft YaHei"
  });
});

test("component asset learning preserves zero-axis DrawingML connectors as editable lines", () => {
  const children = _private.parseDirectChildBoxes([
    '<p:cxnSp xmlns:p="p" xmlns:a="a">',
    '<a:xfrm><a:off x="12700" y="25400"/><a:ext cx="254000" cy="0"/></a:xfrm>',
    '<a:ln w="6350"><a:solidFill><a:srgbClr val="4381DD"/></a:solidFill><a:headEnd type="triangle"/></a:ln>',
    '</p:cxnSp>'
  ].join(""));

  assert.equal(children.length, 1);
  assert.equal(children[0].kind, "connector");
  assert.ok(children[0].boxPt.w > 0);
  assert.equal(children[0].boxPt.h, 0.75);
  assert.equal(children[0].style.endArrow, "triangle");
});

test("component asset learning promotes ungrouped slide shapes as applied component candidates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-ungrouped-pptx-"));
  const pptx = path.join(tmp, "applied-template.pptx");
  writeStoredZip(pptx, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": [
      '<p:sld xmlns:p="p" xmlns:a="a">',
      '<p:cSld><p:spTree>',
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="card 1"/></p:nvSpPr><a:xfrm><a:off x="12700" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:sp><p:nvSpPr><p:cNvPr id="3" name="card 2"/></p:nvSpPr><a:xfrm><a:off x="165100" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="09BF5D"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:sp><p:nvSpPr><p:cNvPr id="4" name="card 3"/></p:nvSpPr><a:xfrm><a:off x="317500" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:cxnSp><a:xfrm><a:off x="139700" y="38100"/><a:ext cx="25400" cy="12700"/></a:xfrm><a:ln w="12700"><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:cxnSp>',
      '<p:sp><a:xfrm><a:off x="12700" y="95250"/><a:ext cx="431800" cy="12700"/></a:xfrm><a:t>插件应用后的未组合组件</a:t></p:sp>',
      '</p:spTree></p:cSld>',
      "</p:sld>"
    ].join("")
  });

  const summary = summarizePptxTemplate(pptx);
  const candidate = summary.componentCatalog[0];

  assert.equal(summary.totals.groups, 0);
  assert.equal(candidate.id, "slide1-ungrouped-component");
  assert.equal(candidate.sourceKind, "slide-level-ungrouped");
  assert.equal(candidate.childCount, 5);
  assert.equal(candidate.childLayout.provider, "pptx-slide-ungrouped-child-layout-v1");
  assert.equal(candidate.childLayout.childBoxCount, 5);
  assert.ok(candidate.componentScore >= 10);
  assert.deepEqual(candidate.topColors[0], { value: "#185ABD", count: 3 });
  assert.equal(candidate.structure.kind, "process-chain");
  assert.deepEqual(candidate.structure.motifs, ["whole-process-template", "linear-arrow-chain"]);
  assert.equal(candidate.structure.motifCounts["linear-arrow-chain"], 4);
  assert.equal(candidate.structure.motifCounts["whole-process-template"], 5);
  assert.equal(candidate.structure.nodeCount, 3);
  assert.equal(candidate.structure.connectorCount, 1);
  assert.equal(candidate.structure.textSlotCount, 1);
  assert.equal(candidate.reuseReadiness.level, "high");
  assert.ok(candidate.reuseReadiness.score >= 70);
  assert.ok(candidate.reuseReadiness.reasons.includes("has-child-layout"));
  assert.ok(candidate.reuseReadiness.reasons.includes("structured-process-chain"));
});

test("component asset learning keeps nested iSlide card grids as one reusable matrix component", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-nested-grid-"));
  const pptx = path.join(tmp, "nested-grid.pptx");
  const card = (name, x, y, color) => [
    '<p:grpSp>',
    `<p:nvGrpSpPr><p:cNvPr id="${name}" name="${name}"/></p:nvGrpSpPr>`,
    `<p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="127000" cy="63500"/></a:xfrm></p:grpSpPr>`,
    `<p:sp><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:prstGeom prst="rtTriangle"/></p:spPr></p:sp>`,
    `<p:sp><p:nvSpPr><p:cNvPr id="${name}-shape" name="${name}-shape"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstGeom prst="roundRect"/></p:spPr><p:txBody><a:p><a:r><a:rPr sz="1800"/><a:t>${name}</a:t></a:r></a:p></p:txBody></p:sp>`,
    '</p:grpSp>'
  ].join("");
  writeStoredZip(pptx, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": [
      '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>',
      '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="outer" name="four card matrix"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="12700" y="12700"/><a:ext cx="406400" cy="190500"/></a:xfrm></p:grpSpPr>',
      card("card-a", 12700, 12700, "185ABD"),
      card("card-b", 165100, 12700, "09BF5D"),
      card("card-c", 12700, 101600, "ED7D31"),
      card("card-d", 165100, 101600, "7030A0"),
      '</p:grpSp></p:spTree></p:cSld></p:sld>'
    ].join("")
  });

  const summary = summarizePptxTemplate(pptx);
  const candidate = summary.componentCatalog[0];

  assert.equal(summary.totals.groups, 5);
  assert.equal(candidate.name, "four card matrix");
  assert.equal(candidate.childLayout.childBoxCount, 4);
  assert.equal(candidate.replayChildLayout.provider, "pptx-group-replay-child-layout-v1");
  assert.ok(candidate.replayChildLayout.childBoxCount > candidate.childLayout.childBoxCount);
  assert.equal(candidate.structure.kind, "matrix");
  assert.ok(candidate.structure.motifs.includes("card-grid"));
  assert.equal(candidate.structure.nodeCount, 4);
  assert.equal(candidate.reuseReadiness.level, "high");
  assert.deepEqual(_private.extractTopLevelGroupBlocks('<p:grpSp><p:grpSp></p:grpSp></p:grpSp>'), ['<p:grpSp><p:grpSp></p:grpSp></p:grpSp>']);
});

test("component asset learning classifies nested segmented arc arrows from recursive replay coordinates", () => {
  const large = [
    { kind: "shape", box: { x: 0.49, y: 0, w: 0.51, h: 0.68 }, style: { gradient: { type: "linear", stops: [{}, {}] } } },
    { kind: "shape", box: { x: 0, y: 0.32, w: 0.51, h: 0.68 }, style: { gradient: { type: "linear", stops: [{}, {}] } } }
  ];
  const segments = Array.from({ length: 12 }, (_, index) => ({
    kind: "shape",
    box: { x: 0.12 + index * 0.06, y: index < 6 ? 0.02 : 0.84, w: 0.07, h: 0.12 },
    style: { freeform: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closePath: true } }
  }));
  const structure = _private.summarizeComponentStructure({ children: [...large, ...segments] });

  assert.equal(structure.kind, "cycle-loop");
  assert.ok(structure.motifs.includes("arc-arrow"));
});

test("component asset learning composes nested DrawingML group coordinate systems", () => {
  const nestedCard = (x, color) => [
    '<p:grpSp>',
    '<p:nvGrpSpPr><p:cNvPr id="2" name="nested card"/></p:nvGrpSpPr>',
    `<p:grpSpPr><a:xfrm><a:off x="${x}" y="127000"/><a:ext cx="508000" cy="508000"/><a:chOff x="0" y="0"/><a:chExt cx="254000" cy="254000"/></a:xfrm></p:grpSpPr>`,
    `<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="254000" cy="254000"/></a:xfrm><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstGeom prst="roundRect"/></p:spPr></p:sp>`,
    '</p:grpSp>'
  ].join("");
  const group = [
    '<p:grpSp xmlns:p="p" xmlns:a="a">',
    '<p:nvGrpSpPr><p:cNvPr id="1" name="outer"/></p:nvGrpSpPr>',
    '<p:grpSpPr><a:xfrm><a:off x="127000" y="254000"/><a:ext cx="1270000" cy="1270000"/><a:chOff x="0" y="0"/><a:chExt cx="1270000" cy="1270000"/></a:xfrm></p:grpSpPr>',
    nestedCard(0, "185ABD"),
    nestedCard(762000, "ED7D31"),
    '</p:grpSp>'
  ].join("");

  const replay = _private.summarizeGroupReplayChildLayout(group);

  assert.equal(replay.childBoxCount, 2);
  assert.deepEqual(replay.children.map((child) => child.box), [
    { x: 0, y: 0.1, w: 0.4, h: 0.4 },
    { x: 0.6, y: 0.1, w: 0.4, h: 0.4 }
  ]);
  assert.deepEqual(replay.children.map((child) => child.style.fill), ["#185ABD", "#ED7D31"]);
});

test("component asset learning composes group rotation and horizontal flip", () => {
  const rotated = [
    '<p:grpSp xmlns:p="p" xmlns:a="a">',
    '<p:grpSpPr><a:xfrm rot="5400000"><a:off x="0" y="0"/><a:ext cx="1270000" cy="1270000"/><a:chOff x="0" y="0"/><a:chExt cx="1270000" cy="1270000"/></a:xfrm></p:grpSpPr>',
    '<p:sp><p:spPr><a:xfrm><a:off x="127000" y="254000"/><a:ext cx="254000" cy="127000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:sp>',
    '</p:grpSp>'
  ].join("");
  const flipped = rotated.replace('rot="5400000"', 'flipH="1"');

  const rotatedChildren = _private.parseNestedReplayChildBoxes(rotated);
  const flippedChildren = _private.parseNestedReplayChildBoxes(flipped);

  assert.deepEqual(roundBox(rotatedChildren[0].boxPt), { x: 70, y: 10, w: 10, h: 20 });
  assert.equal(rotatedChildren[0].style.rotation, 90);
  assert.deepEqual(roundBox(flippedChildren[0].boxPt), { x: 70, y: 20, w: 20, h: 10 });
  assert.equal(flippedChildren[0].style.flipH, true);
});

test("component asset learning bounds malformed and excessively deep group input", () => {
  const transform = '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="127000" cy="127000"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  let xml = '<p:sp><a:xfrm><a:off x="0" y="0"/><a:ext cx="12700" cy="12700"/></a:xfrm></p:sp>';
  for (let index = 0; index < 15; index += 1) xml = `<p:grpSp>${transform}${xml}</p:grpSp>`;

  const children = _private.parseNestedReplayChildBoxes(xml);

  assert.ok(children.length <= 1);
  assert.ok(children.every((child) => child.boxPt && Object.values(child.boxPt).every(Number.isFinite)));
  assert.equal(_private.extractTopLevelDrawingBlocks('<p:sp/><p:pic/><p:cxnSp/>').length, 3);
});

test("component asset learning extracts fine-grained component motifs", () => {
  const { summarizeComponentStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const structure = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, style: { shapeType: "arc" } },
      { kind: "shape", box: { x: 0.45, y: 0.15, w: 0.08, h: 0.08 }, style: { shapeType: "triangle" } },
      { kind: "shape", box: { x: 0.2, y: 0.2, w: 0.12, h: 0.12 }, style: { shapeType: "ellipse" } },
      { kind: "shape", box: { x: 0.55, y: 0.45, w: 0.14, h: 0.1 }, style: { shapeType: "roundRect" } },
      { kind: "shape", box: { x: 0.25, y: 0.62, w: 0.14, h: 0.1 }, style: { shapeType: "roundRect" } }
    ]
  });

  assert.equal(structure.kind, "card-group");
  assert.ok(structure.motifs.includes("arc-arrow"));
  assert.ok(structure.motifCounts["arc-arrow"] >= 2);
});

test("component asset learning recognizes segmented iSlide arc-arrow components", () => {
  const { summarizeComponentStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const structure = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.49, y: 0.00, w: 0.51, h: 0.68 }, style: {} },
      { kind: "shape", box: { x: 0.00, y: 0.32, w: 0.51, h: 0.68 }, style: {} },
      { kind: "shape", box: { x: 0.43, y: 0.00, w: 0.05, h: 0.13 }, style: {} },
      { kind: "shape", box: { x: 0.36, y: 0.02, w: 0.06, h: 0.13 }, style: {} },
      { kind: "shape", box: { x: 0.29, y: 0.05, w: 0.08, h: 0.13 }, style: {} },
      { kind: "shape", box: { x: 0.22, y: 0.09, w: 0.09, h: 0.11 }, style: {} },
      { kind: "shape", box: { x: 0.17, y: 0.15, w: 0.09, h: 0.09 }, style: {} },
      { kind: "shape", box: { x: 0.12, y: 0.23, w: 0.10, h: 0.07 }, style: {} },
      { kind: "shape", box: { x: 0.52, y: 0.87, w: 0.05, h: 0.13 }, style: {} },
      { kind: "shape", box: { x: 0.58, y: 0.85, w: 0.07, h: 0.13 }, style: {} },
      { kind: "shape", box: { x: 0.64, y: 0.83, w: 0.08, h: 0.12 }, style: {} },
      { kind: "shape", box: { x: 0.69, y: 0.79, w: 0.09, h: 0.11 }, style: {} },
      { kind: "shape", box: { x: 0.74, y: 0.75, w: 0.09, h: 0.10 }, style: {} },
      { kind: "shape", box: { x: 0.78, y: 0.70, w: 0.10, h: 0.07 }, style: {} }
    ]
  });

  assert.equal(structure.kind, "cycle-loop");
  assert.ok(structure.motifs.includes("arc-arrow"));
  assert.ok(structure.motifCounts["arc-arrow"] >= 6);
});

test("component asset learning recognizes iSlide freeform arrow chains without promoting single arrows", () => {
  const { summarizeComponentStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const arrowStyle = {
    freeform: {
      points: [
        { x: 0.2999, y: 0 },
        { x: 0.0374, y: 0 },
        { x: 0.6529, y: 0.4984 },
        { x: 0, y: 1 },
        { x: 0.2999, y: 1 },
        { x: 1, y: 0.5 }
      ],
      closePath: true
    }
  };
  const structure = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.00, y: 0.00, w: 0.64, h: 1.00 }, style: arrowStyle },
      { kind: "shape", box: { x: 0.36, y: 0.00, w: 0.64, h: 1.00 }, style: arrowStyle },
      {
        kind: "shape",
        box: { x: 0.00, y: 0.28, w: 0.18, h: 0.44 },
        style: {
          freeform: {
            points: [{ x: 1, y: 0.4967 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
            closePath: true
          }
        }
      }
    ]
  });
  const single = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.00, y: 0.00, w: 1.00, h: 1.00 }, style: arrowStyle }
    ]
  });

  assert.equal(structure.kind, "process-chain");
  assert.ok(structure.motifs.includes("linear-arrow-chain"));
  assert.equal(structure.motifCounts["linear-arrow-chain"], 3);
  assert.equal(single.kind, "mixed");
  assert.deepEqual(single.motifs, []);
});

test("component asset learning recognizes cyclic freeform arrows without treating them as a card grid", () => {
  const { summarizeComponentStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const cycleArrow = {
    freeform: {
      points: Array.from({ length: 20 }, (_, index) => ({
        x: index % 2 === 0 ? index / 19 : 1 - index / 19,
        y: (index * 7 % 19) / 19
      })),
      closePath: true
    }
  };
  const structure = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.04, y: 0.04, w: 0.42, h: 0.42 }, style: cycleArrow },
      { kind: "shape", box: { x: 0.54, y: 0.04, w: 0.42, h: 0.42 }, style: cycleArrow },
      { kind: "shape", box: { x: 0.04, y: 0.54, w: 0.42, h: 0.42 }, style: cycleArrow },
      { kind: "shape", box: { x: 0.54, y: 0.54, w: 0.42, h: 0.42 }, style: cycleArrow }
    ]
  });

  assert.equal(structure.kind, "cycle-loop");
  assert.ok(structure.motifs.includes("arc-arrow"));
  assert.equal(structure.motifs.includes("card-grid"), false);
});

test("component asset learning promotes curved milestone roadmaps to timeline components", () => {
  const matrix = {
    kind: "matrix",
    roles: { background: 1, node: 6, connector: 0, textSlot: 0, pictureSlot: 0, decoration: 0 },
    motifs: ["card-grid"],
    motifCounts: { "card-grid": 6 },
    nodeCount: 6,
    connectorCount: 0,
    textSlotCount: 0,
    pictureSlotCount: 0
  };
  const context = {
    childLayout: { children: Array.from({ length: 7 }, () => ({ kind: "shape" })) },
    pictureCount: 6,
    textRuns: 12
  };
  const roadmap = _private.refineGroupStructure(matrix, {
    customGeometryCount: 2,
    ellipseCount: 14,
    arcGeometryCount: 2
  }, context);
  const ordinaryMatrix = _private.refineGroupStructure(matrix, {
    customGeometryCount: 0,
    ellipseCount: 0,
    arcGeometryCount: 0
  }, context);

  assert.equal(roadmap.kind, "timeline");
  assert.deepEqual(roadmap.motifs, ["card-grid", "milestone-roadmap"]);
  assert.equal(roadmap.motifCounts["milestone-roadmap"], 5);
  assert.equal(ordinaryMatrix.kind, "matrix");
});

test("component asset learning promotes connector-rich branching components to relationship templates", () => {
  const { refineGroupStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const structure = refineGroupStructure({
    kind: "timeline",
    roles: { background: 0, node: 3, connector: 0, textSlot: 0, pictureSlot: 0, decoration: 0 },
    motifs: [],
    motifCounts: {},
    nodeCount: 3,
    connectorCount: 0,
    textSlotCount: 0,
    pictureSlotCount: 0
  }, {}, {
    childLayout: { children: [{}, {}, {}] },
    replayChildLayout: { children: Array.from({ length: 25 }, () => ({})) },
    connectorCount: 7,
    textRuns: 14
  });

  assert.equal(structure.kind, "hub-spoke");
  assert.equal(structure.roles.connector, 7);
  assert.equal(structure.connectorCount, 7);
  assert.ok(structure.motifs.includes("tree-link"));
});

test("component asset learning recognizes fishbone cause-effect spines before generic hub-spoke routing", () => {
  const { refineGroupStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const structure = refineGroupStructure({
    kind: "hub-spoke",
    roles: { background: 0, node: 5, connector: 0, textSlot: 0, pictureSlot: 0, decoration: 0 },
    motifs: ["tree-link"],
    motifCounts: { "tree-link": 12 },
    nodeCount: 5,
    connectorCount: 0,
    textSlotCount: 0,
    pictureSlotCount: 0
  }, {}, {
    replayChildLayout: {
      children: [
        { kind: "connector", box: { x: 0.03, y: 0.5, w: 0.94, h: 0.002 } },
        { kind: "connector", box: { x: 0.08, y: 0.14, w: 0.1, h: 0.36 } },
        { kind: "connector", box: { x: 0.3, y: 0.14, w: 0.1, h: 0.36 } },
        { kind: "connector", box: { x: 0.22, y: 0.5, w: 0.1, h: 0.36 } },
        { kind: "connector", box: { x: 0.55, y: 0.5, w: 0.1, h: 0.36 } },
        ...Array.from({ length: 12 }, () => ({ kind: "shape", box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } }))
      ]
    },
    connectorCount: 6,
    textRuns: 20
  });

  assert.equal(structure.kind, "fishbone-cause-effect");
  assert.equal(structure.connectorCount, 6);
  assert.ok(structure.motifs.includes("fishbone-cause"));
  assert.ok(structure.motifCounts["fishbone-cause"] >= 6);
});

test("component asset learning recognizes native pyramid and funnel component stacks", () => {
  const { refineGroupStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const base = {
    kind: "matrix",
    roles: { background: 0, node: 4, connector: 0, textSlot: 8, pictureSlot: 0, decoration: 0 },
    motifs: ["card-grid"],
    motifCounts: { "card-grid": 4 },
    nodeCount: 4,
    connectorCount: 0,
    textSlotCount: 8,
    pictureSlotCount: 0
  };
  const pyramid = refineGroupStructure(base, {}, {
    childLayout: {
      children: [
        { kind: "shape", box: { x: 0.18, y: 0.00, w: 0.82, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.12, y: 0.24, w: 0.88, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.06, y: 0.48, w: 0.94, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.00, y: 0.72, w: 1.00, h: 0.2 }, style: { shapeType: "rect" } }
      ]
    }
  });
  const funnel = refineGroupStructure(base, {}, {
    childLayout: {
      children: [
        { kind: "shape", box: { x: 0.00, y: 0.00, w: 1.00, h: 0.2 }, style: { shapeType: "ellipse" } },
        { kind: "shape", box: { x: 0.04, y: 0.27, w: 0.96, h: 0.2 }, style: { shapeType: "ellipse" } },
        { kind: "shape", box: { x: 0.08, y: 0.54, w: 0.92, h: 0.2 }, style: { shapeType: "ellipse" } },
        { kind: "shape", box: { x: 0.12, y: 0.81, w: 0.88, h: 0.19 }, style: { shapeType: "ellipse" } }
      ]
    },
    replayChildLayout: { children: [{ kind: "shape", box: { x: 0.1, y: 0.1, w: 0.6, h: 0.7 }, style: { shapeType: "trapezoid" } }] }
  });
  const ordinaryCards = refineGroupStructure(base, {}, {
    childLayout: {
      children: [
        { kind: "shape", box: { x: 0.0, y: 0.0, w: 0.45, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.5, y: 0.0, w: 0.45, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.0, y: 0.5, w: 0.45, h: 0.2 }, style: { shapeType: "rect" } },
        { kind: "shape", box: { x: 0.5, y: 0.5, w: 0.45, h: 0.2 }, style: { shapeType: "rect" } }
      ]
    }
  });

  assert.ok(pyramid.motifs.includes("pyramid-stack"));
  assert.ok(funnel.motifs.includes("funnel-stack"));
  assert.equal(ordinaryCards.motifs.includes("pyramid-stack"), false);
  assert.equal(ordinaryCards.motifs.includes("funnel-stack"), false);
});

test("component asset learning recognizes a quadrant component only with a central axis", () => {
  const { refineGroupStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const base = {
    kind: "matrix",
    roles: { background: 0, node: 5, connector: 0, textSlot: 4, pictureSlot: 0, decoration: 0 },
    motifs: ["card-grid"],
    motifCounts: { "card-grid": 4 },
    nodeCount: 5,
    connectorCount: 0,
    textSlotCount: 4,
    pictureSlotCount: 0
  };
  const cards = [
    { kind: "shape", box: { x: 0.00, y: 0.00, w: 0.45, h: 0.43 }, style: { shapeType: "roundRect" } },
    { kind: "shape", box: { x: 0.55, y: 0.00, w: 0.45, h: 0.43 }, style: { shapeType: "roundRect" } },
    { kind: "shape", box: { x: 0.00, y: 0.57, w: 0.45, h: 0.43 }, style: { shapeType: "roundRect" } },
    { kind: "shape", box: { x: 0.55, y: 0.57, w: 0.45, h: 0.43 }, style: { shapeType: "roundRect" } }
  ];
  const quadrant = refineGroupStructure(base, {}, {
    childLayout: {
      children: [...cards, { kind: "shape", box: { x: 0.39, y: 0.25, w: 0.22, h: 0.58 }, style: { shapeType: "ellipse" } }]
    }
  });
  const ordinaryGrid = refineGroupStructure(base, {}, { childLayout: { children: cards } });

  assert.ok(quadrant.motifs.includes("quadrant-axis"));
  assert.equal(ordinaryGrid.motifs.includes("quadrant-axis"), false);
});

test("component asset learning recognizes offset layered stacks without relabeling equal-width lists", () => {
  const { refineGroupStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const base = {
    kind: "card-group",
    roles: { background: 0, node: 3, connector: 0, textSlot: 3, pictureSlot: 0, decoration: 0 },
    motifs: [],
    motifCounts: {},
    nodeCount: 3,
    connectorCount: 0,
    textSlotCount: 3,
    pictureSlotCount: 0
  };
  const layered = refineGroupStructure(base, {}, {
    childLayout: {
      children: [
        { kind: "shape", box: { x: 0.05, y: 0.15, w: 1.00, h: 0.36 }, style: { shapeType: "roundRect" } },
        { kind: "shape", box: { x: 0.19, y: 0.47, w: 0.86, h: 0.36 }, style: { shapeType: "roundRect" } },
        { kind: "shape", box: { x: 0.25, y: 0.79, w: 0.79, h: 0.36 }, style: { shapeType: "roundRect" } }
      ]
    }
  });
  const equalWidthList = refineGroupStructure(base, {}, {
    childLayout: {
      children: [
        { kind: "shape", box: { x: 0.05, y: 0.15, w: 0.90, h: 0.36 }, style: { shapeType: "roundRect" } },
        { kind: "shape", box: { x: 0.05, y: 0.47, w: 0.90, h: 0.36 }, style: { shapeType: "roundRect" } },
        { kind: "shape", box: { x: 0.05, y: 0.79, w: 0.90, h: 0.36 }, style: { shapeType: "roundRect" } }
      ]
    }
  });

  assert.ok(layered.motifs.includes("layered-stack"));
  assert.equal(equalWidthList.motifs.includes("layered-stack"), false);
});

test("component asset learning recognizes lens funnel and branch card flow motifs", () => {
  const { summarizeComponentStructure } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const structure = summarizeComponentStructure({
    children: [
      { kind: "shape", box: { x: 0.04, y: 0.20, w: 0.16, h: 0.16 }, style: { shapeType: "roundRect" } },
      { kind: "shape", box: { x: 0.04, y: 0.48, w: 0.16, h: 0.16 }, style: { shapeType: "roundRect" } },
      { kind: "shape", box: { x: 0.30, y: 0.30, w: 0.24, h: 0.24 }, style: { freeform: { points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }] } } },
      { kind: "shape", box: { x: 0.50, y: 0.25, w: 0.18, h: 0.28 }, style: { shapeType: "ellipse" } },
      { kind: "shape", box: { x: 0.78, y: 0.12, w: 0.18, h: 0.12 }, style: { shapeType: "roundRect" } },
      { kind: "shape", box: { x: 0.78, y: 0.34, w: 0.18, h: 0.12 }, style: { shapeType: "roundRect" } },
      { kind: "shape", box: { x: 0.78, y: 0.56, w: 0.18, h: 0.12 }, style: { shapeType: "roundRect" } },
      { kind: "connector", box: { x: 0.66, y: 0.40, w: 0.11, h: 0.00 }, style: { endArrow: "triangle" } },
      { kind: "connector", box: { x: 0.75, y: 0.18, w: 0.00, h: 0.44 }, style: {} }
    ]
  });

  assert.ok(structure.motifs.includes("lens-funnel-flow"));
  assert.ok(structure.motifs.includes("branch-card-flow"));
  assert.ok(structure.motifCounts["lens-funnel-flow"] >= 5);
  assert.ok(structure.motifCounts["branch-card-flow"] >= 5);
});

test("component asset learning resolves theme scheme colors in plugin gradients", () => {
  const { parseGradientFill, parseThemeColorsXml } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const themeColors = parseThemeColorsXml([
    '<a:themeOverride xmlns:a="a"><a:clrScheme name="iSlide">',
    '<a:accent1><a:srgbClr val="FD6D25"/></a:accent1>',
    '<a:dk1><a:srgbClr val="000000"/></a:dk1>',
    '<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>',
    '</a:clrScheme></a:themeOverride>'
  ].join(""));
  const gradient = parseGradientFill([
    '<a:gradFill><a:gsLst>',
    '<a:gs pos="36000"><a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/><a:alpha val="45000"/></a:schemeClr></a:gs>',
    '<a:gs pos="91000"><a:schemeClr val="accent1"/></a:gs>',
    '</a:gsLst><a:lin ang="5400000"/></a:gradFill>'
  ].join(""), themeColors);

  assert.equal(themeColors.accent1, "#FD6D25");
  assert.equal(gradient.stops.length, 2);
  assert.equal(gradient.stops[0].alpha, 0.45);
  assert.equal(gradient.stops[1].color, "#FD6D25");
  assert.match(gradient.stops[0].color, /^#[0-9A-F]{6}$/);
  assert.notEqual(gradient.stops[0].color, gradient.stops[1].color);
});

test("component asset learning extracts safe text style from plugin template shapes", () => {
  const layout = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")
    ._private
    .summarizeGroupChildLayout([
      '<p:grpSp xmlns:p="p" xmlns:a="a">',
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></a:xfrm></p:grpSpPr>',
      '<p:sp>',
      '<a:xfrm><a:off x="127000" y="63500"/><a:ext cx="381000" cy="127000"/></a:xfrm>',
      '<p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/>',
      '<a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:latin typeface="Microsoft YaHei"/></a:rPr>',
      '<a:t>核心&amp;价值</a:t></a:r></a:p></p:txBody>',
      '</p:sp>',
      '<p:sp><a:xfrm><a:off x="635000" y="63500"/><a:ext cx="127000" cy="127000"/></a:xfrm></p:sp>',
      '</p:grpSp>'
    ].join(""));

  assert.deepEqual(layout.children[0].style.text, {
    placeholderText: "核心&价值",
    fontSizePt: 18,
    color: "#112233",
    weight: "bold",
    align: "center",
    valign: "middle",
    marginLeftPt: 7.2,
    marginRightPt: 7.2,
    marginTopPt: 3.6,
    marginBottomPt: 3.6,
    family: "Microsoft YaHei"
  });
});

test("component asset learning preserves OpenXML child order and rotation", () => {
  const layout = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")
    ._private
    .summarizeGroupChildLayout([
      '<p:grpSp xmlns:p="p" xmlns:a="a">',
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></a:xfrm></p:grpSpPr>',
      '<p:cxnSp><a:xfrm><a:off x="12700" y="12700"/><a:ext cx="127000" cy="12700"/></a:xfrm><a:ln><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill></a:ln></p:cxnSp>',
      '<p:pic><a:xfrm><a:off x="254000" y="63500"/><a:ext cx="127000" cy="127000"/></a:xfrm><p:blipFill><a:blip r:embed="rId7"><a:alphaModFix amt="65000"/></a:blip><a:srcRect l="10000" t="5000" r="20000"/></p:blipFill></p:pic>',
      '<p:sp><a:xfrm rot="5400000"><a:off x="508000" y="63500"/><a:ext cx="127000" cy="127000"/></a:xfrm><a:solidFill><a:srgbClr val="09BF5D"/></a:solidFill></p:sp>',
      '</p:grpSp>'
    ].join(""), { rId7: "ppt/media/image7.png" });

  assert.equal(layout.childBoxCount, 3);
  assert.deepEqual(layout.children.map((child) => child.kind), ["connector", "picture", "shape"]);
  assert.deepEqual(layout.children[1].style.picture, {
    embedRelId: "rId7",
    mediaTarget: "ppt/media/image7.png",
    crop: { left: 0.1, top: 0.05, right: 0.2 },
    opacity: 0.65
  });
  assert.equal(layout.children[2].style.rotation, 90);
});

test("component asset learning resolves only safe package media relationships", () => {
  const { parseRelationshipsXml, resolveRelationshipTarget } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-learning")._private;
  const relationships = parseRelationshipsXml([
    '<Relationships>',
    '<Relationship Id="rId1" Target="../media/icon.svg"/>',
    '<Relationship Id="rId2" TargetMode="External" Target="https://example.com/evil.png"/>',
    '<Relationship Id="rId3" Target="../../evil.png"/>',
    '</Relationships>'
  ].join(""), "ppt/slides/slide1.xml");

  assert.deepEqual(relationships, { rId1: "ppt/media/icon.svg" });
  assert.equal(resolveRelationshipTarget("ppt/slides", "../media/photo.jpeg"), "ppt/media/photo.jpeg");
  assert.equal(resolveRelationshipTarget("ppt/slides", "https://example.com/photo.jpeg"), "");
});

test("component asset learning summarizes OfficePLUS style json fonts and kinds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-style-"));
  const file = path.join(tmp, "style.json");
  fs.writeFileSync(file, JSON.stringify([{
    libName: "demo",
    styles: [
      { styleName: "一级标题", wordStyles: { font: { name: "Microsoft YaHei", color: "#112233" } } },
      { styleName: "正文", wordStyles: { font: { name: "Microsoft YaHei", color: "#000000" } } }
    ]
  }]));

  const summary = summarizeStyleJson(file);

  assert.equal(summary.status, "ok");
  assert.equal(summary.libraries, 1);
  assert.equal(summary.styles, 2);
  assert.deepEqual(summary.styleKinds, { heading: 1, body: 1 });
  assert.equal(summary.topFonts[0].value, "Microsoft YaHei");
});

test("component asset learning summarizes svg vectors without retaining markup", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-svg-"));
  const file = path.join(tmp, "icon.svg");
  fs.writeFileSync(file, '<svg viewBox="0 0 10 10"><linearGradient id="g"/><path fill="#ff0000" d="M0 0h10v10z"/><circle stroke="#00ff00"/></svg>');

  const summary = summarizeSvg(file);

  assert.equal(summary.status, "ok");
  assert.equal(summary.viewBox, "0 0 10 10");
  assert.equal(summary.paths, 1);
  assert.equal(summary.circles, 1);
  assert.equal(summary.gradients, 1);
  assert.equal(summary.topColors.length, 2);
});

test("component asset learning rejects unreadable or relative assets", () => {
  const summary = summarizeLocalComponentAsset({
    path: "relative/template.pptx",
    assetKind: "presentation-template"
  });

  assert.equal(summary.status, "unavailable");
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}
