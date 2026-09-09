"use strict";

function createDenseComplexScaffoldFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    boxCenterY,
    centerOfBox,
    normalizeCjkText,
    round,
    roundedBox,
    safeComponentToken,
    temporaryAnswerWorkflowTextBox,
    unionPtBoxes
  } = dependencies;

  function rb(box = {}, x, y, w, h) {
    return {
      x: Number(box.x || 0) + Number(box.w || 0) * x,
      y: Number(box.y || 0) + Number(box.h || 0) * y,
      w: Number(box.w || 0) * w,
      h: Number(box.h || 0) * h
    };
  }

  function createDenseComplexDiagramScaffoldShapes(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {  
    return createDenseComplexDiagramScaffoldObjects(images, textBoxes, slideSize).shapes;  
  }  
    
  function createDenseComplexDiagramScaffoldObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const shapes = [];  
    const nativeTextBoxes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyDenseComplexDiagramScaffold(image, textBoxes, slideSize)) continue;  
      const theme = inferDenseComplexDiagramTheme(image, textBoxes);  
      const localShapes = inferDenseComplexDiagramScaffoldShapes(image, theme);  
      if (localShapes.length === 0) continue;  
      const localTextBoxes = inferDenseComplexDiagramScaffoldTextBoxes(image, theme, localShapes);  
      image.source = {  
        ...(image.source || {}),  
        denseComplexDiagramScaffoldObjectified: true,  
        visualAtomOverlayOnly: true,  
        denseComplexScaffoldTheme: theme,  
        objectifiedDenseComplexScaffoldShapes: localShapes.length,  
        objectifiedDenseComplexScaffoldTextBoxes: localTextBoxes.length,  
        nativeRebuildDeferredReason: "dense complex diagram cannot yet be safely redrawn as a full native template; rebuilt the high-level structure as editable native scaffold while preserving the local fidelity crop",  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; dense complex diagram structure rebuilt as editable scaffold overlays and native text labels while preserving the crop`  
      };  
      shapes.push(...localShapes);  
      nativeTextBoxes.push(...localTextBoxes);  
    }  
    return { shapes, textBoxes: nativeTextBoxes };  
  }  
    
  function shouldObjectifyDenseComplexDiagramScaffold(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const source = image?.source || {};  
    const box = image?.box || {};  
    if (!box.w || !box.h) return false;  
    if (/screenshot|photo|logo|icon|illustration/.test(String(source.expressionForm || ""))) return false;  
    if (/keep-local-crop|preserve-local-crop|match-icon-library/.test(String(source.recommendedAction || ""))) return false;  
    const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    if (areaRatio < 0.16 || areaRatio > 0.78) return false;  
    const detector = String(source.detector || "");  
    const subtype = String(source.expressionSubtype || "");  
    const complexCandidate = subtype === "dense-complex-diagram"  
      || /sparse-diagram-graphic-underlay-crop|foreground-aggregate-crop|foreground-graphic-crop/.test(detector);  
    if (!complexCandidate) return false;  
    const pageText = denseComplexPageText(textBoxes);  
    return /PMPortalSkills|AI原生产品交付基座|全链路AISkills|链式编排|破局重构|原型与高仿|意图转界面|资产落盘|组织级资产|终局视野|企业级AI智能产品底座|产品资产|复利引擎/.test(pageText)  
      || /foreground-aggregate-crop|sparse-diagram-graphic-underlay-crop/.test(detector);  
  }  
    
  function inferDenseComplexDiagramTheme(image = {}, textBoxes = []) {  
    const pageText = denseComplexPageText(textBoxes);  
    if (/PMPortalSkills|AI原生产品交付基座/.test(pageText)) return "cover-platform";  
    if (/全链路AISkills|链式编排|破局重构/.test(pageText)) return "skill-chain";  
    if (/原型与高仿|意图转界面|可视化验证/.test(pageText)) return "prototype-validation";  
    if (/资产落盘|组织级资产|单点技能产出/.test(pageText)) return "asset-landing";  
    if (/终局视野|企业级AI智能产品底座|产品资产|复利引擎/.test(pageText)) return "system-vision";  
    const detector = String(image?.source?.detector || "");  
    if (/foreground-aggregate-crop/.test(detector)) return "system-vision";  
    return "generic-complex";  
  }  
    
  function denseComplexPageText(textBoxes = []) {  
    return normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));  
  }  
    
  function inferDenseComplexDiagramScaffoldShapes(image = {}, theme = "generic-complex") {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    if (theme === "cover-platform") return denseComplexCoverPlatformShapes(image, box);  
    if (theme === "skill-chain") return denseComplexSkillChainShapes(image, box);  
    if (theme === "prototype-validation") return denseComplexPrototypeValidationShapes(image, box);  
    if (theme === "asset-landing") return denseComplexAssetLandingShapes(image, box);  
    if (theme === "system-vision") return denseComplexSystemVisionShapes(image, box);  
    return denseComplexGenericShapes(image, box);  
  }  
    
  function denseComplexScaffoldSource(image, detector, extra = {}) {  
    const groupId = `dense-complex-${safeComponentToken(image.id || "diagram")}`;  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.68,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "dense-complex-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      scaffoldOnly: true,  
      nativeComponentGroupId: groupId,  
      nativeComponentArchetype: "dense-complex-diagram",  
      ...extra  
    };  
  }  
    
  function denseComplexShape(image, id, detector, type, box, style, extra = {}) {  
    return {  
      id: `${image.id || "dense-complex"}-${id}`,  
      type,  
      box: roundedBox(box),  
      style,  
      source: denseComplexScaffoldSource(image, detector, extra)  
    };  
  }  
    
  function inferDenseComplexDiagramScaffoldTextBoxes(image = {}, theme = "generic-complex", shapes = []) {  
    return denseComplexThemeLabels(theme).flatMap((label) =>  
      denseComplexLabelTextBoxesForRole(image, theme, label, shapes)  
    );  
  }  
    
  function denseComplexThemeLabels(theme = "generic-complex") {  
    const labels = {  
      "cover-platform": [  
        { role: "core", text: "Skills Engine", subtext: "AI 原生交付基座" },  
        { role: "node", index: 0, text: "知识输入" },  
        { role: "node", index: 1, text: "需求理解" },  
        { role: "node", index: 2, text: "原型生成" },  
        { role: "node", index: 3, text: "资产沉淀" }  
      ],  
      "skill-chain": [  
        { role: "step", index: 0, text: "需求理解", subtext: "业务意图结构化" },  
        { role: "step", index: 1, text: "Skill 编排", subtext: "能力链路复用" },  
        { role: "step", index: 2, text: "PRD 生成", subtext: "标准交付资产" },  
        { role: "step", index: 3, text: "资产沉淀", subtext: "组织级复利" }  
      ],  
      "prototype-validation": [  
        { role: "node", index: 0, text: "业务意图" },  
        { role: "node", index: 1, text: "AI 生成" },  
        { role: "node", index: 2, text: "高仿原型" }  
      ],  
      "asset-landing": [  
        { role: "core", text: "资产 Hub" },  
        { role: "node", index: 0, text: "标准化 PRD" },  
        { role: "node", index: 1, text: "交互原型" },  
        { role: "node", index: 2, text: "操作手册" },  
        { role: "node", index: 3, text: "业务规则" }  
      ],  
      "system-vision": [  
        { role: "core", text: "产品资产底座" },  
        { role: "node", index: 0, text: "业务域" },  
        { role: "node", index: 1, text: "产品图谱" },  
        { role: "node", index: 2, text: "知识复利" },  
        { role: "node", index: 3, text: "智能门户" }  
      ],  
      "generic-complex": [  
        { role: "step", index: 0, text: "输入" },  
        { role: "step", index: 1, text: "理解" },  
        { role: "step", index: 2, text: "生成" },  
        { role: "step", index: 3, text: "校验" },  
        { role: "step", index: 4, text: "沉淀" }  
      ]  
    };  
    return labels[theme] || labels["generic-complex"];  
  }  
    
  function denseComplexLabelTextBoxesForRole(image = {}, theme = "generic-complex", label = {}, shapes = []) {  
    const anchor = denseComplexLabelAnchorBox(label, shapes);  
    if (!anchor) return [];  
    const baseSource = denseComplexScaffoldSource(image, "dense-complex-diagram-native-scaffold-text", {  
      theme,  
      textRole: label.role,  
      textIndex: Number.isFinite(label.index) ? label.index : null  
    });  
    const titleSize = denseComplexTitleSize(anchor, label);  
    const result = [  
      denseComplexTextBox(`${image.id || "dense-complex"}-${theme}-${label.role}-${label.index ?? "core"}-title`, label.text, {  
        x: anchor.x + anchor.w * 0.10,  
        y: anchor.y + anchor.h * (label.subtext ? 0.24 : 0.32),  
        w: anchor.w * 0.80,  
        h: anchor.h * (label.subtext ? 0.28 : 0.38)  
      }, {  
        sizePt: titleSize,  
        color: denseComplexTextColor(theme, label),  
        weight: "bold",  
        align: "center"  
      }, baseSource)  
    ];  
    if (label.subtext) {  
      result.push(denseComplexTextBox(`${image.id || "dense-complex"}-${theme}-${label.role}-${label.index ?? "core"}-subtitle`, label.subtext, {  
        x: anchor.x + anchor.w * 0.12,  
        y: anchor.y + anchor.h * 0.56,  
        w: anchor.w * 0.76,  
        h: anchor.h * 0.24  
      }, {  
        sizePt: Math.max(8.5, titleSize - 4),  
        color: "#557085",  
        weight: "regular",  
        align: "center"  
      }, {  
        ...baseSource,  
        textRole: `${label.role}-subtitle`  
      }));  
    }  
    return result;  
  }  
    
  function denseComplexLabelAnchorBox(label = {}, shapes = []) {  
    if (label.role === "core") {  
      return shapes.find((shape) => shape?.source?.detector === "dense-complex-diagram-native-scaffold-core")?.box || null;  
    }  
    if (label.role === "layer") {  
      return shapes.find((shape) =>  
        shape?.source?.detector === "dense-complex-diagram-native-scaffold-layer"  
        && Number(shape?.source?.layerIndex) === Number(label.index)  
      )?.box || null;  
    }  
    return shapes.find((shape) =>  
      shape?.source?.detector === "dense-complex-diagram-native-scaffold-card"  
      && (Number(shape?.source?.stepIndex) === Number(label.index)  
        || Number(shape?.source?.nodeIndex) === Number(label.index)  
        || Number(shape?.source?.cardIndex) === Number(label.index))  
    )?.box || null;  
  }  
    
  function denseComplexTitleSize(box = {}, label = {}) {  
    const height = Number(box.h || 0);  
    if (label.subtext) return Math.max(10.5, Math.min(15, height * 0.15));  
    return Math.max(11, Math.min(18, height * 0.20));  
  }  
    
  function denseComplexTextColor(theme = "generic-complex", label = {}) {  
    if (theme === "asset-landing" && label.role === "core") return "#FFFFFF";  
    return "#162331";  
  }  
    
  function denseComplexTextBox(id, text, box, font = {}, source = {}) {  
    return temporaryAnswerWorkflowTextBox(id, text, roundedBox(box), {  
      family: "Microsoft YaHei",  
      sizePt: font.sizePt || 12,  
      color: font.color || "#162331",  
      weight: font.weight || "regular",  
      align: font.align || "center"  
    }, {  
      ...source,  
      editable: true,  
      nativeRebuild: true,  
      overlayVisibility: "visible"  
    });  
  }  
    
  function denseComplexConnector(image, id, box, color = "#5A8FC6", extra = {}) {  
    return denseComplexShape(image, id, "dense-complex-diagram-native-scaffold-connector", "line", box, {  
      stroke: color,  
      strokeWidthPt: 1.6,  
      connectorType: "straight",  
      endArrowType: "triangle",  
      opacity: 0.82  
    }, extra);  
  }  
    
  function denseComplexCardStyle(fill = "#FFFFFF", stroke = "#82A9CE") {  
    return {  
      fill,  
      stroke,  
      strokeWidthPt: 1.1,  
      radiusRatio: 0.08,  
      opacity: 0.78,  
      shadow: { color: stroke, opacity: 0.12, blurPt: 3.2, distancePt: 1, angleDeg: 90 }  
    };  
  }  
    
  function denseComplexCoverPlatformShapes(image, box) {  
    const shapes = [];  
    const center = rb(box, 0.38, 0.30, 0.24, 0.26);  
    shapes.push(denseComplexShape(image, "cover-core", "dense-complex-diagram-native-scaffold-core", "roundRect", center, denseComplexCardStyle("#F8FCFF", "#2F88C9"), { theme: "cover-platform" }));  
    const nodes = [  
      ["top", 0.38, 0.04, "#EAF5FF"], ["left", 0.08, 0.34, "#F4F8FF"], ["right", 0.68, 0.34, "#F4F8FF"], ["bottom", 0.38, 0.68, "#F7FBF4"]  
    ];  
    nodes.forEach(([key, x, y, fill], index) => {  
      const node = rb(box, x, y, 0.24, 0.18);  
      shapes.push(denseComplexShape(image, `cover-node-${key}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle(fill, "#79A8CF"), { theme: "cover-platform", nodeIndex: index }));  
      shapes.push(denseComplexConnector(image, `cover-link-${key}`, {  
        x: round(center.x + center.w / 2),  
        y: round(center.y + center.h / 2),  
        w: round(node.x + node.w / 2 - (center.x + center.w / 2)),  
        h: round(node.y + node.h / 2 - (center.y + center.h / 2))  
      }, "#4E93C9", { theme: "cover-platform", nodeIndex: index }));  
    });  
    return shapes;  
  }  
    
  function denseComplexSkillChainShapes(image, box) {  
    const shapes = [];  
    const cards = [];  
    for (let index = 0; index < 4; index += 1) {  
      const card = rb(box, 0.07 + index * 0.225, 0.28 + (index % 2) * 0.08, 0.16, 0.26);  
      cards.push(card);  
      shapes.push(denseComplexShape(image, `skill-chain-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle(index % 2 ? "#F8FFF7" : "#F6FBFF", index % 2 ? "#65AE7A" : "#5C9ED3"), { theme: "skill-chain", stepIndex: index }));  
      shapes.push(denseComplexShape(image, `skill-chain-chip-${index}`, "dense-complex-diagram-native-scaffold-chip", "ellipse", {  
        x: card.x + card.w * 0.37,  
        y: card.y - card.h * 0.16,  
        w: card.w * 0.26,  
        h: card.w * 0.26  
      }, { fill: index % 2 ? "#5BBE76" : "#2E92D0", stroke: "none", strokeWidthPt: 0, opacity: 0.92 }, { theme: "skill-chain", stepIndex: index }));  
    }  
    for (let index = 0; index < cards.length - 1; index += 1) {  
      shapes.push(denseComplexConnector(image, `skill-chain-connector-${index}`, {  
        x: round(cards[index].x + cards[index].w),  
        y: round(cards[index].y + cards[index].h * 0.52),  
        w: round(cards[index + 1].x - (cards[index].x + cards[index].w)),  
        h: round(cards[index + 1].y + cards[index + 1].h * 0.52 - (cards[index].y + cards[index].h * 0.52))  
      }, "#4C9ED0", { theme: "skill-chain", connectorIndex: index }));  
    }  
    shapes.push(denseComplexShape(image, "skill-chain-backbone", "dense-complex-diagram-native-scaffold-backbone", "line", {  
      x: round(box.x + box.w * 0.08),  
      y: round(box.y + box.h * 0.68),  
      w: round(box.w * 0.84),  
      h: 0  
    }, { stroke: "#B8CADB", strokeWidthPt: 1.2, connectorType: "straight", opacity: 0.7 }, { theme: "skill-chain" }));  
    return shapes;  
  }  
    
  function denseComplexPrototypeValidationShapes(image, box) {  
    const shapes = [];  
    const left = rb(box, 0.06, 0.16, 0.24, 0.58);  
    const center = rb(box, 0.39, 0.28, 0.18, 0.30);  
    const right = rb(box, 0.68, 0.12, 0.26, 0.62);  
    [  
      ["input-panel", left, "#F7FAFF", "#6CA6D8"],  
      ["intent-core", center, "#FFF9F1", "#E49C4D"],  
      ["prototype-panel", right, "#F8FFF8", "#67AE72"]  
    ].forEach(([key, node, fill, stroke], index) => {  
      shapes.push(denseComplexShape(image, `prototype-${key}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle(fill, stroke), { theme: "prototype-validation", nodeIndex: index }));  
    });  
    shapes.push(denseComplexConnector(image, "prototype-left-link", { x: left.x + left.w, y: left.y + left.h * 0.5, w: center.x - left.x - left.w, h: center.y + center.h * 0.5 - left.y - left.h * 0.5 }, "#D09042", { theme: "prototype-validation" }));  
    shapes.push(denseComplexConnector(image, "prototype-right-link", { x: center.x + center.w, y: center.y + center.h * 0.5, w: right.x - center.x - center.w, h: right.y + right.h * 0.5 - center.y - center.h * 0.5 }, "#6BAA76", { theme: "prototype-validation" }));  
    [0.24, 0.42, 0.60].forEach((ratio, index) => shapes.push(denseComplexShape(image, `prototype-ui-line-${index}`, "dense-complex-diagram-native-scaffold-line", "line", {  
      x: right.x + right.w * 0.15,  
      y: right.y + right.h * ratio,  
      w: right.w * (index === 1 ? 0.54 : 0.68),  
      h: 0  
    }, { stroke: "#8EC69A", strokeWidthPt: 2, connectorType: "straight", opacity: 0.76 }, { theme: "prototype-validation", lineIndex: index })));  
    return shapes;  
  }  
    
  function denseComplexAssetLandingShapes(image, box) {  
    const shapes = [];  
    const hub = rb(box, 0.40, 0.28, 0.20, 0.28);  
    shapes.push(denseComplexShape(image, "asset-hub", "dense-complex-diagram-native-scaffold-core", "ellipse", hub, { fill: "#2F91D1", stroke: "#1D74A9", strokeWidthPt: 1.1, opacity: 0.84 }, { theme: "asset-landing" }));  
    const cards = [[0.08, 0.10], [0.68, 0.10], [0.08, 0.66], [0.68, 0.66]];  
    cards.forEach(([x, y], index) => {  
      const card = rb(box, x, y, 0.23, 0.20);  
      shapes.push(denseComplexShape(image, `asset-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle("#F8FBFF", "#78A9CF"), { theme: "asset-landing", cardIndex: index }));  
      shapes.push(denseComplexConnector(image, `asset-link-${index}`, {  
        x: round(hub.x + hub.w / 2),  
        y: round(hub.y + hub.h / 2),  
        w: round(card.x + card.w / 2 - (hub.x + hub.w / 2)),  
        h: round(card.y + card.h / 2 - (hub.y + hub.h / 2))  
      }, "#6A9FC6", { theme: "asset-landing", cardIndex: index }));  
    });  
    return shapes;  
  }  
    
  function denseComplexSystemVisionShapes(image, box) {  
    const shapes = [];  
    const platform = rb(box, 0.18, 0.26, 0.64, 0.34);  
    shapes.push(denseComplexShape(image, "system-platform", "dense-complex-diagram-native-scaffold-core", "roundRect", platform, denseComplexCardStyle("#F7FBFF", "#4D92C9"), { theme: "system-vision" }));  
    for (let index = 0; index < 3; index += 1) {  
      shapes.push(denseComplexShape(image, `system-layer-${index}`, "dense-complex-diagram-native-scaffold-layer", "roundRect", rb(platform, 0.08, 0.16 + index * 0.24, 0.84, 0.13), {  
        fill: index === 1 ? "#EAF6FF" : "#FFFFFF",  
        stroke: "#A8C7DE",  
        strokeWidthPt: 0.8,  
        radiusRatio: 0.06,  
        opacity: 0.82  
      }, { theme: "system-vision", layerIndex: index }));  
    }  
    const nodes = [[0.04, 0.08], [0.76, 0.08], [0.04, 0.70], [0.76, 0.70]];  
    nodes.forEach(([x, y], index) => {  
      const node = rb(box, x, y, 0.18, 0.16);  
      shapes.push(denseComplexShape(image, `system-node-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle("#F9FFF7", "#78B67D"), { theme: "system-vision", nodeIndex: index }));  
      shapes.push(denseComplexConnector(image, `system-link-${index}`, {  
        x: round(node.x + node.w / 2),  
        y: round(node.y + node.h / 2),  
        w: round(platform.x + platform.w / 2 - (node.x + node.w / 2)),  
        h: round(platform.y + platform.h / 2 - (node.y + node.h / 2))  
      }, "#6AA773", { theme: "system-vision", nodeIndex: index }));  
    });  
    return shapes;  
  }  
    
  function denseComplexGenericShapes(image, box) {  
    const shapes = [];  
    const cardCount = 5;  
    for (let index = 0; index < cardCount; index += 1) {  
      const card = rb(box, 0.07 + index * 0.18, 0.30 + (index % 2) * 0.12, 0.13, 0.22);  
      shapes.push(denseComplexShape(image, `generic-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle("#FAFCFF", "#8AAFD0"), { theme: "generic-complex", cardIndex: index }));  
      if (index > 0) {  
        const prev = rb(box, 0.07 + (index - 1) * 0.18, 0.30 + ((index - 1) % 2) * 0.12, 0.13, 0.22);  
        shapes.push(denseComplexConnector(image, `generic-link-${index - 1}`, {  
          x: prev.x + prev.w,  
          y: prev.y + prev.h * 0.5,  
          w: card.x - prev.x - prev.w,  
          h: card.y + card.h * 0.5 - prev.y - prev.h * 0.5  
        }, "#7AA7CC", { theme: "generic-complex", connectorIndex: index - 1 }));  
      }  
    }  
    return shapes;  
  }

  return {
    createDenseComplexDiagramScaffoldShapes,
    createDenseComplexDiagramScaffoldObjects,
    shouldObjectifyDenseComplexDiagramScaffold,
    inferDenseComplexDiagramTheme,
    inferDenseComplexDiagramScaffoldShapes,
    inferDenseComplexDiagramScaffoldTextBoxes,
    denseComplexScaffoldSource
  };
}

module.exports = {
  createDenseComplexScaffoldFactory
};
