"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "demand-intake-funnel-native-";

function createDemandIntakeFunnelObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyDemandIntakeFunnel(page, textBoxes, slideSize)) {
    return { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
  }
  const sourceImages = (page.images || []).filter(isStructuralSegment);
  const sourceIds = sourceImages.map((image) => String(image.id || "")).filter(Boolean);
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      demandIntakeFunnelObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      expressionForm: "workflow-diagram",
      expressionSubtype: "demand-intake-funnel",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "demand intake funnel segment"}; structural notes, funnel, routes, and output cards rebuilt as native components`
    };
  }
  const layout = funnelLayout(slideSize, textBoxes, options.sourceImage);
  return {
    matched: true,
    sourceIds,
    shapes: createFunnelShapes(layout),
    textBoxes: createFunnelTextBoxes(layout),
    images: materializeFunnelIcons(layout, slideSize, options)
  };
}

function shouldObjectifyDemandIntakeFunnel(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const semantic = normalizeText((textBoxes || []).map((item) => item?.text || "").join(" "));
  const required = ["从杂乱信息到结构化输入", "会议纪要", "业务描述", "竞品截图", "业务流程", "角色边界", "待确认问题"];
  if (!required.every((token) => semantic.includes(normalizeText(token)))) return false;
  if (!semantic.includes("旧系统") || !semantic.includes("需求理解") || !semantic.includes("skill")) return false;
  const images = (page.images || []).filter(isStructuralSegment);
  if (images.length !== 3) return false;
  const area = images.reduce((sum, image) => sum + areaOf(image.box), 0);
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  const ratio = area / slideArea;
  return ratio >= 0.25 && ratio <= 0.4;
}

function isStructuralSegment(image) {
  return image?.source?.detector === "product-illustration-segment-crop";
}

function funnelLayout(slideSize = DEFAULT_SLIDE, textBoxes = [], sourceImage = null) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  const evidence = (text) => findTextEvidence(textBoxes, text);
  const legacyEvidence = unionEvidence([evidence("旧系统"), evidence("说明")]);
  const note = (role, label, fallback, rotate, padding, folded = false, textEvidence = evidence(label)) => ({
    role,
    label,
    box: textEvidence?.box ? expandBox(textEvidence.box, padding, slideSize) : fallback,
    rotate,
    folded,
    textEvidence
  });
  const output = (role, label, fallback) => {
    const textEvidence = evidence(label);
    return {
      role,
      label,
      box: textEvidence?.box ? expandBox(textEvidence.box, { left: 30, top: 13, right: 30, bottom: 13 }, slideSize) : fallback,
      textEvidence
    };
  };
  const layout = {
    sx,
    sy,
    title: evidence("需求理解：从杂乱信息到结构化输入")?.box || box(204, 48, 556, 40),
    titleEvidence: evidence("需求理解：从杂乱信息到结构化输入"),
    notes: [
      note("meeting", "会议纪要", box(168, 122, 111, 67), 13, { left: 13, top: 18, right: 19, bottom: 18 }),
      note("description", "业务描述", box(111, 199, 103, 61), 4, { left: 12, top: 17, right: 14, bottom: 17 }),
      note("competitor", "竞品截图", box(109, 279, 89, 82), -13, { left: 8, top: 25, right: 11, bottom: 25 }, true),
      note("legacy", "旧系统\n说明", box(205, 335, 91, 80), 8, { left: 11, top: 17, right: 12, bottom: 18 }, true, legacyEvidence)
    ],
    funnel: box(338, 126, 297, 292),
    lip: box(337, 126, 58, 292),
    funnelLabelEvidence: evidence("需求理解"),
    funnelSkillEvidence: evidence("Skill"),
    outputs: [
      output("process", "业务流程", box(752, 176, 150, 56)),
      output("boundary", "角色边界", box(752, 251, 150, 55)),
      output("questions", "待确认问题", box(752, 326, 150, 55))
    ],
    narrativeEvidence: {
      unify: evidence("·多源统一收口：无视材料格式，AI自动提炼核心主线。"),
      boundary: evidence("·角色边界识别：精准定位业务场景中的核心参与者与权限范围。"),
      process: evidence("·业务流程梳理：自动拆解复杂业务，理清上下游节点关联。"),
      gap: evidence("·缺口提前暴露：主动挖掘待确认的模糊地带，避免需求带病下传。")
    },
    icons: [
      { role: "network-top", box: box(399, 181, 84, 51) },
      { role: "network-bottom", box: box(399, 283, 84, 52) },
      { role: "gear-large", box: box(527, 245, 41, 41) },
      { role: "gear-small", box: box(554, 233, 32, 30) }
    ]
  };
  const funnelAnchor = detectDemandIntakeFunnelAnchor(sourceImage, slideSize);
  if (funnelAnchor) {
    layout.funnel = funnelAnchor;
    layout.lip = roundedBox({
      x: funnelAnchor.x - funnelAnchor.w * 0.005,
      y: funnelAnchor.y,
      w: funnelAnchor.w * 0.195,
      h: funnelAnchor.h
    });
  }
  return layout;
}

function detectDemandIntakeFunnelAnchor(sourceImage, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage?.rgba || !Number(sourceImage.width) || !Number(sourceImage.height)) return null;
  const width = Number(sourceImage.width);
  const height = Number(sourceImage.height);
  const pixels = width * height;
  const blue = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const r = sourceImage.rgba[offset];
    const g = sourceImage.rgba[offset + 1];
    const b = sourceImage.rgba[offset + 2];
    if (b > r + 35 && b > g + 15 && r < 110 && g >= 55 && g <= 190 && b >= 125) blue[index] = 1;
  }
  const visited = new Uint8Array(pixels);
  let best = null;
  for (let seed = 0; seed < pixels; seed += 1) {
    if (!blue[seed] || visited[seed]) continue;
    const queue = [seed];
    visited[seed] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (!blue[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    const candidate = roundedBox({
      x: minX * slideSize.widthPt / width,
      y: minY * slideSize.heightPt / height,
      w: (maxX - minX + 1) * slideSize.widthPt / width,
      h: (maxY - minY + 1) * slideSize.heightPt / height
    });
    const area = candidate.w * candidate.h;
    if (candidate.w < 180 || candidate.w > 430 || candidate.h < 130 || candidate.h > 360 || area < 30000) continue;
    if (!best || area > best.area) best = { ...candidate, area };
  }
  if (!best) return null;
  const { area, ...box } = best;
  return box;
}

function createFunnelShapes(layout) {
  const shapes = [];
  const add = (shape) => shapes.push(shape);
  const native = (detector, role, part) => source(detector, role, part);
  const body = layout.funnel;
  add({
    id: "demand-intake-funnel-body",
    type: "freeform",
    box: body,
    points: [
      { x: body.x + body.w * 0.13, y: body.y },
      { x: body.x + body.w * 0.80, y: body.y + body.h * 0.36 },
      { x: body.x + body.w * 0.98, y: body.y + body.h * 0.36 },
      { x: body.x + body.w, y: body.y + body.h * 0.64 },
      { x: body.x + body.w * 0.80, y: body.y + body.h * 0.64 },
      { x: body.x + body.w * 0.13, y: body.y + body.h },
      { x: body.x, y: body.y + body.h * 0.5 }
    ],
    style: {
      fill: "#257CCF",
      gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#1970C2" }, { position: 1, color: "#3B8ADD" }] },
      stroke: "#1B70BF",
      strokeWidthPt: 1.2
    },
    source: native(`${DETECTOR_PREFIX}funnel`, "funnel", "body")
  });
  add({ id: "demand-intake-funnel-lip", type: "ellipse", box: layout.lip, style: { fill: "#FFFFFF", stroke: "#1E73C4", strokeWidthPt: 8.5 }, source: native(`${DETECTOR_PREFIX}funnel`, "funnel", "lip") });

  layout.notes.forEach((note, index) => {
    add({ id: `demand-intake-note-${note.role}`, type: "rect", box: note.box, style: { fill: "#F3F3F2", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#FFFFFF" }, { position: 1, color: "#E6E6E4" }] }, stroke: "#999999", strokeWidthPt: 2, rotation: note.rotate, shadow: { color: "#8A8A8A", alpha: 0.12, blurPt: 2, distancePt: 1, angle: 45 } }, source: native(`${DETECTOR_PREFIX}input-note`, `input-${note.role}`, "container") });
    if (note.folded) {
      add({ id: `demand-intake-note-fold-${note.role}`, type: "triangle", box: roundedBox({ x: note.box.x + note.box.w - 18 * layout.sx, y: note.box.y + note.box.h - 16 * layout.sy, w: 18 * layout.sx, h: 16 * layout.sy }), style: { fill: "#D1D1CF", stroke: "#929292", strokeWidthPt: 1, rotation: note.rotate + 90 }, source: native(`${DETECTOR_PREFIX}input-note-fold`, `input-${note.role}`, "fold") });
    }
    const starts = [
      { x: note.box.x + note.box.w * 0.88, y: note.box.y + note.box.h * 0.56 },
      { x: note.box.x + note.box.w * 0.94, y: note.box.y + note.box.h * 0.5 },
      { x: note.box.x + note.box.w * 0.94, y: note.box.y + note.box.h * 0.55 },
      { x: note.box.x + note.box.w * 0.92, y: note.box.y + note.box.h * 0.40 }
    ];
    const targets = [0.27, 0.42, 0.58, 0.73];
    add({ id: `demand-intake-route-${note.role}`, type: "line", box: lineBox(starts[index], { x: layout.lip.x - 7 * layout.sx, y: layout.lip.y + layout.lip.h * targets[index] }), style: { stroke: "#9A9A9A", strokeWidthPt: 2.3, connectorType: "straight", endArrow: "triangle", lineCap: "round" }, source: native(`${DETECTOR_PREFIX}input-route`, `input-${note.role}`, "connector") });
  });

  const nozzleX = body.x + body.w * 0.98;
  const branchX = 665 * layout.sx;
  const centerY = body.y + body.h * 0.5;
  add(line("demand-intake-output-trunk", nozzleX, centerY, branchX, centerY, native(`${DETECTOR_PREFIX}output-route`, "output-routing", "trunk")));
  layout.outputs.forEach((card, index) => {
    const y = card.box.y + card.box.h / 2;
    if (index !== 1) {
      add(line(`demand-intake-output-branch-v-${index}`, branchX, centerY, branchX, y, native(`${DETECTOR_PREFIX}output-route`, "output-routing", `branch-v-${index}`)));
    }
    add(line(`demand-intake-output-branch-h-${index}`, branchX, y, card.box.x, y, native(`${DETECTOR_PREFIX}output-route`, `output-${card.role}`, "connector")));
    add({ id: `demand-intake-output-card-${card.role}`, type: "rect", box: card.box, style: { fill: "#F7FFF8", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#FFFFFF" }, { position: 1, color: "#EAF8EE" }] }, stroke: "#23A963", strokeWidthPt: 2.4, radiusPt: 5, shadow: { color: "#23A963", alpha: 0.08, blurPt: 2, distancePt: 1, angle: 45 } }, source: native(`${DETECTOR_PREFIX}output-card`, `output-${card.role}`, "container") });
  });
  const warning = layout.outputs[2].box;
  add({ id: "demand-intake-output-warning-dot", type: "ellipse", box: roundedBox({ x: warning.x + warning.w - 14 * layout.sx, y: warning.y - 14 * layout.sy, w: 27 * layout.sx, h: 27 * layout.sy }), style: { fill: "#FF8500", stroke: "#FF8500", strokeWidthPt: 0 }, source: native(`${DETECTOR_PREFIX}warning`, "output-questions", "warning") });
  return shapes;
}

function createFunnelTextBoxes(layout) {
  const boxes = [
    evidenceTextBox("demand-intake-title", "需求理解：从杂乱信息到结构化输入", layout.titleEvidence, layout.title, 25.5, "#111111", "bold", "left", source(`${DETECTOR_PREFIX}text`, "title", "text")),
    ...layout.notes.map((note) => textBox(`demand-intake-note-text-${note.role}`, note.label, inset(note.box, 8 * layout.sx, 8 * layout.sy), note.role === "legacy" ? 15 : 16.5, "#111111", "bold", "center", source(`${DETECTOR_PREFIX}text`, `input-${note.role}`, "label"), note.rotate)),
    evidenceTextBox("demand-intake-funnel-label", "需求理解", layout.funnelLabelEvidence, roundedBox({ x: 455 * layout.sx, y: 251 * layout.sy, w: 107 * layout.sx, h: 25 * layout.sy }), 18.5, "#FFFFFF", "bold", "left", source(`${DETECTOR_PREFIX}text`, "funnel", "label")),
    evidenceTextBox("demand-intake-funnel-skill", "Skill", layout.funnelSkillEvidence, roundedBox({ x: 470 * layout.sx, y: 277 * layout.sy, w: 76 * layout.sx, h: 29 * layout.sy }), 21, "#FFFFFF", "bold", "left", source(`${DETECTOR_PREFIX}text`, "funnel", "skill")),
    ...layout.outputs.map((card) => evidenceTextBox(`demand-intake-output-text-${card.role}`, card.label, card.textEvidence, inset(card.box, 8 * layout.sx, 8 * layout.sy), 18, "#111111", "bold", "left", source(`${DETECTOR_PREFIX}text`, `output-${card.role}`, "label"))),
    richNote("demand-intake-note-unify", "多源统一收口：", "无视材料格式，AI自动提炼核心主线。", 70, 429, 356, layout, "narrative-unify", layout.narrativeEvidence.unify),
    richNote("demand-intake-note-boundary", "角色边界识别：", "精准定位业务场景中的核心参与者与权限范围。", 485, 429, 407, layout, "narrative-boundary", layout.narrativeEvidence.boundary),
    richNote("demand-intake-note-process", "业务流程梳理：", "自动拆解复杂业务，理清上下游节点关联。", 70, 455, 380, layout, "narrative-process", layout.narrativeEvidence.process),
    richNote("demand-intake-note-gap", "缺口提前暴露：", "主动挖掘待确认的模糊地带，避免需求带病下传。", 485, 455, 418, layout, "narrative-gap", layout.narrativeEvidence.gap)
  ];
  return boxes;
}

function richNote(id, prefix, body, x, y, w, layout, role, evidence = null) {
  const box = evidence?.box || roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: 20 * layout.sy });
  const sizePt = evidenceFontSize(evidence, 13);
  return {
    ...textBox(id, `·${prefix}${body}`, box, sizePt, "#111111", "regular", "left", withEvidence(source(`${DETECTOR_PREFIX}note`, role, "text"), evidence)),
    runs: [
      { text: `·${prefix}`, font: { family: "Microsoft YaHei", sizePt, weight: "bold", color: "#111111" } },
      { text: body, font: { family: "Microsoft YaHei", sizePt, weight: "regular", color: "#111111" } }
    ]
  };
}

function evidenceTextBox(id, text, evidence, fallbackBox, fallbackSize, color, weight, align, sourceValue, rotate = 0) {
  return textBox(
    id,
    text,
    evidence?.box || fallbackBox,
    evidenceFontSize(evidence, fallbackSize),
    color,
    weight,
    evidence?.box ? "left" : align,
    withEvidence(sourceValue, evidence),
    rotate
  );
}

function materializeFunnelIcons(layout, slideSize, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const deck = safeToken(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  return layout.icons.map((icon) => {
    const pxBox = ptToPxBox(icon.box, options.sourceImage, slideSize, 1);
    const crop = cropPng(options.sourceImage, pxBox);
    const transparent = isolateLightBlueIcon(crop);
    const file = path.join(options.assetDir, `${deck}-p${page}-demand-funnel-${icon.role}.png`);
    writePng(file, transparent);
    return {
      id: `demand-intake-funnel-icon-${icon.role}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: icon.box,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `${DETECTOR_PREFIX}icon-crop`,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: `${icon.role}-line-icon`,
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: "source-faithful internal line icon retained as the smallest pictorial unit",
        ...component("funnel", `icon-${icon.role}`)
      }
    };
  });
}

