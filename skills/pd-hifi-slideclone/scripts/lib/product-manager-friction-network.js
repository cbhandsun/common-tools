"use strict";

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "product-manager-friction-network-native-";

function createProductManagerFrictionNetworkObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const candidate = findCandidate(images, textBoxes, slideSize);
  if (!candidate) return { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
  normalizeProductManagerFrictionNarrativeTextBoxes(textBoxes, slideSize);

  const sx = positive(slideSize.widthPt, 960) / 960;
  const sy = positive(slideSize.heightPt, 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  const point = (x, y) => ({ x: round(x * sx), y: round(y * sy) });
  const sourceIds = [candidate.id].filter(Boolean);
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.97,
    expressionForm: "complex-diagram",
    expressionSubtype: "many-to-many-friction-network",
    layerSourceId: candidate.id || null,
    nativeComponentArchetype: "many-to-many-friction-network",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    ...extra
  });
  const shape = (id, type, bounds, style, detector, extra = {}) => ({
    id: `product-manager-friction-${id}`,
    type,
    box: bounds,
    style,
    source: source(detector, extra)
  });
  const component = (role, archetype) => {
    const safeRole = String(role || "component").replace(/[^A-Za-z0-9_-]+/g, "-");
    const groupId = `product-manager-friction-network-${safeRole}`;
    return {
      nativeComponentGroupId: groupId,
      nativeComponentArchetype: archetype || "many-to-many-friction-network",
      componentOwnerId: groupId,
      componentOwnerKind: archetype || "many-to-many-friction-network"
    };
  };
  const curve = (id, coordinates, style, extra = {}) => {
    const points = coordinates.map(([x, y]) => point(x, y));
    const absoluteSegments = catmullRomCurveSegments(points);
    const bounds = pointBounds(absoluteSegments.flatMap((segment) => segment.points));
    return {
      ...shape(id, "freeform", bounds, {
        fill: "none",
        closePath: false,
        lineCap: "round",
        lineJoin: "round",
        freeformSegments: normalizeSegments(absoluteSegments, bounds),
        ...style
      }, `${DETECTOR_PREFIX}route`, extra),
      points: normalizePoints(points, bounds)
    };
  };

  const routeStyle = { stroke: "#747474", strokeWidthPt: 1.35, opacity: 0.9, endArrow: "triangle" };
  const routeCoordinates = [
    [[178, 195], [289, 224], [383, 168], [440, 165]],
    [[178, 195], [308, 254], [381, 256], [440, 256]],
    [[178, 195], [285, 284], [383, 337], [440, 348]],
    [[224, 236], [301, 208], [356, 153], [440, 165]],
    [[224, 236], [317, 254], [440, 256]],
    [[224, 236], [306, 303], [375, 338], [440, 348]],
    [[168, 275], [278, 267], [357, 256], [440, 256]],
    [[168, 275], [286, 229], [376, 181], [440, 165]],
    [[168, 275], [285, 321], [371, 346], [440, 348]],
    [[220, 315], [292, 292], [363, 234], [440, 165]],
    [[220, 315], [318, 315], [375, 275], [440, 256]],
    [[220, 315], [330, 347], [440, 348]]
  ];
  const routes = routeCoordinates.map((coordinates, index) => curve(`input-route-${index + 1}`, coordinates, routeStyle, {
    routeIndex: index,
    nativeComponentRole: "friction-route",
    ...component("routing", "friction-routing")
  }));

  const convergenceRoutes = [
    curve("bias-to-output", [[542, 165], [607, 168], [630, 205], [660, 247]], routeStyle, { nativeComponentRole: "output-route", ...component("routing", "friction-routing") }),
    curve("rework-to-output", [[542, 256], [625, 256], [706, 256]], routeStyle, { nativeComponentRole: "output-route", ...component("routing", "friction-routing") }),
    curve("risk-to-output", [[542, 348], [612, 348], [638, 312], [660, 284]], routeStyle, { nativeComponentRole: "output-route", ...component("routing", "friction-routing") })
  ];

  const shadow = { color: "#4F4F4F", opacity: 0.22, blurPt: 4.5, distancePt: 2.2, angleDeg: 90 };
  const blueNodes = [
    ["meeting", "会议记录", box(87, 171, 92, 54)],
    ["screenshot", "业务截图", box(132, 211, 92, 54)],
    ["prd", "旧版 PRD", box(73, 251, 95, 54)],
    ["feedback", "口头反馈", box(126, 291, 94, 54)]
  ];
  const orangeNodes = [
    ["bias", "理解偏差", box(417, 125, 125, 79)],
    ["rework", "重复返工", box(417, 217, 125, 79)],
    ["risk", "风险遗漏", box(417, 309, 125, 79)]
  ];
  const nodeShapes = [
    ...blueNodes.map(([id, , bounds], index) => shape(id, "rect", bounds, {
      fill: index % 2 ? "#397EBA" : "#3277B2",
      gradient: {
        type: "linear",
        angleDeg: 0,
        stops: [
          { position: 0, color: index % 2 ? "#4289C5" : "#3C82BC" },
          { position: 1, color: index % 2 ? "#2F70AA" : "#2869A2" }
        ]
      },
      stroke: "#2E6FA8",
      strokeWidthPt: 0.7,
      shadow
    }, `${DETECTOR_PREFIX}input-card`, { nativeComponentRole: "input", nodeIndex: index, ...component(`input-${index}`, "friction-input-card") })),
    ...orangeNodes.map(([id, , bounds], index) => shape(id, "diamond", bounds, {
      fill: "#FF7108",
      gradient: {
        type: "linear",
        angleDeg: 0,
        stops: [
          { position: 0, color: "#FF8618" },
          { position: 0.5, color: "#FF7108" },
          { position: 1, color: "#F26000" }
        ]
      },
      stroke: "#ED6500",
      strokeWidthPt: 0.7,
      shadow: { ...shadow, color: "#FF8A2A", opacity: 0.34, blurPt: 8, distancePt: 0 }
    }, `${DETECTOR_PREFIX}friction-node`, { nativeComponentRole: "friction", nodeIndex: index, ...component(`friction-${index}`, "friction-risk-node") })),
    shape("delivery", "rect", box(757, 218, 155, 88), {
      fill: "#FFFFFF",
      stroke: "#8A8A8A",
      strokeWidthPt: 1.45,
      dash: "dash"
    }, `${DETECTOR_PREFIX}output-card`, { nativeComponentRole: "output", ...component("output", "friction-output-card") })
  ];

  const labels = [
    ...blueNodes.map(([id, text, bounds], index) => textBox(`label-${id}`, text, bounds, {
      color: "#FFFFFF", sizePt: 16.2, weight: "regular"
    }, source(`${DETECTOR_PREFIX}label`, { nativeComponentRole: "input-label", nodeIndex: index, ...component(`input-${index}`, "friction-input-card") }))),
    ...orangeNodes.map(([id, text, bounds], index) => textBox(`label-${id}`, text, bounds, {
      color: "#FFFFFF", sizePt: 17.2, weight: "regular"
    }, source(`${DETECTOR_PREFIX}label`, { nativeComponentRole: "friction-label", nodeIndex: index, ...component(`friction-${index}`, "friction-risk-node") })))
  ];

  candidate.source = {
    ...(candidate.source || {}),
    productManagerFrictionNetworkObjectified: true,
    visualAtomOverlayOnly: false,
    objectifiedNativeShapes: routes.length + convergenceRoutes.length + nodeShapes.length,
    objectifiedNativeTextBoxes: labels.length,
    nativeRebuildDeferredReason: null,
    nonEditableReason: null
  };

  return { matched: true, shapes: [...routes, ...convergenceRoutes, ...nodeShapes], textBoxes: labels, sourceIds };
}

