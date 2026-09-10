"use strict";

function createLinearProcessDiagramFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    clamp,
    constrainPtBox,
    expandPtBox,
    lineBox,
    round,
    truncateText
  } = dependencies;

  function createLinearProcessDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyLinearProcessDiagram(image)) continue;
      const process = inferLinearProcessDiagram(image, textBoxes, slideSize);
      if (!process) continue;
      image.source = {
        ...(image.source || {}),
        linearProcessObjectified: true,
        objectifiedLinearProcessStages: process.stages.length,
        objectifiedLinearProcessConnectors: process.connectors.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt linear process stages and connectors natively while preserving residual artwork`
      };
      for (let index = 0; index < process.stages.length; index += 1) {
        const stage = process.stages[index];
        shapes.push({
          id: `${image.id || "linear-process"}-native-stage-${index}`,
          type: "roundRect",
          box: stage.box,
          style: {
            fill: stage.fill,
            stroke: stage.stroke,
            strokeWidthPt: 1.3,
            radiusRatio: 0.11,
            shadow: {
              color: "#000000",
              alpha: 0.08,
              blurPt: 6,
              distancePt: 1.5,
              angle: 45
            }
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "linear-process-native-stage",
            layerSourceId: image.id || null,
            stageIndex: index,
            label: stage.label,
            confidence: process.confidence
          }
        });
      }
      for (let index = 0; index < process.connectors.length; index += 1) {
        const connector = process.connectors[index];
        shapes.push({
          id: `${image.id || "linear-process"}-native-connector-${index}`,
          type: "line",
          box: connector.box,
          style: {
            stroke: connector.stroke,
            strokeWidthPt: connector.strokeWidthPt,
            connectorType: "straight",
            endArrow: "triangle"
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "linear-process-native-connector",
            layerSourceId: image.id || null,
            connectorIndex: index,
            confidence: process.confidence
          }
        });
      }
    }
    return shapes;
  }

  function productWorkflowStageBackplateShapes(image, cards = [], bounds = DEFAULT_SLIDE) {
    return (cards || []).map((card, index) => ({
      id: `${image.id || "product-workflow"}-native-stage-backplate-${index}`,
      type: "rect",
      box: constrainPtBox(card.box, bounds),
      style: {
        fill: "#0867B8",
        stroke: "#045B9F",
        strokeWidthPt: 1.6
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "product-workflow-native-stage-backplate",
        layerSourceId: image.id || null,
        stageRole: card.role,
        stageIndex: index,
        confidence: 0.82
      }
    }));
  }

  function productWorkflowEndpointShapes(image, box, bounds) {
    const sx = (n) => box.x + box.w * n;
    const sy = (n) => box.y + box.h * n;
    const sw = (n) => box.w * n;
    const sh = (n) => box.h * n;
    const src = (region, part, index = 0) => ({
      editable: true,
      nativeRebuild: true,
      detector: `product-workflow-native-${region}`,
      layerSourceId: image.id || null,
      part,
      partIndex: index,
      confidence: 0.74
    });
    const shape = (region, part, type, localBox, style, index = 0) => ({
      id: `${image.id || "product-workflow"}-native-${region}-${part}-${index}`,
      type,
      box: constrainPtBox(localBox, bounds),
      style,
      source: src(region, part, index)
    });
    const line = (region, part, from, to, stroke, strokeWidthPt, index = 0) => shape(region, part, "line", lineBox(from, to), {
      stroke,
      strokeWidthPt,
      connectorType: "straight",
      lineCap: "round"
    }, index);
    const leftRegion = {
      x: sx(0.035),
      y: sy(0.170),
      w: sw(0.160),
      h: sh(0.470)
    };
    const rightRegion = {
      x: sx(0.855),
      y: sy(0.125),
      w: sw(0.140),
      h: sh(0.520)
    };
    const left = [
      shape("chaos-input", "back-blob", "ellipse", {
        x: leftRegion.x + leftRegion.w * 0.20,
        y: leftRegion.y + leftRegion.h * 0.20,
        w: leftRegion.w * 0.56,
        h: leftRegion.h * 0.42
      }, { fill: "#E5E7EB", stroke: "#D1D5DB", strokeWidthPt: 0.8, opacity: 0.82 }),
      ...[
        [0.08, 0.17, 0.28, 0.10, "#9CA3AF"],
        [0.35, 0.07, 0.23, 0.14, "#CBD5E1"],
        [0.58, 0.18, 0.28, 0.12, "#94A3B8"],
        [0.18, 0.43, 0.24, 0.11, "#B6BEC9"],
        [0.52, 0.47, 0.34, 0.12, "#D1D5DB"],
        [0.33, 0.66, 0.28, 0.12, "#9CA3AF"]
      ].map(([x, y, w, h, fill], index) => shape("chaos-input", "fragment", "roundRect", {
        x: leftRegion.x + leftRegion.w * x,
        y: leftRegion.y + leftRegion.h * y,
        w: leftRegion.w * w,
        h: leftRegion.h * h
      }, { fill, stroke: "#FFFFFF", strokeWidthPt: 0.6, radiusRatio: 0.10, rotation: index % 2 === 0 ? -10 : 9 }, index)),
      ...[
        [0.18, 0.28, 0.74, 0.24],
        [0.22, 0.54, 0.70, 0.36],
        [0.32, 0.18, 0.46, 0.76],
        [0.12, 0.70, 0.78, 0.62]
      ].map(([x1, y1, x2, y2], index) => line("chaos-input", "messy-link", {
        x: leftRegion.x + leftRegion.w * x1,
        y: leftRegion.y + leftRegion.h * y1
      }, {
        x: leftRegion.x + leftRegion.w * x2,
        y: leftRegion.y + leftRegion.h * y2
      }, "#9CA3AF", 1.4, index)),
      ...[
        [0.18, 0.73, 0.055],
        [0.78, 0.44, 0.050],
        [0.58, 0.80, 0.060],
        [0.10, 0.38, 0.045]
      ].map(([x, y, r], index) => shape("chaos-input", "dot", "ellipse", {
        x: leftRegion.x + leftRegion.w * x,
        y: leftRegion.y + leftRegion.h * y,
        w: leftRegion.w * r,
        h: leftRegion.w * r
      }, { fill: "#6B7280", stroke: "#6B7280", strokeWidthPt: 0.4 }, index))
    ];
    const right = [
      shape("standard-output", "doc-a", "roundRect", {
        x: rightRegion.x + rightRegion.w * 0.05,
        y: rightRegion.y + rightRegion.h * 0.02,
        w: rightRegion.w * 0.45,
        h: rightRegion.h * 0.27
      }, { fill: "#0D65B8", stroke: "#0A569B", strokeWidthPt: 0.9, radiusRatio: 0.04 }),
      shape("standard-output", "doc-b", "roundRect", {
        x: rightRegion.x + rightRegion.w * 0.58,
        y: rightRegion.y + rightRegion.h * 0.02,
        w: rightRegion.w * 0.38,
        h: rightRegion.h * 0.27
      }, { fill: "#0D65B8", stroke: "#0A569B", strokeWidthPt: 0.9, radiusRatio: 0.04 }),
      shape("standard-output", "screen-main", "roundRect", {
        x: rightRegion.x + rightRegion.w * 0.04,
        y: rightRegion.y + rightRegion.h * 0.34,
        w: rightRegion.w * 0.88,
        h: rightRegion.h * 0.33
      }, { fill: "#CFE8F8", stroke: "#2E86C1", strokeWidthPt: 1.2, radiusRatio: 0.04 }),
      shape("standard-output", "screen-side", "roundRect", {
        x: rightRegion.x + rightRegion.w * 0.05,
        y: rightRegion.y + rightRegion.h * 0.72,
        w: rightRegion.w * 0.50,
        h: rightRegion.h * 0.25
      }, { fill: "#D8ECF8", stroke: "#2E86C1", strokeWidthPt: 1.1, radiusRatio: 0.04 }),
      shape("standard-output", "image-slot-main", "rect", {
        x: rightRegion.x + rightRegion.w * 0.10,
        y: rightRegion.y + rightRegion.h * 0.43,
        w: rightRegion.w * 0.22,
        h: rightRegion.h * 0.15
      }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.8 }),
      shape("standard-output", "image-slot-side", "rect", {
        x: rightRegion.x + rightRegion.w * 0.10,
        y: rightRegion.y + rightRegion.h * 0.79,
        w: rightRegion.w * 0.18,
        h: rightRegion.h * 0.12
      }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.8 }),
      ...[
        [0.15, 0.10, 0.18, "#D8ECF8"],
        [0.15, 0.17, 0.22, "#D8ECF8"],
        [0.67, 0.09, 0.18, "#D8ECF8"],
        [0.67, 0.16, 0.20, "#D8ECF8"],
        [0.38, 0.45, 0.42, "#2E86C1"],
        [0.38, 0.54, 0.34, "#2E86C1"],
        [0.31, 0.81, 0.22, "#2E86C1"],
        [0.31, 0.89, 0.18, "#2E86C1"]
      ].map(([x, y, w], index) => line("standard-output", "content-line", {
        x: rightRegion.x + rightRegion.w * x,
        y: rightRegion.y + rightRegion.h * y
      }, {
        x: rightRegion.x + rightRegion.w * (x + w),
        y: rightRegion.y + rightRegion.h * y
      }, index < 4 ? "#D8ECF8" : "#2E86C1", index < 4 ? 1.4 : 1.2, index)),
      shape("standard-output", "check-badge", "ellipse", {
        x: rightRegion.x + rightRegion.w * 0.70,
        y: rightRegion.y + rightRegion.h * 0.80,
        w: rightRegion.w * 0.28,
        h: rightRegion.w * 0.28
      }, { fill: "#0E8AD7", stroke: "#0E8AD7", strokeWidthPt: 0.8 }),
      line("standard-output", "check-left", {
        x: rightRegion.x + rightRegion.w * 0.77,
        y: rightRegion.y + rightRegion.h * 0.89
      }, {
        x: rightRegion.x + rightRegion.w * 0.82,
        y: rightRegion.y + rightRegion.h * 0.94
      }, "#FFFFFF", 2.0),
      line("standard-output", "check-right", {
        x: rightRegion.x + rightRegion.w * 0.82,
        y: rightRegion.y + rightRegion.h * 0.94
      }, {
        x: rightRegion.x + rightRegion.w * 0.92,
        y: rightRegion.y + rightRegion.h * 0.84
      }, "#FFFFFF", 2.0),
      ...[
        [0.03, 0.29],
        [0.06, 0.53],
        [0.00, 0.70]
      ].map(([x, y], index) => shape("standard-output", "side-chip", "roundRect", {
        x: rightRegion.x + rightRegion.w * x,
        y: rightRegion.y + rightRegion.h * y,
        w: rightRegion.w * 0.15,
        h: rightRegion.h * 0.08
      }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.7, radiusRatio: 0.14 }, index))
    ];
    return [...left, ...right];
  }

  function shouldObjectifyLinearProcessDiagram(image) {
    const layer = image?.source?.layer || {};
    const detector = String(image?.source?.detector || "");
    const box = image?.box || {};
    if (!box.w || !box.h || box.w < 360 || box.h < 80) return false;
    if (/screenshot|kpi|evidence|chart|comparison|wms-chain|collaboration-flow/.test(detector)) return false;
    if (!/foreground-graphic|sparse-diagram|mixed-diagram|content-graphic|visual-cluster/.test(detector)) return false;
    return layer.layerType === "diagram-zone" || layer.layerType === "table-zone" || /diagram/.test(detector);
  }

  function inferLinearProcessDiagram(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const imageBox = image?.box || {};
    const candidates = (textBoxes || [])
      .filter((item) => isLinearProcessStageText(item, imageBox))
      .sort((a, b) => (a.box.x - b.box.x) || (a.box.y - b.box.y));
    if (candidates.length < 3 || candidates.length > 8) return null;

    const groups = groupLinearProcessRows(candidates, imageBox);
    const row = groups
      .filter((group) => group.length >= 3)
      .sort((a, b) => b.length - a.length || linearRowScore(a, imageBox) - linearRowScore(b, imageBox))[0];
    if (!row) return null;

    const sorted = row.sort((a, b) => a.box.x - b.box.x);
    if (!isWellSpacedLinearRow(sorted, imageBox)) return null;
    const confidence = round(clamp(0.58 + sorted.length * 0.035 + (isLikelyProcessVocabulary(sorted) ? 0.10 : 0), 0.58, 0.86));
    const palette = inferLinearProcessPalette(sorted);
    const stages = sorted.map((item, index) => {
      const box = expandPtBox({
        x: item.box.x - Math.max(18, item.box.w * 0.26),
        y: item.box.y - Math.max(11, item.box.h * 0.62),
        w: Math.max(72, item.box.w + Math.max(34, item.box.w * 0.52)),
        h: Math.max(34, item.box.h + 22)
      }, slideSize, 0, 0);
      return {
        label: truncateText(String(item.text || "").trim(), 48),
        box: constrainPtBox(box, imageBox),
        fill: palette[index % palette.length].fill,
        stroke: palette[index % palette.length].stroke
      };
    });
    if (stages.some((stage) => stage.box.w < 48 || stage.box.h < 24)) return null;
    const connectors = [];
    for (let index = 0; index < stages.length - 1; index += 1) {
      const current = stages[index].box;
      const next = stages[index + 1].box;
      const gap = next.x - (current.x + current.w);
      if (gap < 8 || gap > imageBox.w * 0.32) return null;
      const y = round((current.y + current.h / 2 + next.y + next.h / 2) / 2);
      connectors.push({
        box: lineBox({ x: current.x + current.w + 4, y }, { x: next.x - 5, y }),
        stroke: "#5B6B7A",
        strokeWidthPt: 2.2
      });
    }
    return { stages, connectors, confidence };
  }

  function isLinearProcessStageText(textBox, imageBox) {
    const text = String(textBox?.text || "").trim();
    const box = textBox?.box || {};
    if (!boxCenterInside(box, expandPtBox(imageBox, DEFAULT_SLIDE, 6, 6))) return false;
    if (text.length < 2 || text.length > 42) return false;
    if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
    if (/[。！？.!?]{1,}$/.test(text) && text.length > 12) return false;
    if (Number(box.w || 0) < 24 || Number(box.h || 0) < 8) return false;
    if (Number(box.w || 0) > Number(imageBox.w || 0) * 0.28) return false;
    if (Number(box.h || 0) > Number(imageBox.h || 0) * 0.38) return false;
    return true;
  }

  function groupLinearProcessRows(candidates = [], imageBox = {}) {
    const threshold = Math.max(14, Number(imageBox.h || 0) * 0.12);
    const rows = [];
    for (const candidate of candidates) {
      const cy = Number(candidate.box.y || 0) + Number(candidate.box.h || 0) / 2;
      const existing = rows.find((row) => Math.abs(row.centerY - cy) <= threshold);
      if (!existing) {
        rows.push({ centerY: cy, items: [candidate] });
        continue;
      }
      existing.items.push(candidate);
      existing.centerY = existing.items.reduce((sum, item) => sum + Number(item.box.y || 0) + Number(item.box.h || 0) / 2, 0) / existing.items.length;
    }
    return rows.map((row) => row.items);
  }

  function linearRowScore(row, imageBox = {}) {
    const centers = row.map((item) => Number(item.box.x || 0) + Number(item.box.w || 0) / 2).sort((a, b) => a - b);
    const gaps = centers.slice(1).map((value, index) => value - centers[index]);
    const avg = gaps.reduce((sum, item) => sum + item, 0) / Math.max(1, gaps.length);
    const variance = gaps.reduce((sum, item) => sum + Math.abs(item - avg), 0) / Math.max(1, gaps.length);
    const spread = centers[centers.length - 1] - centers[0];
    return variance / Math.max(1, avg) - spread / Math.max(1, Number(imageBox.w || 1));
  }

  function isWellSpacedLinearRow(row = [], imageBox = {}) {
    const centers = row.map((item) => ({
      x: Number(item.box.x || 0) + Number(item.box.w || 0) / 2,
      y: Number(item.box.y || 0) + Number(item.box.h || 0) / 2
    }));
    const xSpread = centers[centers.length - 1].x - centers[0].x;
    if (xSpread < Number(imageBox.w || 0) * 0.42) return false;
    const ySpread = Math.max(...centers.map((item) => item.y)) - Math.min(...centers.map((item) => item.y));
    if (ySpread > Math.max(24, Number(imageBox.h || 0) * 0.18)) return false;
    const gaps = centers.slice(1).map((item, index) => item.x - centers[index].x);
    if (gaps.some((gap) => gap < 44 || gap > Number(imageBox.w || 0) * 0.36)) return false;
    const avg = gaps.reduce((sum, item) => sum + item, 0) / gaps.length;
    const maxDeviation = Math.max(...gaps.map((gap) => Math.abs(gap - avg)));
    return maxDeviation <= Math.max(42, avg * 0.55);
  }

  function isLikelyProcessVocabulary(row = []) {
    const joined = row.map((item) => String(item.text || "")).join(" ");
    return /阶段|步骤|Step|step|流程|输入|输出|生成|评审|验证|发布|需求|设计|开发|测试|上线|交付|PRD|Review/.test(joined);
  }

  function inferLinearProcessPalette(row = []) {
    const hasRisk = row.some((item) => /风险|异常|失败|拒绝|问题/.test(String(item.text || "")));
    if (hasRisk) {
      return [
        { fill: "#1D75BB", stroke: "#0B4F91" },
        { fill: "#28A263", stroke: "#16804A" },
        { fill: "#F07916", stroke: "#C85C08" },
        { fill: "#D94841", stroke: "#A82B26" }
      ];
    }
    return [
      { fill: "#1D75BB", stroke: "#0B4F91" },
      { fill: "#2386C8", stroke: "#145F9C" },
      { fill: "#28A263", stroke: "#16804A" },
      { fill: "#34AE5A", stroke: "#1E8C4A" },
      { fill: "#F07916", stroke: "#C85C08" }
    ];
  }

  return {
    createLinearProcessDiagramShapes,
    productWorkflowEndpointShapes,
    productWorkflowStageBackplateShapes
  };
}

module.exports = { createLinearProcessDiagramFactory };