function isolateLightBlueIcon(image) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const blueLead = b - r;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const keep = r >= 82 && g >= 145 && b >= 185 && blueLead >= 42 && saturation >= 45;
    if (!keep) {
      rgba[offset + 3] = 0;
      continue;
    }
    const strength = Math.min(1, Math.max(0.25, (r - 72) / 60));
    rgba[offset + 3] = Math.min(rgba[offset + 3], Math.round(255 * strength));
  }
  return { ...image, rgba };
}

function filterDemandIntakeFunnelTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const native = (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX));
  const claimed = new Set(native.map((item) => normalizeText(item.text)));
  const fragments = new Set(["旧系统", "说明", "需求理解", "skill", "y", "u"]);
  return (textBoxes || []).filter((item) => {
    const detector = String(item?.source?.detector || "");
    if (detector.startsWith(DETECTOR_PREFIX)) return true;
    const key = normalizeText(item?.text || "");
    return !claimed.has(key) && !fragments.has(key);
  });
}

function line(id, x1, y1, x2, y2, sourceValue) {
  return { id, type: "line", box: lineBox({ x: x1, y: y1 }, { x: x2, y: y2 }), style: { stroke: "#24A963", strokeWidthPt: 5.5, connectorType: "straight", lineCap: "round" }, source: sourceValue };
}

