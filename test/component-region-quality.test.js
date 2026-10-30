"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildComponentRegions, compareComponentRegions } = require("../packages/slideclone-core/quality/component-region-quality");

function image(width, height, color = 255) { return { width, height, rgba: Buffer.alloc(width * height * 4, color) }; }
function setPixel(target, x, y, rgba) { const offset = (y * target.width + x) * 4; rgba.forEach((value, index) => { target.rgba[offset + index] = value; }); }
function fillRect(target, left, top, width, height, rgba) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) setPixel(target, x, y, rgba);
  }
}

test("component region quality identifies the worst editable object", () => {
  const source = image(20, 10); const generated = image(20, 10);
  setPixel(source, 2, 2, [0, 0, 0, 255]);
  setPixel(source, 15, 2, [0, 0, 0, 255]); setPixel(generated, 15, 2, [0, 0, 0, 255]);
  const regions = [{ id: "missing", kind: "text", box: { x: 0, y: 0, w: 10, h: 10 } }, { id: "matched", kind: "shape", box: { x: 10, y: 0, w: 10, h: 10 } }];
  const result = compareComponentRegions(source, generated, regions, { widthPt: 20, heightPt: 10 }, { threshold: 24, foregroundTolerancePx: 0, foregroundToleranceDelta: 0 });
  assert.equal(result.audited, 2);
  assert.equal(result.worst[0].id, "missing");
  assert.equal(result.worst[0].foregroundMissingRatio, 1);
  assert.equal(result.worst[1].foregroundMissingRatio, 0);
});

