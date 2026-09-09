"use strict";

const { safeComponentToken } = require("@common-tools/slideclone-core/diagram-residual-crops");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { normalizeCjkText } = require("@common-tools/slideclone-core/prd-generation-shapes");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createPortalPlatformDiagramFactory(dependencies = {}) {
  const {
    boxCenterInside,
    round
  } = dependencies;
  const required = {
    boxCenterInside,
    round
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`portal platform dependency ${name} must be a function`);
  }

  function createPortalPlatformDiagramObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const shapes = [];
    const generatedTextBoxes = [];
    for (const image of images || []) {
      if (!shouldObjectifyPortalPlatformDiagram(image, textBoxes, slideSize)) continue;
      const diagram = inferPortalPlatformDiagramLayout(image);
      if (!diagram) continue;
      image.source = {
        ...(image.source || {}),
        portalPlatformDiagramObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        objectifiedPortalPlatformShapes: diagram.shapes.length,
        objectifiedPortalPlatformTextBoxes: diagram.textBoxes.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "portal platform diagram crop"}; rebuilt portal platform architecture diagram as native editable components`
      };
      shapes.push(...diagram.shapes);
      generatedTextBoxes.push(...diagram.textBoxes);
    }
    return { shapes, textBoxes: generatedTextBoxes };
  }

  function shouldObjectifyPortalPlatformDiagram(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    if (!box.w || !box.h || box.w < 760 || box.h < 200) return false;
    const layer = image.source?.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    if (String(layer.layerType || "") !== "table-zone") return false;
    if (understanding.archetype !== "matrix-or-grid") return false;
    const nearby = normalizedTextsInsideBox(textBoxes, {
      x: Math.max(0, box.x - 20),
      y: box.y + box.h,
      w: Math.min(slideSize.widthPt, box.w + 40),
      h: Math.max(120, slideSize.heightPt - box.y - box.h)
    });
    return nearby.has(normalizeCjkText("统一入口：跨越业务域与系统"))
      && nearby.has(normalizeCjkText("资产沉淀：打破工具孤岛，让"))
      && nearby.has(normalizeCjkText("AI协作：依托底层Skills引"));
  }

  function inferPortalPlatformDiagramLayout(image = {}) {
    const b = image.box || {};
    const prefix = image.id || "portal-platform";
    const shapes = [];
    const textBoxes = [];
    const leftCards = ["业务需求", "系统菜单", "历史文档"].map((label, index) => ({
      label,
      box: {
        x: round(b.x + b.w * 0.003),
        y: round(b.y + b.h * (0.011 + index * 0.356)),
        w: round(b.w * 0.149),
        h: round(b.h * 0.283)
      }
    }));
    const platform = {
      x: round(b.x + b.w * 0.323),
      y: round(b.y + b.h * 0.014),
      w: round(b.w * 0.347),
      h: round(b.h * 0.973)
    };
    const portal = {
      x: round(b.x + b.w * 0.750),
      y: round(b.y + b.h * 0.257),
      w: round(b.w * 0.246),
      h: round(b.h * 0.487)
    };
    leftCards.forEach((card, index) => {
      const component = portalPlatformComponent(image, `input-${index}`, "portal-input-card");
      shapes.push(portalShape(`${prefix}-input-card-${index}`, "rect", card.box, {
        fill: "#E9EFF6",
        stroke: "#E1E8F0",
        strokeWidthPt: 0.8
      }, image, { role: "input-card", label: card.label, ...component, nativeComponentRole: "container" }));
      textBoxes.push(portalTextBox(`${prefix}-input-label-${index}`, card.label, card.box, 17, "#111111", "regular", image, { role: "input-card-label", ...component, nativeComponentRole: "label" }));
      const start = { x: card.box.x + card.box.w, y: card.box.y + card.box.h * 0.5 };
      const midX = b.x + b.w * 0.237;
      const routing = portalPlatformComponent(image, "input-routing", "portal-routing");
      shapes.push(portalShape(`${prefix}-input-route-horizontal-${index}`, "line", lineBox(start, { x: midX, y: start.y }), {
        stroke: "#8B929A",
        strokeWidthPt: 4.2,
        connectorType: "straight"
      }, image, { role: "input-route", label: card.label, ...routing, nativeComponentRole: `branch-${index}` }));
    });
    const midX = b.x + b.w * 0.237;
    const inputRouting = portalPlatformComponent(image, "input-routing", "portal-routing");
    shapes.push(portalShape(`${prefix}-input-route-join`, "line", lineBox(
      { x: midX, y: leftCards[0].box.y + leftCards[0].box.h * 0.5 },
      { x: midX, y: leftCards[2].box.y + leftCards[2].box.h * 0.5 }
    ), {
      stroke: "#8B929A",
      strokeWidthPt: 4.2,
      connectorType: "straight"
    }, image, { role: "input-route-join", ...inputRouting, nativeComponentRole: "join" }));
    shapes.push(portalShape(`${prefix}-input-arrow`, "line", lineBox(
      { x: midX, y: b.y + b.h * 0.49 },
      { x: platform.x - 3, y: b.y + b.h * 0.49 }
    ), {
      stroke: "#8B929A",
      strokeWidthPt: 4.2,
      connectorType: "straight",
      endArrow: "triangle"
    }, image, { role: "input-arrow", ...inputRouting, nativeComponentRole: "arrow" }));

    const platformComponent = portalPlatformComponent(image, "platform", "portal-platform-core");
    shapes.push(portalShape(`${prefix}-platform-card`, "rect", platform, {
      fill: "#176BBF",
      stroke: "#176BBF",
      strokeWidthPt: 0,
      shadow: { color: "#176BBF", alpha: 0.12, blurPt: 6, distancePt: 0, angle: 0 }
    }, image, { role: "platform-card", ...platformComponent, nativeComponentRole: "container" }));
    textBoxes.push(portalTextBox(`${prefix}-platform-title`, "PM Portal Platform", {
      x: platform.x + platform.w * 0.10,
      y: platform.y + platform.h * 0.22,
      w: platform.w * 0.80,
      h: platform.h * 0.14
    }, 24, "#FFFFFF", "bold", image, { role: "platform-title", ...platformComponent, nativeComponentRole: "title" }));
    shapes.push(...portalPlatformIconShapes(prefix, platform, image, platformComponent, portalShape, round));
    const outputRouting = portalPlatformComponent(image, "output-routing", "portal-routing");
    shapes.push(portalShape(`${prefix}-output-arrow`, "line", lineBox(
      { x: platform.x + platform.w, y: platform.y + platform.h * 0.50 },
      { x: portal.x - 3, y: portal.y + portal.h * 0.50 }
    ), {
      stroke: "#28AA65",
      strokeWidthPt: 6,
      connectorType: "straight",
      endArrow: "triangle"
    }, image, { role: "output-arrow", ...outputRouting, nativeComponentRole: "arrow" }));

    const portalComponent = portalPlatformComponent(image, "unified-portal", "unified-portal-card");
    shapes.push(portalShape(`${prefix}-portal-frame`, "roundRect", portal, {
      fill: "#FFFFFF",
      stroke: "#176BBF",
      strokeWidthPt: 3,
      radiusRatio: 0.04
    }, image, { role: "portal-frame", ...portalComponent, nativeComponentRole: "frame" }));
    textBoxes.push(portalTextBox(`${prefix}-portal-title`, "统一门户", {
      x: portal.x + portal.w * 0.12,
      y: portal.y + portal.h * 0.16,
      w: portal.w * 0.76,
      h: portal.h * 0.20
    }, 19, "#111111", "bold", image, { role: "portal-title", ...portalComponent, nativeComponentRole: "title" }));
    ["系统入口", "PRD资产", "原型资产"].forEach((label, index) => {
      const pill = {
        x: round(portal.x + portal.w * (0.06 + index * 0.31)),
        y: round(portal.y + portal.h * 0.58),
        w: round(portal.w * 0.27),
        h: round(portal.h * 0.212)
      };
      shapes.push(portalShape(`${prefix}-portal-pill-${index}`, "roundRect", pill, {
        fill: "#176BBF",
        stroke: "#176BBF",
        strokeWidthPt: 0,
        radiusRatio: 0.12
      }, image, { role: "portal-pill", label, ...portalComponent, nativeComponentRole: `pill-${index}` }));
      textBoxes.push(portalTextBox(`${prefix}-portal-pill-label-${index}`, label, pill, 9.5, "#FFFFFF", "regular", image, { role: "portal-pill-label", ...portalComponent, nativeComponentRole: `pill-label-${index}` }));
    });
    return { shapes, textBoxes };
  }

  function portalShape(id, type, box, style, image, extra = {}) {
    return {
      id,
      type,
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      style,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "portal-platform-native-component",
        layerSourceId: image?.id || null,
        layerType: image?.source?.layer?.layerType || "table-zone",
        ...extra
      }
    };
  }

  function portalTextBox(id, text, box, sizePt, color, weight, image, extra = {}) {
    return {
      id,
      text,
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt,
        color,
        opacity: 1,
        weight,
        align: "center",
        valign: "middle"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "portal-platform-native-text",
        layerSourceId: image?.id || null,
        ...extra
      }
    };
  }

  function normalizedTextsInsideBox(textBoxes = [], box = {}) {
    return new Set((textBoxes || [])
      .filter((item) => item?.box && boxCenterInside(item.box, box))
      .map((item) => normalizeCjkText(item.text))
      .filter(Boolean));
  }

  return {
    createPortalPlatformDiagramObjects,
    inferPortalPlatformDiagramLayout,
    shouldObjectifyPortalPlatformDiagram
  };
}

function portalPlatformIconShapes(prefix, platform, image, component = {}, portalShape, round) {
  const iconY = platform.y + platform.h * 0.53;
  const iconW = platform.w * 0.13;
  const xs = [0.22, 0.50, 0.76].map((ratio) => platform.x + platform.w * ratio - iconW / 2);
  const folder = portalShape(`${prefix}-platform-folder`, "freeform", { x: round(xs[0]), y: round(iconY), w: round(iconW), h: round(iconW * 0.72) }, {
    fill: "#FFFFFF",
    stroke: "#FFFFFF",
    strokeWidthPt: 0
  }, image, { role: "platform-icon", part: "folder", ...component, nativeComponentRole: "folder-icon" });
  folder.points = [
    { x: 0, y: 0.24 },
    { x: 0.34, y: 0.24 },
    { x: 0.42, y: 0.08 },
    { x: 0.74, y: 0.08 },
    { x: 0.82, y: 0.24 },
    { x: 1, y: 0.24 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ];
  return [
    folder,
    portalShape(`${prefix}-platform-document`, "document", { x: round(xs[1]), y: round(iconY - 3), w: round(iconW * 0.82), h: round(iconW * 0.90) }, {
      fill: "#FFFFFF",
      stroke: "#FFFFFF",
      strokeWidthPt: 0
    }, image, { role: "platform-icon", part: "document", ...component, nativeComponentRole: "document-icon" }),
    portalShape(`${prefix}-platform-wireframe-frame`, "rect", { x: round(xs[2]), y: round(iconY - 2), w: round(iconW), h: round(iconW * 0.86) }, {
      fill: "none",
      stroke: "#FFFFFF",
      strokeWidthPt: 2
    }, image, { role: "platform-icon", part: "wireframe", ...component, nativeComponentRole: "wireframe-frame" }),
    portalShape(`${prefix}-platform-wireframe-line-a`, "line", lineBox({ x: xs[2], y: iconY + iconW * 0.22 }, { x: xs[2] + iconW, y: iconY + iconW * 0.62 }), {
      stroke: "#FFFFFF",
      strokeWidthPt: 1.6,
      connectorType: "straight"
    }, image, { role: "platform-icon", part: "wireframe", ...component, nativeComponentRole: "wireframe-line-a" }),
    portalShape(`${prefix}-platform-wireframe-line-b`, "line", lineBox({ x: xs[2] + iconW, y: iconY + iconW * 0.22 }, { x: xs[2], y: iconY + iconW * 0.62 }), {
      stroke: "#FFFFFF",
      strokeWidthPt: 1.6,
      connectorType: "straight"
    }, image, { role: "platform-icon", part: "wireframe", ...component, nativeComponentRole: "wireframe-line-b" })
  ];
}

function portalPlatformComponent(image = {}, role = "component", archetype = "portal-platform-diagram") {
  const base = safeComponentToken(image.id || "portal-platform");
  const safeRole = safeComponentToken(role);
  return {
    nativeComponentInstance: true,
    nativeComponentGroupId: `${base}-portal-${safeRole}`,
    nativeComponentArchetype: archetype,
    componentOwnerId: `${base}-portal-${safeRole}`,
    componentOwnerKind: archetype
  };
}

module.exports = {
  createPortalPlatformDiagramFactory,
  _private: {
    portalPlatformComponent
  }
};