function lineBox(a, b) {
  return roundedBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
}

function textBox(id, text, box, sizePt, color, weight, align, sourceValue, rotate = 0) {
  return { id, text, box, font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1, rotation: rotate }, style: { wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, rotation: rotate }, wrap: true, source: sourceValue };
}

function source(detector, role, part) {
  return { editable: true, nativeRebuild: true, detector, confidence: 0.94, expressionForm: "workflow-diagram", expressionSubtype: "demand-intake-funnel", ...component(role, part) };
}

function component(role, part) {
  const safeRole = safeToken(role);
  return { nativeComponentGroupId: `demand-intake-funnel-${safeRole}`, nativeComponentArchetype: "demand-intake-funnel", nativeComponentRole: part };
}

function inset(box, x, y) {
  return roundedBox({ x: box.x + x, y: box.y + y, w: Math.max(1, box.w - x * 2), h: Math.max(1, box.h - y * 2) });
}

function findTextEvidence(textBoxes, text) {
  const target = normalizeText(text);
  return (textBoxes || []).find((item) => normalizeText(item?.text || "") === target && validBox(item?.box)) || null;
}

function unionEvidence(items) {
  const valid = (items || []).filter((item) => validBox(item?.box));
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((item) => item.box.x));
  const top = Math.min(...valid.map((item) => item.box.y));
  const right = Math.max(...valid.map((item) => item.box.x + item.box.w));
  const bottom = Math.max(...valid.map((item) => item.box.y + item.box.h));
  return {
    box: roundedBox({ x: left, y: top, w: right - left, h: bottom - top }),
    font: valid[0].font || null
  };
}