test("component region quality prioritizes absolute missing contribution over tiny severe fragments", () => {
  const source = image(80, 40);
  const generated = image(80, 40);
  fillRect(source, 2, 2, 3, 8, [0, 0, 0, 255]);
  fillRect(source, 20, 4, 6, 10, [0, 0, 0, 255]);
  fillRect(generated, 20, 4, 6, 5, [0, 0, 0, 255]);
  const regions = [
    { id: "tiny-severe", kind: "missing", role: "missing-native-component", box: { x: 2, y: 2, w: 3, h: 8 } },
    { id: "large-impact", kind: "missing", role: "missing-native-component", box: { x: 20, y: 4, w: 6, h: 10 } },
  ];

  const result = compareComponentRegions(source, generated, regions, { widthPt: 80, heightPt: 40 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(result.worst[0].id, "large-impact");
  assert.equal(result.worst[0].foregroundMissingPixels, 30);
  assert.equal(result.worst[1].id, "tiny-severe");
  assert.equal(result.worst[1].foregroundMissingPixels, 24);
  assert.ok(result.worst[0].contributionScore > result.worst[1].contributionScore);
});

test("component region quality routes severe missing native components ahead of broad text drift", () => {
  const source = image(120, 80);
  const generated = image(120, 80);
  fillRect(source, 4, 4, 80, 30, [0, 0, 0, 255]);
  fillRect(source, 90, 40, 12, 12, [0, 0, 0, 255]);
  fillRect(generated, 4, 4, 80, 15, [0, 0, 0, 255]);
  const regions = [
    { id: "broad-text", kind: "text", role: "text", box: { x: 4, y: 4, w: 80, h: 30 } },
    { id: "missing-icon", kind: "missing", role: "missing-native-component", box: { x: 90, y: 40, w: 12, h: 12 } },
  ];

  const result = compareComponentRegions(source, generated, regions, { widthPt: 120, heightPt: 80 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(result.worst[0].id, "missing-icon");
  assert.equal(result.worst[1].id, "broad-text");
  assert.ok(result.worst[0].severity > result.worst[1].severity);
  assert.ok(result.worst[1].contributionScore > result.worst[0].contributionScore);
});

test("component region quality routes text-adjacent missing native fragments back to text refinement", () => {
  const source = image(140, 70);
  const generated = image(140, 70);
  fillRect(source, 10, 10, 70, 16, [0, 0, 0, 255]);
  fillRect(generated, 10, 10, 45, 16, [0, 0, 0, 255]);
  fillRect(source, 74, 12, 4, 10, [0, 0, 0, 255]);
  const regions = [
    { id: "title-text", kind: "text", role: "text", box: { x: 10, y: 10, w: 70, h: 16 } },
    { id: "title-edge-fragment", kind: "missing", role: "missing-native-component", box: { x: 74, y: 12, w: 4, h: 10 } },
  ];

  const result = compareComponentRegions(source, generated, regions, { widthPt: 140, heightPt: 70 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  const fragment = result.worst.find((item) => item.id === "title-edge-fragment");
  assert.equal(result.worst[0].id, "title-text");
  assert.equal(fragment.textAdjacent, true);
  assert.equal(fragment.repairHint, "text");
  assert.equal(fragment.nearestTextId, "title-text");
});

test("component region quality treats text edge fragments as text-adjacent", () => {
  const source = image(140, 70);
  const generated = image(140, 70);
  fillRect(source, 40, 9, 8, 2, [0, 0, 0, 255]);
  fillRect(source, 10, 12, 70, 16, [0, 0, 0, 255]);
  fillRect(generated, 10, 12, 70, 16, [0, 0, 0, 255]);
  const regions = [
    { id: "title-text", kind: "text", role: "text", box: { x: 10, y: 11, w: 70, h: 18 } },
    { id: "title-top-edge", kind: "missing", role: "missing-native-component", box: { x: 40, y: 9, w: 8, h: 2 } },
  ];

  const result = compareComponentRegions(source, generated, regions, { widthPt: 140, heightPt: 70 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  const fragment = result.worst.find((item) => item.id === "title-top-edge");
  assert.equal(fragment.textAdjacent, true);
  assert.equal(fragment.nearestTextId, "title-text");
});

test("component region quality preserves text worst rows when missing native rows dominate", () => {
  const source = image(220, 120);
  const generated = image(220, 120);
  const regions = [];
  for (let index = 0; index < 35; index += 1) {
    const x = 2 + (index % 11) * 18;
    const y = 2 + Math.floor(index / 11) * 18;
    fillRect(source, x, y, 8, 8, [0, 0, 0, 255]);
    regions.push({
      id: `missing-${index}`,
      kind: "missing",
      role: "missing-native-component",
      box: { x, y, w: 8, h: 8 }
    });
  }
  fillRect(source, 30, 90, 80, 16, [0, 0, 0, 255]);
  fillRect(generated, 30, 90, 80, 8, [0, 0, 0, 255]);
  regions.push({
    id: "text-still-actionable",
    kind: "text",
    role: "text",
    box: { x: 30, y: 90, w: 80, h: 16 }
  });

  const result = compareComponentRegions(source, generated, regions, { widthPt: 220, heightPt: 120 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.ok(result.worst.length > 30);
  assert.ok(result.worst.some((item) => item.id === "text-still-actionable"));
});

test("component region quality preserves high-contribution sparse missing native curves", () => {
  const source = image(320, 180);
  const generated = image(320, 180);
  const regions = [];
  for (let index = 0; index < 34; index += 1) {
    const x = 4 + (index % 17) * 16;
    const y = 4 + Math.floor(index / 17) * 18;
    fillRect(source, x, y, 6, 6, [20, 90, 220, 255]);
    regions.push({
      id: `small-missing-${index}`,
      kind: "missing",
      role: "missing-native-component",
      box: { x, y, w: 6, h: 6 }
    });
  }
  for (let step = 0; step < 120; step += 1) {
    const t = step / 119;
    const x = Math.round(40 + 220 * t);
    const y = Math.round(92 + 44 * (2 * t - 1) * (2 * t - 1));
    fillRect(source, x, y, 3, 3, [30, 110, 230, 255]);
  }
  regions.push({
    id: "sparse-curve-high-contribution",
    kind: "missing",
    role: "missing-native-component",
    box: { x: 38, y: 88, w: 228, h: 54 }
  });

  const result = compareComponentRegions(source, generated, regions, { widthPt: 320, heightPt: 180 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  const sparse = result.worst.find((item) => item.id === "sparse-curve-high-contribution");
  assert.ok(sparse);
  assert.ok(sparse.contributionScore > 1000);
});

test("component region quality preserves missing native source evidence for downstream repair", () => {
  const source = image(80, 40);
  const generated = image(80, 40);
  fillRect(source, 20, 10, 8, 6, [24, 72, 168, 255]);
  const regions = [{
    id: "missing-icon",
    kind: "missing",
    role: "missing-native-component",
    box: { x: 20, y: 10, w: 8, h: 6 },
    source: {
      detector: "missing-native-component-quality",
      dominantColor: "#1848A8",
      missingForegroundPixels: 48,
      missingPixelDensity: 1,
      missingComponentFingerprint: "20:10:8:6:48:#1848A8"
    }
  }];

  const result = compareComponentRegions(source, generated, regions, { widthPt: 80, heightPt: 40 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.deepEqual(result.local[0].source, {
    detector: "missing-native-component-quality",
    dominantColor: "#1848A8",
    missingForegroundPixels: 48,
    missingPixelDensity: 1,
    missingComponentFingerprint: "20:10:8:6:48:#1848A8"
  });
});

test("text component foreground uses the declared font color instead of pastel backgrounds", () => {
  const source = image(24, 12);
  const generated = image(24, 12);
  fillRect(source, 0, 0, 24, 12, [236, 248, 248, 255]);
  fillRect(generated, 0, 0, 24, 12, [236, 248, 248, 255]);
  fillRect(source, 4, 4, 8, 3, [12, 18, 49, 255]);
  fillRect(generated, 4, 4, 8, 3, [12, 18, 49, 255]);
  const [region] = buildComponentRegions({
    textBoxes: [{
      id: "label",
      box: { x: 0, y: 0, w: 24, h: 12 },
      font: { color: "#0C1231" }
    }]
  }, { widthPt: 24, heightPt: 12 });

  const result = compareComponentRegions(source, generated, [region], { widthPt: 24, heightPt: 12 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
    componentBaselines: { text: { maximumPixelDiffRatio: 0.62, maximumForegroundMissingRatio: 0.34, minimumForegroundPixels: 1 } }
  });

  assert.equal(result.local[0].foregroundPixels, 24);
  assert.equal(result.local[0].foregroundMissingPixels, 0);
});

test("component region builder includes editable and fidelity objects with stable fallback ids", () => {
  const regions = buildComponentRegions({ textBoxes: [{ id: "title", box: { x: 1, y: 2, w: 3, h: 4 } }], shapes: [{ box: { x: 5, y: 6, w: 7, h: 8 } }], images: [{ id: "bad", box: { x: 0, y: 0, w: 0, h: 1 } }] }, { widthPt: 100, heightPt: 50 });
  assert.deepEqual(regions.map(({ id, kind }) => ({ id, kind })), [{ id: "title", kind: "text" }, { id: "shape-1", kind: "shape" }]);
});

test("component region builder skips explicitly ignored residual vector primitives", () => {
  const regions = buildComponentRegions({
    shapes: [
      { id: "semantic-card", type: "rect", box: { x: 5, y: 6, w: 70, h: 20 }, source: { editable: true } },
      { id: "residual-pixel-run", type: "rect", box: { x: 8, y: 8, w: 2, h: 2 }, source: { editable: true, componentQualityIgnore: true, detector: "native-residual-primitive-rect" } }
    ]
  }, { widthPt: 100, heightPt: 50 });
  assert.deepEqual(regions.map((region) => region.id), ["semantic-card"]);
});

test("component region builder skips compacted fidelity primitive ids", () => {
  const regions = buildComponentRegions({
    shapes: [
      { id: "semantic-card", type: "rect", box: { x: 5, y: 6, w: 70, h: 20 }, source: { editable: true } },
      { id: "component-fidelity-native-run-1-1", type: "rect", box: { x: 8, y: 8, w: 2, h: 2 } },
      { id: "text-fidelity-native-run-1-2", type: "rect", box: { x: 12, y: 8, w: 2, h: 2 } },
      { id: "native-residual-p1-final-low-contrast-footer-primitives-source-1-1", type: "rect", box: { x: 16, y: 8, w: 2, h: 2 } }
    ]
  }, { widthPt: 100, heightPt: 50 });
  assert.deepEqual(regions.map((region) => region.id), ["semantic-card"]);
});

test("component region builder uses explicit quality boxes without changing source geometry", () => {
  const regions = buildComponentRegions({
    textBoxes: [
      {
        id: "status-label",
        text: "权威源治理",
        box: { x: 80, y: 10, w: 50, h: 12 },
        source: {
          detector: "ocr-status-native-label",
          evidenceBox: { x: 68, y: 10, w: 62, h: 12 },
          componentQualityBox: { x: 88, y: 10.5, w: 40, h: 10.5 }
        }
      }
    ]
  }, { widthPt: 160, heightPt: 90 });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].id, "status-label");
  assert.deepEqual(regions[0].box, { x: 88, y: 10.5, w: 40, h: 10.5 });
});

test("component region builder scores source-edge lines instead of partial card bodies", () => {
  const regions = buildComponentRegions({
    shapes: [
      {
        id: "partial-card",
        type: "roundRect",
        box: { x: 20, y: 20, w: 80, h: 40 },
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
        source: { detector: "line-text-native-card-row", sourceNativeEdgeRefinement: { provider: "test", kind: "partial", sides: 1 } }
      },
      {
        id: "partial-card-source-top-1",
        type: "line",
        box: { x: 20, y: 18, w: 80, h: 0 },
        style: { stroke: "#D7DEE8", strokeWidthPt: 0.8, connectorType: "straight" },
        source: { detector: "source-native-edge-refinement", sourceShapeId: "partial-card", supportedSide: "top" }
      }
    ]
  }, { widthPt: 160, heightPt: 90 });

  assert.equal(regions.find((region) => region.id === "partial-card"), undefined);
  assert.equal(regions.find((region) => region.id === "partial-card-source-top-1").role, "connector-straight");
});

test("component regions normalize signed and axis-aligned connectors without losing their endpoints", () => {
  const regions = buildComponentRegions({ shapes: [
    { id: "descending", type: "line", box: { x: 10, y: 8, w: -8, h: -6 }, style: { strokeWidthPt: 2, endArrow: "triangle" } },
    { id: "horizontal", type: "line", box: { x: 2, y: 5, w: 12, h: 0 }, style: { strokeWidthPt: 1 } },
  ] }, { widthPt: 20, heightPt: 10 });
  assert.equal(regions.length, 2);
  assert.equal(regions[0].role, "connector-straight");
  assert.deepEqual(
    { startX: regions[0].geometry.startX, startY: regions[0].geometry.startY, endX: regions[0].geometry.endX, endY: regions[0].geometry.endY },
    { startX: 10, startY: 8, endX: 2, endY: 2 },
  );
  assert.equal(regions[1].geometry.startY, regions[1].geometry.endY);
});

test("closed native filled surfaces audit their interior instead of a diagonal connector corridor", () => {
  const source = image(48, 40); const generated = image(48, 40);
  fillRect(source, 8, 27, 6, 4, [120, 190, 240, 255]);
  const regions = buildComponentRegions({ shapes: [{
    id: "filled-surface", type: "freeform", box: { x: 4, y: 4, w: 40, h: 30 },
    style: { fill: "#78BEF0", stroke: "none", strokeWidthPt: 0,
      freeformPath: "[[0,0,0],[1,1,0],[1,1,1],[1,0,1],[4]]" }
  }] }, { widthPt: 48, heightPt: 40 });
  assert.equal(regions[0].role, "shape");
  assert.deepEqual(regions[0].box, { x: 4, y: 4, w: 40, h: 30 });
  assert.equal(regions[0].geometry, undefined);
  const result = compareComponentRegions(source, generated, regions, { widthPt: 48, heightPt: 40 }, {
    threshold: 24, foregroundTolerancePx: 0, foregroundToleranceDelta: 0
  });
  assert.equal(result.worst[0].foregroundPixels, 24);
  assert.equal(result.worst[0].foregroundMissingRatio, 1);
  assert.equal(result.worst[0].attention, true);
});

test("surface classification preserves explicit relationships open paths and unfilled contours", () => {
  const base = {type:"freeform",box:{x:4,y:4,w:12,h:10},
    style:{fill:"#123456",stroke:"none",freeformPath:"[[0,0,0],[1,1,0],[1,1,1],[1,0,1],[4]]"}};
  for(const patch of [
    {source:{componentQualityRole:"connector-straight"}},
    {source:{nativeComponentRole:"relationship"}}, {source:{role:"relationship"}},
    {style:{...base.style,connectorType:"straight"}},
    {style:{...base.style,startAnchor:{elementId:"node",side:"right",position:.5}}},
    {style:{...base.style,endArrow:"triangle"}},
    {style:{...base.style,fill:"none"}}, {style:{...base.style,stroke:"#123456"}},
    {style:{...base.style,freeformPath:"[[0,0,0],[1,1,0],[1,1,1]]"}},
    {style:{fill:"#123456",stroke:"none"}}
  ]){
    const [region]=buildComponentRegions({shapes:[{...base,...patch}]},{widthPt:24,heightPt:20});
    assert.equal(region.role,"connector-straight");
    assert.equal(region.geometry.type,"segment");
  }
  const {decodeNativeFreeformPath}=require("../packages/slideclone-core/scene-plan/native-freeform-path");
  const style={fill:"#123456",stroke:"none",freeformSegments:decodeNativeFreeformPath(base.style.freeformPath)};
  const [expanded]=buildComponentRegions({shapes:[{...base,style}]},{widthPt:24,heightPt:20});
  assert.equal(expanded.role,"shape");
  assert.throws(()=>buildComponentRegions({shapes:[{...base,style:{...base.style,freeformPath:"malformed"}}]},{widthPt:24,heightPt:20}),/payload is invalid/u);
});

test("surface classification keeps strict shape gates and both regression files in unit and all CI", () => {
  const {includesSuite}=require("../scripts/test-suites");
  for(const name of [__filename,require.resolve("./native-freeform-path.test.js")])
    for(const suite of ["unit","all"])assert.equal(includesSuite(name,suite),true);
  const source=image(16,16),generated=image(16,16);fillRect(source,0,0,16,16,[40,40,40,255]);
  const [region]=buildComponentRegions({shapes:[{type:"freeform",box:{x:0,y:0,w:16,h:16},
    style:{fill:"#282828",stroke:"none",freeformPath:"[[0,0,0],[1,1,0],[1,1,1],[1,0,1],[4]]"}}]},{widthPt:16,heightPt:16});
  const result=compareComponentRegions(source,generated,[region],{widthPt:16,heightPt:16},
    {threshold:24,foregroundTolerancePx:0,foregroundToleranceDelta:0});
  assert.equal(result.worst[0].role,"shape");assert.equal(result.worst[0].attention,true);
  assert.ok(result.worst[0].severity >= 1/.38);
});

test("connector diagnostics sample a narrow geometry corridor and apply role baselines", () => {
  const source = image(24, 16); const generated = image(24, 16);
  for (let x = 4; x <= 12; x += 2) setPixel(source, x, 4, [0, 0, 0, 255]);
  setPixel(source, 10, 12, [0, 0, 0, 255]);
  const regions = buildComponentRegions({ shapes: [{ id: "route", type: "line", box: { x: 4, y: 4, w: 8, h: 0 }, style: { strokeWidthPt: 0.5 } }] }, { widthPt: 24, heightPt: 16 });
  const result = compareComponentRegions(source, generated, regions, { widthPt: 24, heightPt: 16 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
    componentBaselines: { "connector-straight": { maximumPixelDiffRatio: 0.1, maximumForegroundMissingRatio: 0.1, minimumForegroundPixels: 1 } },
  });
  assert.equal(result.worst[0].foregroundPixels, 5);
  assert.equal(result.worst[0].attention, true);
  assert.equal(result.attentionCount, 1);
  assert.equal(result.roles[0].role, "connector-straight");
});

test("component region quality rejects invalid boundaries and excessive input", () => {
  assert.throws(() => buildComponentRegions({}, {}), /invalid/u);
  assert.throws(() => buildComponentRegions({ shapes: Array.from({ length: 5001 }, (_, index) => ({ id: String(index), box: { x: index, y: 0, w: 1, h: 1 } })) }, { widthPt: 10000, heightPt: 10 }), /safety limit/u);
  assert.throws(() => compareComponentRegions(image(1, 1), image(1, 1), [], { widthPt: 1, heightPt: 1 }, { foregroundTolerancePx: 9 }), /options/u);
  assert.throws(() => compareComponentRegions(image(1, 1), image(1, 1), [{ id: "x", kind: "shape", role: "shape", box: { x: 0, y: 0, w: 1, h: 1 } }], { widthPt: 1, heightPt: 1 }, { componentBaselines: { shape: { maximumPixelDiffRatio: 2 } } }), /baseline/u);
});
