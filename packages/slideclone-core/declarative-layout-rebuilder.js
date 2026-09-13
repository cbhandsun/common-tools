// @ts-check
"use strict";

const { resolveAutoLayout } = require("./auto-layout-tree");
const { snapBox, assertBox } = require("./layout-constraint-solver");
const { detectStaticTextOverflow } = require("./static-text-overflow-detector");

/**
 * @typedef {Object} DeclarativeItem
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {string} [body]
 * @property {string} [badge]
 * @property {string} [icon]
 * @property {string} [fill]
 * @property {string} [stroke]
 * @property {Record<string, unknown>} [extra]
 */

/**
 * @typedef {Object} RebuilderOptions
 * @property {number} [gridSnap]
 * @property {boolean} [autoFitText]
 * @property {Record<string, unknown>} [theme]
 */

/**
 * Rebuild a horizontal sequence of step cards with badges and connectors.
 * @param {readonly DeclarativeItem[]} items
 * @param {unknown} bounds
 * @param {RebuilderOptions} [options]
 * @returns {{ shapes: Array<Record<string, unknown>>, textBoxes: Array<Record<string, unknown>>, envelope: { x: number, y: number, w: number, h: number } }}
 */
function buildHorizontalStepsLayout(items, bounds, options = {}) {
  const container = assertBox(bounds, "bounds");
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw new TypeError("items must be an array with 1 to 20 elements");
  }

  const gridSnap = options.gridSnap != null ? Math.max(1, Number(options.gridSnap)) : 1;
  const autoFitText = options.autoFitText !== false;

  // Build AutoLayout Tree: A horizontal row of step cards
  const children = items.map((item, idx) => ({
    type: "container",
    id: `card_${idx + 1}`,
    direction: "vertical",
    flex: 1,
    gap: 8,
    padding: 12,
    children: [
      { type: "item", id: `badge_${idx + 1}`, height: 28 },
      { type: "item", id: `title_${idx + 1}`, height: 32 },
      { type: "item", id: `body_${idx + 1}`, flex: 1 }
    ]
  }));

  const root = {
    type: "container",
    id: "steps_row",
    direction: "horizontal",
    gap: 16,
    children
  };

  const resolved = resolveAutoLayout(root, container);

  /** @type {Array<Record<string, unknown>>} */
  const shapes = [];
  /** @type {Array<Record<string, unknown>>} */
  const textBoxes = [];

  // Card containers -> background shapes
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const cardNode = resolved.containers.find((c) => c.id === `card_${idx + 1}`);
    if (!cardNode) continue;

    const snappedCard = snapBox(cardNode, gridSnap);
    shapes.push({
      id: `shape_card_${idx + 1}`,
      type: "round_rect",
      x: snappedCard.x,
      y: snappedCard.y,
      w: snappedCard.w,
      h: snappedCard.h,
      fill: item?.fill || "#FFFFFF",
      stroke: item?.stroke || "#0066CC"
    });

    // Badge item
    const badgeNode = resolved.items.find((i) => i.id === `badge_${idx + 1}`);
    if (badgeNode) {
      const badgeText = item?.badge || String(idx + 1).padStart(2, "0");
      const snappedBadge = snapBox(badgeNode, gridSnap);

      shapes.push({
        id: `shape_badge_${idx + 1}`,
        type: "circle",
        x: snappedBadge.x,
        y: snappedBadge.y,
        w: 28,
        h: 28,
        fill: "#0066CC",
        stroke: "#FFFFFF"
      });

      textBoxes.push({
        role: "badge",
        text: badgeText,
        box: { x: snappedBadge.x, y: snappedBadge.y, w: 28, h: 28 },
        font: { sizePt: 12, weight: "bold", color: "#FFFFFF" }
      });
    }

    // Title item
    const titleNode = resolved.items.find((i) => i.id === `title_${idx + 1}`);
    if (titleNode && item?.title) {
      const snappedTitle = snapBox(titleNode, gridSnap);
      let fontPt = 14;
      if (autoFitText) {
        const report = detectStaticTextOverflow(item.title, fontPt, snappedTitle);
        if (report.overflows) fontPt = report.suggestedFontSizePt;
      }
      textBoxes.push({
        role: "title",
        text: item.title,
        box: snappedTitle,
        font: { sizePt: fontPt, weight: "bold", color: "#1F2328" }
      });
    }

    // Body item
    const bodyNode = resolved.items.find((i) => i.id === `body_${idx + 1}`);
    if (bodyNode && item?.body) {
      const snappedBody = snapBox(bodyNode, gridSnap);
      let fontPt = 12;
      if (autoFitText) {
        const report = detectStaticTextOverflow(item.body, fontPt, snappedBody);
        if (report.overflows) fontPt = report.suggestedFontSizePt;
      }
      textBoxes.push({
        role: "body",
        text: item.body,
        box: snappedBody,
        font: { sizePt: fontPt, color: "#57606A" }
      });
    }

    // Connector line to next card
    if (idx < items.length - 1) {
      const nextCard = resolved.containers.find((c) => c.id === `card_${idx + 2}`);
      if (nextCard) {
        const lineX1 = snappedCard.x + snappedCard.w;
        const lineX2 = nextCard.x;
        const lineY = snappedCard.y + snappedCard.h / 2;
        if (lineX2 > lineX1) {
          shapes.push({
            id: `connector_${idx + 1}_${idx + 2}`,
            type: "connector_line",
            x1: lineX1,
            y1: lineY,
            x2: lineX2,
            y2: lineY,
            stroke: "#0066CC"
          });
        }
      }
    }
  }

  return {
    shapes,
    textBoxes,
    envelope: container
  };
}

