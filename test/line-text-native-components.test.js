"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLineTextNativeComponents, createLineTextNativeComponentObjects } = require("../packages/slideclone-core/typography/line-text-native-components");

function h(id, x, y, w, stroke = "#D0D7E2") {
  return { id, type: "line", box: { x, y, w, h: 0 }, style: { stroke, strokeWidthPt: 1 }, source: { detector: "long-axis-line" } };
}

function v(id, x, y, h, stroke = "#D0D7E2") {
  return { id, type: "line", box: { x, y, w: 0, h }, style: { stroke, strokeWidthPt: 1 }, source: { detector: "long-axis-line" } };
}

function text(id, x, y, w = 40, h = 12) {
  return { id, text: id, box: { x, y, w, h } };
}

function image(width, height, fill) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = fill[0];
    rgba[offset + 1] = fill[1];
    rgba[offset + 2] = fill[2];
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

function paintRect(raster, box, fill) {
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(raster.height, Math.ceil(box.y + box.h)); y += 1) {
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(raster.width, Math.ceil(box.x + box.w)); x += 1) {
      const offset = (y * raster.width + x) * 4;
      raster.rgba[offset] = fill[0];
      raster.rgba[offset + 1] = fill[1];
      raster.rgba[offset + 2] = fill[2];
      raster.rgba[offset + 3] = 255;
    }
  }
}

test("line text native components reconstruct saturated leading icon swatches from raster evidence", () => {
  const raster = image(360, 220, [255, 255, 255]);
  paintRect(raster, { x: 68, y: 78, w: 20, h: 20 }, [18, 163, 106]);
  paintRect(raster, { x: 74, y: 84, w: 8, h: 8 }, [255, 255, 255]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 360, heightPt: 220 },
    image: raster,
    lines: [h("guide-a", 8, 8, 80), h("guide-b", 8, 28, 80)],
    textBoxes: [
      text("WorkBuddy", 98, 80, 68, 12),
      text("已在用的通用入口", 98, 98, 92, 10),
      text("reference", 220, 40, 60, 12)
    ]
  });
  const swatches = result.shapes.filter((shape) => shape.source.detector === "line-text-native-leading-icon-swatch");
  assert.ok(swatches.length >= 1);
  assert.equal(swatches[0].type, "rect");
  assert.equal(swatches[0].source.editable, true);
  assert.match(swatches[0].style.fill, /^#[0-9A-F]{6}$/u);
});

test("line text native components fit leading icon swatches to saturated raster bounds", () => {
  const raster = image(360, 220, [255, 255, 255]);
  paintRect(raster, { x: 72, y: 82, w: 14, h: 14 }, [18, 163, 106]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 360, heightPt: 220 },
    image: raster,
    lines: [h("guide-a", 8, 8, 80), h("guide-b", 8, 28, 80)],
    textBoxes: [
      text("WorkBuddy", 98, 80, 68, 12),
      text("已在用的通用入口", 98, 98, 92, 10),
      text("reference", 220, 40, 60, 12)
    ]
  });
  const swatch = result.shapes.find((shape) => shape.source.detector === "line-text-native-leading-icon-swatch");
  assert.ok(swatch);
  assert.equal(swatch.source.fittedToColorBounds, true);
  assert.deepEqual(swatch.box, { x: 72, y: 82, w: 14, h: 14 });
});

test("line text native components preserve wide light details inside leading icon swatches as native marks", () => {
  const raster = image(360, 220, [255, 255, 255]);
  paintRect(raster, { x: 66, y: 76, w: 28, h: 24 }, [14, 156, 156]);
  paintRect(raster, { x: 70, y: 84, w: 4, h: 8 }, [255, 255, 255]);
  paintRect(raster, { x: 78, y: 82, w: 3, h: 10 }, [255, 255, 255]);
  paintRect(raster, { x: 86, y: 85, w: 4, h: 7 }, [255, 255, 255]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 360, heightPt: 220 },
    image: raster,
    lines: [h("guide-a", 8, 8, 80), h("guide-b", 8, 28, 80)],
    textBoxes: [
      text("权限口径", 104, 80, 68, 12),
      text("更多文本", 104, 98, 92, 10),
      text("reference", 220, 40, 60, 12)
    ]
  });
  const detailMarks = result.shapes.filter((shape) =>
    shape.source.detector === "line-text-native-leading-icon-swatch" && shape.source.iconDetail === true);

  assert.ok(detailMarks.length >= 1);
  assert.ok(detailMarks.some((shape) => shape.box.w >= 8 && shape.box.h >= 7));
  assert.ok(detailMarks.every((shape) => shape.style.fill === "#FFFFFF" && shape.source.editable === true));
});

test("line text native components reconstruct grid cells and rules from structural lines", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [239, 246, 255]),
    lines: [
      h("top", 700, 100, 220),
      h("mid", 700, 160, 220),
      h("bottom", 700, 240, 220),
      v("left", 700, 100, 140),
      v("right", 920, 100, 140)
    ],
    textBoxes: [
      text("capability", 720, 118),
      text("tool-a", 805, 118),
      text("tool-b", 875, 118),
      text("row-label", 720, 184),
      text("row-value", 805, 184)
    ]
  });
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-grid-cell").length, 2);
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-grid-rule").length, 5);
  assert.ok(result.filter((shape) => shape.source.detector === "line-text-native-grid-rule").every((shape) => shape.style.strokeWidthPt <= 2.4));
  assert.ok(result.every((shape) => shape.source.editable === true && shape.source.nativeComponentArchetype === "line-text-layout"));
  assert.equal(result.find((shape) => shape.source.detector === "line-text-native-grid-cell").style.fill, "#EFF6FF");
});

test("line text native grid rules are clipped to the detected grid bounds", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 1280 },
    image: image(960, 1280, [255, 255, 255]),
    lines: [
      h("top", 700, 100, 220),
      h("mid", 700, 160, 220),
      h("bottom", 700, 240, 220),
      v("left", 700, 80, 760),
      v("right", 920, 80, 760)
    ],
    textBoxes: [
      text("capability", 720, 118),
      text("tool-a", 805, 118),
      text("tool-b", 875, 118),
      text("row-label", 720, 184),
      text("row-value", 805, 184)
    ]
  });
  const rules = result.filter((shape) => shape.source.detector === "line-text-native-grid-rule");
  const verticalRules = rules.filter((shape) => shape.box.w === 0);
  const horizontalRules = rules.filter((shape) => shape.box.h === 0);
  assert.equal(verticalRules.length, 2);
  assert.ok(verticalRules.every((shape) => shape.box.y === 100 && shape.box.h === 140));
  assert.ok(horizontalRules.every((shape) => shape.box.x === 700 && shape.box.w === 220));
});

test("line text native components reconstruct text-backed section panels without vertical borders", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    lines: [h("a", 20, 90, 640), h("b", 20, 190, 640), h("c", 21, 310, 638)],
    textBoxes: [
      text("section-title", 54, 110, 90, 16),
      text("section-body", 54, 138, 180, 16),
      text("next-title", 54, 212, 90, 16),
      text("next-body", 54, 252, 180, 16)
    ]
  });
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-section-panel").length, 2);
  assert.ok(result.every((shape) => shape.type === "rect"));
  assert.ok(result.filter((shape) => shape.source.detector === "line-text-native-section-panel").every((shape) => shape.style.opacity === 1));
});

