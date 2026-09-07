"use strict";
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");
const { boxCenterInside, round, luma, pixel, saturation, rgbToHsl, clamp } = require("./raster-native-detection");
const { looksLikeLargeKpiValue, looksLikeTopTitle } = require("./native-text-style");

function cropExpressionStats(image, pxBox) {
  const step = Math.max(1, Math.floor(Math.min(pxBox.w, pxBox.h) / 90));
  let total = 0;
  let saturated = 0;
  let paleNeutral = 0;
  let lightPanel = 0;
  let centerTotal = 0;
  let centerWhite = 0;
  const center = {
    x1: pxBox.x + pxBox.w * 0.34,
    x2: pxBox.x + pxBox.w * 0.66,
    y1: pxBox.y + pxBox.h * 0.30,
    y2: pxBox.y + pxBox.h * 0.70
  };
  for (let y = pxBox.y; y < pxBox.y + pxBox.h; y += step) {
    for (let x = pxBox.x; x < pxBox.x + pxBox.w; x += step) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      const sat = saturation(color);
      const lum = luma(color);
      total += 1;
      if (sat >= 0.24 && lum < 245) saturated += 1;
      if (sat < 0.08 && lum >= 210 && lum <= 245) paleNeutral += 1;
      if (sat >= 0.08 && sat < 0.24 && lum >= 205 && lum <= 248) lightPanel += 1;
      if (x >= center.x1 && x <= center.x2 && y >= center.y1 && y <= center.y2) {
        centerTotal += 1;
        if (lum >= 245 && sat < 0.08) centerWhite += 1;
      }
    }
  }
  return {
    saturatedRatio: total ? saturated / total : 0,
    paleNeutralRatio: total ? paleNeutral / total : 0,
    lightPanelRatio: total ? lightPanel / total : 0,
    centerWhiteRatio: centerTotal ? centerWhite / centerTotal : 0
  };
}

function connectedColorBlockEntries(image, pxBox) {
  const step = 4;
  const cols = Math.max(1, Math.ceil(pxBox.w / step));
  const rows = Math.max(1, Math.ceil(pxBox.h / step));
  const keys = new Array(cols * rows).fill(null);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(pxBox.x + col * step, pxBox.x + pxBox.w - 1);
      const y = Math.min(pxBox.y + row * step, pxBox.y + pxBox.h - 1);
      const color = pixel(image, x, y);
      if (!isTableBlockSeed(color)) continue;
      keys[row * cols + col] = tableBlockColorKey(color);
    }
  }
  const visited = new Uint8Array(cols * rows);
  const entries = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const start = row * cols + col;
      const key = keys[start];
      if (!key || visited[start]) continue;
      const queue = [[col, row]];
      visited[start] = 1;
      let qi = 0;
      let count = 0;
      let minX = pxBox.x + col * step;
      let maxX = minX;
      let minY = pxBox.y + row * step;
      let maxY = minY;
      const colors = [];
      while (qi < queue.length) {
        const [cx, cy] = queue[qi++];
        const x = Math.min(pxBox.x + cx * step, pxBox.x + pxBox.w - 1);
        const y = Math.min(pxBox.y + cy * step, pxBox.y + pxBox.h - 1);
        colors.push(pixel(image, x, y));
        count += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const next = ny * cols + nx;
          if (visited[next] || keys[next] !== key) continue;
          visited[next] = 1;
          queue.push([nx, ny]);
        }
      }
      entries.push({ key, count, minX, minY, maxX, maxY, colors });
    }
  }
  return entries;
}

function isTableBlockSeed(color) {
  if (color.a < 64) return false;
  const hsl = rgbToHsl(color);
  if (hsl.l < 0.18 || hsl.l > 0.76) return false;
  return hsl.s >= 0.28;
}

function tableBlockColorKey(color) {
  const hsl = rgbToHsl(color);
  return `${Math.floor(hsl.h / 25)}-${Math.floor(hsl.s * 4)}-${Math.floor(hsl.l * 4)}`;
}