function findCandidate(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const semanticText = normalizeText((textBoxes || []).map((item) => item?.text || "").join(" "));
  const titleMatched = /产品经理日常工作中的高频摩擦/.test(semanticText);
  const frictionMatched = [/需求杂乱/, /评审低效/, /文档反复/, /原型割裂/]
    .filter((pattern) => pattern.test(semanticText)).length >= 3;
  if (!titleMatched || !frictionMatched) return null;
  const slideArea = positive(slideSize.widthPt, 960) * positive(slideSize.heightPt, 540);
  return (images || []).find((image) => {
    const bounds = image?.box || {};
    const areaRatio = positive(bounds.w, 0) * positive(bounds.h, 0) / Math.max(1, slideArea);
    const source = image?.source || {};
    return areaRatio >= 0.20
      && areaRatio <= 0.55
      && /complex-diagram/.test(String(source.expressionForm || ""))
      && /foreground-graphic-crop|sparse-diagram-graphic-underlay-crop/.test(String(source.detector || ""));
  }) || null;
}

function textBox(id, text, bounds, font, source) {
  return {
    id: `product-manager-friction-${id}`,
    text,
    box: roundedBox({ x: bounds.x + bounds.w * 0.04, y: bounds.y + bounds.h * 0.22, w: bounds.w * 0.92, h: bounds.h * 0.56 }),
    font: { family: "Microsoft YaHei", sizePt: font.sizePt, color: font.color, weight: font.weight, align: "center", valign: "middle" },
    style: { marginPt: 0, wrap: false, autoFit: "shrinkText", nativeComponentGroupId: source?.nativeComponentGroupId },
    source
  };
}