test("horizontal section panels require source fill across the proposed interior", () => {
  const slideSize = { widthPt: 800, heightPt: 400 };
  const lines = [h("top", 40, 100, 720), h("bottom", 40, 220, 720)];
  const textBoxes = [text("heading", 40, 30), text("left", 80, 145), text("right", 600, 145)];
  for (const fill of [[220, 235, 245], [175, 225, 190]]) {
    const disconnected = image(800, 400, [255, 255, 255]);
    paintRect(disconnected, { x: 40, y: 100, w: 270, h: 120 }, fill);
    paintRect(disconnected, { x: 490, y: 100, w: 270, h: 120 }, fill);
    const rejected = createLineTextNativeComponents({ slideSize, lines, textBoxes, image: disconnected });
    assert.equal(rejected.filter(shape => shape.source.detector === "line-text-native-section-panel").length, 0);
    const continuous = image(800, 400, [255, 255, 255]);
    paintRect(continuous, { x: 40, y: 100, w: 720, h: 120 }, fill);
    const accepted = createLineTextNativeComponents({ slideSize, lines, textBoxes, image: continuous });
    assert.equal(accepted.filter(shape => shape.source.detector === "line-text-native-section-panel").length, 1);
  }
});

test("panel fill evidence rejects invalid color tolerances", () => {
  const { panelFillMatchesInterior } = require("../packages/slideclone-core/typography/line-text-native-primitives");
  for (const tolerance of [NaN, Infinity, -1, 47, Number.MAX_VALUE]) {
    assert.equal(panelFillMatchesInterior(null, { x: 0, y: 0, w: 10, h: 10 }, { widthPt: 10, heightPt: 10 }, "#FFFFFF", tolerance), false);
  }
  assert.equal(panelFillMatchesInterior(null, { x: 0, y: 0, w: 10, h: 10 }, { widthPt: 10, heightPt: 10 }, "#FFFFFF", 18), true);
});

test("line text native components reconstruct bordered text cards from closed line boxes", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [
      h("card-top", 180, 80, 120, "#7C3AED"),
      h("card-bottom", 180, 132, 120, "#7C3AED"),
      v("card-left", 180, 80, 52, "#7C3AED"),
      v("card-right", 300, 80, 52, "#7C3AED"),
      h("second-top", 320, 80, 120, "#7C3AED"),
      h("second-bottom", 320, 132, 120, "#7C3AED"),
      v("second-left", 320, 80, 52, "#7C3AED"),
      v("second-right", 440, 80, 52, "#7C3AED")
    ],
    textBoxes: [
      text("会议记忆", 196, 92, 58, 12),
      text("岗位记忆", 336, 92, 58, 12),
      text("body", 196, 110, 82, 10),
      text("body2", 336, 110, 82, 10)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-bordered-card");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].style.stroke, "#7C3AED");
  assert.equal(cards[0].style.fill, "#FFFFFF");
  assert.ok(cards.every((shape) => shape.source.editable === true));
});

test("line text native components reconstruct only lower-page two-digit timeline badges", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("02", 170, 430, 18, 12), font: { color: "#3366FF" } },
      { ...text("2", 32, 120, 16, 16), font: { color: "#109D9D" } },
      { ...text("03", 260, 130, 18, 12), font: { color: "#3366FF" } },
      text("context", 300, 430, 60, 12)
    ]
  });
  const badges = result.filter((shape) => shape.source.detector === "line-text-native-timeline-step-badge");
  assert.equal(badges.length, 1);
  assert.equal(badges[0].type, "ellipse");
  assert.equal(badges[0].style.stroke, "#3366FF");
  assert.equal(badges[0].source.text, "02");
});

test("line text native components reconstruct single digit section badges", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 28, y: 216, w: 26, h: 26 }, [16, 157, 157]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("2", 33, 221, 16, 16), font: { color: "#109D9D" } },
      text("System Connection", 58, 214, 96, 12),
      text("系统连接层", 56, 226, 80, 18)
    ]
  });
  const badges = result.shapes.filter((shape) => shape.source.detector === "line-text-native-single-digit-badge");
  assert.equal(badges.length, 1);
  assert.equal(badges[0].type, "roundRect");
  assert.equal(badges[0].style.fill, "#109D9D");
  const badgeText = result.textBoxes.find((item) => item.source.detector === "line-text-native-single-digit-badge-text");
  assert.equal(badgeText.text, "2");
  assert.equal(badgeText.font.color, "#FFFFFF");
  assert.equal(badgeText.font.align, "center");
});

test("line text native components reject isolated single digit badges", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 28, y: 216, w: 26, h: 26 }, [16, 157, 157]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("2", 33, 221, 16, 16), font: { color: "#109D9D" } },
      text("短", 220, 400, 20, 12),
      text("内容", 250, 420, 28, 12)
    ]
  });
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "line-text-native-single-digit-badge").length, 0);
  assert.equal(result.textBoxes.filter((item) => item.source.detector === "line-text-native-single-digit-badge-text").length, 0);
});

test("line text native components do not duplicate existing single digit badge text", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 28, y: 216, w: 26, h: 26 }, [16, 157, 157]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      {
        ...text("2", 28, 216, 25, 25),
        source: { detector: "line-text-native-single-digit-badge-text" }
      },
      text("System Connection", 58, 214, 96, 12),
      text("系统连接层", 56, 226, 80, 18)
    ]
  });
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "line-text-native-single-digit-badge").length, 0);
  assert.equal(result.textBoxes.filter((item) => item.source.detector === "line-text-native-single-digit-badge-text").length, 0);
});

test("line text native components infer missing regular timeline badge text as native objects", () => {
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("选场景", 62, 482, 34, 12),
      text("盘系统资料", 156, 482, 50, 12),
      text("连接与治理", 258, 482, 50, 12),
      text("设权限", 366, 482, 34, 12),
      text("配岗位能力", 456, 482, 50, 12),
      text("真实数据试跑", 552, 482, 58, 12),
      text("上岗运行", 662, 482, 42, 12),
      text("看运行账本", 758, 482, 50, 12),
      text("复制到下一岗", 850, 482, 58, 12),
      { ...text("02", 171, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("03", 271, 470, 17, 12), font: { color: "#2D55E1", sizePt: 7.7 } },
      { ...text("05", 471, 470, 18, 12), font: { color: "#2A53E0", sizePt: 7.7 } },
      { ...text("06", 570, 470, 18, 12), font: { color: "#2F57E1", sizePt: 7.7 } },
      { ...text("08", 772, 470, 16, 12), font: { color: "#355CE2", sizePt: 7.7 } }
    ]
  });
  const badges = result.shapes.filter((shape) => shape.source.detector === "line-text-native-timeline-step-badge");
  assert.equal(badges.length, 9);
  assert.deepEqual(
    result.textBoxes.map((item) => item.text).sort(),
    ["01", "02", "03", "04", "05", "06", "07", "08", "09"]
  );
  assert.equal(result.textBoxes.filter((item) => item.source.inferredFromRegularTimeline === true).length, 4);
  assert.ok(result.textBoxes.every((item) => item.source.detector === "line-text-native-timeline-step-badge-text"));
  assert.ok(result.textBoxes.every((item) => item.font.align === "center" && item.font.valign === "middle"));
});

