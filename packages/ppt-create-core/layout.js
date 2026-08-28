"use strict";

const { nativeChartPayload } = require("./data-models");
const { getLayout, selectLayoutCandidates } = require("./layout-registry");
const { validatePresentationSpec } = require("./spec");
const { getTheme } = require("./theme-registry");

const WIDTH = 960;
const HEIGHT = 540;

function box(x, y, w, h) { return Object.freeze({ x, y, w, h }); }
function source(evidenceBox) { return Object.freeze({ pageImage: "generated:ppt-create", visionProvider: "common-tools-layout-v2", confidence: 1, evidenceBox, editable: true }); }
function text(id, value, bounds, font, role = "body") { return Object.freeze({ id, role, text: value, box: bounds, font: Object.freeze(font), source: source(bounds) }); }
function shape(id, type, bounds, style) { return Object.freeze({ id, type, box: bounds, style: Object.freeze(style), source: source(bounds) }); }
function pageBase(slide, pageIndex, theme, plan) {
  return { pageIndex, sourceImage: "generated:ppt-create", background: { fill: theme.background }, textBoxes: [], shapes: [], images: [], tables: [], charts: [], icons: [], intent: { id: slide.id, role: slide.role, priority: slide.priority, layoutId: plan.selectedLayout, layoutFamily: plan.family, candidateLayoutIds: plan.candidates.map((candidate) => candidate.id) } };
}
function addHeader(page, slide, theme, pageIndex) {
  page.shapes.push(shape(`${slide.id}-header-rule`, "rect", box(56, 46, 44, 6), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(56, 66, 790, 52), { family: theme.font, sizePt: 35, weight: "bold", color: theme.text, align: "left" }, "title"));
  page.textBoxes.push(text(`${slide.id}-number`, String(pageIndex + 1).padStart(2, "0"), box(852, 58, 52, 28), { family: "Arial", sizePt: 16, weight: "bold", color: theme.muted, align: "right" }, "page-number"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(56, 124, 820, 42), { family: theme.font, sizePt: 18, color: theme.muted, align: "left" }, "summary"));
}
function addItemCopy(page, slide, item, bounds, theme, align = "left") {
  if (item.value) page.textBoxes.push(text(`${slide.id}-${item.id}-value`, item.value, box(bounds.x, bounds.y, bounds.w, 44), { family: theme.font, sizePt: 30, weight: "bold", color: theme.primary, align }, "value"));
  page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(bounds.x, bounds.y + (item.value ? 50 : 0), bounds.w, 34), { family: theme.font, sizePt: 24, weight: "bold", color: theme.text, align }, "item-title"));
  if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(bounds.x, bounds.y + (item.value ? 90 : 40), bounds.w, Math.max(34, bounds.h - (item.value ? 90 : 40))), { family: theme.font, sizePt: 16, color: theme.muted, align }, "item-detail"));
}