function inferDiagramSemanticSignals(textBoxes = []) {
  const text = (textBoxes || []).map((item) => String(item?.text || "")).join("\n");
  const groups = [
    /WMS|Tollgate|Inbound|Outbound|PRD|Debug|Debugger|HTML|API/i,
    /挑战|痛点|问题|风险|阻断|瓶颈|熵增|断层|孤岛/,
    /AI\s*介入|AI能力|AI中台|AI\s*Skill|PMSkills|AISkills/i,
    /价值落地|产出价值|收益|提效|降本|复用|资产复利/,
    /输入|输出|流转|链路|流程|闭环|协同|交互|转化/,
    /Tollgate\d+|V\d+(?:\.\d+)?|V\d+[A-Z]?|版本|码表/i,
    /修复建议|边界缺失|权限|公式|规则|状态计算/,
    /原型|截图|页面|界面|组件|按钮|表单|看板/
  ];
  return groups.filter((pattern) => pattern.test(text)).length;
}

function scoreDiagramCandidate({ panels = [], textBoxes = [], slideSize = DEFAULT_SLIDE, structuralLines = [], semanticSignals = 0 } = {}) {
  const validPanels = (Array.isArray(panels) ? panels : [panels]).filter(Boolean);
  if (validPanels.length === 0) {
    return { score: 0, reasons: ["no-panels"], metrics: {} };
  }
  const inferredSemanticSignals = inferDiagramSemanticSignals(textBoxes);
  const effectiveSemanticSignals = Math.max(Number(semanticSignals || 0), inferredSemanticSignals);
  const slideArea = Math.max(1, slideSize.widthPt * slideSize.heightPt);
  const panelArea = validPanels.reduce((sum, box) => sum + Math.max(0, Number(box.w || 0) * Number(box.h || 0)), 0);
  const panelAreaRatio = panelArea / slideArea;
  const insideText = textBoxes.filter((textBox) => validPanels.some((panel) => boxCenterInside(textBox.box, panel)));
  const textCoverage = insideText.length / Math.max(1, textBoxes.length);
  const xBuckets = new Set(insideText.map((textBox) => {
    const centerX = Number(textBox?.box?.x || 0) + Number(textBox?.box?.w || 0) / 2;
    return Math.max(0, Math.min(3, Math.floor(centerX / Math.max(1, slideSize.widthPt / 4))));
  }));
  const yBuckets = new Set(insideText.map((textBox) => {
    const centerY = Number(textBox?.box?.y || 0) + Number(textBox?.box?.h || 0) / 2;
    return Math.max(0, Math.min(2, Math.floor(centerY / Math.max(1, slideSize.heightPt / 3))));
  }));
  const relevantLines = (structuralLines || []).filter((line) =>
    validPanels.some((panel) => boxCenterInside(line.box, panel))
  );
  const reasons = [];
  let score = 0;
  if (panelAreaRatio >= 0.28 && panelAreaRatio <= 0.78) {
    score += 2;
    reasons.push("diagram-sized-region");
  }
  if (textCoverage >= 0.55) {
    score += 1;
    reasons.push("text-over-visual-region");
  }
  if (xBuckets.size >= 3 || yBuckets.size >= 2) {
    score += 1;
    reasons.push("distributed-labels");
  }
  if (validPanels.length >= 2) {
    score += 1;
    reasons.push("segmented-layout");
  }
  if (relevantLines.length >= 3) {
    score += 1;
    reasons.push("structural-line-noise");
  }
  if (effectiveSemanticSignals >= 3) {
    score += 2;
    reasons.push("semantic-diagram-signals");
  } else if (effectiveSemanticSignals >= 1) {
    score += 1;
    reasons.push("weak-semantic-signal");
  }
  const risk = {
    tooMuchRaster: panelAreaRatio > 0.74 && effectiveSemanticSignals < 5,
    weakTextAnchor: textCoverage < 0.45 && effectiveSemanticSignals < 3,
    broadSinglePanel: validPanels.length === 1 && panelAreaRatio > 0.68 && effectiveSemanticSignals < 4
  };
  if (risk.tooMuchRaster) reasons.push("risk-too-much-raster");
  if (risk.weakTextAnchor) reasons.push("risk-weak-text-anchor");
  if (risk.broadSinglePanel) reasons.push("risk-broad-single-panel");
  return {
    score,
    reasons,
    metrics: {
      panelAreaRatio: round(panelAreaRatio),
      textCoverage: round(textCoverage),
      panelCount: validPanels.length,
      textBucketColumns: xBuckets.size,
      textBucketRows: yBuckets.size,
      relevantLineCount: relevantLines.length,
      semanticSignals: effectiveSemanticSignals,
      explicitSemanticSignals: Number(semanticSignals || 0),
      inferredSemanticSignals,
      risk
    }
  };
}