test("line text card rows do not wrap timeline step descriptions", () => {
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 900), h("guide-b", 20, 44, 900)],
    textBoxes: [
      text("选场景", 62, 482, 34, 12),
      text("盘系统资料", 156, 482, 50, 12),
      text("连接与治理", 258, 482, 50, 12),
      text("设权限", 366, 482, 34, 12),
      text("配岗位能力", 456, 482, 50, 12),
      text("挑一件天天做的事", 50, 500, 72, 10),
      text("有什么、在哪、谁负责", 150, 500, 90, 10),
      text("接进来并定权威源", 258, 500, 90, 10),
      text("谁能看到哪些数据", 356, 500, 90, 10),
      text("会做哪些动作、边界", 456, 500, 90, 10),
      { ...text("01", 72, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("02", 172, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("03", 272, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("04", 372, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("05", 472, 470, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } }
    ]
  });
  const timelineCards = result.shapes.filter((shape) =>
    shape.source.detector === "line-text-native-card-row" && shape.box.y > 470
  );
  assert.equal(timelineCards.length, 0);
});

test("line text card rows do not absorb separated row-level captions", () => {
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("top", 120, 95, 580), h("bottom", 120, 200, 580)],
    textBoxes: [
      text("业务系统数据", 170, 118, 66, 12),
      text("文档与表格", 310, 118, 58, 12),
      text("沟通与流程记录", 445, 118, 76, 12),
      text("没写下来的经验", 580, 118, 76, 12),
      text("ERP / CRM / MES", 170, 132, 98, 12),
      text("制度 / 合同 / SOP", 310, 132, 102, 12),
      text("钉钉群 / 审批", 445, 132, 92, 12),
      text("老员工判断", 580, 132, 82, 12),
      text("存 / HRM", 170, 146, 42, 12),
      text("图纸", 310, 146, 24, 12),
      text("例外", 580, 146, 24, 12),
      text("现状：这是跨卡片的行级说明，不属于单张卡片", 170, 180, 300, 12),
      text("这不是模型能解决的问题", 482, 180, 104, 12)
    ]
  });
  const cards = result.shapes.filter((shape) => shape.source.detector === "line-text-native-card-row" && shape.box.y < 140);

  assert.equal(cards.length, 4);
  assert.ok(cards.every((shape) => shape.box.h <= 66));
  assert.ok(cards.every((shape) => shape.source.textCount <= 3));
});

test("numbered section panels stay within the numbered column when side-column rules share the same row", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 250, 245]),
    lines: [
      h("left-top", 20, 100, 680, "#E88339"),
      h("right-top", 714, 100, 226, "#E88339"),
      h("left-bottom", 20, 200, 680, "#E88339"),
      h("right-bottom", 714, 200, 226, "#E88339")
    ],
    textBoxes: [
      { ...text("3", 34, 132, 16, 16), font: { color: "#E88339" } },
      text("权威知识层", 56, 132, 86, 16),
      text("指定权威源", 196, 132, 80, 12),
      text("版本与有效期", 316, 132, 90, 12),
      text("责任人", 456, 132, 58, 12),
      text("侧栏标题", 760, 132, 70, 12),
      text("侧栏内容", 830, 160, 70, 12)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-numbered-section-panel");

  assert.equal(panels.length, 1);
  assert.ok(panels[0].box.w <= 700);
  assert.ok(panels[0].box.x + panels[0].box.w < 714);
});

test("line text card rows respect standardized native timeline badge text", () => {
  const nativeBadgeText = (value, x) => ({
    id: `badge-${value}`,
    text: value,
    box: { x, y: 931.89, w: 27.78, h: 27.78 },
    font: { align: "center", valign: "middle" },
    source: { detector: "line-text-native-timeline-step-badge-text" }
  });
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 1280 },
    image: image(960, 1280, [255, 255, 255]),
    lines: [h("guide-a", 20, 930, 900), h("guide-b", 20, 1008, 900)],
    textBoxes: [
      text("选场景", 62, 963, 34, 12),
      text("盘系统资料", 156, 963, 50, 12),
      text("连接与治理", 258, 963, 50, 12),
      text("设权限", 366, 963, 34, 12),
      text("配岗位能力", 456, 963, 50, 12),
      text("挑一件天天做的事", 50, 979, 72, 10),
      text("有什么、在哪、谁负责", 150, 977, 90, 10),
      text("接进来并定权威源", 258, 979, 90, 10),
      text("谁能看到哪些数据", 356, 979, 90, 10),
      text("会做哪些动作、边界", 456, 979, 90, 10),
      nativeBadgeText("01", 65.22),
      nativeBadgeText("02", 165.67),
      nativeBadgeText("03", 266.11),
      nativeBadgeText("04", 366.11),
      nativeBadgeText("05", 466.11)
    ]
  });
  const timelineCards = result.shapes.filter((shape) =>
    shape.source.detector === "line-text-native-card-row" && shape.box.y > 930
  );
  assert.equal(timelineCards.length, 0);
});

test("line text background panels render behind timeline badge shapes", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 210, w: 680, h: 86 }, [240, 253, 248]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Retrieval & Context", 56, 218, 98, 12),
      text("检索与上下文", 55, 234, 98, 18),
      text("理解问题", 184, 236, 58, 14),
      text("定位范围", 300, 236, 58, 14),
      text("权限过滤", 416, 236, 58, 14),
      text("组装上下文", 532, 236, 72, 14),
      text("找得到、给得准、说得出出处", 28, 266, 128, 12),
      text("选场景", 62, 502, 34, 12),
      text("盘系统资料", 156, 502, 50, 12),
      text("连接与治理", 258, 502, 50, 12),
      text("设权限", 366, 502, 34, 12),
      text("配岗位能力", 456, 502, 50, 12),
      { ...text("01", 72, 480, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("02", 172, 480, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("03", 272, 480, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("04", 372, 480, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } },
      { ...text("05", 472, 480, 18, 12), font: { color: "#3259E1", sizePt: 7.7 } }
    ]
  });
  const panelIndex = result.findLastIndex((shape) => shape.source.detector === "line-text-native-title-band-panel");
  const badgeIndex = result.findIndex((shape) => shape.source.detector === "line-text-native-timeline-step-badge");
  assert.ok(panelIndex >= 0);
  assert.ok(badgeIndex > panelIndex);
});

