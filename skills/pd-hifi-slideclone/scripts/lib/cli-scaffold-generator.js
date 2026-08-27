"use strict";

const REQUIRED_COMMANDS = Object.freeze(["init", "add-system", "sync-prds", "upgrade"]);
const REQUIRED_MODULES = Object.freeze(["域仓模板", "配置", "菜单", "文档", "原型"]);
const REQUIRED_OUTPUTS = Object.freeze(["业务系统A", "业务系统B", "业务系统C"]);
const DETECTOR_PREFIX = "cli-scaffold-generator-native-";

function createCliScaffoldGeneratorObjects(page = {}, slideSize = { widthPt: 960, heightPt: 540 }, options = {}) {
  const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
  const evidence = collectEvidence(textBoxes);
  if (!evidence) return { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
  const width = finitePositive(slideSize?.widthPt, 960);
  const height = finitePositive(slideSize?.heightPt, 540);
  if (width < 480 || width > 3840 || height < 270 || height > 2160) {
    return { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
  }

  const layout = inferLayout(evidence, { widthPt: width, heightPt: height });
  if (!layout) return { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
  const sourceIds = (page.images || []).map((image) => String(image?.id || "")).filter(Boolean);
  const palette = inferPalette(options.sourceImage, layout, { widthPt: width, heightPt: height });
  return {
    matched: true,
    shapes: createShapes(layout, palette),
    textBoxes: [warningTextBox(layout.warning)],
    sourceIds,
    layout,
    palette
  };
}

function collectEvidence(textBoxes = []) {
  const entries = textBoxes
    .filter((item) => validBox(item?.box))
    .map((item) => ({ item, text: normalizeText(item.text) }));
  const find = (label) => entries.find((entry) => entry.text.toLowerCase() === normalizeText(label).toLowerCase())?.item || null;
  const commands = REQUIRED_COMMANDS.map(find);
  const modules = REQUIRED_MODULES.map(find);
  const outputs = REQUIRED_OUTPUTS.map(find);
  const pageText = entries.map((entry) => entry.text).join("");
  if (!/CLI脚手架.*业务域仓的标准生成器/i.test(pageText)) return null;
  if (commands.some((item) => !item) || modules.some((item) => !item) || outputs.some((item) => !item)) return null;
  return { commands, modules, outputs };
}

function inferLayout(evidence, slideSize) {
  const commandCenters = evidence.commands.map((item) => center(item.box));
  const outputCenters = evidence.outputs.map((item) => center(item.box));
  if (!strictlyIncreasing(commandCenters.map((point) => point.y)) || !strictlyIncreasing(outputCenters.map((point) => point.y))) return null;
  const commandGap = medianAdjacentGap(commandCenters.map((point) => point.y));
  const outputGap = medianAdjacentGap(outputCenters.map((point) => point.y));
  if (commandGap < 28 || commandGap > 110 || outputGap < 35 || outputGap > 130) return null;

  const commandLeft = Math.max(20, Math.min(...evidence.commands.map((item) => item.box.x)) - 10);
  const commandRight = Math.max(...evidence.commands.map((item) => item.box.x + item.box.w)) + 10;
  const commandH = clamp(commandGap * 0.8, 36, 58);
  const commandBoxes = commandCenters.map((point) => ({
    x: round(commandLeft),
    y: round(point.y - commandH / 2),
    w: round(commandRight - commandLeft),
    h: round(commandH)
  }));

  const outputX = Math.max(...evidence.modules.map((item) => item.box.x + item.box.w)) + 180;
  const boundedOutputX = clamp(Math.min(...evidence.outputs.map((item) => item.box.x)) - 14, outputX, slideSize.widthPt - 170);
  const outputRight = Math.min(slideSize.widthPt - 18, Math.max(...evidence.outputs.map((item) => item.box.x + item.box.w)) + 16);
  const outputH = clamp(outputGap * 0.77, 48, 68);
  const outputBoxes = outputCenters.map((point) => ({
    x: round(boundedOutputX),
    y: round(point.y - outputH / 2),
    w: round(outputRight - boundedOutputX),
    h: round(outputH)
  }));

  const centralX = round(commandRight + clamp((boundedOutputX - commandRight) * 0.17, 72, 112));
  const centralRight = round(boundedOutputX - clamp((boundedOutputX - commandRight) * 0.18, 72, 116));
  const centralY = round(commandBoxes[0].y);
  const centralBottom = round(commandBoxes[commandBoxes.length - 1].y + commandBoxes[commandBoxes.length - 1].h);
  if (centralRight - centralX < 260 || centralBottom - centralY < 150) return null;
  const central = { x: centralX, y: centralY, w: centralRight - centralX, h: centralBottom - centralY };
  const cardW = central.w * 0.4;
  const cardH = central.h * 0.25;
  const moduleBoxes = [
    { x: central.x + central.w * 0.08, y: central.y + central.h * 0.265, w: cardW, h: cardH },
    { x: central.x + central.w * 0.53, y: central.y + central.h * 0.265, w: cardW, h: cardH },
    { x: central.x + central.w * 0.08, y: central.y + central.h * 0.615, w: cardW, h: cardH },
    { x: central.x + central.w * 0.53, y: central.y + central.h * 0.615, w: cardW, h: cardH }
  ].map(roundBox);
  const warning = {
    x: round(central.x + central.w * 0.47),
    y: round(central.y + central.h * 0.215),
    w: round(clamp(central.h * 0.115, 20, 30)),
    h: round(clamp(central.h * 0.115, 20, 30))
  };
  return { commandBoxes, commandCenters, central, moduleBoxes, warning, outputBoxes, outputCenters };
}

function createShapes(layout, palette = defaultPalette()) {
  const shapes = [];
  const source = (part, role, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector: `${DETECTOR_PREFIX}${part}`,
    confidence: 0.96,
    ...nativeComponentMetadata(role, part),
    ...extra
  });
  shapes.push(rect("container", layout.central, { fill: palette.container, stroke: palette.container, strokeWidthPt: 1 }, source("container", "shell")));
  layout.commandBoxes.forEach((box, index) => {
    const role = `command-${index}`;
    shapes.push(rect(`command-${index}`, box, { fill: palette.command, stroke: palette.command, strokeWidthPt: 0.8 }, source("command", role, { index })));
    shapes.push({
      id: `cli-scaffold-input-arrow-${index}`,
      type: "rightArrow",
      box: roundBox({
        x: box.x + box.w + 5,
        y: box.y + box.h / 2 - 6,
        w: layout.central.x - box.x - box.w - 10,
        h: 12
      }),
      style: { fill: "#3DB06D", stroke: "#3DB06D", strokeWidthPt: 0.5 },
      source: source("input-arrow", role, { index })
    });
  });
  layout.moduleBoxes.forEach((box, index) => {
    shapes.push(rect(`module-${index}`, box, { fill: palette.module, stroke: palette.module, strokeWidthPt: 0.8 }, source("module", `module-${index}`, { index })));
  });
  shapes.push({ id: "cli-scaffold-warning", type: "ellipse", box: layout.warning, style: { fill: "#F58A2A", stroke: "#E5781D", strokeWidthPt: 1.1 }, source: source("warning", "warning") });
  layout.outputBoxes.forEach((box, index) => {
    shapes.push(rect(`output-${index}`, box, { fill: "#FFFFFF", stroke: "#286482", strokeWidthPt: 1.5 }, source("output", `output-${index}`, { index })));
  });
  shapes.push(...outputRouteShapes(layout, source));
  return shapes;
}

function inferPalette(image, layout, slideSize) {
  const fallback = defaultPalette();
  if (!validImage(image)) return fallback;
  const containerEvidence = {
    x: layout.central.x + layout.central.w * 0.025,
    y: layout.central.y + layout.central.h * 0.025,
    w: layout.central.w * 0.2,
    h: layout.central.h * 0.15
  };
  return {
    container: sampleComponentFill(image, [containerEvidence], slideSize, fallback.container),
    command: sampleComponentFill(image, layout.commandBoxes, slideSize, fallback.command),
    module: sampleComponentFill(image, layout.moduleBoxes, slideSize, fallback.module)
  };
}

function defaultPalette() {
  return { container: "#2F78B5", command: "#3C3C3C", module: "#A7A7A7" };
}

function sampleComponentFill(image, boxes, slideSize, fallback) {
  const widthPt = finitePositive(slideSize?.widthPt, 0);
  const heightPt = finitePositive(slideSize?.heightPt, 0);
  if (!widthPt || !heightPt) return fallback;
  const buckets = new Map();
  for (const box of boxes || []) {
    if (!validBox(box)) continue;
    const x0 = clamp(Math.floor(box.x / widthPt * image.width), 0, image.width - 1);
    const y0 = clamp(Math.floor(box.y / heightPt * image.height), 0, image.height - 1);
    const x1 = clamp(Math.ceil((box.x + box.w) / widthPt * image.width), x0 + 1, image.width);
    const y1 = clamp(Math.ceil((box.y + box.h) / heightPt * image.height), y0 + 1, image.height);
    const insetX = Math.max(2, Math.floor((x1 - x0) * 0.07));
    const insetY = Math.max(2, Math.floor((y1 - y0) * 0.12));
    const sampleW = Math.max(2, Math.floor((x1 - x0) * 0.16));
    const sampleH = Math.max(2, Math.floor((y1 - y0) * 0.2));
    const regions = [
      [x0 + insetX, y0 + insetY],
      [x1 - insetX - sampleW, y0 + insetY],
      [x0 + insetX, y1 - insetY - sampleH],
      [x1 - insetX - sampleW, y1 - insetY - sampleH]
    ];
    for (const [left, top] of regions) {
      for (let y = top; y < top + sampleH; y += 2) {
        for (let x = left; x < left + sampleW; x += 2) {
          const offset = (y * image.width + x) * 4;
          if (image.rgba[offset + 3] < 192) continue;
          const red = image.rgba[offset];
          const green = image.rgba[offset + 1];
          const blue = image.rgba[offset + 2];
          const key = `${Math.round(red / 6)},${Math.round(green / 6)},${Math.round(blue / 6)}`;
          const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
          bucket.count += 1;
          bucket.red += red;
          bucket.green += green;
          bucket.blue += blue;
          buckets.set(key, bucket);
        }
      }
    }
  }
  const winner = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!winner || winner.count < 12) return fallback;
  return toHex(winner.red / winner.count, winner.green / winner.count, winner.blue / winner.count);
}

function validImage(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width * height <= 24_000_000 && image?.rgba && image.rgba.length >= width * height * 4;
}

function toHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function outputRouteShapes(layout, source) {
  const shapes = [];
  const routeCount = 4;
  const startYs = Array.from({ length: routeCount }, (_, index) => layout.central.y + layout.central.h * (0.42 + index * 0.055));
  layout.outputBoxes.forEach((output, outputIndex) => {
    const targetYs = Array.from({ length: routeCount }, (_, index) => output.y + output.h * (0.28 + index * 0.15));
    startYs.forEach((startY, routeIndex) => {
      const bendX = layout.central.x + layout.central.w + 34 + routeIndex * 13;
      const routeSource = source("output-route", `output-${outputIndex}`, { outputIndex, routeIndex });
      const points = [
        { x: layout.central.x + layout.central.w, y: startY },
        { x: bendX, y: startY },
        { x: bendX, y: targetYs[routeIndex] },
        { x: output.x, y: targetYs[routeIndex] }
      ];
      shapes.push(polyline(`output-${outputIndex}-route-${routeIndex}`, points, {
        fill: "none", stroke: "#3DB06D", strokeWidthPt: 2.2, lineCap: "round"
      }, routeSource));
    });
  });
  return shapes;
}

function normalizeCliScaffoldGeneratorTextBoxes(textBoxes = [], active = false, layout = null) {
  if (!active) return textBoxes;
  for (const item of textBoxes || []) {
    const text = normalizeText(item?.text);
    const compact = text.replace(/\s+/g, "");
    item.style = { ...(item.style || {}), wrap: false, fit: "shrink" };
    item.source = {
      ...(item.source || {}),
      editable: true,
      nativeRebuild: true,
      detector: String(item.source?.detector || "").startsWith(DETECTOR_PREFIX) ? item.source.detector : `${DETECTOR_PREFIX}text`
    };
    if (REQUIRED_COMMANDS.some((label) => label.toLowerCase() === compact.toLowerCase())) {
      const commandIndex = REQUIRED_COMMANDS.findIndex((label) => label.toLowerCase() === compact.toLowerCase());
      applyTextComponentMetadata(item, `command-${commandIndex}`, "label");
      bindTextToComponentBox(item, layout?.commandBoxes?.[commandIndex]);
      item.font = { ...(item.font || {}), family: "Consolas", sizePt: 19.5, color: "#FFFFFF", weight: "regular", align: "center", valign: "middle" };
    } else if (REQUIRED_OUTPUTS.includes(compact)) {
      const outputIndex = REQUIRED_OUTPUTS.indexOf(compact);
      applyTextComponentMetadata(item, `output-${outputIndex}`, "label");
      bindTextToComponentBox(item, layout?.outputBoxes?.[outputIndex]);
      item.text = `业务系统 ${String.fromCharCode(65 + outputIndex)}`;
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 19, color: "#111111", weight: "regular", align: "center", valign: "middle" };
    } else if (REQUIRED_MODULES.includes(compact)) {
      const moduleIndex = REQUIRED_MODULES.indexOf(compact);
      applyTextComponentMetadata(item, moduleIndex === 0 ? "shell" : `module-${moduleIndex - 1}`, "label");
      bindTextToComponentBox(item, moduleIndex === 0 ? cliScaffoldHeaderBox(layout?.central) : layout?.moduleBoxes?.[moduleIndex - 1]);
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 18.8, color: "#FFFFFF", weight: "regular", align: "center", valign: "middle" };
    } else if (/^CLI脚手架：?业务域仓的标准生成器$/i.test(compact)) {
      item.text = "CLI 脚手架：业务域仓的标准生成器";
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 32, color: "#0F0F0F", weight: "bold", align: "left", valign: "middle" };
    } else if (compact === "!" && item.source?.nativeComponentRole === "warning") {
      item.style = zeroMarginStyle(item.style);
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 15, color: "#FFFFFF", weight: "bold", align: "center", valign: "middle" };
    } else if (/^(一键初始化|全系统扩展|PRD骨架同步|平台持续演进)[:：]/.test(text)) {
      const splitAt = Math.max(text.indexOf("："), text.indexOf(":"));
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 14.3, color: "#1E1E1E", weight: "regular", align: "left", valign: "middle" };
      item.runs = [
        { text: text.slice(0, splitAt + 1), font: { family: "Microsoft YaHei", weight: "bold" } },
        { text: text.slice(splitAt + 1), font: { family: "Microsoft YaHei", weight: "regular" } }
      ];
      item.style = { ...(item.style || {}), preserveTypography: true };
      item.source = { ...(item.source || {}), preserveTypography: true };
    } else {
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", color: "#1E1E1E", align: "left", valign: "middle" };
    }
  }
  return textBoxes;
}