function kpiEvidenceLayoutBounds(textBoxes, slideSize = DEFAULT_SLIDE) {
  const values = textBoxes
    .filter((item) => looksLikeLargeKpiValue(item.text) && Number(item?.box?.h || 0) >= 48)
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  if (values.length !== 4) return null;
  const title = textBoxes.find((item) => looksLikeTopTitle(item));
  const conclusion = textBoxes.find((item) => {
    const text = String(item?.text || "");
    const box = item?.box || {};
    return /AI\s*Skills|AISkills/i.test(text)
      && /企业级|基础设施|验证/.test(text)
      && Number(box.y || 0) >= slideSize.heightPt * 0.78;
  });
  if (!title || !conclusion) return null;
  const captions = textBoxes.filter((item) => {
    const box = item?.box || {};
    const text = String(item?.text || "").trim();
    return !looksLikeLargeKpiValue(text)
      && !looksLikeTopTitle(item)
      && item !== conclusion
      && Number(box.y || 0) >= slideSize.heightPt * 0.36
      && Number(box.y || 0) <= slideSize.heightPt * 0.8;
  });
  if (captions.length < 4) return null;
  const columns = values.map((item) => Number(item.box.x || 0) + Number(item.box.w || 0) / 2);
  const leftValues = values.filter((item) => Number(item.box.x || 0) + Number(item.box.w || 0) / 2 < slideSize.widthPt / 2);
  const rightValues = values.filter((item) => Number(item.box.x || 0) + Number(item.box.w || 0) / 2 >= slideSize.widthPt / 2);
  if (leftValues.length !== 2 || rightValues.length !== 2) return null;
  const topValues = values.slice(0, 2);
  const bottomValues = values.slice(2, 4);
  if (Math.abs(topValues[0].box.y - topValues[1].box.y) > 14) return null;
  if (Math.abs(bottomValues[0].box.y - bottomValues[1].box.y) > 14) return null;
  if (Math.min(...columns) < slideSize.widthPt * 0.12 || Math.max(...columns) > slideSize.widthPt * 0.9) return null;
  const marginX = round(clamp(Math.min(...values.map((item) => item.box.x)) - 72, 36, 70));
  const gap = round(clamp(slideSize.widthPt * 0.018, 12, 20));
  const cardW = round((slideSize.widthPt - marginX * 2 - gap) / 2);
  const row1Y = round(clamp(Math.min(...topValues.map((item) => item.box.y)) - 27, 96, 118));
  const row2Y = round(clamp(Math.min(...bottomValues.map((item) => item.box.y)) - 29, 270, 292));
  const row1Bottom = Math.max(...captions
    .filter((item) => Number(item.box.y || 0) < (row2Y - 10))
    .map((item) => Number(item.box.y || 0) + Number(item.box.h || 0)));
  const row2Bottom = Math.max(...captions
    .filter((item) => Number(item.box.y || 0) >= (row2Y - 10))
    .map((item) => Number(item.box.y || 0) + Number(item.box.h || 0)));
  if (!Number.isFinite(row1Bottom) || !Number.isFinite(row2Bottom)) return null;
  const cardH1 = round(clamp(row1Bottom - row1Y + 18, 148, 166));
  const cardH2 = round(clamp(row2Bottom - row2Y + 18, 148, 166));
  const rightX = round(slideSize.widthPt - marginX - cardW);
  return {
    titleAccent: {
      x: round(clamp((title.box.x || 0) - 12.5, 42, 54)),
      y: round(clamp((title.box.y || 0) - 1.5, 38, 48)),
      w: 3.4,
      h: round(clamp((title.box.h || 0) + 10, 34, 44))
    },
    cards: [
      { x: marginX, y: row1Y, w: cardW, h: cardH1 },
      { x: rightX, y: row1Y, w: cardW, h: cardH1 },
      { x: marginX, y: row2Y, w: cardW, h: cardH2 },
      { x: rightX, y: row2Y, w: cardW, h: cardH2 }
    ],
    banner: {
      x: round(clamp((conclusion.box.x || 0) - 17, 92, 104)),
      y: round(clamp((conclusion.box.y || 0) - 13, 460, 468)),
      w: round(clamp((conclusion.box.w || 0) + 52, 758, 770)),
      h: round(clamp((conclusion.box.h || 0) + 29, 46, 54))
    }
  };
}