test("line text native components reconstruct horizontal rows of card titles", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("业务系统数据", 190, 92, 72, 12), font: { color: "#1F2937" } },
      text("ERP / CRM", 190, 112, 74, 10),
      { ...text("文档与表格", 325, 92, 66, 12), font: { color: "#1F2937" } },
      text("制度合同", 325, 112, 58, 10),
      { ...text("沟通流程", 460, 92, 58, 12), font: { color: "#1F2937" } },
      text("审批日志", 460, 112, 58, 10),
      { ...text("沉淀经验", 595, 92, 58, 12), font: { color: "#1F2937" } },
      text("例外处理", 595, 112, 58, 10)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 4);
  assert.ok(cards.every((shape) => shape.source.rowSize === 4));
  assert.ok(cards.every((shape) => shape.type === "roundRect"));
  assert.ok(cards.every((shape) => Number(shape.style.radiusPt) > 0));
  assert.ok(cards.every((shape) => shape.style.stroke !== "#1F2937"));
});

test("line text compact card rows keep tight lower padding", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: image(960, 720, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("企业记忆", 440, 460, 48, 16),
      text("组织/产品/客户/制度", 442, 476, 103, 12),
      text("长期事实", 442, 486, 39, 15),
      text("经验沉淀", 572, 460, 48, 15),
      text("访谈老员工，把判断写成规", 572, 475, 108, 15),
      text("系统入口", 704, 460, 48, 15),
      text("接入数据", 704, 475, 58, 12)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 3);
  assert.ok(cards.every((shape) => shape.box.h <= 62));
});

test("line text compact card rows sample saturated header fills locally", () => {
  const raster = image(960, 720, [255, 255, 255]);
  for (const x of [160, 272, 384]) {
    paintRect(raster, { x, y: 244, w: 96, h: 48 }, [214, 69, 107]);
  }
  paintRect(raster, { x: 150, y: 300, w: 360, h: 54 }, [255, 248, 250]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("取数、比对、汇总", 180, 270, 72, 12),
      text("拟稿、生成报告表格", 292, 270, 82, 12),
      text("建单、任务、日程", 396, 270, 74, 12),
      text("上岗前必须写清的能力四要素：", 180, 318, 140, 12)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 3);
  assert.ok(cards.every((shape) => shape.box.h <= 42));
  assert.ok(cards.every((shape) => shape.style.fill === "#D6456B"));
});

test("line text card rows ignore leading side-rail labels", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("原始资料层", 56, 94, 82, 17),
      { ...text("业务系统数据", 190, 96, 72, 12), font: { color: "#1F2937" } },
      text("ERP / CRM", 190, 116, 74, 10),
      { ...text("文档与表格", 325, 96, 66, 12), font: { color: "#1F2937" } },
      text("制度合同", 325, 116, 58, 10),
      { ...text("沟通流程", 460, 96, 58, 12), font: { color: "#1F2937" } },
      text("审批日志", 460, 116, 58, 10),
      { ...text("沉淀经验", 595, 96, 58, 12), font: { color: "#1F2937" } },
      text("例外处理", 595, 116, 58, 10)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 4);
  assert.ok(cards.every((shape) => shape.box.x >= 160));
  assert.ok(cards.every((shape) => shape.box.w <= 170));
});

test("line text card rows can sit inside broad native band backgrounds", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 30, y: 78, w: 650, h: 66 }, [240, 253, 248]);
  paintRect(raster, { x: 30, y: 178, w: 650, h: 66 }, [255, 241, 246]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("原始资料层", 56, 94, 82, 17),
      text("业务系统数据", 190, 96, 72, 12),
      text("文档与表格", 325, 96, 66, 12),
      text("沟通流程", 460, 96, 58, 12),
      text("沉淀经验", 595, 96, 58, 12),
      text("ERP / CRM", 190, 116, 74, 10),
      text("制度合同", 325, 116, 58, 10),
      text("审批日志", 460, 116, 58, 10),
      text("例外处理", 595, 116, 58, 10),
      text("系统连接层", 56, 194, 82, 17),
      text("接口对接", 190, 196, 72, 12),
      text("数据库", 325, 196, 66, 12),
      text("文件同步", 460, 196, 58, 12),
      text("表单回调", 595, 196, 58, 12),
      text("开放 API", 190, 216, 74, 10),
      text("只读视图", 325, 216, 58, 10),
      text("导出校验", 460, 216, 58, 10),
      text("按事件触发", 595, 216, 75, 10)
    ]
  });
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-title-band-panel").length, 2);
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 8);
  assert.ok(cards.every((shape) => shape.box.x >= 160 && shape.box.w <= 150));
});

test("line text card rows split mixed main content and side-table rows by wide gaps", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Authoritative", 56, 120, 64, 12),
      text("过程可查", 719, 118, 40, 12),
      text("没有记录", 808, 124, 35, 12),
      text("全程留痕", 887, 122, 34, 12),
      text("指定权威源", 197, 144, 54, 12),
      text("版本与有效期", 297, 144, 62, 12),
      text("冲突裁决", 411, 144, 44, 12),
      text("责任人", 520, 142, 35, 16),
      text("过期下架", 620, 144, 45, 14),
      text("效果评估", 719, 152, 40, 12),
      text("什么时候起停用", 300, 160, 58, 10),
      text("谁负责更新", 516, 159, 44, 12),
      text("旧版不再被引用", 613, 160, 57, 10),
      text("Evaluation", 720, 166, 40, 10),
      text("说不清楚", 808, 164, 36, 10),
      text("有账本可复盘", 878, 163, 51, 10)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  assert.equal(cards.length, 5);
  assert.ok(cards.every((shape) => shape.box.x >= 160));
  assert.ok(cards.every((shape) => shape.box.x + shape.box.w <= 705));
  assert.ok(cards.every((shape) => shape.box.w <= 132));
});

test("line text card rows dedupe containing rows from nearby recovered text clusters", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("接口对接", 178, 110, 48, 16),
      text("有开放 API 的系统", 178, 130, 76, 11),
      text("数据库只读视图", 292, 110, 72, 16),
      text("不动原系统", 292, 130, 58, 11),
      text("文件定时同步", 430, 110, 70, 16),
      text("导出表格类", 430, 130, 58, 11),
      text("钉钉生态直连", 560, 110, 70, 16),
      text("审批日志", 560, 130, 58, 11),
      text("最终产出统一清单", 176, 152, 90, 12),
      text("系统方式频率责任人", 178, 168, 92, 11),
      text("验收标准", 292, 168, 58, 11),
      text("口径纪律", 430, 168, 58, 11)
    ]
  });
  const cards = result.filter((shape) => shape.source.detector === "line-text-native-card-row");
  const overlappingFirstCard = cards.filter((shape) => shape.box.x <= 180 && shape.box.x + shape.box.w >= 252 && shape.box.y <= 130 && shape.box.y + shape.box.h >= 144);
  assert.equal(overlappingFirstCard.length, 1);
});

