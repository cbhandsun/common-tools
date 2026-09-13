"use strict";

const { scaleRelativeBox } = require("./component-template-geometry");
const { safeText } = require("./component-template-sanitizers");

function templateDirectAppliedLayoutShapes(image = {}, match = {}, family = "component", slideSize = {}, deps = {}) {
  if (!isAppliedPluginComponentMatch(match)) return [];
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const replayChildren = Array.isArray(match.replayChildLayout?.children) ? match.replayChildLayout.children : [];
  const fallbackChildren = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const children = isSpatiallyRepresentativeReplayLayout(replayChildren, fallbackChildren)
    ? replayChildren
    : fallbackChildren;
  if (children.length < 3) return [];
  const editableChildren = children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, box, slideSize),
      style: child?.style || {}
    }))
    .map((child) => ({
      ...child,
      structureRole: appliedChildStructureRole(child)
    }))
    .filter((child) => child.kind === "shape" || child.kind === "connector" || child.kind === "picture")
    .filter((child) => isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
    .sort(appliedChildLayerOrder)
    .slice(0, 48);
  const shapeCount = editableChildren.filter((child) => child.kind === "shape").length;
  const pictureCount = editableChildren.filter((child) => child.kind === "picture").length;
  if (editableChildren.length < 3 || shapeCount < 3 || pictureCount > Math.max(2, shapeCount)) return [];
  return editableChildren.map((child, outIndex) => {
    const isConnector = child.kind === "connector";
    const isPicture = child.kind === "picture";
    const part = `${family}-applied-${componentRolePart(child.structureRole, isPicture)}`;
    const replayStyle = appliedReplayStyle(child.style, isConnector, isPicture, deps);
    return deps.nativeShape(
      image,
      match,
      part,
      outIndex,
      isConnector ? "line" : deps.nativeTypeForTemplateStyle(child.style, "rect"),
      child.box,
      replayStyle,
      {
        appliedPluginDirectReplay: true,
        appliedPluginChildIndex: child.index,
        appliedPluginChildKind: child.kind,
        appliedPluginStructureRole: child.structureRole,
        ...(isPicture ? {
          appliedPluginPictureShell: true,
          appliedPluginPictureRelId: child.style?.picture?.embedRelId || "",
          appliedPluginPictureMediaTarget: child.style?.picture?.mediaTarget || "",
          appliedPluginPictureCrop: child.style?.picture?.crop ? JSON.stringify(child.style.picture.crop) : ""
        } : {})
      }
    );
  });
}

function templateSupplementalAppliedLayoutShapes(image = {}, match = {}, family = "component", slideSize = {}, deps = {}) {
  if (!isAppliedPluginComponentMatch(match)) return [];
  const targetBox = deps.safeBox?.(image.box, slideSize);
  const primaryBounds = normalizedSourceBounds(match.boundsPt);
  if (!targetBox || !primaryBounds) return [];
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  const siblings = assets
    .filter((asset) => safeText(asset?.provider) === safeText(match.assetProvider))
    .filter((asset) => !match.assetPath || safeText(asset?.path) === safeText(match.assetPath))
    .flatMap((asset) => Array.isArray(asset?.recommendedComponentGroups) ? asset.recommendedComponentGroups : [])
    .filter((group) => safeText(group?.id) && safeText(group.id) !== safeText(match.id))
    .map((group) => ({
      group,
      bounds: normalizedSourceBounds(group?.boundsPt),
      children: Array.isArray(group?.replayChildLayout?.children) ? group.replayChildLayout.children : []
    }))
    .filter((candidate) => candidate.bounds && candidate.children.length >= 4)
    .filter((candidate) => !groupHasNoisyGenericPlaceholderText(candidate.group, deps))
    .filter((candidate) => sourceBoundsContainedBy(candidate.bounds, primaryBounds));
  const shapes = [];
  for (const candidate of siblings.slice(0, 4)) {
    const children = candidate.children
      .map((child, index) => ({ index, child, relativeBox: sourceChildRelativeBox(child?.box, candidate.bounds, primaryBounds) }))
      .filter(({ child, relativeBox }) => (child?.kind === "shape" || child?.kind === "connector")
        && !child?.style?.text
        && hasSupplementalAppliedPaint(child?.style)
        && isReusableAppliedChildBox(relativeBox))
      .slice(0, 24);
    if (children.length < 4) continue;
    for (const item of children) {
      const isConnector = item.child.kind === "connector";
      const style = appliedReplayStyle(item.child.style, isConnector, false, deps);
      shapes.push(deps.nativeShape(
        image,
        match,
        `${family}-applied-supplemental-decoration`,
        shapes.length,
        isConnector ? "line" : deps.nativeTypeForTemplateStyle(item.child.style, "rect"),
        scaleRelativeBox(item.relativeBox, targetBox, slideSize),
        style,
        {
          appliedPluginDirectReplay: true,
          appliedPluginSupplementalReplay: true,
          appliedPluginSupplementalGroupId: safeText(candidate.group.id),
          appliedPluginChildIndex: item.index,
          appliedPluginChildKind: item.child.kind,
          appliedPluginStructureRole: "decoration"
        }
      ));
    }
  }
  return shapes;
}