function bindTextToComponentBox(textBox, box) {
  if (!validBox(box)) return textBox;
  textBox.box = roundBox(box);
  textBox.style = zeroMarginStyle(textBox.style);
  return textBox;
}

function cliScaffoldHeaderBox(central) {
  if (!validBox(central)) return null;
  return roundBox({
    x: central.x,
    y: central.y + 4,
    w: central.w,
    h: Math.max(28, central.h * 0.18)
  });
}

function zeroMarginStyle(style = {}) {
  return { ...style, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" };
}

function warningTextBox(box) {
  const component = nativeComponentMetadata("warning", "label");
  return {
    id: "cli-scaffold-warning-text",
    type: "text",
    text: "!",
    box: { ...box },
    font: { family: "Microsoft YaHei", sizePt: 15, color: "#FFFFFF", weight: "bold", align: "center", valign: "middle" },
    style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink", nativeComponentGroupId: component.nativeComponentGroupId },
    source: { editable: true, nativeRebuild: true, detector: `${DETECTOR_PREFIX}warning-text`, confidence: 0.96, ...component }
  };
}

function applyTextComponentMetadata(textBox, role, part) {
  const component = nativeComponentMetadata(role, part);
  textBox.style = { ...(textBox.style || {}), nativeComponentGroupId: component.nativeComponentGroupId };
  textBox.source = { ...(textBox.source || {}), ...component };
}

function nativeComponentMetadata(role, part) {
  const safeRole = safeToken(role);
  return {
    nativeComponentGroupId: `cli-scaffold-component-${safeRole}`,
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentArchetype: "cli-scaffold",
    nativeComponentRole: safeRole,
    nativeComponentPart: safeToken(part)
  };
}

function safeToken(value) {
  const token = String(value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return token || "unknown";
}

function rect(id, box, style, source) {
  return { id: `cli-scaffold-${id}`, type: "rect", box: roundBox(box), style, source };
}

function line(id, from, to, style, source) {
  return {
    id: `cli-scaffold-${id}`,
    type: "line",
    box: { x: round(from.x), y: round(from.y), w: round(to.x - from.x), h: round(to.y - from.y) },
    style,
    source
  };
}

function polyline(id, points, style, source) {
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const width = Math.max(0.01, Math.max(...points.map((point) => point.x)) - left);
  const height = Math.max(0.01, Math.max(...points.map((point) => point.y)) - top);
  return {
    id: `cli-scaffold-${id}`,
    type: "freeform",
    box: roundBox({ x: left, y: top, w: width, h: height }),
    points: points.map((point) => ({
      x: round((point.x - left) / width),
      y: round((point.y - top) / height)
    })),
    style,
    source
  };
}

function normalizeText(value) {
  return String(value || "").replace(/[—–−]/g, "-").replace(/\s+/g, "").trim();
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].map(Number).every(Number.isFinite)
    && Number(box.x) >= 0
    && Number(box.y) >= 0
    && Number(box.w) > 0
    && Number(box.h) > 0
    && Number(box.w) <= 4000
    && Number(box.h) <= 2500;
}

function center(box) {
  return { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y) + Number(box.h) / 2 };
}

function strictlyIncreasing(values) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function medianAdjacentGap(values) {
  const gaps = values.slice(1).map((value, index) => value - values[index]).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 0;
}

function finitePositive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function roundBox(box) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

module.exports = {
  DETECTOR_PREFIX,
  createCliScaffoldGeneratorObjects,
  normalizeCliScaffoldGeneratorTextBoxes
};