test("line text background panels stay above nearby structural section boundaries", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 180, y: 96, w: 640, h: 40 }, [245, 250, 255]);
  paintRect(raster, { x: 180, y: 145, w: 640, h: 58 }, [12, 156, 156]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("section-guide", 170, 92, 660), h("section-boundary", 170, 142, 660)],
    textBoxes: [
      text("业务系统数据", 190, 102, 72, 12),
      text("ERP / CRM", 190, 120, 74, 10),
      text("文档与表格", 325, 102, 66, 12),
      text("制度合同", 325, 120, 58, 10),
      text("沟通流程", 460, 102, 58, 12),
      text("审批日志", 460, 120, 58, 10),
      text("沉淀经验", 595, 102, 58, 12),
      text("例外处理", 595, 120, 58, 10),
      text("下一段标题", 190, 158, 72, 12),
      text("下一段内容", 190, 178, 74, 10)
    ]
  });
  const backgrounds = result.filter((shape) => String(shape.source.detector || "").startsWith("line-text-native-"));
  assert.ok(backgrounds.length >= 1);
  assert.ok(backgrounds.every((shape) => shape.box.y + shape.box.h <= 142));
  assert.ok(backgrounds.every((shape) => shape.style.fill !== "#0C9C9C"));
});

test("line text native components reconstruct numbered section panels from wide separators", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 20, y: 90, w: 720, h: 84 }, [240, 253, 248]);
  paintRect(raster, { x: 20, y: 184, w: 720, h: 88 }, [255, 241, 246]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [
      h("row-a-top", 20, 90, 720, "#22C55E"),
      h("row-a-bottom", 20, 174, 720, "#22C55E"),
      h("row-b-bottom", 20, 272, 720, "#E11D48")
    ],
    textBoxes: [
      { ...text("5", 34, 110, 13, 14), font: { color: "#22C55E" } },
      text("检索与上下文", 64, 108, 92, 15),
      text("理解问题", 190, 112, 58, 12),
      text("定位范围", 320, 112, 58, 12),
      text("权限过滤", 450, 112, 58, 12),
      { ...text("6", 34, 206, 13, 14), font: { color: "#E11D48" } },
      text("岗位能力层", 64, 204, 82, 15),
      text("查", 190, 208, 20, 12),
      text("写", 320, 208, 20, 12),
      text("建", 450, 208, 20, 12)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-numbered-section-panel");
  assert.equal(panels.length, 2);
  assert.ok(panels.every((shape) => shape.type === "rect" && shape.source.editable === true));
  assert.deepEqual(panels.map((shape) => shape.source.sectionNumber), ["5", "6"]);
});

test("line text broad section panels sample background from inner edges", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 20, y: 90, w: 720, h: 84 }, [240, 253, 248]);
  paintRect(raster, { x: 180, y: 105, w: 96, h: 52 }, [255, 255, 255]);
  paintRect(raster, { x: 300, y: 105, w: 96, h: 52 }, [255, 255, 255]);
  paintRect(raster, { x: 420, y: 105, w: 96, h: 52 }, [255, 255, 255]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [
      h("row-top", 20, 90, 720, "#22C55E"),
      h("row-bottom", 20, 174, 720, "#22C55E")
    ],
    textBoxes: [
      { ...text("5", 34, 110, 13, 14), font: { color: "#22C55E" } },
      text("检索与上下文", 64, 108, 92, 15),
      text("理解问题", 190, 112, 58, 12),
      text("定位范围", 310, 112, 58, 12),
      text("权限过滤", 430, 112, 58, 12)
    ]
  });
  const panel = result.find((shape) => shape.source.detector === "line-text-native-numbered-section-panel");
  assert.ok(panel);
  assert.equal(panel.style.fill, "#F0FDF8");
});

test("line text native components reconstruct numbered text bands without separator lines", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 210, w: 680, h: 76 }, [240, 253, 248]);
  paintRect(raster, { x: 18, y: 304, w: 680, h: 78 }, [255, 241, 246]);
  paintRect(raster, { x: 18, y: 402, w: 680, h: 78 }, [239, 246, 255]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("5", 32, 226, 13, 14), font: { color: "#16A34A" } },
      text("检索与上下文", 64, 222, 100, 16),
      text("理解问题", 190, 232, 58, 12),
      text("定位范围", 310, 232, 58, 12),
      text("权限过滤", 430, 232, 58, 12),
      { ...text("6", 32, 326, 13, 14), font: { color: "#DB2777" } },
      text("岗位能力层", 64, 322, 90, 16),
      text("查", 190, 332, 20, 12),
      text("写", 310, 332, 20, 12),
      text("建", 430, 332, 20, 12),
      { ...text("7", 32, 426, 13, 14), font: { color: "#2563EB" } },
      text("AI 员工层", 64, 422, 80, 16),
      text("销售作战", 190, 432, 58, 12),
      text("智能客服", 310, 432, 58, 12),
      text("数据分析", 430, 432, 58, 12)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-numbered-band-panel");
  assert.equal(panels.length, 3);
  assert.deepEqual(panels.map((shape) => shape.source.sectionNumber), ["5", "6", "7"]);
});

test("line text native components reconstruct title anchored text bands", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 210, w: 680, h: 86 }, [240, 253, 248]);
  paintRect(raster, { x: 18, y: 322, w: 680, h: 82 }, [239, 246, 255]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Retrieval & Context", 56, 218, 98, 12),
      text("检索与上下文", 55, 234, 98, 18),
      text("理解问题", 184, 236, 58, 14),
      text("定位范围", 300, 236, 58, 14),
      text("权限过滤", 416, 236, 58, 14),
      text("组装上下文", 532, 236, 72, 14),
      text("找得到、给得准、说得出出处", 28, 266, 128, 12),
      text("Job Capability", 56, 330, 86, 12),
      text("岗位能力层", 56, 346, 82, 18),
      text("取数、比对、汇总", 184, 352, 78, 14),
      text("拟稿、生成报告", 300, 352, 72, 14),
      text("建单、任务、日程", 416, 352, 78, 14),
      text("发起或协办审批", 532, 352, 78, 14),
      text("独立侧栏说明", 750, 352, 92, 12)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-title-band-panel");
  assert.ok(panels.length >= 2);
  assert.deepEqual(panels.slice(0, 2).map((shape) => shape.source.anchorText), ["检索与上下文", "岗位能力层"]);
  assert.ok(panels.slice(0, 2).every((shape) => shape.box.w >= 960 * 0.6 && shape.box.x + shape.box.w < 700));
  assert.ok(panels.slice(0, 2).every((shape) => shape.source.textCount >= 6));
  assert.ok(panels.slice(0, 2).every((shape) => shape.style.opacity === 1));
});

test("line text title bands reject mixed interior backgrounds", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 210, w: 150, h: 86 }, [176, 198, 249]);
  paintRect(raster, { x: 18, y: 210, w: 680, h: 5 }, [55, 106, 239]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Raw Material", 56, 218, 98, 12),
      text("原始资料层", 55, 234, 98, 18),
      text("业务系统数据", 184, 236, 70, 14),
      text("文档与表格", 300, 236, 58, 14),
      text("沟通与流程记录", 416, 236, 78, 14),
      text("没写下来的经验", 532, 236, 78, 14),
      text("散落在系统、文档、群聊和人脑里", 28, 266, 160, 12),
      text("System Connection", 56, 330, 120, 12),
      text("系统连接层", 56, 346, 82, 18),
      text("接口对接", 184, 352, 58, 14),
      text("数据库只读视图", 300, 352, 82, 14),
      text("文件定时同步", 416, 352, 82, 14),
      text("钉钉生态直连", 532, 352, 82, 14)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-title-band-panel");
  assert.equal(panels.some((shape) => shape.source.anchorText === "原始资料层"), false);
});