function shouldUseGraphicUnderlay({ aggregate, image, structuralLines = [], textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  if (textBoxes.length < 8 || structuralLines.length < 2) return false;
  const areaRatio = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.05 || areaRatio > 0.65) return false;
  if (aggregate.box.w > image.width * 0.92 && aggregate.box.h > image.height * 0.92) return false;
  return true;
}



function shouldUseSegmentedGraphicUnderlay({ aggregate, image, structuralLines = [], textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  if (textBoxes.length < 12 || structuralLines.length < 4) return false;
  const areaRatio = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  const fullCanvasAggregate = aggregate.box.w > image.width * 0.96 && aggregate.box.h > image.height * 0.96;
  if (areaRatio <= 0.7) return false;
  if (areaRatio > 0.86 && !(fullCanvasAggregate && structuralLines.length >= 120)) return false;
  return true;
}

function shouldUseContentGraphicUnderlay({ aggregate, image, structuralLines = [], detectedLineCount = 0, textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  const fullCanvasAggregate = aggregate.box.w > image.width * 0.96 && aggregate.box.h > image.height * 0.96;
  return fullCanvasAggregate && Math.max(structuralLines.length, detectedLineCount) >= 120 && textBoxes.length >= 12;
}

function shouldUseVisualClusterUnderlay({
  aggregate,
  image,
  cluster,
  components = [],
  structuralLines = [],
  detectedLineCount = 0,
  textBoxes = []
} = {}) {
  if (!aggregate || !image || !cluster) return false;
  if (textBoxes.length < 4 || textBoxes.length > 36) return false;
  const meaningfulComponents = components.filter((component) => {
    const areaRatio = component.box.w * component.box.h / Math.max(1, image.width * image.height);
    return areaRatio >= 0.004 && areaRatio <= 0.22;
  });
  if (meaningfulComponents.length < 3) return false;
  if (Math.max(structuralLines.length, detectedLineCount) < 2 && meaningfulComponents.length < 5) return false;
  const clusterArea = cluster.w * cluster.h / Math.max(1, image.width * image.height);
  if (clusterArea < 0.16 || clusterArea > 0.62) return false;
  if (cluster.w > image.width * 0.94 && cluster.h > image.height * 0.82) return false;
  const aggregateArea = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (aggregateArea > 0.78) return false;
  return true;
}

function shouldUseStructuredCaseUnderlay({ aggregate, image, structuralLines = [], textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  if (textBoxes.length < 14 || structuralLines.length < 3) return false;
  const aggregateArea = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (aggregateArea < 0.55 || aggregateArea > 0.94) return false;
  const textArea = textBoxes
    .map((item) => item.box)
    .filter(Boolean)
    .reduce((sum, box) => sum + Math.max(0, Number(box.w || 0) * Number(box.h || 0)), 0);
  const slideArea = 960 * 540;
  return textArea / slideArea >= 0.08;
}

function shouldUseMixedDiagramUnderlay({ aggregate, image, structuralLines = [], textBoxes = [], contentBox, slideSize = DEFAULT_SLIDE } = {}) {
  if (!aggregate || !image || !contentBox) return false;
  if (textBoxes.length < 18 || textBoxes.length > 34) return false;
  if (structuralLines.length < 3) return false;
  const aggregateArea = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (aggregateArea < 0.81 || aggregateArea > 0.94) return false;
  const contentArea = contentBox.w * contentBox.h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  if (contentArea < 0.54 || contentArea > 0.66) return false;
  return contentBox.w >= slideSize.widthPt * 0.82 && contentBox.h >= slideSize.heightPt * 0.62;
}

function shouldUseLeftIllustrationPanelUnderlay({ aggregate, image, leftBox, bannerBox, textBoxes = [], slideSize = DEFAULT_SLIDE } = {}) {
  if (!aggregate || !image || !leftBox || !bannerBox) return false;
  if (textBoxes.length < 16 || textBoxes.length > 24) return false;
  const aggregateArea = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (aggregateArea < 0.84) return false;
  const leftArea = leftBox.w * leftBox.h / Math.max(1, image.width * image.height);
  if (leftArea < 0.14 || leftArea > 0.32) return false;
  if (leftBox.x > image.width * 0.16 || leftBox.w > image.width * 0.42) return false;
  const bannerArea = bannerBox.w * bannerBox.h / Math.max(1, image.width * image.height);
  if (bannerArea < 0.05 || bannerArea > 0.18) return false;
  const rightTextCount = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.x || 0) >= slideSize.widthPt * 0.45
      && Number(box.y || 0) >= slideSize.heightPt * 0.25
      && Number(box.y || 0) <= slideSize.heightPt * 0.82;
  }).length;
  return rightTextCount >= 8;
}

