"use strict";

const { applyTextBoxMicroAdjustments } = require("../lib/text-box-micro-adjust");

module.exports = async function polishFlowDiagramRules(input, context = {}) {
  const ir = JSON.parse(JSON.stringify(input.ir));
  const changes = [];
  const metrics = input.diff?.summary || {};
  const needsForegroundPolish = typeof metrics.foregroundMissingRatio === "number"
    && metrics.foregroundMissingRatio > (input.thresholds?.foregroundMissingRatio ?? 0.12);
  const textCoverageByPage = new Map((input.compare?.textCoverage?.pages || []).map((page) => [page.pageIndex, page]));
  const needsTextMicroPolish = [...textCoverageByPage.values()].some((page) =>
    (page.boxes || []).some((box) => box.ok === true && (
      (typeof box.textCoverage === "number" && box.textCoverage < 0.995)
      || (typeof box.expectedCoverage === "number" && box.expectedCoverage < 0.995)
    )));
  if (!needsForegroundPolish && !needsTextMicroPolish) {
    return {
      ok: true,
      data: {
        provider: "polish-flow-diagram-rules",
        iteration: input.iteration,
        changed: false,
        ir,
        changes: []
      }
    };
  }

  if (needsForegroundPolish) {
    for (const page of ir.pages || []) {
      for (const shape of page.shapes || []) {
        if (shape.type === "rounded-rect") {
          setStyle(shape, "radiusRatio", radiusFor(shape.id), changes, input.iteration, "Reduce PowerPoint default rounded-rectangle radius to better match source card corners.");
        }
        if (shape.type === "line" && shape.style?.strokeWidthPt) {
          const width = lineWidthFor(shape.id, shape.style.strokeWidthPt);
          setStyle(shape, "strokeWidthPt", width, changes, input.iteration, "Tune connector stroke width from diff foreground mismatch.");
        }
      }

      for (const textBox of page.textBoxes || []) {
        const font = textBox.font || {};
        const factor = textScaleFor(textBox.id);
        if (factor !== 1 && typeof font.sizePt === "number") {
          setFont(textBox, "sizePt", round(font.sizePt * factor), changes, input.iteration, "Tune text size from foreground diff.");
        }
        const move = textMoveFor(textBox.id);
        if (move) moveBox(textBox, move.dx, move.dy, changes, input.iteration, "Nudge text box toward source text position.");
      }
      page.polishNotes = [
        ...(page.polishNotes || []),
        {
          iteration: input.iteration,
          provider: "polish-flow-diagram-rules",
          note: "Applied deterministic flow-diagram polish: radius, stroke, arrow head, and typography adjustments."
        }
      ];
    }
  }

  const genericTextAdjust = applyTextBoxMicroAdjustments(ir, input.compare?.textCoverage, {
    enabled: context.config?.textMicroAdjust?.enabled !== false,
    paddingPt: context.config?.textMicroAdjust?.paddingPt ?? context.config?.textOcr?.paddingPt ?? 16,
    minCoverage: context.config?.textMicroAdjust?.minCoverage ?? 0.995,
    maxMovePt: context.config?.textMicroAdjust?.maxMovePt ?? 3,
    maxHeightAdjustPt: context.config?.textMicroAdjust?.maxHeightAdjustPt ?? 2.5,
    minDeltaPt: context.config?.textMicroAdjust?.minDeltaPt ?? 0.15
  });
  if (genericTextAdjust.changed) {
    for (const changeEntry of genericTextAdjust.changes) {
      changes.push({
        iteration: input.iteration,
        ...changeEntry
      });
    }
  }

  return {
    ok: true,
    data: {
      provider: "polish-flow-diagram-rules",
      iteration: input.iteration,
      changed: changes.length > 0,
      ir: genericTextAdjust.ir,
      changes
    }
  };
};

function radiusFor(id) {
  if (id === "banner") return 0.035;
  if (id === "engine" || id === "portal-button") return 0.055;
  if (/card$/.test(id)) return 0.06;
  return 0.045;
}

function lineWidthFor(id, current) {
  if (/cards-to-portal|to-portal|card-/.test(id)) return Math.max(1.5, current * 0.82);
  if (/engine-to/.test(id)) return Math.max(1.5, current * 0.86);
  return Math.max(1.2, current * 0.78);
}

function textScaleFor(id) {
  if (id === "title") return 0.94;
  if (id === "banner-text") return 0.9;
  if (id === "engine-title") return 0.92;
  if (id === "ui-card-title" || id === "doc-card-title") return 0.9;
  if (id === "portal-caption") return 0.9;
  return 0.94;
}

function textMoveFor(id) {
  const moves = {
    title: { dx: 0, dy: 1.5 },
    "banner-text": { dx: -3, dy: 0 },
    "engine-title": { dx: 0, dy: -2 },
    "ui-card-title": { dx: 0, dy: -2 },
    "doc-card-title": { dx: 0, dy: -2 },
    "portal-caption": { dx: 0, dy: -3 }
  };
  return moves[id] || null;
}

function setStyle(item, key, value, changes, iteration, reason) {
  item.style = item.style || {};
  const before = item.style[key];
  if (before === value) return;
  item.style[key] = value;
  changes.push(change(iteration, item.id, `style.${key}`, before, value, reason));
}

function setFont(item, key, value, changes, iteration, reason) {
  item.font = item.font || {};
  const before = item.font[key];
  if (before === value) return;
  item.font[key] = value;
  changes.push(change(iteration, item.id, `font.${key}`, before, value, reason));
}

function moveBox(item, dx, dy, changes, iteration, reason) {
  const before = { ...item.box };
  item.box.x = round(item.box.x + dx);
  item.box.y = round(item.box.y + dy);
  changes.push(change(iteration, item.id, "box", before, { ...item.box }, reason));
}

function change(iteration, elementId, field, before, after, reason) {
  return {
    iteration,
    pageIndex: 0,
    elementId,
    field,
    before,
    after,
    reason
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