test("line text title bands reject lower-page inline step detail labels", () => {
  const raster = image(960, 1280, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 210, w: 680, h: 86 }, [240, 253, 248]);
  paintRect(raster, { x: 18, y: 1018, w: 680, h: 72 }, [250, 252, 254]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 1280 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Retrieval & Context", 56, 218, 98, 12),
      text("检索与上下文", 55, 234, 98, 18),
      text("理解问题", 184, 236, 58, 14),
      text("定位范围", 300, 236, 58, 14),
      text("权限过滤", 416, 236, 58, 14),
      text("组装上下文", 532, 236, 72, 14),
      text("找得到、给得准、说得出出处", 28, 266, 128, 12),
      text("01懂公司知识、口径、权限先理清", 38, 1036, 138, 12),
      text("02能力事进系统做动作，不只给文字", 238, 1036, 152, 12),
      text("03管得住有记录、有边界、有人兜底", 438, 1036, 158, 12),
      text("04持续变强经验回流，越用越准", 638, 1036, 148, 12)
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-title-band-panel");
  assert.equal(panels.some((shape) => /^01/u.test(String(shape.source.anchorText || ""))), false);
});

test("line text native components avoid overextended saturated title bands", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 18, y: 318, w: 680, h: 98 }, [214, 69, 107]);
  paintRect(raster, { x: 180, y: 340, w: 92, h: 28 }, [214, 69, 107]);
  paintRect(raster, { x: 300, y: 340, w: 92, h: 28 }, [214, 69, 107]);
  paintRect(raster, { x: 420, y: 340, w: 92, h: 28 }, [214, 69, 107]);
  paintRect(raster, { x: 540, y: 340, w: 92, h: 28 }, [214, 69, 107]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Retrieval & Context", 56, 218, 98, 12),
      text("检索与上下文", 55, 234, 98, 18),
      text("理解问题", 184, 236, 58, 14),
      text("定位范围", 300, 236, 58, 14),
      text("权限过滤", 416, 236, 58, 14),
      text("组装上下文", 532, 236, 72, 14),
      text("Job Capability", 56, 330, 86, 12),
      text("岗位能力层", 56, 346, 82, 18),
      text("查", 184, 352, 28, 14),
      text("写", 300, 352, 28, 14),
      text("建", 416, 352, 28, 14),
      text("审", 532, 352, 28, 14)
    ]
  });
  const titleBands = result.filter((shape) => shape.source.detector === "line-text-native-title-band-panel");
  assert.ok(titleBands.every((shape) => shape.style.fill !== "#D6456B"));
});

test("line text native components reconstruct text-anchored colored panels from sampled pixels", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 92, y: 95, w: 92, h: 28 }, [0, 150, 136]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("a", 20, 20, 220), h("b", 20, 44, 220)],
    textBoxes: [
      text("接 口 对 接", 106, 101, 62, 13),
      text("plain", 300, 101, 50, 13),
      text("other", 370, 101, 50, 13)
    ]
  });
  const panels = result.shapes.filter((shape) => shape.source.detector === "line-text-native-color-panel");
  assert.equal(panels.length, 1);
  assert.equal(panels[0].style.fill, "#009688");
  assert.ok(panels[0].box.x <= 94);
  assert.ok(panels[0].box.w >= 88);
  assert.equal(panels[0].source.nativeComponentRole, "section-panel");
  const panelText = result.textBoxes.find((item) => item.source.detector === "line-text-native-color-panel-text");
  assert.equal(panelText.text, "接 口 对 接");
  assert.equal(panelText.id, "接 口 对 接");
  assert.equal(panelText.font.color, "#FFFFFF");
  assert.equal(panelText.font.align, "center");
  assert.equal(panelText.font.valign, "middle");
  assert.deepEqual(panelText.box, panels[0].box);
});

test("line text native components fit vertical color panels from connected source pixels", () => {
  const raster = image(1080, 1440, [255, 255, 255]);
  paintRect(raster, { x: 813, y: 605, w: 25, h: 59 }, [14, 156, 156]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 1280 },
    image: raster,
    lines: [h("a", 700, 520, 220), h("b", 700, 640, 220)],
    textBoxes: [
      text("企业自建 Agent", 749, 565, 75, 13),
      text("other", 700, 700, 50, 13),
      text("more", 760, 700, 50, 13)
    ]
  });

  const panel = result.shapes.find((shape) => shape.source.detector === "line-text-native-color-panel");

  assert.ok(panel);
  assert.equal(panel.style.fill.toLowerCase(), "#0e9c9c");
  assert.ok(panel.box.x >= 720 && panel.box.x <= 724);
  assert.ok(panel.box.y >= 536 && panel.box.y <= 540);
  assert.ok(panel.box.w >= 20 && panel.box.w <= 24);
  assert.ok(panel.box.h >= 50 && panel.box.h <= 54);
});

test("line text native components do not duplicate existing color panel text", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 92, y: 95, w: 92, h: 28 }, [0, 150, 136]);
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("a", 20, 20, 220), h("b", 20, 44, 220)],
    textBoxes: [
      {
        ...text("接 口 对 接", 92, 95, 92, 28),
        source: { detector: "line-text-native-color-panel-text" }
      },
      text("plain", 300, 101, 50, 13),
      text("other", 370, 101, 50, 13)
    ]
  });
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "line-text-native-color-panel").length, 0);
  assert.equal(result.textBoxes.filter((item) => item.source.detector === "line-text-native-color-panel-text").length, 0);
});

test("line text color panels preserve source-backed text geometry and font", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 92, y: 95, w: 92, h: 28 }, [0, 150, 136]);
  const original = { ...text("API label", 106, 101, 62, 13),
    font: { color: "#222222", sizePt: 9, align: "left", valign: "middle", weight: "regular" },
    source: { evidenceBox: { x: 106, y: 101, w: 62, h: 13 }, confidence: 0.95 } };
  const result = createLineTextNativeComponentObjects({
    slideSize: { widthPt: 960, heightPt: 540 }, image: raster,
    lines: [h("a", 20, 20, 220), h("b", 20, 44, 220)],
    textBoxes: [original, text("plain", 300, 101, 50, 13), text("other", 370, 101, 50, 13)]
  });
  assert.equal(result.shapes.filter(shape => shape.source.detector === "line-text-native-color-panel").length, 1);
  const label = result.textBoxes.find(item => item.id === original.id);
  assert.ok(label);
  assert.deepEqual(label.box, original.box);
  assert.deepEqual(label.font, original.font);
  assert.equal(label.source.preservedSourceTextGeometry, true);
});

