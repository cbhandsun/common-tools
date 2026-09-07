"use strict";
// @ts-check
const {constrainPtBox} = require("./raster-native-detection");
const {lineBox} = require("./workflow-shape-primitives");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} Slide */
/** @typedef {{id?:string,box:Box,source?:Record<string,unknown>}} Image */
/** @typedef {{text?:string,box?:Box,fontSizePt?:number,font?:{sizePt?:number,color?:string,weight?:string|number,align?:string}}} TextBox */
/** @typedef {{role:string,type:string,box:Box,style:Record<string,unknown>}} Icon */
const MAX_INPUT_ITEMS = 30000;
const MAX_STRING_LENGTH = 32768;
const MAX_COORDINATE = 100000;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isDataRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {object} object @param {string} key @returns {unknown} */
function readData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new RangeError("Invalid tool platform input");
  return descriptor.value;
}

/** @param {unknown} value */
function validateBox(value) {
  if (!isDataRecord(value)) throw new RangeError("Invalid tool platform input");
  for (const key of ["x", "y", "w", "h"]) {
    const coordinate = readData(value, key);
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate) || Math.abs(coordinate) > MAX_COORDINATE) throw new RangeError("Invalid tool platform input");
  }
  if (/** @type {number} */ (readData(value, "w")) < 0 || /** @type {number} */ (readData(value, "h")) < 0) throw new RangeError("Invalid tool platform input");
}

/** @param {unknown} value */
function validateText(value) {
  if (!isDataRecord(value)) throw new RangeError("Invalid tool platform input");
  const text = readData(value, "text");
  if (text !== undefined && typeof text !== "string") throw new RangeError("Invalid tool platform input");
  if (typeof text === "string" && text.length > MAX_STRING_LENGTH) throw new RangeError("Invalid tool platform input");
  const fontSizePt = readData(value, "fontSizePt");
  if (fontSizePt !== undefined && (typeof fontSizePt !== "number" || !Number.isFinite(fontSizePt) || fontSizePt < 0 || fontSizePt > MAX_COORDINATE)) throw new RangeError("Invalid tool platform input");
  const box = readData(value, "box");
  if (box !== undefined) validateBox(box);
  const font = readData(value, "font");
  if (font !== undefined) {
    if (!isDataRecord(font)) throw new RangeError("Invalid tool platform input");
    for (const key of ["sizePt", "color", "weight", "align"]) {
      const field = readData(font, key);
      if (field !== undefined && ((key === "sizePt" && (typeof field !== "number" || !Number.isFinite(field) || field < 0 || field > MAX_COORDINATE)) || (key !== "sizePt" && typeof field !== "string" && !(key === "weight" && typeof field === "number" && Number.isFinite(field))))) throw new RangeError("Invalid tool platform input");
      if (typeof field === "string" && field.length > MAX_STRING_LENGTH) throw new RangeError("Invalid tool platform input");
    }
  }
}