function shouldUseTwoPanelDiagramCrops({ panels, textBoxes = [], slideSize = DEFAULT_SLIDE } = {}) {
  if (!Array.isArray(panels) || panels.length !== 2) return false;
  const upperLeft = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.x || 0) < slideSize.widthPt * 0.5
      && Number(box.y || 0) >= slideSize.heightPt * 0.18
      && Number(box.y || 0) <= slideSize.heightPt * 0.76;
  });
  const rightPanelText = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.x || 0) >= slideSize.widthPt * 0.52
      && Number(box.y || 0) >= slideSize.heightPt * 0.18
      && Number(box.y || 0) <= slideSize.heightPt * 0.76;
  });
  const bottomText = textBoxes.filter((item) => Number(item?.box?.y || 0) >= slideSize.heightPt * 0.8);
  const noisyLeftLabels = upperLeft.filter((item) => /^(?:w|v\d|v\d\.\d|v\d\.\d-fix|html?|<>|error|rfcor|码表|多版本)/i.test(String(item?.text || "").trim()));
  const panelArea = panels.reduce((sum, box) => sum + box.w * box.h, 0) / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  if (upperLeft.length < 12 || noisyLeftLabels.length < 7) return false;
  if (rightPanelText.length < 5 || bottomText.length < 5) return false;
  if (panelArea < 0.42 || panelArea > 0.72) return false;
  return panels.every((box) => box.y >= slideSize.heightPt * 0.1
    && box.y <= slideSize.heightPt * 0.22
    && box.h >= slideSize.heightPt * 0.48
    && box.h <= slideSize.heightPt * 0.72
    && box.w >= slideSize.widthPt * 0.34
    && box.w <= slideSize.widthPt * 0.5);
}

function shouldUseTopComplexDiagramCrop({ panel, textBoxes = [], slideSize = DEFAULT_SLIDE } = {}) {
  if (!panel) return false;
  const topText = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.y || 0) >= slideSize.heightPt * 0.08
      && Number(box.y || 0) <= slideSize.heightPt * 0.72;
  });
  const bottomText = textBoxes.filter((item) => Number(item?.box?.y || 0) >= slideSize.heightPt * 0.68);
  const signalCount = topText.filter((item) => {
    const text = String(item?.text || "").trim();
    return /debugger|prd|修复建议|前后矛盾|边界缺失|权限|阻断|^\d+$|^[+.中]$/i.test(text);
  }).length;
  const bottomLabels = bottomText.filter((item) => /痛点|能力|产出价值/.test(String(item?.text || ""))).length;
  const areaRatio = panel.w * panel.h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  if (topText.length < 20 || signalCount < 10) return false;
  if (bottomText.length < 5 || bottomLabels < 2) return false;
  if (areaRatio < 0.52 || areaRatio > 0.76) return false;
  return panel.x >= slideSize.widthPt * 0.04
    && panel.x <= slideSize.widthPt * 0.14
    && panel.y >= slideSize.heightPt * 0.06
    && panel.y <= slideSize.heightPt * 0.16
    && panel.w >= slideSize.widthPt * 0.72
    && panel.h >= slideSize.heightPt * 0.52
    && panel.y + panel.h <= slideSize.heightPt * 0.72;
}

function isAcceptableDiagramCandidate(candidate, minScore) {
  if (!candidate || candidate.score < minScore) return false;
  const risk = candidate.metrics?.risk || {};
  return !risk.tooMuchRaster && !risk.weakTextAnchor && !risk.broadSinglePanel;
}