test("line text native components reconstruct centered vertical stack bars from sampled pixels", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 374, y: 91, w: 212, h: 28 }, [39, 174, 96]);
  paintRect(raster, { x: 394, y: 133, w: 172, h: 28 }, [59, 130, 246]);
  paintRect(raster, { x: 414, y: 175, w: 132, h: 28 }, [245, 158, 11]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("Layer One", 434, 99, 92, 12),
      text("Layer Two", 434, 141, 92, 12),
      text("Layer Three", 428, 183, 104, 12)
    ]
  });
  const bars = result.filter((shape) => shape.source.detector === "line-text-native-stack-bar");
  assert.equal(bars.length, 3);
  assert.deepEqual(bars.map((shape) => shape.source.stackIndex), [0, 1, 2]);
  assert.ok(bars.every((shape) => shape.source.stackSize === 3));
  assert.ok(bars.every((shape) => shape.type === "roundRect" && shape.source.editable === true));
  assert.ok(bars[0].box.w > bars[2].box.w);
  for(const [index,expected] of [{x:374,y:91,w:212,h:28},{x:394,y:133,w:172,h:28},{x:414,y:175,w:132,h:28}].entries()){
    for(const key of ["x","y","w","h"])assert.ok(Math.abs(bars[index].box[key]-expected[key])<=2,`source ${key} must not be replaced by rank-based layout`);
  }
});

test("line text native components keep dense multi-layer stack bars despite adjacent color runs", () => {
  const raster = image(960, 720, [248, 250, 255]);
  paintRect(raster, { x: 380, y: 360, w: 190, h: 24 }, [31, 59, 139]);
  paintRect(raster, { x: 395, y: 392, w: 160, h: 24 }, [58, 111, 240]);
  paintRect(raster, { x: 410, y: 424, w: 130, h: 24 }, [122, 146, 232]);
  paintRect(raster, { x: 425, y: 456, w: 100, h: 24 }, [169, 188, 240]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("权威知识", 445, 366, 70, 12),
      text("企业记忆", 445, 398, 70, 12),
      text("岗位记忆", 445, 430, 70, 12),
      text("会话记忆", 445, 462, 70, 12)
    ]
  });
  const bars = result.filter((shape) => shape.source.detector === "line-text-native-stack-bar");
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map((shape) => shape.source.stackIndex), [0, 1, 2, 3]);
  assert.ok(bars.every((shape) => shape.box.w >= 90));
});

test("line text native components do not use secondary stack labels as duplicate bars", () => {
  const raster = image(960, 720, [248, 250, 255]);
  paintRect(raster, { x: 380, y: 360, w: 190, h: 30 }, [31, 59, 139]);
  paintRect(raster, { x: 395, y: 400, w: 160, h: 30 }, [58, 111, 240]);
  paintRect(raster, { x: 410, y: 440, w: 130, h: 30 }, [122, 146, 232]);
  paintRect(raster, { x: 425, y: 480, w: 100, h: 30 }, [169, 188, 240]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("权威知识", 445, 364, 42, 12),
      text("该信哪一份", 424, 376, 86, 10),
      text("企业记忆", 445, 404, 42, 12),
      text("组织产品制度", 424, 416, 86, 10),
      text("岗位记忆", 445, 444, 42, 12),
      text("岗位习惯口径", 424, 456, 86, 10),
      text("会话记忆", 445, 484, 42, 12),
      text("临时上下文", 424, 496, 86, 10)
    ]
  });
  const bars = result.filter((shape) => shape.source.detector === "line-text-native-stack-bar");
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map((shape) => shape.source.stackIndex), [0, 1, 2, 3]);
});

test("line text native components reconstruct text-aligned comparison matrix cells", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("左侧说明", 40, 88, 52, 12),
      text("维度", 704, 88, 34, 12),
      text("旧方案", 790, 88, 44, 12),
      text("新方案", 876, 88, 44, 12),
      text("远端描述", 40, 116, 52, 12),
      text("知识", 704, 116, 34, 12),
      text("分散", 790, 116, 34, 12),
      text("治理", 876, 116, 34, 12),
      text("其他内容", 40, 144, 52, 12),
      text("连接", 704, 144, 34, 12),
      text("手工", 790, 144, 34, 12),
      text("自动", 876, 144, 34, 12),
      text("段落文字", 40, 172, 52, 12),
      text("权限", 704, 172, 34, 12),
      text("粗放", 790, 172, 34, 12),
      text("精细", 876, 172, 34, 12),
      text("旁路说明", 40, 200, 52, 12),
      text("运行", 704, 200, 34, 12),
      text("单次", 790, 200, 34, 12),
      text("持续", 876, 200, 34, 12),
      text("备注信息", 40, 228, 52, 12),
      text("审计", 704, 228, 34, 12),
      text("缺失", 790, 228, 34, 12),
      text("留痕", 876, 228, 34, 12)
    ]
  });
  const cells = result.filter((shape) => shape.source.detector === "line-text-native-matrix-cell");
  assert.equal(cells.length, 18);
  assert.ok(cells.every((shape) => shape.source.nativeComponentRole === "table-cell"));
  assert.deepEqual([...new Set(cells.map((shape) => shape.source.columnIndex))], [0, 1, 2]);
});

test("line text matrix cells do not inherit dark text colors as borders", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: image(960, 720, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("动作能力", 705, 220, 44, 12), font: { color: "#1F2937" } },
      { ...text("只给文字", 790, 220, 50, 12), font: { color: "#E11D48" } },
      { ...text("查写建审", 875, 220, 50, 12), font: { color: "#16A34A" } },
      { ...text("过程可查", 705, 252, 44, 12), font: { color: "#1F2937" } },
      { ...text("没有记录", 790, 252, 50, 12), font: { color: "#E11D48" } },
      { ...text("全程留痕", 875, 252, 50, 12), font: { color: "#16A34A" } },
      { ...text("效果评估", 705, 284, 44, 12), font: { color: "#1F2937" } },
      { ...text("说不清楚", 790, 284, 50, 12), font: { color: "#E11D48" } },
      { ...text("有账本", 875, 284, 50, 12), font: { color: "#16A34A" } },
      { ...text("岗位复制", 705, 316, 44, 12), font: { color: "#1F2937" } },
      { ...text("一人一套", 790, 316, 50, 12), font: { color: "#E11D48" } },
      { ...text("按岗位复用", 875, 316, 58, 12), font: { color: "#16A34A" } },
      { ...text("运行效率", 705, 348, 44, 12), font: { color: "#1F2937" } },
      { ...text("不可复得", 790, 348, 50, 12), font: { color: "#E11D48" } },
      { ...text("持续运行", 875, 348, 50, 12), font: { color: "#16A34A" } }
    ]
  });
  const cells = result.filter((shape) => shape.source.detector === "line-text-native-matrix-cell");
  assert.ok(cells.length >= 6);
  assert.ok(cells.every((shape) => shape.style.stroke === "#D7DEE8"));
});