/** @param {unknown} image @param {unknown} textBoxes @param {unknown} slideSize @returns {{image:Image,textBoxes:TextBox[],slideSize:Slide}} */
function validateExternalInputs(image, textBoxes, slideSize) {
  if (!isDataRecord(image)) throw new RangeError("Invalid tool platform input");
  validateBox(readData(image, "box"));
  const id = readData(image, "id");
  if (id !== undefined && (typeof id !== "string" || id.length > MAX_STRING_LENGTH)) throw new RangeError("Invalid tool platform input");
  const source = readData(image, "source");
  if (source !== undefined) {
    if (!isDataRecord(source)) throw new RangeError("Invalid tool platform input");
    for (const key of Object.keys(source)) {
      const field = readData(source, key);
      if (typeof field === "string" && field.length > MAX_STRING_LENGTH) throw new RangeError("Invalid tool platform input");
      if (["detector", "nonEditableReason", "reason"].includes(key) && field != null && typeof field !== "string") throw new RangeError("Invalid tool platform input");
    }
  }
  if (!Array.isArray(textBoxes) || textBoxes.length > MAX_INPUT_ITEMS) throw new RangeError("Invalid tool platform input");
  let textCharacters = 0;
  /** @type {TextBox[]} */ const validatedText = [];
  for (let index = 0; index < textBoxes.length; index++) {
    const text = readData(textBoxes, String(index));
    validateText(text);
    const content = isDataRecord(text) ? readData(text, "text") : undefined;
    textCharacters += typeof content === "string" ? content.length : 0;
    if (textCharacters > 32 * 1024 * 1024) throw new RangeError("Invalid tool platform input");
    validatedText.push(/** @type {TextBox} */ (text));
  }
  if (!isDataRecord(slideSize)) throw new RangeError("Invalid tool platform input");
  const width = readData(slideSize, "widthPt");
  const height = readData(slideSize, "heightPt");
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > MAX_COORDINATE || height > MAX_COORDINATE) throw new RangeError("Invalid tool platform input");
  return {image: /** @type {Image} */ (image), textBoxes: validatedText, slideSize: {widthPt: width, heightPt: height}};
}

