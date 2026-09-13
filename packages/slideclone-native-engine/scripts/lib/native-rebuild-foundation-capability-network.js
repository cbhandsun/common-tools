"use strict";

function createFoundationCapabilityNetworkFactory(dependencies = {}) {
  const {
    isResidualCropCoveredByText,
    safeComponentToken
  } = dependencies;
  const required = { isResidualCropCoveredByText, safeComponentToken };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild foundation capability network dependency ${name} must be a function`);
    }
  }

  function createFoundationCapabilityNetworkObjects(images = []) {
    const target = (images || []).find((image) => shouldObjectifyFoundationCapabilityNetwork(image));
    if (!target) return { shapes: [], textBoxes: [] };
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: target.id || null,
      expressionForm: "foundation-capability-network",
      ...extra
    });
    const component = (role, part) => ({
      nativeComponentGroupId: `${safeComponentToken(target.id || "foundation-network")}-foundation-${safeComponentToken(role)}`,
      nativeComponentParentId: `${safeComponentToken(target.id || "foundation-network")}-foundation-network`,
      nativeComponentArchetype: role === "shell"
        ? "foundation-network-shell"
        : role === "backbone"
          ? "foundation-network-backbone"
          : role.startsWith("capability-")
            ? "foundation-network-capability"
            : "foundation-network-domain",
      nativeComponentInstance: true,
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentRole: role,
      nativeComponentPart: part
    });
    target.source = {
      ...(target.source || {}),
      foundationCapabilityNetworkObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${target.source?.nonEditableReason || "foundation network underlay"}; rebuilt foundation banner, capability cards, domain warehouses, and routing connectors as native editable objects`
    };
    const banner = { x: 54, y: 99, w: 852, h: 112 };
    const capabilityXs = [87, 289, 491, 693];
    const capabilityLabels = ["多域聚合", "知识复用", "AI增强", "标准治理"];
    const domainXs = [230, 410, 590];
    const domainLabels = ["业务域仓 A", "业务域仓 B", "业务域仓 C"];
    // Preserve the source's intentionally narrow reading columns without
    // changing the font-size path that PowerPoint has already validated.
    const descriptionWidths = [168, 162, 162, 164];
    const descriptionText = [
      "无界聚合：打通全业务域，形成真正意义上的企业级超级大门户。",
      "经验复用：让每一次需求分析、每一份优质 PRD，都成为后续项目的优质语料库。",
      "认知跃迁：基于海量沉淀数据，AI 将从辅助“生成”进化为辅助“决策”。",
      "基建护航：为不可预测的业务变化，提供最稳定、最标准化的交付底层支撑。"
    ];
    const shapes = [
      { id: `${target.id}-foundation-banner`, type: "roundRect", box: banner, style: { fill: "#34A65E", stroke: "#34A65E", strokeWidthPt: 1, radiusPt: 7 }, source: source("foundation-network-native-banner", component("shell", "background")) },
      { id: `${target.id}-foundation-endpoint-left`, type: "ellipse", box: { x: 48.5, y: 153.5, w: 17, h: 17 }, style: { fill: "#F79432", stroke: "#F79432", strokeWidthPt: 0 }, source: source("foundation-network-native-endpoint", component("shell", "endpoint")) },
      { id: `${target.id}-foundation-endpoint-right`, type: "ellipse", box: { x: 894.5, y: 153.5, w: 17, h: 17 }, style: { fill: "#F79432", stroke: "#F79432", strokeWidthPt: 0 }, source: source("foundation-network-native-endpoint", component("shell", "endpoint")) },
      ...capabilityXs.map((x, index) => ({ id: `${target.id}-foundation-capability-${index}`, type: "roundRect", box: { x, y: 153, w: 180, h: 39 }, style: { fill: "#448FD5", stroke: "#448FD5", strokeWidthPt: 0.8, radiusPt: 4 }, source: source("foundation-network-native-capability", { index, ...component(`capability-${index}`, "label-background") }) })),
      ...domainXs.map((x, index) => ({ id: `${target.id}-foundation-domain-${index}`, type: "roundRect", box: { x, y: 447, w: 140, h: 47 }, style: { fill: "#1B5EAF", stroke: "#164F93", strokeWidthPt: 1.1, radiusPt: 4 }, source: source("foundation-network-native-domain", { index, ...component(`domain-${index}`, "node") }) })),
      foundationCurvedUpstreamConnector(`${target.id}-foundation-upstream-left`, { x: 300, y: 211, w: 162, h: 236 }, "left", source("foundation-network-native-connector", component("backbone", "upstream"))),
      { id: `${target.id}-foundation-upstream-center`, type: "line", box: { x: 480, y: 211, w: 0.1, h: 236 }, style: { stroke: "#38A85A", strokeWidthPt: 7, connectorType: "straight", startArrow: "triangle" }, source: source("foundation-network-native-connector", component("domain-1", "connector")) },
      foundationCurvedUpstreamConnector(`${target.id}-foundation-upstream-right`, { x: 498, y: 211, w: 162, h: 236 }, "right", source("foundation-network-native-connector", component("backbone", "upstream")))
    ];
    const text = (id, value, box, font, componentRole, componentPart) => ({ id: `${target.id}-${id}`, text: value, box, font: { family: "Microsoft YaHei", align: "center", valign: "middle", ...font }, style: { fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, source: source("foundation-network-native-text", component(componentRole, componentPart)) });
    const nativeTextBoxes = [
      text("foundation-title", "组织级产品底座", { x: 330, y: 116, w: 300, h: 27 }, { sizePt: 25, weight: "bold", color: "#FFFFFF" }, "shell", "title"),
      ...capabilityLabels.map((label, index) => text(`capability-label-${index}`, label, { x: capabilityXs[index], y: 153, w: 180, h: 39 }, { sizePt: 18, weight: "bold", color: "#FFFFFF" }, `capability-${index}`, "label")),
      ...domainLabels.map((label, index) => text(`domain-label-${index}`, label, { x: domainXs[index], y: 447, w: 140, h: 47 }, { sizePt: 17, weight: "bold", color: "#FFFFFF" }, `domain-${index}`, "label")),
      ...descriptionText.map((value, index) => ({
        ...text(`description-${index}`, value, { x: [58, 274, 517, 729][index], y: 244, w: descriptionWidths[index], h: 85 }, { sizePt: 13.5, weight: "regular", color: "#111111", align: "left", valign: "top" }, `capability-${index}`, "description"),
        runs: foundationDescriptionRuns(value)
      }))
    ];
    return { shapes, textBoxes: nativeTextBoxes };
  }

  function foundationCurvedUpstreamConnector(id, box, side, source) {
    const isLeft = side === "left";
    const outerX = isLeft ? 0 : 1;
    const innerX = isLeft ? 1 : 0;
    return {
      id,
      type: "freeform",
      box,
      style: {
        fill: "none",
        stroke: "#38A85A",
        strokeWidthPt: 7,
        endArrow: "triangle",
        closePath: false,
        freeformSegments: [
          { type: "moveTo", points: [{ x: outerX, y: 1 }] },
          { type: "lnTo", points: [{ x: outerX, y: 0.76 }] },
          { type: "cubicBezTo", points: [
            { x: outerX, y: 0.69 },
            { x: isLeft ? 0.05 : 0.95, y: 0.66 },
            { x: isLeft ? 0.13 : 0.87, y: 0.66 }
          ] },
          { type: "lnTo", points: [{ x: isLeft ? 0.87 : 0.13, y: 0.66 }] },
          { type: "cubicBezTo", points: [
            { x: isLeft ? 0.95 : 0.05, y: 0.66 },
            { x: innerX, y: 0.61 },
            { x: innerX, y: 0.54 }
          ] },
          { type: "lnTo", points: [{ x: innerX, y: 0 }] }
        ]
      },
      source
    };
  }

  function foundationDescriptionRuns(value) {
    const text = String(value || "");
    const splitAt = text.indexOf("：");
    if (splitAt < 0) return [];
    const font = { family: "Microsoft YaHei", sizePt: 13.5, color: "#111111" };
    return [
      { text: text.slice(0, splitAt + 1), font: { ...font, weight: "bold" } },
      { text: text.slice(splitAt + 1), font: { ...font, weight: "regular" } }
    ];
  }

  function dropFoundationCapabilityNetworkResidualCrops(page = {}, shapes = [], nativeTextBoxes = []) {
    const layerIds = new Set((shapes || [])
      .filter((shape) => /^foundation-network-native-/.test(String(shape?.source?.detector || "")))
      .map((shape) => String(shape?.source?.layerSourceId || ""))
      .filter(Boolean));
    if (layerIds.size === 0) return;
    page.images = (page.images || []).filter((image) => {
      const source = image?.source || {};
      const detector = String(source.detector || "");
      const imageId = String(image?.id || "");
      if (detector === "icon-residual-crop" && [...layerIds].some((layerId) => imageId.startsWith(`${layerId}-split-`))) {
        if (isResidualCropCoveredByText(image?.box, nativeTextBoxes, 0.25)) return false;
        image.source = {
          ...source,
          expressionForm: "icon-or-illustration",
          expressionSubtype: "icon",
          recommendedAction: "preserve-local-crop",
          standaloneVisualAsset: true,
          intentionalMinimumUnitCrop: true,
          nonEditableReason: "small decorative endpoint icon preserved as a local crop after foundation network native rebuild"
        };
        return true;
      }
      if (detector !== "split-erased-residual-crop") return true;
      return !layerIds.has(String(source.layerSourceId || ""))
        && ![...layerIds].some((layerId) => imageId.startsWith(`${layerId}-split-`));
    });
  }

  function shouldObjectifyFoundationCapabilityNetwork(image = {}) {
    const source = image?.source || {};
    const layer = source.layer || {};
    const text = String(layer?.diagramUnderstanding?.evidence?.semanticText || source.pageText || source.allText || "").replace(/\s+/g, "");
    const box = image?.box || {};
    return source.detector === "foreground-graphic-underlay-crop"
      && layer.layerType === "table-zone"
      && Number(box.w || 0) >= 700
      && /组织级产品底座/.test(text)
      && /多域聚合/.test(text)
      && /知识复用/.test(text)
      && /ai增强/i.test(text)
      && /标准治理/.test(text)
      && /业务域仓[abc]/i.test(text);
  }

  return {
    createFoundationCapabilityNetworkObjects,
    dropFoundationCapabilityNetworkResidualCrops,
    shouldObjectifyFoundationCapabilityNetwork
  };
}

module.exports = { createFoundationCapabilityNetworkFactory };