function coverSignal(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan);
  page.shapes.push(shape(`${slide.id}-rail`, "rect", box(0, 0, 18, HEIGHT), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.shapes.push(shape(`${slide.id}-panel`, "roundRect", box(590, 72, 280, 396), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 18 }));
  page.shapes.push(shape(`${slide.id}-signal-a`, "ellipse", box(642, 128, 150, 150), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0, opacity: 0.86 }));
  page.shapes.push(shape(`${slide.id}-signal-b`, "ellipse", box(692, 250, 108, 108), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0, opacity: 0.78 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(62, 142, 470, 174), { family: theme.font, sizePt: 50, weight: "bold", color: theme.text, align: "left" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(64, 346, 440, 86), { family: theme.font, sizePt: 20, color: theme.muted, align: "left" }, "summary"));
  return page;
}
function coverBand(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan);
  page.shapes.push(shape(`${slide.id}-band`, "rect", box(0, 176, WIDTH, 188), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0 }));
  page.shapes.push(shape(`${slide.id}-accent`, "rect", box(0, 364, WIDTH, 10), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(90, 206, 780, 78), { family: theme.font, sizePt: 50, weight: "bold", color: theme.inverse, align: "center" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(140, 292, 680, 48), { family: theme.font, sizePt: 20, color: theme.inverse, align: "center" }, "summary"));
  return page;
}
function sectionBand(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan);
  page.shapes.push(shape(`${slide.id}-band`, "rect", box(0, 0, WIDTH, 118), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-number`, String(index + 1).padStart(2, "0"), box(62, 52, 90, 56), { family: "Arial", sizePt: 26, weight: "bold", color: theme.inverse, align: "left" }, "section-number"));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(62, 184, 760, 88), { family: theme.font, sizePt: 42, weight: "bold", color: theme.text, align: "left" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(64, 292, 740, 70), { family: theme.font, sizePt: 20, color: theme.muted, align: "left" }, "summary"));
  slide.items.forEach((item, itemIndex) => page.textBoxes.push(text(`${slide.id}-${item.id}`, item.label, box(64 + itemIndex * 276, 418, 248, 46), { family: theme.font, sizePt: 18, weight: "bold", color: theme.accent, align: "left" }, "section-item")));
  return page;
}
function sectionIndex(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan);
  page.textBoxes.push(text(`${slide.id}-number`, String(index + 1).padStart(2, "0"), box(58, 100, 260, 180), { family: "Arial", sizePt: 92, weight: "bold", color: theme.primary, align: "left" }, "section-number"));
  page.shapes.push(shape(`${slide.id}-divider`, "rect", box(324, 92, 4, 340), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(378, 122, 500, 110), { family: theme.font, sizePt: 42, weight: "bold", color: theme.text, align: "left" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(380, 252, 480, 74), { family: theme.font, sizePt: 20, color: theme.muted, align: "left" }, "summary"));
  slide.items.forEach((item, itemIndex) => page.textBoxes.push(text(`${slide.id}-${item.id}`, item.label, box(380, 354 + itemIndex * 42, 470, 34), { family: theme.font, sizePt: 18, weight: "bold", color: theme.accent, align: "left" }, "section-item")));
  return page;
}
function contentCards(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index);
  const count = slide.items.length; const columns = count <= 3 ? count : 2; const rows = Math.ceil(count / columns);
  const gap = 18; const areaX = 56; const areaY = 190; const areaW = 848; const areaH = 292; const cardW = (areaW - gap * (columns - 1)) / columns; const cardH = (areaH - gap * (rows - 1)) / rows;
  slide.items.forEach((item, itemIndex) => {
    const column = itemIndex % columns; const row = Math.floor(itemIndex / columns); const x = areaX + column * (cardW + gap); const y = areaY + row * (cardH + gap);
    page.shapes.push(shape(`${slide.id}-${item.id}-card`, "roundRect", box(x, y, cardW, cardH), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 12 }));
    page.shapes.push(shape(`${slide.id}-${item.id}-accent`, "rect", box(x, y, 8, cardH), { fill: itemIndex % 2 ? theme.primary : theme.accent, stroke: "none", strokeWidthPt: 0 }));
    addItemCopy(page, slide, item, box(x + 28, y + 18, cardW - 50, cardH - 28), theme);
  });
  return page;
}
function contentEditorial(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index);
  page.shapes.push(shape(`${slide.id}-rail`, "rect", box(56, 194, 266, 286), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-takeaway`, slide.summary || slide.items[0].label, box(82, 228, 214, 190), { family: theme.font, sizePt: 24, weight: "bold", color: theme.inverse, align: "left" }, "takeaway"));
  const columns = slide.items.length > 3 ? 2 : 1; const rows = Math.ceil(slide.items.length / columns); const x0 = 364; const totalW = 540; const gap = 20; const columnW = (totalW - gap * (columns - 1)) / columns; const rowH = 280 / rows;
  slide.items.forEach((item, itemIndex) => {
    const column = itemIndex % columns; const row = Math.floor(itemIndex / columns); const x = x0 + column * (columnW + gap); const y = 198 + row * rowH;
    page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x, y, columnW, 32), { family: theme.font, sizePt: 24, weight: "bold", color: theme.text, align: "left" }, "item-title"));
    if (item.value) page.textBoxes.push(text(`${slide.id}-${item.id}-value`, item.value, box(x, y + 36, columnW, 34), { family: theme.font, sizePt: 26, weight: "bold", color: theme.accent, align: "left" }, "value"));
    if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x, y + (item.value ? 76 : 40), columnW, Math.max(34, rowH - (item.value ? 84 : 48))), { family: theme.font, sizePt: 16, color: theme.muted, align: "left" }, "item-detail"));
  });
  return page;
}
function metricsRow(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); const gap = 18; const itemW = (848 - gap * (slide.items.length - 1)) / slide.items.length;
  slide.items.forEach((item, itemIndex) => { const x = 56 + itemIndex * (itemW + gap); page.shapes.push(shape(`${slide.id}-${item.id}-metric`, "roundRect", box(x, 205, itemW, 240), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 14 })); addItemCopy(page, slide, item, box(x + 22, 246, itemW - 44, 166), theme, "center"); });
  return page;
}
function metricsFocus(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); const [focus, ...others] = slide.items;
  page.shapes.push(shape(`${slide.id}-${focus.id}-focus`, "roundRect", box(56, 198, 404, 280), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0, radiusPt: 16 }));
  page.textBoxes.push(text(`${slide.id}-${focus.id}-value`, focus.value || focus.label, box(88, 246, 340, 74), { family: theme.font, sizePt: 44, weight: "bold", color: theme.inverse, align: "left" }, "value"));
  page.textBoxes.push(text(`${slide.id}-${focus.id}-label`, focus.label, box(88, 330, 340, 44), { family: theme.font, sizePt: 24, weight: "bold", color: theme.inverse, align: "left" }, "item-title"));
  if (focus.detail) page.textBoxes.push(text(`${slide.id}-${focus.id}-detail`, focus.detail, box(88, 386, 340, 56), { family: theme.font, sizePt: 16, color: theme.inverse, align: "left" }, "item-detail"));
  const rowH = 260 / Math.max(1, others.length); others.forEach((item, itemIndex) => addItemCopy(page, slide, item, box(512, 204 + itemIndex * rowH, 372, rowH - 8), theme));
  return page;
}
function comparisonSplit(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index);
  slide.items.forEach((item, itemIndex) => { const x = itemIndex === 0 ? 56 : 490; page.shapes.push(shape(`${slide.id}-${item.id}-panel`, "roundRect", box(x, 204, 414, 264), { fill: theme.surface, stroke: itemIndex ? theme.primary : theme.accent, strokeWidthPt: 2, radiusPt: 14 })); addItemCopy(page, slide, item, box(x + 32, 244, 350, 190), theme); });
  return page;
}
function comparisonAxis(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); page.shapes.push(shape(`${slide.id}-axis`, "rect", box(477, 194, 6, 286), { fill: theme.line, stroke: theme.line, strokeWidthPt: 0 }));
  slide.items.forEach((item, itemIndex) => { const x = itemIndex === 0 ? 70 : 530; const y = itemIndex === 0 ? 214 : 278; page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x, y, 350, 48), { family: theme.font, sizePt: 28, weight: "bold", color: itemIndex ? theme.primary : theme.accent, align: "left" }, "item-title")); if (item.value) page.textBoxes.push(text(`${slide.id}-${item.id}-value`, item.value, box(x, y + 58, 350, 54), { family: theme.font, sizePt: 36, weight: "bold", color: theme.text, align: "left" }, "value")); if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x, y + (item.value ? 122 : 60), 350, 92), { family: theme.font, sizePt: 16, color: theme.muted, align: "left" }, "item-detail")); });
  return page;
}
function processLinear(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); const count = slide.items.length; const gap = 12; const startX = 56; const totalW = 848; const itemW = (totalW - gap * (count - 1)) / count;
  page.shapes.push(shape(`${slide.id}-flow-line`, "rect", box(startX + itemW / 2, 286, totalW - itemW, 5), { fill: theme.line, stroke: theme.line, strokeWidthPt: 0 }));
  slide.items.forEach((item, itemIndex) => { const x = startX + itemIndex * (itemW + gap); page.shapes.push(shape(`${slide.id}-${item.id}-node`, "ellipse", box(x + itemW / 2 - 18, 269, 36, 36), { fill: itemIndex % 2 ? theme.primary : theme.accent, stroke: theme.background, strokeWidthPt: 3 })); page.textBoxes.push(text(`${slide.id}-${item.id}-step`, String(itemIndex + 1).padStart(2, "0"), box(x, 212, itemW, 34), { family: "Arial", sizePt: 16, weight: "bold", color: theme.accent, align: "center" }, "step-number")); page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x, 322, itemW, 54), { family: theme.font, sizePt: 20, weight: "bold", color: theme.text, align: "center" }, "item-title")); if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x, 386, itemW, 76), { family: theme.font, sizePt: 16, color: theme.muted, align: "center" }, "item-detail")); });
  return page;
}
function processStages(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); const gap = 10; const itemW = (848 - gap * (slide.items.length - 1)) / slide.items.length;
  slide.items.forEach((item, itemIndex) => { const x = 56 + itemIndex * (itemW + gap); const y = 208 + (itemIndex % 2) * 54; page.shapes.push(shape(`${slide.id}-${item.id}-stage`, "roundRect", box(x, y, itemW, 198), { fill: itemIndex % 2 ? theme.surface : theme.primary, stroke: theme.line, strokeWidthPt: 1, radiusPt: 12 })); page.textBoxes.push(text(`${slide.id}-${item.id}-step`, String(itemIndex + 1).padStart(2, "0"), box(x + 18, y + 18, itemW - 36, 30), { family: "Arial", sizePt: 16, weight: "bold", color: itemIndex % 2 ? theme.accent : theme.inverse, align: "left" }, "step-number")); page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x + 18, y + 58, itemW - 36, 52), { family: theme.font, sizePt: 20, weight: "bold", color: itemIndex % 2 ? theme.text : theme.inverse, align: "left" }, "item-title")); if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x + 18, y + 118, itemW - 36, 62), { family: theme.font, sizePt: 16, color: itemIndex % 2 ? theme.muted : theme.inverse, align: "left" }, "item-detail")); });
  return page;
}
function closingCentered(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); page.shapes.push(shape(`${slide.id}-top`, "rect", box(0, 0, WIDTH, 14), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 })); page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(120, 148, 720, 94), { family: theme.font, sizePt: 42, weight: "bold", color: theme.text, align: "center" }, "title")); if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(170, 270, 620, 74), { family: theme.font, sizePt: 20, color: theme.muted, align: "center" }, "summary")); slide.items.forEach((item, itemIndex) => page.textBoxes.push(text(`${slide.id}-${item.id}`, item.label, box(150 + itemIndex * 220, 398, 210, 44), { family: theme.font, sizePt: 18, weight: "bold", color: theme.accent, align: "center" }, "closing-item"))); return page;
}
function closingActions(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); page.shapes.push(shape(`${slide.id}-panel`, "rect", box(0, 0, 344, HEIGHT), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0 })); page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(56, 110, 250, 166), { family: theme.font, sizePt: 42, weight: "bold", color: theme.inverse, align: "left" }, "title")); if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(56, 304, 250, 100), { family: theme.font, sizePt: 18, color: theme.inverse, align: "left" }, "summary")); const rowH = 320 / Math.max(1, slide.items.length); slide.items.forEach((item, itemIndex) => addItemCopy(page, slide, item, box(408, 110 + itemIndex * rowH, 450, rowH - 18), theme)); return page;
}