/** @param {unknown} [inputImages] @param {unknown} [inputText] @param {unknown} [sourceImage] @param {unknown} [inputSlide] */
function createToolGapPlatformDiagramObjects(inputImages = [], inputText = [], sourceImage = null, inputSlide = DEFAULT_SLIDE) {
  if (!sourceImage) return { shapes: [], textBoxes: [] };
  const {textBoxes: rawTextBoxes, slideSize} = validateExternalInputs({box:{x:0,y:0,w:0,h:0}}, inputText, inputSlide);
  if (!Array.isArray(inputImages) || inputImages.length > MAX_INPUT_ITEMS) throw new RangeError("Invalid tool platform input");
  /** @type {Image[]} */ const images = [];
  for (let index=0;index<inputImages.length;index++) images.push(validateExternalInputs(readData(inputImages,String(index)),[],slideSize).image);
  const allText = rawTextBoxes.map(item => item.text || "").join(" ");
  const target = images.find((image) => isEligibleToolPlatformImage(image, allText, slideSize));
  if (!target) return { shapes: [], textBoxes: [] };
  const layout = inferToolGapPlatformDiagramLayout(target, rawTextBoxes, slideSize);
  if (!layout) return { shapes: [], textBoxes: [] };
  target.source = {
    ...(target.source || {}),
    toolGapPlatformObjectified: true,
    objectifiedToolGapRows: layout.rowBands.length,
    objectifiedToolGapIcons: layout.iconShapes.length,
    objectifiedToolGapConnectors: layout.connectorShapes.length,
    toolGapPlatformNativeTextBoxes: layout.textBoxes.length,
    toolGapPlatformTextEraseBoxes: layout.textBoxes.map((item) => item.box).filter(Boolean),
    nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "mixed diagram crop"}; rebuilt tool-gap comparison table, status row, and PM Portal flow as native editable objects`
  };
  /** @param {string} detector @param {Record<string,unknown>} [extra] */
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: target.id || null,
    confidence: layout.confidence,
    ...extra
  });
  const shapes = [
    ...layout.rowBands.flatMap((band, index) => [
      {
        id: `${target.id || "tool-gap"}-native-row-${index}`,
        type: "rect",
        box: band.box,
        style: {
          fill: band.fill,
          stroke: "#BFC8D2",
          strokeWidthPt: 0.9
        },
        source: source("tool-gap-platform-native-row", { rowIndex: index })
      },
      {
        id: `${target.id || "tool-gap"}-native-left-label-${index}`,
        type: "rect",
        box: band.labelBox,
        style: {
          fill: "#EEF3F8",
          stroke: "#BFC8D2",
          strokeWidthPt: 0.8
        },
        source: source("tool-gap-platform-native-label-cell", { rowIndex: index })
      }
    ]),
    ...layout.columnDividers.map((line, index) => ({
      id: `${target.id || "tool-gap"}-native-divider-${index}`,
      type: "line",
      box: line.box,
      style: {
        stroke: "#C9D2DC",
        strokeWidthPt: line.strokeWidthPt,
        connectorType: "straight"
      },
      source: source("tool-gap-platform-native-divider", { dividerIndex: index })
    })),
    ...layout.connectorShapes.map((line, index) => ({
      id: `${target.id || "tool-gap"}-native-connector-${index}`,
      type: "line",
      box: line.box,
      style: {
        stroke: line.stroke,
        strokeWidthPt: line.strokeWidthPt,
        connectorType: "straight",
        endArrow: line.endArrow,
        lineCap: "round"
      },
      source: source("tool-gap-platform-native-connector", { connectorIndex: index })
    })),
    ...layout.loopShapes.map((shape, index) => ({
      id: `${target.id || "tool-gap"}-native-loop-${index}`,
      type: shape.type,
      box: shape.box,
      style: shape.style,
      source: source("tool-gap-platform-native-loop", { loopIndex: index, loopRole: shape.role })
    })),
    ...layout.iconShapes.map((shape, index) => ({
      id: `${target.id || "tool-gap"}-native-icon-${index}`,
      type: shape.type,
      box: shape.box,
      style: shape.style,
      source: source("tool-gap-platform-native-icon", { iconIndex: index, iconRole: shape.role })
    }))
  ];
  return { shapes, textBoxes: layout.textBoxes };
}

/** @param {unknown} inputImage @param {unknown} [inputText] @param {unknown} [inputSlide] */
function shouldObjectifyToolGapPlatformDiagram(inputImage, inputText = [], inputSlide = DEFAULT_SLIDE) {
  const {image,textBoxes,slideSize} = validateExternalInputs(inputImage, inputText, inputSlide);
  return isEligibleToolPlatformImage(image, textBoxes.map(item => item.text || "").join(" "), slideSize);
}

/** @param {Image} image @param {string} allText @param {Slide} slideSize */
function isEligibleToolPlatformImage(image, allText, slideSize) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.toolGapPlatformObjectified === true) return false;
  if (source.detector !== "mixed-diagram-graphic-underlay-crop") return false;
  if (Number(box.w || 0) < slideSize.widthPt * 0.72 || Number(box.h || 0) < slideSize.heightPt * 0.56) return false;
  return /跨越工具孤岛/.test(allText)
    && /传统协作模式/.test(allText)
    && /普通AI工具/.test(allText)
    && /PM\s*Portal/i.test(allText)
    && /Platform/i.test(allText);
}

/** @param {unknown} inputImage @param {unknown} [inputText] @param {unknown} [inputSlide] */
function inferToolGapPlatformDiagramLayout(inputImage, inputText = [], inputSlide = DEFAULT_SLIDE) {
  const {image,textBoxes:rawTextBoxes,slideSize} = validateExternalInputs(inputImage, inputText, inputSlide);
  const b = image.box || {};
  if (!b.w || !b.h) return null;
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  /** @param {number} n */
  const sx = (n) => b.x + b.w * n;
  /** @param {number} n */
  const sy = (n) => b.y + b.h * n;
  /** @param {number} n */
  const sw = (n) => b.w * n;
  /** @param {number} n */
  const sh = (n) => b.h * n;
  const rowBands = [
    { role: "manual", box: { x: b.x, y: sy(0.01), w: b.w, h: sh(0.24) }, fill: "#F6FAFD" },
    { role: "ai-tool", box: { x: b.x, y: sy(0.34), w: b.w, h: sh(0.21) }, fill: "#F7FAFD" },
    { role: "platform", box: { x: b.x, y: sy(0.68), w: b.w, h: sh(0.27) }, fill: "#F7FAFD" }
  ].map((row) => ({
    ...row,
    box: constrainPtBox(row.box, bounds),
    labelBox: constrainPtBox({ x: row.box.x, y: row.box.y, w: sw(0.16), h: row.box.h }, bounds)
  }));
  const columnDividers = [
    { x: sx(0.16), y1: sy(0.01), y2: sy(0.95), strokeWidthPt: 0.9 },
    { x: sx(0.76), y1: sy(0.01), y2: sy(0.95), strokeWidthPt: 0.9 },
    { x: sx(0.49), y1: sy(0.01), y2: sy(0.28), strokeWidthPt: 0.7 }
  ].map((line) => ({
    ...line,
    box: lineBox({ x: line.x, y: line.y1 }, { x: line.x, y: line.y2 })
  }));
  /** @type {{from:[number,number],to:[number,number],stroke:string,strokeWidthPt:number,endArrow:string}[]} */
  const connectorDefinitions = [
    { from: [0.22, 0.18], to: [0.32, 0.18], stroke: "#F28C24", strokeWidthPt: 1.7, endArrow: "triangle" },
    { from: [0.43, 0.18], to: [0.53, 0.18], stroke: "#F28C24", strokeWidthPt: 1.7, endArrow: "triangle" },
    { from: [0.64, 0.18], to: [0.72, 0.18], stroke: "#F28C24", strokeWidthPt: 1.7, endArrow: "triangle" },
    { from: [0.28, 0.47], to: [0.75, 0.47], stroke: "#B7BEC7", strokeWidthPt: 1.5, endArrow: "triangle" },
    { from: [0.30, 0.78], to: [0.73, 0.78], stroke: "#1478B8", strokeWidthPt: 3.0, endArrow: "triangle" },
    { from: [0.58, 0.79], to: [0.73, 0.79], stroke: "#22A76B", strokeWidthPt: 3.0, endArrow: "triangle" }
  ];
  const connectorShapes = connectorDefinitions.map((line) => ({
    ...line,
    box: lineBox({ x: sx(line.from[0]), y: sy(line.from[1]) }, { x: sx(line.to[0]), y: sy(line.to[1]) })
  }));
  const loopShapes = [
    { role: "left-loop", type: "ellipse", box: { x: sx(0.21), y: sy(0.72), w: sw(0.27), h: sh(0.17) }, stroke: "#1478B8" },
    { role: "right-loop", type: "ellipse", box: { x: sx(0.43), y: sy(0.72), w: sw(0.27), h: sh(0.17) }, stroke: "#1478B8" },
    { role: "platform-chip-left", type: "roundRect", box: { x: sx(0.25), y: sy(0.735), w: sw(0.13), h: sh(0.055) }, fill: "#E8F3FE", stroke: "#1478B8" },
    { role: "platform-chip-right", type: "roundRect", box: { x: sx(0.51), y: sy(0.735), w: sw(0.13), h: sh(0.055) }, fill: "#E8F9F1", stroke: "#22A76B" }
  ].map((shape) => ({
    ...shape,
    box: constrainPtBox(shape.box, bounds),
    style: {
      fill: shape.fill || "none",
      stroke: shape.stroke,
      strokeWidthPt: shape.type === "ellipse" ? 3.2 : 1.1,
      radiusRatio: shape.type === "roundRect" ? 0.25 : undefined
    }
  }));
  const iconShapes = [
    ...toolGapDocumentIconCluster(b, bounds),
    ...toolGapAiStatusIconCluster(b, bounds),
    ...toolGapPlatformIconCluster(b, bounds)
  ];
  const textBoxes = toolGapPlatformNativeTextBoxes(image, rawTextBoxes);
  return {
    rowBands,
    columnDividers,
    connectorShapes,
    loopShapes,
    iconShapes,
    textBoxes,
    confidence: 0.82
  };
}

/** @param {Box} b @param {Box} bounds @returns {Icon[]} */
function toolGapDocumentIconCluster(b, bounds) {
  /** @type {[number,number,string,string][]} */
  const positions = [
    [0.215, 0.095, "#F3A33A", "doc"],
    [0.355, 0.095, "#F3A33A", "prototype"],
    [0.555, 0.095, "#F3A33A", "review"]
  ];
  return positions.flatMap(([x, y, color, role], index) => {
    const box = constrainPtBox({ x: b.x + b.w * x, y: b.y + b.h * y, w: b.w * 0.05, h: b.h * 0.095 }, bounds);
    return [
      {
        role: `${role}-paper`,
        type: "rect",
        box,
        style: { fill: "#FFFFFF", stroke: color, strokeWidthPt: 1.2 }
      },
      {
        role: `${role}-fold`,
        type: "triangle",
        box: constrainPtBox({ x: box.x + box.w * 0.62, y: box.y, w: box.w * 0.38, h: box.h * 0.30 }, bounds),
        style: { fill: "#FFE1B9", stroke: color, strokeWidthPt: 0.7, rotation: 45 }
      },
      {
        role: `${role}-line-${index}`,
        type: "rect",
        box: constrainPtBox({ x: box.x + box.w * 0.18, y: box.y + box.h * 0.58, w: box.w * 0.58, h: 1.6 }, bounds),
        style: { fill: color, stroke: color, strokeWidthPt: 0 }
      }
    ];
  });
}

/** @param {Box} b @param {Box} bounds @returns {Icon[]} */
function toolGapAiStatusIconCluster(b, bounds) {
  const icons = [
    { role: "chat-a", type: "roundRect", x: 0.22, y: 0.42, w: 0.060, h: 0.060, fill: "#B5BBC3", stroke: "#8C949E" },
    { role: "chat-b", type: "roundRect", x: 0.30, y: 0.42, w: 0.060, h: 0.060, fill: "#B5BBC3", stroke: "#8C949E" },
    { role: "check-a", type: "ellipse", x: 0.405, y: 0.42, w: 0.045, h: 0.060, fill: "#2EAD67", stroke: "#2EAD67" },
    { role: "warning-a", type: "triangle", x: 0.500, y: 0.42, w: 0.050, h: 0.065, fill: "#F4A42C", stroke: "#E18716" },
    { role: "warning-b", type: "triangle", x: 0.595, y: 0.42, w: 0.050, h: 0.065, fill: "#F4A42C", stroke: "#E18716" },
    { role: "warning-c", type: "triangle", x: 0.690, y: 0.42, w: 0.050, h: 0.065, fill: "#F4A42C", stroke: "#E18716" }
  ];
  return icons.flatMap((icon) => {
    const box = constrainPtBox({ x: b.x + b.w * icon.x, y: b.y + b.h * icon.y, w: b.w * icon.w, h: b.h * icon.h }, bounds);
    const base = {
      role: icon.role,
      type: icon.type,
      box,
      style: {
        fill: icon.fill,
        stroke: icon.stroke,
        strokeWidthPt: 0.8,
        radiusRatio: icon.type === "roundRect" ? 0.22 : undefined
      }
    };
    if (!icon.role.startsWith("check")) return [base];
    return [
      base,
      {
        role: `${icon.role}-tick`,
        type: "line",
        box: lineBox({ x: box.x + box.w * 0.28, y: box.y + box.h * 0.55 }, { x: box.x + box.w * 0.46, y: box.y + box.h * 0.72 }),
        style: { stroke: "#FFFFFF", strokeWidthPt: 1.2, connectorType: "straight" }
      },
      {
        role: `${icon.role}-tick-long`,
        type: "line",
        box: lineBox({ x: box.x + box.w * 0.45, y: box.y + box.h * 0.72 }, { x: box.x + box.w * 0.76, y: box.y + box.h * 0.33 }),
        style: { stroke: "#FFFFFF", strokeWidthPt: 1.2, connectorType: "straight" }
      }
    ];
  });
}

/** @param {Box} b @param {Box} bounds @returns {Icon[]} */
function toolGapPlatformIconCluster(b, bounds) {
  const search = constrainPtBox({ x: b.x + b.w * 0.238, y: b.y + b.h * 0.730, w: b.w * 0.055, h: b.h * 0.100 }, bounds);
  const catalog = constrainPtBox({ x: b.x + b.w * 0.552, y: b.y + b.h * 0.728, w: b.w * 0.052, h: b.h * 0.098 }, bounds);
  return [
    { role: "search-tile", type: "roundRect", box: search, style: { fill: "#E8F3FE", stroke: "#1478B8", strokeWidthPt: 1, radiusRatio: 0.12 } },
    { role: "search-lens", type: "ellipse", box: constrainPtBox({ x: search.x + search.w * 0.24, y: search.y + search.h * 0.22, w: search.w * 0.36, h: search.h * 0.36 }, bounds), style: { fill: "none", stroke: "#1478B8", strokeWidthPt: 1.5 } },
    { role: "search-handle", type: "line", box: lineBox({ x: search.x + search.w * 0.58, y: search.y + search.h * 0.58 }, { x: search.x + search.w * 0.78, y: search.y + search.h * 0.78 }), style: { stroke: "#1478B8", strokeWidthPt: 1.5, connectorType: "straight" } },
    { role: "catalog-tile", type: "roundRect", box: catalog, style: { fill: "#E8F9F1", stroke: "#22A76B", strokeWidthPt: 1, radiusRatio: 0.12 } },
    { role: "catalog-line-a", type: "rect", box: constrainPtBox({ x: catalog.x + catalog.w * 0.22, y: catalog.y + catalog.h * 0.28, w: catalog.w * 0.56, h: 1.8 }, bounds), style: { fill: "#22A76B", stroke: "#22A76B", strokeWidthPt: 0 } },
    { role: "catalog-line-b", type: "rect", box: constrainPtBox({ x: catalog.x + catalog.w * 0.22, y: catalog.y + catalog.h * 0.50, w: catalog.w * 0.56, h: 1.8 }, bounds), style: { fill: "#22A76B", stroke: "#22A76B", strokeWidthPt: 0 } },
    { role: "catalog-line-c", type: "rect", box: constrainPtBox({ x: catalog.x + catalog.w * 0.22, y: catalog.y + catalog.h * 0.72, w: catalog.w * 0.45, h: 1.8 }, bounds), style: { fill: "#22A76B", stroke: "#22A76B", strokeWidthPt: 0 } }
  ];
}

/** @param {unknown} inputImage @param {unknown} [inputText] */
function toolGapPlatformNativeTextBoxes(inputImage, inputText = []) {
  const {image,textBoxes:rawTextBoxes} = validateExternalInputs(inputImage, inputText, DEFAULT_SLIDE);
  const b = image.box || {};
  const candidates = (rawTextBoxes || []).filter((item) => {
    const box = item.box ?? {x: 0, y: 0, w: 0, h: 0};
    const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
    const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
    return cx >= b.x - 2 && cx <= b.x + b.w + 2 && cy >= b.y - 2 && cy <= b.y + b.h + 2;
  });
  return candidates.map((item, index) => {
    const text = String(item.text || "");
    const sizePt = Number(item.font?.sizePt || item.fontSizePt || 12);
    return {
      id: `${image.id || "tool-gap"}-native-text-${index}`,
      text,
      box: item.box,
      font: {
        family: /[\u4e00-\u9fa5]/.test(text) ? "Microsoft YaHei" : "Aptos",
        sizePt,
        color: item.font?.color || "#111827",
        weight: item.font?.weight || (/^(?:深|PM Portal|Platform)$/i.test(text.trim()) ? "bold" : "regular"),
        align: item.font?.align || "center",
        valign: "middle",
        opacity: 1
      },
      style: {
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        fit: "shrink"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "tool-gap-platform-native-text",
        layerSourceId: image.id || null,
        confidence: 0.82
      }
    };
  });
}

module.exports = {createToolGapPlatformDiagramObjects, inferToolGapPlatformDiagramLayout, toolGapAiStatusIconCluster, toolGapDocumentIconCluster, toolGapPlatformIconCluster, toolGapPlatformNativeTextBoxes, shouldObjectifyToolGapPlatformDiagram};