/**
 * Rebuild a grid of KPI metric cards.
 * @param {readonly DeclarativeItem[]} metrics
 * @param {unknown} bounds
 * @param {RebuilderOptions} [options]
 * @returns {{ shapes: Array<Record<string, unknown>>, textBoxes: Array<Record<string, unknown>>, envelope: { x: number, y: number, w: number, h: number } }}
 */
function buildMetricCardsLayout(metrics, bounds, options = {}) {
  const container = assertBox(bounds, "bounds");
  if (!Array.isArray(metrics) || metrics.length < 1 || metrics.length > 20) {
    throw new TypeError("metrics must be an array with 1 to 20 elements");
  }

  const gridSnap = options.gridSnap != null ? Math.max(1, Number(options.gridSnap)) : 1;
  const autoFitText = options.autoFitText !== false;

  const children = metrics.map((_, idx) => ({
    type: "container",
    id: `kpi_card_${idx + 1}`,
    direction: "vertical",
    flex: 1,
    gap: 6,
    padding: 14,
    children: [
      { type: "item", id: `kpi_title_${idx + 1}`, height: 24 },
      { type: "item", id: `kpi_val_${idx + 1}`, height: 48 },
      { type: "item", id: `kpi_sub_${idx + 1}`, flex: 1 }
    ]
  }));

  const root = {
    type: "container",
    id: "kpi_row",
    direction: "horizontal",
    gap: 16,
    children
  };

  const resolved = resolveAutoLayout(root, container);

  /** @type {Array<Record<string, unknown>>} */
  const shapes = [];
  /** @type {Array<Record<string, unknown>>} */
  const textBoxes = [];

  for (let idx = 0; idx < metrics.length; idx += 1) {
    const item = metrics[idx];
    const cardNode = resolved.containers.find((c) => c.id === `kpi_card_${idx + 1}`);
    if (!cardNode) continue;

    const snappedCard = snapBox(cardNode, gridSnap);
    shapes.push({
      id: `shape_kpi_${idx + 1}`,
      type: "round_rect",
      x: snappedCard.x,
      y: snappedCard.y,
      w: snappedCard.w,
      h: snappedCard.h,
      fill: item?.fill || "#F6F8FA",
      stroke: item?.stroke || "#D0D7DE"
    });

    // Label
    const titleNode = resolved.items.find((i) => i.id === `kpi_title_${idx + 1}`);
    if (titleNode && item?.title) {
      const b = snapBox(titleNode, gridSnap);
      textBoxes.push({
        role: "title",
        text: item.title,
        box: b,
        font: { sizePt: 13, weight: "bold", color: "#57606A" }
      });
    }

    // Big Value
    const valNode = resolved.items.find((i) => i.id === `kpi_val_${idx + 1}`);
    if (valNode && (item?.body || item?.badge)) {
      const valText = item.body || item.badge || "";
      const b = snapBox(valNode, gridSnap);
      let fontPt = 32;
      if (autoFitText) {
        const report = detectStaticTextOverflow(valText, fontPt, b, { maxLines: 1 });
        if (report.overflows) fontPt = report.suggestedFontSizePt;
      }
      textBoxes.push({
        role: "metric",
        text: valText,
        box: b,
        font: { sizePt: fontPt, weight: "bold", color: "#0969DA" }
      });
    }

    // Subtitle / Trend
    const subNode = resolved.items.find((i) => i.id === `kpi_sub_${idx + 1}`);
    if (subNode && item?.subtitle) {
      const b = snapBox(subNode, gridSnap);
      textBoxes.push({
        role: "body",
        text: item.subtitle,
        box: b,
        font: { sizePt: 11, color: "#1A7F37" }
      });
    }
  }

  return {
    shapes,
    textBoxes,
    envelope: container
  };
}

module.exports = {
  buildHorizontalStepsLayout,
  buildMetricCardsLayout
};