function isAppliedPluginComponentMatch(match = {}) {
  return match.assetAppliedComponent === true
    || safeText(match.assetReusePolicy).toLowerCase() === "inspect-openxml-applied-plugin-component";
}

function isSpatiallyRepresentativeReplayLayout(children = [], fallbackChildren = []) {
  const replayBounds = normalizedLayoutBounds(children);
  if (!replayBounds || replayBounds.count < 3) return false;
  const fallbackBounds = normalizedLayoutBounds(fallbackChildren);
  if (!fallbackBounds || fallbackBounds.count < 3) return true;
  const widthCoverage = replayBounds.w / Math.max(0.001, fallbackBounds.w);
  const heightCoverage = replayBounds.h / Math.max(0.001, fallbackBounds.h);
  return widthCoverage >= 0.55 || heightCoverage >= 0.55;
}

function normalizedLayoutBounds(children = []) {
  const boxes = (Array.isArray(children) ? children : [])
    .map((child) => child?.box)
    .filter((box) => box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return { count: boxes.length, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function normalizedSourceBounds(bounds = {}) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const w = Number(bounds?.w);
  const h = Number(bounds?.h);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
}

function sourceBoundsContainedBy(inner = {}, outer = {}) {
  const toleranceX = Math.max(2, outer.w * 0.025);
  const toleranceY = Math.max(2, outer.h * 0.025);
  return inner.x >= outer.x - toleranceX
    && inner.y >= outer.y - toleranceY
    && inner.x + inner.w <= outer.x + outer.w + toleranceX
    && inner.y + inner.h <= outer.y + outer.h + toleranceY;
}

function sourceChildRelativeBox(childBox = {}, groupBounds = {}, primaryBounds = {}) {
  const child = normalizedSourceBounds({ x: childBox?.x, y: childBox?.y, w: childBox?.w, h: childBox?.h });
  if (!child) return null;
  return {
    x: (groupBounds.x + child.x * groupBounds.w - primaryBounds.x) / primaryBounds.w,
    y: (groupBounds.y + child.y * groupBounds.h - primaryBounds.y) / primaryBounds.h,
    w: child.w * groupBounds.w / primaryBounds.w,
    h: child.h * groupBounds.h / primaryBounds.h
  };
}

function hasSupplementalAppliedPaint(style = {}) {
  const fill = safeText(style?.fill).toLowerCase();
  const stroke = safeText(style?.stroke).toLowerCase();
  return (fill && fill !== "none") || (stroke && stroke !== "none") || Boolean(style?.gradient);
}

function groupHasNoisyGenericPlaceholderText(group = {}, deps = {}) {
  const isGenericPluginPlaceholderText = deps.isGenericPluginPlaceholderText || (() => false);
  const layouts = [group?.replayChildLayout, group?.childLayout];
  return layouts
    .flatMap((layout) => Array.isArray(layout?.children) ? layout.children : [])
    .map((child) => safeText(child?.style?.text?.placeholderText))
    .some((text) => text.length >= 40 && isGenericPluginPlaceholderText(text));
}

function appliedReplayStyle(templateStyle = {}, isConnector = false, isPicture = false, deps = {}) {
  const isTextOnly = Boolean(templateStyle?.text)
    && (!safeText(templateStyle?.fill) || safeText(templateStyle.fill).toLowerCase() === "none")
    && (!safeText(templateStyle?.stroke) || safeText(templateStyle.stroke).toLowerCase() === "none");
  const fallbackStyle = isConnector
    ? { stroke: "#64748B", strokeWidthPt: 1.2, connectorType: "straight" }
    : isPicture
      ? { fill: "none", stroke: "none", strokeWidthPt: 0, opacity: 0.98 }
      : isTextOnly
        ? { fill: "none", stroke: "none", strokeWidthPt: 0 }
        : { fill: "none", stroke: "#64748B", strokeWidthPt: 0.85, radiusRatio: 0.12 };
  const replayStyle = deps.mergeTemplateStyle(templateStyle, fallbackStyle);
  const sourceExplicitlyHasNoFill = safeText(templateStyle?.fill).toLowerCase() === "none";
  if (sourceExplicitlyHasNoFill && safeText(replayStyle.fill).toLowerCase() === "none") {
    const lineGradientOpacity = deps.maxGradientStopAlpha?.(replayStyle.gradient);
    if (lineGradientOpacity !== null && replayStyle.opacity === undefined) {
      replayStyle.opacity = lineGradientOpacity;
    }
    delete replayStyle.gradient;
  }
  return replayStyle;
}

function isReusableAppliedChildBox(box = {}) {
  if (!box || typeof box !== "object") return false;
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return false;
  return x >= -0.18 && y >= -0.18 && x + w <= 1.18 && y + h <= 1.18;
}

function appliedChildLayerOrder(a = {}, b = {}) {
  const layerA = appliedRoleLayer(a.structureRole);
  const layerB = appliedRoleLayer(b.structureRole);
  if (layerA !== layerB) return layerA - layerB;
  return Number(a.index || 0) - Number(b.index || 0);
}

function appliedRoleLayer(role) {
  if (role === "background") return 0;
  return 1;
}

function appliedChildStructureRole(child = {}) {
  const kind = safeText(child.kind).toLowerCase();
  if (kind === "connector") return "connector";
  if (kind === "picture") return "picture";
  const style = child.style || {};
  const box = child.relativeBox || {};
  const width = Math.max(0, Number(box.w || 0));
  const height = Math.max(0, Number(box.h || 0));
  const area = width * height;
  const shapeType = safeText(style.shapeType).toLowerCase();
  const hasVisibleFill = Boolean(style.fill && String(style.fill).toLowerCase() !== "none");
  const hasVisibleStroke = Boolean(style.stroke && String(style.stroke).toLowerCase() !== "none" && Number(style.strokeWidthPt ?? 1) > 0);
  if (area >= 0.42 && width >= 0.55 && height >= 0.32) return "background";
  if (style.text && !hasVisibleFill && !hasVisibleStroke && !shapeType) return "text-slot";
  if (/line|arc|brace|bracket|triangle|chevron|circular|arrow|blockarc/.test(shapeType)) return "decoration";
  if (area <= 0.015 || width <= 0.035 || height <= 0.035) return "decoration";
  return "node";
}

function isTemplateConnectorDecorationStyle(style = {}) {
  const shapeType = safeText(style?.shapeType).toLowerCase();
  return /line|arc|brace|bracket|triangle|chevron|circular|arrow|blockarc/.test(shapeType);
}

function componentRolePart(role, isPicture = false) {
  if (isPicture) return "picture-shell";
  if (role === "background") return "background";
  if (role === "connector") return "connector";
  if (role === "decoration") return "decoration";
  if (role === "text-slot") return "text-slot";
  return "node";
}

module.exports = {
  appliedChildLayerOrder,
  appliedChildStructureRole,
  appliedReplayStyle,
  componentRolePart,
  groupHasNoisyGenericPlaceholderText,
  hasSupplementalAppliedPaint,
  isAppliedPluginComponentMatch,
  isReusableAppliedChildBox,
  isSpatiallyRepresentativeReplayLayout,
  isTemplateConnectorDecorationStyle,
  normalizedLayoutBounds,
  normalizedSourceBounds,
  sourceBoundsContainedBy,
  sourceChildRelativeBox,
  templateDirectAppliedLayoutShapes,
  templateSupplementalAppliedLayoutShapes
};
