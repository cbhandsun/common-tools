"use strict";

const { measurePrototypeLoopGeometry } = require("./prototype-loop-measurement");

function createPrototypeGenerationLoopModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }, options = {}) {
  const text = (page.textBoxes || []).map((item) => String(item?.text || "")).join(" ");
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const requiredSignals = [/原型生成闭环/, /标准prd/, /原型生成/, /可点击原型/, /门户展示/];
  if (candidates.length < 4 || requiredSignals.filter((pattern) => pattern.test(normalized)).length < 5) {
    return { matched: false, shapes: [], pictorialRegions: [], sourceIds: [] };
  }

  const sx = finitePositive(slideSize.widthPt, 960) / 960;
  const sy = finitePositive(slideSize.heightPt, 540) / 540;
  const box = (x, y, w, h) => ({ x: round(x * sx), y: round(y * sy), w: round(w * sx), h: round(h * sy) });
  const point = (x, y) => ({ x: round(x * sx), y: round(y * sy) });
  const measurement = measurePrototypeLoopGeometry(options.sourceImage, slideSize);
  const screenshotBox = measurement?.screenshotBox || box(499, 185, 235, 166);
  const portalBox = measurement?.portalBox || box(806, 184, 154, 168);
  const skillBox = measurement?.skillBox || box(258, 181, 141, 141);
  const sourceIds = candidates.map((image) => image.id).filter(Boolean);
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "prototype-generation-loop-native-component",
    componentOwnerKind: "prototype-generation-loop",
    layerSourceIds: sourceIds,
    confidence: 0.96,
    ...prototypeGenerationLoopComponentMetadata(detector, extra),
    ...extra
  });
  const shape = (id, type, bounds, style, detector, extra = {}) => ({
    id: `prototype-generation-loop-${id}`,
    type,
    box: bounds,
    style,
    source: source(detector, extra)
  });
  const line = (id, from, to, style, detector, extra = {}) => shape(
    id,
    "line",
    lineBox(point(...from), point(...to)),
    { connectorType: "straight", ...style },
    detector,
    extra
  );
  const polyline = (id, points, style, detector, extra = {}) => {
    const bounds = points.reduce((result, current) => ({
      left: Math.min(result.left, current.x),
      top: Math.min(result.top, current.y),
      right: Math.max(result.right, current.x),
      bottom: Math.max(result.bottom, current.y)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const width = Math.max(0.01, bounds.right - bounds.left);
    const height = Math.max(0.01, bounds.bottom - bounds.top);
    return {
      ...shape(id, "polyline", { x: round(bounds.left), y: round(bounds.top), w: round(width), h: round(height) }, {
        fill: "none",
        closePath: false,
        lineCap: "round",
        lineJoin: "round",
        ...style
      }, detector, extra),
      points: points.map((current) => ({
        x: round((current.x - bounds.left) / width),
        y: round((current.y - bounds.top) / height)
      }))
    };
  };

  const shapes = [
    shape("document", "roundRect", box(64, 184, 134, 168), { fill: "#F2F2F2", stroke: "#9C9C9C", strokeWidthPt: 2.2, radiusPt: 7 }, "prototype-generation-loop-native-document"),
    line("document-line-1", [84, 239], [130, 239], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-line-2", [84, 259], [177, 259], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-line-3", [84, 274], [161, 274], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-line-4", [84, 306], [130, 306], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-line-5", [84, 323], [177, 323], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-line-6", [84, 338], [151, 338], { stroke: "#A7A7A7", strokeWidthPt: 4 }, "prototype-generation-loop-native-document-line"),
    line("document-to-skill", [199, 264], [round(skillBox.x / sx - 3), 264], { stroke: "#9C9C9C", strokeWidthPt: 3, endArrow: "triangle" }, "prototype-generation-loop-native-route", { role: "document-route" }),
    line("skill-to-prototype", [round((skillBox.x + skillBox.w + 7 * sx) / sx), 264], [round(screenshotBox.x / sx - 2), 264], { stroke: "#3AB873", strokeWidthPt: 4, endArrow: "triangle" }, "prototype-generation-loop-native-route", { role: "skill-route" }),
    shape("prototype-window", "roundRect", box(499, 185, 235, 166), { fill: "#F7FAF8", stroke: "#3AB873", strokeWidthPt: 2.2, radiusPt: 5 }, "prototype-generation-loop-native-browser"),
    line("prototype-toolbar", [499, 211], [734, 211], { stroke: "#3AB873", strokeWidthPt: 1.6 }, "prototype-generation-loop-native-browser-line"),
    line("prototype-sidebar", [554, 211], [554, 351], { stroke: "#3AB873", strokeWidthPt: 1.4 }, "prototype-generation-loop-native-browser-line"),
    shape("prototype-status", "ellipse", box(508, 195, 11, 11), { fill: "#3AB873", stroke: "#3AB873", strokeWidthPt: 0 }, "prototype-generation-loop-native-browser-chrome"),
    shape("prototype-address", "roundRect", box(565, 194, 103, 10), { fill: "#ACACAC", stroke: "#ACACAC", strokeWidthPt: 0, radiusPt: 3 }, "prototype-generation-loop-native-browser-chrome"),
    shape("prototype-sidebar-tab", "roundRect", box(506, 222, 44, 13), { fill: "#3AB873", stroke: "#3AB873", strokeWidthPt: 0, radiusPt: 2 }, "prototype-generation-loop-native-browser-chrome"),
    shape("portal", "roundRect", portalBox, { fill: "#BABABA", stroke: "#3AB873", strokeWidthPt: 2.2, radiusPt: 6 }, "prototype-generation-loop-native-portal")
  ];
  [0, 1, 2].forEach((column) => [0, 1, 2].forEach((row) => {
    shapes.push(shape(`prototype-card-${row}-${column}`, "roundRect", box(565 + column * 55, 240 + row * 45, 46, 33), {
      fill: "#F0F2F1",
      stroke: "#3AB873",
      strokeWidthPt: 1.1,
      radiusPt: 3
    }, "prototype-generation-loop-native-browser-card", { row, column }));
    if (row < 2) shapes.push(line(`prototype-card-label-${row}-${column}`, [568 + column * 55, 278 + row * 45], [589 + column * 55, 278 + row * 45], {
      stroke: "#A7A7A7",
      strokeWidthPt: 2
    }, "prototype-generation-loop-native-browser-label", { row, column }));
  }));
  [0, 1, 2].forEach((row) => shapes.push(line(`prototype-sidebar-line-${row}`, [506, 250 + row * 17], [535, 250 + row * 17], {
    stroke: "#A7A7A7",
    strokeWidthPt: 2
  }, "prototype-generation-loop-native-browser-label", { row })));

  if (measurement) {
    const top = measurement.topRoute;
    const bottom = measurement.bottomRoute;
    shapes.push(
      polyline("feedback-top", [
        { x: top.rightX, y: portalBox.y },
        { x: top.rightX, y: top.y },
        { x: top.leftX, y: top.y },
        { x: top.leftX, y: screenshotBox.y + 12 * sy }
      ], { stroke: "#3AB873", strokeWidthPt: top.strokeWidthPt, endArrow: "triangle" }, "prototype-generation-loop-native-feedback", { role: "feedback", measuredGeometry: true }),
      polyline("feedback-bottom", [
        { x: bottom.leftX, y: screenshotBox.y + screenshotBox.h },
        { x: bottom.leftX, y: bottom.y },
        { x: bottom.rightX, y: bottom.y },
        { x: bottom.rightX, y: portalBox.y + portalBox.h - 12 * sy }
      ], { stroke: "#3AB873", strokeWidthPt: bottom.strokeWidthPt, endArrow: "triangle" }, "prototype-generation-loop-native-feedback", { role: "feedback", measuredGeometry: true })
    );
  } else {
    shapes.push(
      line("feedback-top-right", [883, 184], [883, 130], { stroke: "#3AB873", strokeWidthPt: 4 }, "prototype-generation-loop-native-feedback", { role: "feedback" }),
      line("feedback-top", [883, 130], [613, 130], { stroke: "#3AB873", strokeWidthPt: 4 }, "prototype-generation-loop-native-feedback", { role: "feedback" }),
      line("feedback-top-down", [613, 130], [613, 184], { stroke: "#3AB873", strokeWidthPt: 4, endArrow: "triangle" }, "prototype-generation-loop-native-feedback", { role: "feedback" }),
      line("feedback-bottom-down", [613, 351], [613, 419], { stroke: "#3AB873", strokeWidthPt: 4 }, "prototype-generation-loop-native-feedback", { role: "feedback" }),
      line("feedback-bottom", [613, 419], [883, 419], { stroke: "#3AB873", strokeWidthPt: 4 }, "prototype-generation-loop-native-feedback", { role: "feedback" }),
      line("feedback-bottom-up", [883, 419], [883, 352], { stroke: "#3AB873", strokeWidthPt: 4, endArrow: "triangle" }, "prototype-generation-loop-native-feedback", { role: "feedback" })
    );
  }

  const preservePrototypeScreenshot = options.preservePrototypeScreenshot !== false;
  const retainedShapes = preservePrototypeScreenshot
    ? shapes.filter((item) => !String(item?.source?.detector || "").startsWith("prototype-generation-loop-native-browser"))
    : shapes;
  return {
    matched: true,
    shapes: retainedShapes,
    sourceIds,
    pictorialRegions: [
      { key: "skill-icon", box: skillBox, component: prototypeGenerationLoopComponent("skill", "icon") },
      ...(preservePrototypeScreenshot ? [{ key: "prototype-screenshot", box: screenshotBox, component: prototypeGenerationLoopComponent("prototype", "screenshot") }] : []),
      { key: "warning-badge", box: relativeBox(screenshotBox, { x: 499, y: 185, w: 235, h: 166 }, { x: 696, y: 157, w: 61, h: 61 }), component: prototypeGenerationLoopComponent("prototype", "warning-badge") },
      { key: "upload-icon", box: relativeBox(portalBox, { x: 806, y: 184, w: 154, h: 168 }, { x: 856, y: 225, w: 52, h: 45 }), component: prototypeGenerationLoopComponent("portal", "upload-icon") }
    ],
    measurement
  };
}

function relativeBox(targetParent, referenceParent, referenceChild) {
  return {
    x: round(targetParent.x + (referenceChild.x - referenceParent.x) / referenceParent.w * targetParent.w),
    y: round(targetParent.y + (referenceChild.y - referenceParent.y) / referenceParent.h * targetParent.h),
    w: round(referenceChild.w / referenceParent.w * targetParent.w),
    h: round(referenceChild.h / referenceParent.h * targetParent.h)
  };
}

function annotatePrototypeGenerationLoopTextBoxes(textBoxes = [], matched = false) {
  if (!matched) return textBoxes;
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => {
    const text = String(textBox?.text || "").replace(/\s+/g, "").toLowerCase();
    let role = null;
    if (text === "标准prd") role = "document";
    else if (text === "原型生成" || text === "skill") role = "skill";
    else if (text === "可点击原型") role = "prototype";
    else if (text === "门户展示") role = "portal";
    if (!role) return textBox;
    const component = prototypeGenerationLoopComponent(role, "label");
    const normalizedFont = text === "标准prd"
      ? {
        ...(textBox.font || {}),
        sizePt: Number(textBox?.box?.y || 0) < 260 ? 17.5 : 18,
        weight: "bold"
      }
      : textBox.font;
    return {
      ...textBox,
      ...(normalizedFont ? { font: normalizedFont } : {}),
      style: { ...(textBox.style || {}), nativeComponentGroupId: component.nativeComponentGroupId },
      source: { ...(textBox.source || {}), ...component }
    };
  });
}

function prototypeGenerationLoopComponentMetadata(detector, extra = {}) {
  const value = String(detector || "");
  const semanticRole = String(extra.role || "");
  if (/native-feedback/.test(value)) return prototypeGenerationLoopComponent("feedback", semanticRole || "route");
  if (/native-document/.test(value) || semanticRole === "document-route") return prototypeGenerationLoopComponent("document", semanticRole || "shape");
  if (semanticRole === "skill-route") return prototypeGenerationLoopComponent("skill", semanticRole);
  if (/native-browser/.test(value)) return prototypeGenerationLoopComponent("prototype", semanticRole || "shape");
  if (/native-portal/.test(value)) return prototypeGenerationLoopComponent("portal", semanticRole || "shape");
  return {};
}

function prototypeGenerationLoopComponent(role, part) {
  return {
    nativeComponentGroupId: `prototype-generation-loop-${role}`,
    nativeComponentParentId: "prototype-generation-loop",
    nativeComponentArchetype: role === "feedback" ? "feedback-loop" : "prototype-generation-stage",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part || "detail"
  };
}

function lineBox(from, to) {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = { annotatePrototypeGenerationLoopTextBoxes, createPrototypeGenerationLoopModel };