function mediaFrame(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index);
  page.shapes.push(shape(`${slide.id}-media-slot`, "roundRect", box(500, 194, 390, 270), { fill: theme.surface, stroke: theme.primary, strokeWidthPt: 2, radiusPt: 16, dash: "dash" }));
  page.shapes.push(shape(`${slide.id}-media-mark`, visual.mediaType === "icon" ? "ellipse" : "rect", box(650, 256, 90, 70), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0, opacity: 0.18 }));
  page.textBoxes.push(text(`${slide.id}-media-alt`, visual.alt, box(548, 344, 294, 62), { family: theme.font, sizePt: 16, weight: "bold", color: theme.muted, align: "center" }, "media-alt"));
  slide.items.slice(0, 4).forEach((item, itemIndex) => addItemCopy(page, slide, item, box(58, 206 + itemIndex * 70, 380, 64), theme));
  return page;
}
function mediaCaption(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index);
  page.shapes.push(shape(`${slide.id}-media-stage`, "roundRect", box(56, 188, 848, 226), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 14 }));
  page.shapes.push(shape(`${slide.id}-media-accent`, "rect", box(56, 188, 12, 226), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-media-alt`, visual.alt, box(110, 254, 740, 70), { family: theme.font, sizePt: 20, weight: "bold", color: theme.muted, align: "center" }, "media-alt"));
  page.textBoxes.push(text(`${slide.id}-media-caption`, visual.caption || `${visual.mediaType} · ${visual.fit}`, box(96, 438, 768, 34), { family: theme.font, sizePt: 16, color: theme.muted, align: "center" }, "media-caption"));
  return page;
}
function tableIr(slide, bounds, theme, compact) {
  const visual = slide.visual; const rows = [visual.headers, ...visual.rows];
  return Object.freeze({ id: `${slide.id}-table`, type: "table", box: bounds, rows, style: Object.freeze({ fill: theme.surface, headerFill: theme.primary, textColor: theme.text, headerTextColor: theme.inverse, stroke: theme.line, strokeWidthPt: 0.6, fontFamily: theme.font, fontSizePt: compact ? 13 : 14, headerFontSizePt: compact ? 14 : 16, headerWeight: "bold", textValign: "middle", paddingLeftPt: 7, paddingRightPt: 7 }), source: source(bounds) });
}
function tableFocus(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); page.tables.push(tableIr(slide, box(56, 190, 848, 282), theme, false)); return page;
}
function tableCompact(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index); page.tables.push(tableIr(slide, box(56, 196, 610, 270), theme, true));
  page.shapes.push(shape(`${slide.id}-insight-panel`, "roundRect", box(696, 196, 208, 270), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0, radiusPt: 14 }));
  page.textBoxes.push(text(`${slide.id}-insight`, visual.insight || slide.items[0].label, box(724, 238, 152, 178), { family: theme.font, sizePt: 20, weight: "bold", color: theme.inverse, align: "left" }, "insight")); return page;
}
function chartIr(slide, bounds, theme) {
  const visual = slide.visual; const style = Object.freeze({ fill: theme.surface, stroke: theme.line, barFill: theme.primary, accent: theme.accent, axisColor: theme.muted, textColor: theme.text, fontFamily: theme.font, fontSizePt: 12 });
  return Object.freeze({ id: `${slide.id}-chart`, type: visual.type, box: bounds, style, categories: visual.categories, series: visual.series, nativePayload: nativeChartPayload(visual, style), source: source(bounds) });
}
function chartFocus(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); addHeader(page, slide, theme, index); page.charts.push(chartIr(slide, box(56, 188, 848, 292), theme)); return page;
}
function chartInsight(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index); page.charts.push(chartIr(slide, box(56, 198, 610, 270), theme));
  page.shapes.push(shape(`${slide.id}-insight-panel`, "roundRect", box(700, 198, 204, 270), { fill: theme.surface, stroke: theme.accent, strokeWidthPt: 2, radiusPt: 14 }));
  page.textBoxes.push(text(`${slide.id}-insight`, visual.insight || slide.items[0].label, box(726, 232, 152, 196), { family: theme.font, sizePt: 20, weight: "bold", color: theme.text, align: "left" }, "insight")); return page;
}
function analysisCanvas(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index); const columns = visual.model === "swot" || visual.model === "quadrant" ? 2 : Math.min(4, visual.entries.length); const rows = Math.ceil(visual.entries.length / columns); const gap = 12; const cellW = (848 - gap * (columns - 1)) / columns; const cellH = (278 - gap * (rows - 1)) / rows;
  visual.entries.forEach((entry, entryIndex) => { const x = 56 + (entryIndex % columns) * (cellW + gap); const y = 194 + Math.floor(entryIndex / columns) * (cellH + gap); page.shapes.push(shape(`${slide.id}-${entry.id}-analysis`, "roundRect", box(x, y, cellW, cellH), { fill: entryIndex % 2 ? theme.surface : theme.primary, stroke: theme.line, strokeWidthPt: 1, radiusPt: 12 })); page.textBoxes.push(text(`${slide.id}-${entry.id}-label`, entry.label, box(x + 18, y + 18, cellW - 36, 34), { family: theme.font, sizePt: 20, weight: "bold", color: entryIndex % 2 ? theme.text : theme.inverse, align: "left" }, "analysis-label")); if (entry.detail) page.textBoxes.push(text(`${slide.id}-${entry.id}-detail`, entry.detail, box(x + 18, y + 58, cellW - 36, Math.max(34, cellH - 74)), { family: theme.font, sizePt: 16, color: entryIndex % 2 ? theme.muted : theme.inverse, align: "left" }, "analysis-detail")); }); return page;
}
function analysisSteps(slide, index, theme, plan) {
  const page = pageBase(slide, index, theme, plan); const visual = slide.visual; addHeader(page, slide, theme, index); const rowH = 280 / visual.entries.length;
  page.shapes.push(shape(`${slide.id}-analysis-rail`, "rect", box(94, 196, 5, 272), { fill: theme.line, stroke: theme.line, strokeWidthPt: 0 }));
  visual.entries.forEach((entry, entryIndex) => { const y = 192 + entryIndex * rowH; page.shapes.push(shape(`${slide.id}-${entry.id}-node`, "ellipse", box(79, y + 10, 34, 34), { fill: entryIndex % 2 ? theme.primary : theme.accent, stroke: theme.background, strokeWidthPt: 3 })); page.textBoxes.push(text(`${slide.id}-${entry.id}-label`, entry.label, box(138, y + 4, 260, 36), { family: theme.font, sizePt: 20, weight: "bold", color: theme.text, align: "left" }, "analysis-label")); if (entry.detail) page.textBoxes.push(text(`${slide.id}-${entry.id}-detail`, entry.detail, box(418, y + 4, 430, 42), { family: theme.font, sizePt: 16, color: theme.muted, align: "left" }, "analysis-detail")); }); return page;
}

const RENDERERS = Object.freeze({ "cover-signal-v1": coverSignal, "cover-band-v1": coverBand, "section-band-v1": sectionBand, "section-index-v1": sectionIndex, "content-cards-v1": contentCards, "content-editorial-v1": contentEditorial, "metrics-row-v1": metricsRow, "metrics-focus-v1": metricsFocus, "comparison-split-v1": comparisonSplit, "comparison-axis-v1": comparisonAxis, "process-linear-v1": processLinear, "process-stages-v1": processStages, "closing-centered-v1": closingCentered, "closing-actions-v1": closingActions, "media-frame-v1": mediaFrame, "media-caption-v1": mediaCaption, "table-focus-v1": tableFocus, "table-compact-v1": tableCompact, "chart-focus-v1": chartFocus, "chart-insight-v1": chartInsight, "analysis-canvas-v1": analysisCanvas, "analysis-steps-v1": analysisSteps });

function createLayoutPlanFromSpec(spec) {
  let previousSilhouette;
  const pages = spec.slides.map((slide) => { const candidates = selectLayoutCandidates(slide, { seed: spec.seed, variantCount: spec.variantCount, previousSilhouette }); const selected = candidates[0]; previousSilhouette = selected.silhouette; return Object.freeze({ slideId: slide.id, selectedLayout: selected.id, family: selected.family, silhouette: selected.silhouette, candidates: Object.freeze(candidates.map((candidate) => Object.freeze({ id: candidate.id, family: candidate.family, silhouette: candidate.silhouette }))) }); });
  return Object.freeze({ version: "1.0", seed: spec.seed, variantCount: spec.variantCount, pages: Object.freeze(pages) });
}
function createLayoutPlan(rawSpec) { return createLayoutPlanFromSpec(validatePresentationSpec(rawSpec)); }
function createDeckIr(rawSpec) {
  const spec = validatePresentationSpec(rawSpec); const theme = getTheme(spec.theme); const plan = createLayoutPlanFromSpec(spec);
  const pages = spec.slides.map((slide, index) => { const pagePlan = plan.pages[index]; const renderer = RENDERERS[pagePlan.selectedLayout]; if (typeof renderer !== "function") throw new Error("presentation layout renderer is unavailable"); getLayout(pagePlan.selectedLayout); return Object.freeze(renderer(slide, index, theme, pagePlan)); });
  return Object.freeze({ version: "1.0", slideSize: Object.freeze({ widthPt: WIDTH, heightPt: HEIGHT }), pages: Object.freeze(pages) });
}

module.exports = { HEIGHT, RENDERERS, WIDTH, createDeckIr, createLayoutPlan };
