"use strict";

function normalizeContainerKind(shape = {}) {
  const explicit = typeof shape.role === "string" ? shape.role.trim().toLowerCase() : "";
  if (explicit) return explicit;
  const id = String(shape.id || "").toLowerCase();
  if (id === "banner") return "banner";
  if (id === "engine" || id === "portal-button") return "strong-card";
  if (id.endsWith("card") || id.includes("card")) return "card";
  return "container";
}

function collectContainerStylePlan(ir, config = {}) {
  const styles = config.kindCandidates || {};
  const targetIds = Array.isArray(config.targetIds)
    ? new Set(config.targetIds.map((value) => String(value).trim()))
    : null;
  const containers = [];
  for (const page of ir.pages || []) {
    for (const shape of page.shapes || []) {
      if (!isRoundedContainer(shape)) continue;
      if (targetIds && !targetIds.has(shape.id)) continue;
      const kind = normalizeContainerKind(shape);
      const current = currentStyle(shape);
      const kindConfig = styles[kind] || styles.container || {};
      containers.push({
        pageIndex: page.pageIndex,
        elementId: shape.id,
        kind,
        current,
        radiusRatio: uniqueNumbers([...(kindConfig.radiusRatio || []), current.radiusRatio]),
        shadowAlpha: uniqueNumbers([...(kindConfig.shadowAlpha || []), current.shadow.alpha]),
        shadowBlurPt: uniqueNumbers([...(kindConfig.shadowBlurPt || []), current.shadow.blurPt]),
        shadowDistancePt: uniqueNumbers([...(kindConfig.shadowDistancePt || []), current.shadow.distancePt]),
        shadowAngleDeg: uniqueNumbers([...(kindConfig.shadowAngleDeg || []), current.shadow.angleDeg])
      });
    }
  }
  return containers;
}

function applyContainerStyleOption(ir, target, option = {}) {
  const next = JSON.parse(JSON.stringify(ir));
  let changed = false;
  for (const page of next.pages || []) {
    if (page.pageIndex !== target.pageIndex) continue;
    for (const shape of page.shapes || []) {
      if (shape.id !== target.elementId || !isRoundedContainer(shape)) continue;
      shape.style = shape.style || {};
      const nextRadius = typeof option.radiusRatio === "number" ? round(option.radiusRatio) : shape.style.radiusRatio;
      if (typeof nextRadius === "number" && shape.style.radiusRatio !== nextRadius) {
        shape.style.radiusRatio = nextRadius;
        changed = true;
      }
      const existingShadow = shape.style.shadow || {};
      const nextShadow = {
        color: option.color || existingShadow.color || "#000000",
        alpha: typeof option.alpha === "number" ? round(option.alpha) : round(existingShadow.alpha ?? 0.18),
        blurPt: typeof option.blurPt === "number" ? round(option.blurPt) : round(existingShadow.blurPt ?? 4),
        distancePt: typeof option.distancePt === "number" ? round(option.distancePt) : round(existingShadow.distancePt ?? 1.5),
        angleDeg: typeof option.angleDeg === "number" ? round(option.angleDeg) : round(existingShadow.angleDeg ?? 45)
      };
      if (!shadowEquals(existingShadow, nextShadow)) {
        shape.style.shadow = nextShadow;
        changed = true;
      }
    }
  }
  return { ir: next, changed };
}

function describeContainerOption(target, option = {}) {
  return `${target.elementId}: radius=${round(option.radiusRatio)}, alpha=${round(option.alpha)}, blurPt=${round(option.blurPt)}, distancePt=${round(option.distancePt)}, angleDeg=${round(option.angleDeg)}`;
}

function currentStyle(shape = {}) {
  const style = shape.style || {};
  const shadow = style.shadow || {};
  return {
    radiusRatio: round(Number(style.radiusRatio ?? 0.05)),
    shadow: {
      color: shadow.color || "#000000",
      alpha: round(Number(shadow.alpha ?? 0.18)),
      blurPt: round(Number(shadow.blurPt ?? 4)),
      distancePt: round(Number(shadow.distancePt ?? 1.5)),
      angleDeg: round(Number(shadow.angleDeg ?? 45))
    }
  };
}

function isRoundedContainer(shape = {}) {
  const type = String(shape.type || "").toLowerCase();
  return type === "rounded-rect" || type === "roundrect" || type === "roundedrectangle";
}

function shadowEquals(a = {}, b = {}) {
  return round(Number(a.alpha ?? 0.18)) === round(Number(b.alpha ?? 0.18))
    && round(Number(a.blurPt ?? 4)) === round(Number(b.blurPt ?? 4))
    && round(Number(a.distancePt ?? 1.5)) === round(Number(b.distancePt ?? 1.5))
    && round(Number(a.angleDeg ?? 45)) === round(Number(b.angleDeg ?? 45))
    && String(a.color || "#000000").toLowerCase() === String(b.color || "#000000").toLowerCase();
}

function uniqueNumbers(values) {
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => round(value)))];
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  applyContainerStyleOption,
  collectContainerStylePlan,
  describeContainerOption,
  normalizeContainerKind
};
