"use strict";

const { compileSvgToPageIr } = require("../slideclone-core/svg/svg-to-deck-ir");
const { getTheme } = require("./theme-registry");
const { WIDTH, HEIGHT } = require("./layout");

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function embedSvgIntoSlidePage(page, svgSource, slotBox = { x: 56, y: 188, w: 848, h: 292 }, options = {}) {
  if (!page || typeof page !== "object" || !Array.isArray(page.shapes) || !Array.isArray(page.textBoxes)) {
    throw new TypeError("target slide page must be a valid Deck IR page object");
  }
  if (
    !slotBox ||
    typeof slotBox.x !== "number" ||
    typeof slotBox.y !== "number" ||
    typeof slotBox.w !== "number" ||
    typeof slotBox.h !== "number" ||
    slotBox.w <= 0 ||
    slotBox.h <= 0
  ) {
    throw new TypeError("slotBox must have positive width and height");
  }
  const idPrefix = typeof options.idPrefix === "string" && options.idPrefix.trim()
    ? options.idPrefix.trim()
    : page.intent?.id || `page-${(page.pageIndex || 0) + 1}`;
  const compiled = compileSvgToPageIr(svgSource, {
    pageIndex: page.pageIndex || 0,
    slideSize: { widthPt: slotBox.w, heightPt: slotBox.h }
  });

  const existingIds = new Set([
    ...page.shapes.map((s) => s.id),
    ...page.textBoxes.map((t) => t.id),
    ...(page.images || []).map((i) => i.id),
    ...(page.tables || []).map((t) => t.id),
    ...(page.charts || []).map((c) => c.id)
  ]);

  const remapId = (rawId) => {
    let candidate = `${idPrefix}-svg-${rawId}`;
    let suffix = 1;
    while (existingIds.has(candidate)) {
      suffix += 1;
      candidate = `${idPrefix}-svg-${rawId}-${suffix}`;
    }
    existingIds.add(candidate);
    return candidate;
  };

  for (const shape of compiled.page.shapes) {
    const id = remapId(shape.id);
    const groupId = shape.source?.nativeComponentGroupId
      ? `${idPrefix}-svg-${shape.source.nativeComponentGroupId}`
      : undefined;
    page.shapes.push({
      ...shape,
      id,
      box: {
        x: round3(slotBox.x + shape.box.x),
        y: round3(slotBox.y + shape.box.y),
        w: round3(shape.box.w),
        h: round3(shape.box.h)
      },
      source: {
        ...shape.source,
        visionProvider: "common-tools-svg-fusion-v1",
        confidence: 1,
        editable: true,
        ...(groupId ? { nativeComponentGroupId: groupId } : {})
      }
    });
  }

  for (const textBox of compiled.page.textBoxes) {
    const id = remapId(textBox.id);
    const groupId = textBox.source?.nativeComponentGroupId
      ? `${idPrefix}-svg-${textBox.source.nativeComponentGroupId}`
      : undefined;
    page.textBoxes.push({
      ...textBox,
      id,
      box: {
        x: round3(slotBox.x + textBox.box.x),
        y: round3(slotBox.y + textBox.box.y),
        w: round3(textBox.box.w),
        h: round3(textBox.box.h)
      },
      source: {
        ...textBox.source,
        visionProvider: "common-tools-svg-fusion-v1",
        confidence: 1,
        editable: true,
        ...(groupId ? { nativeComponentGroupId: groupId } : {})
      }
    });
  }

  return page;
}

function createDeckIrFromSvgSlides(spec = {}) {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.slides) || spec.slides.length < 1 || spec.slides.length > 20) {
    throw new TypeError("SVG presentation spec must contain 1 to 20 slides");
  }
  const theme = getTheme(spec.theme || "technical-blue-v1");
  const pages = spec.slides.map((slide, index) => {
    if (!slide || typeof slide !== "object" || typeof slide.svg !== "string" || !slide.svg.trim()) {
      throw new TypeError(`slide ${index + 1} requires a non-empty svg string`);
    }
    const slideId = typeof slide.id === "string" && slide.id.trim() ? slide.id.trim() : `slide-${index + 1}`;
    const fullCanvas = slide.mode === "full-canvas" || !slide.title;
    if (fullCanvas) {
      const compiled = compileSvgToPageIr(slide.svg, {
        pageIndex: index,
        slideSize: { widthPt: WIDTH, heightPt: HEIGHT }
      });
      return {
        ...compiled.page,
        ...(slide.speakerNotes ? { speakerNotes: String(slide.speakerNotes) } : {}),
        intent: {
          id: slideId,
          role: index === 0 ? "cover" : index === spec.slides.length - 1 ? "closing" : "content",
          priority: "narrative",
          layoutId: "svg-canvas-v1",
          layoutFamily: "svg",
          candidateLayoutIds: ["svg-canvas-v1"]
        }
      };
    }

    const page = {
      pageIndex: index,
      background: { fill: theme.background },
      shapes: [
        {
          id: `${slideId}-header-rule`,
          type: "rect",
          box: { x: 56, y: 46, w: 44, h: 6 },
          style: { fill: theme.accent, stroke: theme.accent, strokeWidthPt: 0 },
          source: { visionProvider: "common-tools-svg-fusion-v1", confidence: 1, editable: true }
        }
      ],
      textBoxes: [
        {
          id: `${slideId}-title`,
          role: "title",
          text: String(slide.title),
          box: { x: 56, y: 66, w: 790, h: 52 },
          font: { family: theme.font, sizePt: 35, weight: "bold", color: theme.text, align: "left" },
          source: { visionProvider: "common-tools-svg-fusion-v1", confidence: 1, editable: true }
        },
        {
          id: `${slideId}-number`,
          role: "page-number",
          text: String(index + 1).padStart(2, "0"),
          box: { x: 852, y: 58, w: 52, h: 28 },
          font: { family: "Arial", sizePt: 16, weight: "bold", color: theme.muted, align: "right" },
          source: { visionProvider: "common-tools-svg-fusion-v1", confidence: 1, editable: true }
        }
      ],
      images: [],
      tables: [],
      charts: [],
      icons: [],
      ...(slide.speakerNotes ? { speakerNotes: String(slide.speakerNotes) } : {}),
      intent: {
        id: slideId,
        role: "content",
        priority: "narrative",
        layoutId: "svg-stage-v1",
        layoutFamily: "svg",
        candidateLayoutIds: ["svg-stage-v1"]
      }
    };
    if (slide.summary) {
      page.textBoxes.push({
        id: `${slideId}-summary`,
        role: "summary",
        text: String(slide.summary),
        box: { x: 56, y: 124, w: 820, h: 42 },
        font: { family: theme.font, sizePt: 18, color: theme.muted, align: "left" },
        source: { visionProvider: "common-tools-svg-fusion-v1", confidence: 1, editable: true }
      });
    }
    const stageY = slide.summary ? 182 : 138;
    const stageH = HEIGHT - stageY - 38;
    embedSvgIntoSlidePage(page, slide.svg, { x: 56, y: stageY, w: 848, h: stageH }, { idPrefix: slideId });
    return page;
  });

  return {
    version: "1.0",
    meta: {
      source: "ppt-create-svg-fusion",
      reconstructionMode: "native-only",
      svgPageCount: pages.length
    },
    slideSize: { widthPt: WIDTH, heightPt: HEIGHT },
    pages
  };
}

module.exports = {
  createDeckIrFromSvgSlides,
  embedSvgIntoSlidePage
};