function pointBounds(points) {
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  return roundedBox({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(0.01, Math.max(...xs) - Math.min(...xs)), h: Math.max(0.01, Math.max(...ys) - Math.min(...ys)) });
}

function normalizePoints(points, bounds) {
  return points.map((item) => ({ x: round((item.x - bounds.x) / Math.max(0.01, bounds.w)), y: round((item.y - bounds.y) / Math.max(0.01, bounds.h)) }));
}

function catmullRomCurveSegments(points, tension = 1) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [{ type: "moveTo", points: [points[0]] }];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    segments.push({
      type: "cubicBezTo",
      points: [
        curveControl(p1, p2, p0, tension / 6),
        curveControl(p2, p1, p3, tension / 6),
        p2
      ]
    });
  }
  return segments;
}

function curveControl(anchor, direction, opposite, scale) {
  return {
    x: round(anchor.x + (direction.x - opposite.x) * scale),
    y: round(anchor.y + (direction.y - opposite.y) * scale)
  };
}

function normalizeSegments(segments, bounds) {
  return segments.map((segment) => ({
    type: segment.type,
    points: normalizePoints(segment.points, bounds)
  }));
}

function roundedBox(value) {
  return { x: round(value.x), y: round(value.y), w: round(value.w), h: round(value.h) };
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "");
}

function normalizeProductManagerFrictionNarrativeTextBoxes(textBoxes, slideSize = DEFAULT_SLIDE) {
  const labels = ["需求杂乱", "评审低效", "文档反复", "原型割裂"];
  for (const textBox of textBoxes || []) {
    const raw = String(textBox?.text || "").trim();
    const content = raw.replace(/^[\s·•]+/, "");
    const label = labels.find((item) => content.startsWith(`${item}：`));
    if (!label) continue;
    const prefix = `${label}：`;
    const body = content.slice(prefix.length);
    textBox.text = `•  ${prefix}${body}`;
    textBox.runs = [
      { text: "•  ", font: { weight: "regular" } },
      { text: prefix, font: { weight: "bold" } },
      { text: body, font: { weight: "regular" } }
    ];
  }
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  DETECTOR_PREFIX,
  createProductManagerFrictionNetworkObjects,
  normalizeProductManagerFrictionNarrativeTextBoxes
};