test("line text native components reconstruct multi-row text group containers from sampled background", () => {
  const raster = image(960, 540, [255, 255, 255]);
  paintRect(raster, { x: 704, y: 88, w: 210, h: 178 }, [45, 64, 118]);
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      { ...text("能力维度", 722, 108, 40, 12), font: { color: "#FFFFFF" } },
      { ...text("通用聊天 AI", 794, 108, 58, 12), font: { color: "#FFFFFF" } },
      { ...text("开沿 AI 员工", 862, 108, 58, 12), font: { color: "#FFFFFF" } },
      { ...text("懂企业", 722, 140, 38, 12), font: { color: "#DDE7FF" } },
      { ...text("靠上传靠猜", 794, 140, 58, 12), font: { color: "#DDE7FF" } },
      { ...text("权威源治理", 862, 140, 58, 12), font: { color: "#DDE7FF" } },
      { ...text("连系统", 722, 172, 38, 12), font: { color: "#DDE7FF" } },
      { ...text("基本没有", 794, 172, 45, 12), font: { color: "#DDE7FF" } },
      { ...text("逐项对接验收", 862, 172, 62, 12), font: { color: "#DDE7FF" } },
      { ...text("权限边界", 722, 204, 44, 12), font: { color: "#DDE7FF" } },
      { ...text("谁问都一样", 794, 204, 50, 12), font: { color: "#DDE7FF" } },
      { ...text("按岗位授权", 862, 204, 52, 12), font: { color: "#DDE7FF" } }
    ]
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-group-panel");
  assert.equal(panels.length, 1);
  assert.equal(panels[0].style.fill, "#2D4076");
  assert.equal(panels[0].style.opacity, 1);
  assert.ok(panels[0].box.x <= 710);
  assert.ok(panels[0].box.w >= 200);
  assert.equal(panels[0].source.rowCount, 4);
  assert.equal(panels[0].source.nativeComponentRole, "section-panel");
});

test("line text native components reject text group containers without distinct panel pixels", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes: [
      text("能力维度", 722, 108, 40, 12),
      text("通用聊天 AI", 794, 108, 58, 12),
      text("开沿 AI 员工", 862, 108, 58, 12),
      text("懂企业", 722, 140, 38, 12),
      text("靠上传靠猜", 794, 140, 58, 12),
      text("权威源治理", 862, 140, 58, 12),
      text("连系统", 722, 172, 38, 12),
      text("基本没有", 794, 172, 45, 12),
      text("逐项对接验收", 862, 172, 62, 12)
    ]
  });
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-group-panel").length, 0);
});

test("line text native components reconstruct tall side panels from dense text groups", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 704, y: 78, w: 214, h: 300 }, [248, 250, 255]);
  const textBoxes = [];
  for (let index = 0; index < 10; index += 1) {
    textBoxes.push({ ...text(`能力${index + 1}`, 724, 100 + index * 28, 38, 12), font: { color: "#475569" } });
    textBoxes.push({ ...text(`通用${index + 1}`, 794, 100 + index * 28, 38, 12), font: { color: "#64748B" } });
    textBoxes.push({ ...text(`开沿${index + 1}`, 862, 100 + index * 28, 38, 12), font: { color: "#334155" } });
  }
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-group-panel");
  assert.equal(panels.length, 1);
  assert.equal(panels[0].source.tallSidePanel, true);
  assert.equal(panels[0].style.fill, "#F8FAFF");
  assert.equal(panels[0].style.opacity, 0.86);
  assert.ok(panels[0].box.h > 250);
});

test("line text native components split tall side panels at later colored headers", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 704, y: 78, w: 214, h: 220 }, [248, 250, 255]);
  paintRect(raster, { x: 704, y: 330, w: 214, h: 230 }, [255, 249, 242]);
  const textBoxes = [
    { ...text("能力对照", 760, 92, 70, 12), font: { color: "#FFFFFF" } }
  ];
  for (let index = 0; index < 8; index += 1) {
    textBoxes.push({ ...text(`能力${index + 1}`, 724, 122 + index * 22, 38, 12), font: { color: "#475569" } });
    textBoxes.push({ ...text(`通用${index + 1}`, 794, 122 + index * 22, 38, 12), font: { color: "#64748B" } });
    textBoxes.push({ ...text(`开沿${index + 1}`, 862, 122 + index * 22, 38, 12), font: { color: "#334155" } });
  }
  textBoxes.push({ ...text("工具关系", 760, 332, 70, 12), font: { color: "#FFFFFF" } });
  for (let index = 0; index < 8; index += 1) {
    textBoxes.push({ ...text(`工具${index + 1}`, 724, 362 + index * 22, 44, 12), font: { color: "#475569" } });
    textBoxes.push({ ...text(`说明${index + 1}`, 794, 362 + index * 22, 44, 12), font: { color: "#64748B" } });
    textBoxes.push({ ...text(`状态${index + 1}`, 862, 362 + index * 22, 44, 12), font: { color: "#334155" } });
  }
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-group-panel");
  assert.equal(panels.length, 2);
  assert.ok(panels.every((shape) => shape.source.tallSidePanel === true));
  assert.ok(panels[0].box.y + panels[0].box.h < panels[1].box.y + 20);
});

test("line text native components reconstruct single-column dense side panels", () => {
  const raster = image(960, 720, [255, 255, 255]);
  paintRect(raster, { x: 704, y: 260, w: 214, h: 190 }, [244, 252, 248]);
  const textBoxes = [
    { ...text("为什么选择", 790, 278, 74, 16), font: { color: "#FFFFFF" } },
    text("工程上下文完整", 728, 314, 170, 11),
    text("云端持续运行", 728, 336, 132, 11),
    text("记录完整可审计", 728, 358, 140, 11),
    text("按岗位授权", 728, 380, 112, 11),
    text("模型按需切换", 728, 402, 126, 11),
    text("愿意做系统对接", 728, 424, 150, 11),
    text("服务商认证", 728, 446, 110, 11)
  ];
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 720 },
    image: raster,
    lines: [h("guide-a", 20, 20, 220), h("guide-b", 20, 44, 220)],
    textBoxes
  });
  const panels = result.filter((shape) => shape.source.detector === "line-text-native-group-panel");
  assert.equal(panels.length, 1);
  assert.equal(panels[0].source.tallSidePanel, true);
  assert.ok(panels[0].box.x >= 690);
  assert.ok(panels[0].box.h >= 150);
});

test("line text native components do not create color panels without a distinct sampled background", () => {
  const result = createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    image: image(960, 540, [255, 255, 255]),
    lines: [h("a", 20, 20, 220), h("b", 20, 44, 220)],
    textBoxes: [
      text("plain-a", 106, 101, 62, 13),
      text("plain-b", 300, 101, 50, 13),
      text("plain-c", 370, 101, 50, 13)
    ]
  });
  assert.equal(result.filter((shape) => shape.source.detector === "line-text-native-color-panel").length, 0);
});

test("line text native components reject sparse or ambiguous structural evidence", () => {
  assert.deepEqual(createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    lines: [h("only", 20, 90, 640), v("side", 20, 90, 200)],
    textBoxes: [text("single", 40, 120)]
  }), []);
  assert.deepEqual(createLineTextNativeComponents({
    slideSize: { widthPt: 960, heightPt: 540 },
    lines: [h("a", 20, 90, 120), h("b", 20, 110, 120), h("c", 20, 130, 120)],
    textBoxes: [text("a", 40, 96), text("b", 40, 116), text("c", 40, 136)]
  }), []);
});
