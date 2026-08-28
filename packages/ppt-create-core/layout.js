"use strict";

const { validatePresentationSpec } = require("./spec");

const WIDTH = 960;
const HEIGHT = 540;
const THEMES = Object.freeze({
  "clean-light-v1": Object.freeze({ background: "#F7F9FC", surface: "#FFFFFF", primary: "#175CD3", accent: "#0E9384", text: "#101828", muted: "#475467", line: "#D0D5DD", inverse: "#FFFFFF", font: "Microsoft YaHei" }),
  "executive-dark-v1": Object.freeze({ background: "#101828", surface: "#1D2939", primary: "#84ADFF", accent: "#5FE9D0", text: "#F9FAFB", muted: "#D0D5DD", line: "#344054", inverse: "#101828", font: "Microsoft YaHei" })
});

function box(x, y, w, h) { return Object.freeze({ x, y, w, h }); }
function source(evidenceBox) { return Object.freeze({ pageImage: "generated:ppt-create", visionProvider: "common-tools-layout-v1", confidence: 1, evidenceBox, editable: true }); }
function text(id, value, bounds, font, role = "body") { return Object.freeze({ id, role, text: value, box: bounds, font: Object.freeze(font), source: source(bounds) }); }
function shape(id, type, bounds, style) { return Object.freeze({ id, type, box: bounds, style: Object.freeze(style), source: source(bounds) }); }
function titleSize(value, normal = 32) { return value.length > 48 ? normal - 6 : value.length > 28 ? normal - 3 : normal; }
function pageBase(slide, pageIndex, theme) {
  return { pageIndex, sourceImage: "generated:ppt-create", background: { fill: theme.background }, textBoxes: [], shapes: [], images: [], tables: [], charts: [], icons: [], intent: { id: slide.id, role: slide.role } };
}
function addHeader(page, slide, theme, pageIndex) {
  page.shapes.push(shape(`${slide.id}-header-rule`, "rect", box(56, 46, 44, 6), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(56, 66, 780, 52), { family: theme.font, sizePt: titleSize(slide.title), weight: "bold", color: theme.text, align: "left" }, "title"));
  page.textBoxes.push(text(`${slide.id}-number`, String(pageIndex + 1).padStart(2, "0"), box(852, 58, 52, 28), { family: "Arial", sizePt: 14, weight: "bold", color: theme.muted, align: "right" }, "page-number"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(56, 122, 820, 42), { family: theme.font, sizePt: slide.summary.length > 100 ? 15 : 18, color: theme.muted, align: "left" }, "summary"));
}
function coverPage(slide, index, theme) {
  const page = pageBase(slide, index, theme);
  page.shapes.push(shape(`${slide.id}-rail`, "rect", box(0, 0, 18, HEIGHT), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.shapes.push(shape(`${slide.id}-panel`, "roundRect", box(570, 70, 300, 400), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 18 }));
  page.shapes.push(shape(`${slide.id}-signal-a`, "ellipse", box(640, 130, 150, 150), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0, opacity: 0.86 }));
  page.shapes.push(shape(`${slide.id}-signal-b`, "ellipse", box(690, 245, 110, 110), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0, opacity: 0.78 }));
  page.textBoxes.push(text(`${slide.id}-eyebrow`, "COMMON TOOLS · PPT CREATE", box(62, 86, 430, 28), { family: "Arial", sizePt: 13, weight: "bold", color: theme.accent, align: "left" }, "eyebrow"));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(62, 150, 455, 170), { family: theme.font, sizePt: titleSize(slide.title, 44), weight: "bold", color: theme.text, align: "left" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(64, 342, 420, 82), { family: theme.font, sizePt: 19, color: theme.muted, align: "left" }, "summary"));
  return page;
}
function sectionPage(slide, index, theme) {
  const page = pageBase(slide, index, theme);
  page.shapes.push(shape(`${slide.id}-band`, "rect", box(0, 0, WIDTH, 118), { fill: theme.primary, stroke: theme.primary, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-number`, String(index + 1).padStart(2, "0"), box(62, 55, 90, 56), { family: "Arial", sizePt: 26, weight: "bold", color: theme.inverse, align: "left" }, "section-number"));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(62, 185, 720, 100), { family: theme.font, sizePt: titleSize(slide.title, 42), weight: "bold", color: theme.text, align: "left" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(64, 300, 700, 70), { family: theme.font, sizePt: 20, color: theme.muted, align: "left" }, "summary"));
  slide.items.forEach((item, itemIndex) => page.textBoxes.push(text(`${slide.id}-${item.id}`, item.label, box(64 + itemIndex * 250, 418, 220, 46), { family: theme.font, sizePt: 16, weight: "bold", color: theme.accent, align: "left" }, "section-item")));
  return page;
}
function cardPage(slide, index, theme, mode) {
  const page = pageBase(slide, index, theme); addHeader(page, slide, theme, index);
  const count = slide.items.length;
  const columns = mode === "comparison" ? 2 : count <= 3 ? count : 2;
  const rows = Math.ceil(count / columns);
  const gap = 18; const areaX = 56; const areaY = 190; const areaW = 848; const areaH = 292;
  const cardW = (areaW - gap * (columns - 1)) / columns; const cardH = (areaH - gap * (rows - 1)) / rows;
  slide.items.forEach((item, itemIndex) => {
    const column = itemIndex % columns; const row = Math.floor(itemIndex / columns);
    const x = areaX + column * (cardW + gap); const y = areaY + row * (cardH + gap);
    page.shapes.push(shape(`${slide.id}-${item.id}-card`, "roundRect", box(x, y, cardW, cardH), { fill: theme.surface, stroke: theme.line, strokeWidthPt: 1, radiusPt: 12 }));
    page.shapes.push(shape(`${slide.id}-${item.id}-accent`, "rect", box(x, y, 8, cardH), { fill: itemIndex % 2 ? theme.primary : theme.accent, stroke: "none", strokeWidthPt: 0 }));
    if (item.value) page.textBoxes.push(text(`${slide.id}-${item.id}-value`, item.value, box(x + 28, y + 20, cardW - 48, Math.min(58, cardH * 0.34)), { family: theme.font, sizePt: item.value.length > 12 ? 23 : 31, weight: "bold", color: theme.primary, align: "left" }, "value"));
    page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x + 28, y + (item.value ? 78 : 28), cardW - 48, 38), { family: theme.font, sizePt: item.label.length > 30 ? 15 : 18, weight: "bold", color: theme.text, align: "left" }, "item-title"));
    if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x + 28, y + (item.value ? 118 : 76), cardW - 48, Math.max(42, cardH - (item.value ? 138 : 96))), { family: theme.font, sizePt: item.detail.length > 100 ? 13 : 15, color: theme.muted, align: "left" }, "item-detail"));
  });
  return page;
}
function processPage(slide, index, theme) {
  const page = pageBase(slide, index, theme); addHeader(page, slide, theme, index);
  const count = slide.items.length; const gap = 12; const startX = 56; const totalW = 848; const cardW = (totalW - gap * (count - 1)) / count;
  page.shapes.push(shape(`${slide.id}-flow-line`, "rect", box(startX + cardW / 2, 286, totalW - cardW, 5), { fill: theme.line, stroke: theme.line, strokeWidthPt: 0 }));
  slide.items.forEach((item, itemIndex) => {
    const x = startX + itemIndex * (cardW + gap);
    page.shapes.push(shape(`${slide.id}-${item.id}-node`, "ellipse", box(x + cardW / 2 - 18, 269, 36, 36), { fill: itemIndex % 2 ? theme.primary : theme.accent, stroke: theme.background, strokeWidthPt: 3 }));
    page.textBoxes.push(text(`${slide.id}-${item.id}-step`, String(itemIndex + 1).padStart(2, "0"), box(x, 205, cardW, 34), { family: "Arial", sizePt: 14, weight: "bold", color: theme.accent, align: "center" }, "step-number"));
    page.textBoxes.push(text(`${slide.id}-${item.id}-label`, item.label, box(x, 320, cardW, 54), { family: theme.font, sizePt: item.label.length > 16 ? 14 : 17, weight: "bold", color: theme.text, align: "center" }, "item-title"));
    if (item.detail) page.textBoxes.push(text(`${slide.id}-${item.id}-detail`, item.detail, box(x, 380, cardW, 76), { family: theme.font, sizePt: item.detail.length > 70 ? 12 : 14, color: theme.muted, align: "center" }, "item-detail"));
  });
  return page;
}
function closingPage(slide, index, theme) {
  const page = pageBase(slide, index, theme);
  page.shapes.push(shape(`${slide.id}-top`, "rect", box(0, 0, WIDTH, 14), { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 }));
  page.textBoxes.push(text(`${slide.id}-title`, slide.title, box(120, 155, 720, 90), { family: theme.font, sizePt: titleSize(slide.title, 42), weight: "bold", color: theme.text, align: "center" }, "title"));
  if (slide.summary) page.textBoxes.push(text(`${slide.id}-summary`, slide.summary, box(170, 270, 620, 74), { family: theme.font, sizePt: 20, color: theme.muted, align: "center" }, "summary"));
  slide.items.forEach((item, itemIndex) => page.textBoxes.push(text(`${slide.id}-${item.id}`, item.label, box(170 + itemIndex * 210, 395, 200, 44), { family: theme.font, sizePt: 16, weight: "bold", color: theme.accent, align: "center" }, "closing-item")));
  return page;
}
function createPage(slide, index, theme) {
  if (slide.role === "cover") return coverPage(slide, index, theme);
  if (slide.role === "section") return sectionPage(slide, index, theme);
  if (slide.role === "process") return processPage(slide, index, theme);
  if (slide.role === "closing") return closingPage(slide, index, theme);
  return cardPage(slide, index, theme, slide.role);
}
function createDeckIr(rawSpec) {
  const spec = validatePresentationSpec(rawSpec); const theme = THEMES[spec.theme];
  return Object.freeze({ version: "1.0", slideSize: Object.freeze({ widthPt: WIDTH, heightPt: HEIGHT }), pages: Object.freeze(spec.slides.map((slide, index) => Object.freeze(createPage(slide, index, theme)))) });
}

module.exports = { HEIGHT, THEMES, WIDTH, createDeckIr };