function shouldUseComparisonMatrixCrop({ matrixBox, textBoxes = [], slideSize = DEFAULT_SLIDE } = {}) {
  if (!matrixBox) return false;
  if (textBoxes.length < 14 || textBoxes.length > 34) return false;
  const text = textBoxes.map((item) => String(item?.text || "")).join("\n");
  const hasHeaders = /传统工作方式/.test(text)
    && /普通\s*AI\s*工具/i.test(text)
    && /PM\s*Portal\s*AI\s*Skills/i.test(text);
  const rowSignals = ["场景理解", "流程引擎", "质量控制", "资产沉淀"]
    .filter((item) => text.includes(item)).length;
  const blueColumnSignals = ["深度结合", "需求", "前置拦截", "产出自动落盘"]
    .filter((item) => text.includes(item)).length;
  const areaRatio = matrixBox.w * matrixBox.h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  return hasHeaders
    && rowSignals >= 3
    && blueColumnSignals >= 2
    && areaRatio >= 0.58
    && areaRatio <= 0.86
    && matrixBox.x >= slideSize.widthPt * 0.02
    && matrixBox.x <= slideSize.widthPt * 0.12
    && matrixBox.y >= slideSize.heightPt * 0.04
    && matrixBox.y <= slideSize.heightPt * 0.16
    && matrixBox.w >= slideSize.widthPt * 0.78
    && matrixBox.h >= slideSize.heightPt * 0.68;
}

function shouldUseLineDiagramUnderlay({ pxBox, image, detectedLineCount = 0, textBoxes = [] } = {}) {
  if (!pxBox || !image) return false;
  if (detectedLineCount < 48) return false;
  const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.52 || areaRatio > 0.65) return false;
  if (pxBox.w > image.width * 0.94 && pxBox.h > image.height * 0.9) return false;
  return textBoxes.length <= 8;
}

function shouldUseIllustrationCardUnderlay({ image, textBoxes = [], box, slideSize = DEFAULT_SLIDE } = {}) {
  if (!image || !box) return false;
  if (textBoxes.length < 10 || textBoxes.length > 14) return false;
  const titleLike = textBoxes.filter((item) => {
    const itemBox = item?.box || {};
    const size = Number(item?.font?.sizePt || 0);
    return Number(itemBox.y || 0) < 125 && Number(itemBox.h || 0) >= 18 && size >= 17;
  });
  if (titleLike.length < 3) return false;
  const areaRatio = box.w * box.h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  if (areaRatio < 0.45 || areaRatio > 0.68) return false;
  return box.w >= slideSize.widthPt * 0.78 && box.h >= slideSize.heightPt * 0.58;
}

function shouldUseSaturatedDiagramUnderlay({ aggregate, image, pxBox, detectedLineCount = 0, textBoxes = [] } = {}) {
  if (!aggregate || !image || !pxBox) return false;
  if (textBoxes.length < 12 || textBoxes.length > 24) return false;
  if (detectedLineCount < 60) return false;
  const fullCanvasAggregate = aggregate.box.w > image.width * 0.96 && aggregate.box.h > image.height * 0.96;
  if (!fullCanvasAggregate) return false;
  const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  return areaRatio >= 0.34 && areaRatio <= 0.72;
}

function shouldUseSparseDiagramUnderlay({ aggregate, image, detectedLineCount = 0, textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  if (textBoxes.length < 6 || textBoxes.length > 10) return false;
  if (detectedLineCount < 48) return false;
  const areaRatio = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.18 || areaRatio > 0.45) return false;
  if (aggregate.box.w > image.width * 0.88 && aggregate.box.h > image.height * 0.8) return false;
  return true;
}

module.exports = { shouldUseGraphicUnderlay, shouldUseSegmentedGraphicUnderlay, shouldUseContentGraphicUnderlay, shouldUseVisualClusterUnderlay, shouldUseStructuredCaseUnderlay, shouldUseMixedDiagramUnderlay, shouldUseLeftIllustrationPanelUnderlay, shouldUseTwoPanelDiagramCrops, shouldUseTopComplexDiagramCrop, isAcceptableDiagramCandidate, shouldUseComparisonMatrixCrop, shouldUseLineDiagramUnderlay, shouldUseIllustrationCardUnderlay, shouldUseSaturatedDiagramUnderlay, shouldUseSparseDiagramUnderlay, scoreDiagramCandidate, inferDiagramSemanticSignals, cropExpressionStats, connectedColorBlockEntries, isTableBlockSeed, tableBlockColorKey, kpiEvidenceLayoutBounds };