function expandBox(box, padding, slideSize = DEFAULT_SLIDE) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const left = Number(padding?.left || 0) * sx;
  const right = Number(padding?.right || 0) * sx;
  const top = Number(padding?.top || 0) * sy;
  const bottom = Number(padding?.bottom || 0) * sy;
  return roundedBox({ x: box.x - left, y: box.y - top, w: box.w + left + right, h: box.h + top + bottom });
}

function evidenceFontSize(evidence, fallback) {
  const value = Number(evidence?.font?.sizePt);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function withEvidence(sourceValue, evidence) {
  return evidence?.box ? { ...sourceValue, evidenceBox: evidence.box } : sourceValue;
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function ptToPxBox(box, image, slideSize, paddingPt = 0) {
  const sx = image.width / Math.max(1, Number(slideSize.widthPt || 960));
  const sy = image.height / Math.max(1, Number(slideSize.heightPt || 540));
  const x = Math.max(0, Math.floor((box.x - paddingPt) * sx));
  const y = Math.max(0, Math.floor((box.y - paddingPt) * sy));
  const right = Math.min(image.width, Math.ceil((box.x + box.w + paddingPt) * sx));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h + paddingPt) * sy));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function roundedBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100]));
}

function areaOf(box) {
  return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
}

function normalizeText(value) {
  return String(value || "").replace(/[\s:：,，。.;；·•—_-]/g, "").toLowerCase();
}

function safeToken(value) {
  return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component";
}

module.exports = {
  DETECTOR_PREFIX,
  createDemandIntakeFunnelObjects,
  filterDemandIntakeFunnelTextBoxes,
  funnelLayout,
  isolateLightBlueIcon,
  shouldObjectifyDemandIntakeFunnel
};
