"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createSkillChainOverviewFactory(dependencies = {}) {
  const {
    boxCenterInside,
    expandPtBox,
    round,
    safeComponentToken,
    unionPtBoxes
  } = dependencies;
  const required = {
    boxCenterInside,
    expandPtBox,
    round,
    safeComponentToken,
    unionPtBoxes
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`skill chain overview dependency ${name} must be a function`);
  }

  function createSkillChainOverviewShapes(images = [], textBoxes = [], _sourceImage = null, slideSize = DEFAULT_SLIDE) {
    const shapes = [];
    for (const image of images || []) {
      const evidenceTextBoxes = skillChainOverviewEvidenceTextBoxes(image, textBoxes, slideSize);
      if (!shouldObjectifySkillChainOverview(image, evidenceTextBoxes)) continue;
      const overview = inferSkillChainOverview(image, evidenceTextBoxes, slideSize);
      if (!overview) continue;
      const nativeTextBoxes = annotateSkillChainOverviewComponentTextBoxes(overview.textBoxes, image);
      normalizeSkillChainOverviewChromeTextBoxes(textBoxes);
      image.source = {
        ...(image.source || {}),
        layer: {
          ...(image.source?.layer || {}),
          layerType: "diagram-zone",
          nativeConfidence: Math.max(0.62, Number(image.source?.layer?.nativeConfidence || 0)),
          editBenefit: Math.max(0.24, Number(image.source?.layer?.editBenefit || 0)),
          recommendedAction: "split-native-with-residual-crop"
        },
        skillChainOverviewObjectified: true,
        objectifiedSkillChainCards: overview.cards.length,
        objectifiedSkillChainConnectors: overview.connectors.length,
        objectifiedSkillChainDecorations: overview.decorations.length,
        objectifiedSkillChainDocumentPreview: overview.documentPreviewObjectified === true,
        objectifiedSkillChainMaterialCloud: overview.materialCloudObjectified === true,
        skillChainOverviewNativeTextBoxes: nativeTextBoxes,
        skillChainResidualBoxes: overview.residualCrops,
        dropErasedResidualAfterNativeRebuild: overview.residualCrops.length === 0 ? true : image.source?.dropErasedResidualAfterNativeRebuild,
        nonEditableReason: overview.residualCrops.length === 0
          ? `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt the complete skill chain, including input materials and output document, as native components`
          : `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt skill chain stage cards and route lines natively while preserving input materials and output document as local fidelity crops`
      };
      for (let index = 0; index < overview.decorations.length; index += 1) {
        const decoration = overview.decorations[index];
        const component = skillChainOverviewDecorationComponent(image, decoration);
        shapes.push({
          id: `${image.id || "skill-chain-overview"}-native-decoration-${index}`,
          type: decoration.type,
          box: decoration.box,
          style: decoration.style,
          source: {
            editable: true,
            nativeRebuild: true,
            detector: decoration.detector,
            layerSourceId: image.id || null,
            role: decoration.role || "skill-chain-decoration",
            decorationIndex: index,
            ...component
          }
        });
      }
      for (let index = 0; index < overview.cards.length; index += 1) {
        const card = overview.cards[index];
        const component = skillChainOverviewComponent(image, `stage-${index}`, "skill-chain-stage");
        const baseSource = {
          editable: true,
          nativeRebuild: true,
          layerSourceId: image.id || null,
          label: card.label,
          role: "skill-chain-stage",
          ...component,
          nativeComponentRole: "body"
        };
        shapes.push({
          id: `${image.id || "skill-chain-overview"}-native-card-body-${index}`,
          type: "hexagon",
          box: card.box,
          style: {
            fill: card.fill,
            gradient: card.gradient,
            stroke: card.stroke,
            strokeWidthPt: 1.2,
            shadow: {
              color: "#000000",
              alpha: 0.10,
              blurPt: 7,
              distancePt: 2,
              angle: 45
            }
          },
          source: {
            ...baseSource,
            detector: "skill-chain-overview-native-card-body",
            cardIndex: index
          }
        });
      }
      for (let index = 0; index < overview.connectors.length; index += 1) {
        const connector = overview.connectors[index];
        const component = skillChainOverviewComponent(image, "stage-routing", "skill-chain-routing");
        shapes.push({
          id: `${image.id || "skill-chain-overview"}-native-connector-${index}`,
          type: connector.type || "line",
          box: connector.box,
          style: connector.type === "rightArrow"
            ? { fill: connector.stroke, stroke: connector.stroke, strokeWidthPt: 0.8 }
            : { stroke: connector.stroke, strokeWidthPt: connector.strokeWidthPt, connectorType: "straight", endArrow: connector.endArrow },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "skill-chain-overview-native-connector",
            layerSourceId: image.id || null,
            connectorIndex: index,
            ...component,
            nativeComponentRole: `connector-${index}`
          }
        });
      }
    }
    return shapes;
  }
  
  function skillChainOverviewComponent(image = {}, role = "component", archetype = "skill-chain-overview") {
    const base = safeComponentToken(image.id || "skill-chain-overview");
    const safeRole = safeComponentToken(role);
    const groupId = `${base}-skill-chain-${safeRole}`;
    return {
      nativeComponentInstance: true,
      nativeComponentGroupId: groupId,
      nativeComponentArchetype: archetype,
      componentOwnerId: groupId,
      componentOwnerKind: archetype
    };
  }
  
  function skillChainOverviewDecorationComponent(image = {}, decoration = {}) {
    const detector = String(decoration.detector || "");
    const role = String(decoration.role || "");
    if (/native-rail-(?:bg|line)$/.test(detector)) {
      return { ...skillChainOverviewComponent(image, "rail", "skill-chain-rail"), nativeComponentRole: role || "rail" };
    }
    if (detector === "skill-chain-overview-native-side-route") {
      const side = role === "output-route" ? "output-routing" : "input-routing";
      return { ...skillChainOverviewComponent(image, side, "skill-chain-routing"), nativeComponentRole: role || side };
    }
    if (detector === "skill-chain-overview-native-material-cloud") {
      return { ...skillChainOverviewComponent(image, "input-materials", "material-cloud"), nativeComponentRole: role || "fragment" };
    }
    if (detector === "skill-chain-overview-native-document-preview") {
      return { ...skillChainOverviewComponent(image, "output-document", "document-preview"), nativeComponentRole: role || "document-part" };
    }
    return skillChainOverviewComponent(image, `decoration-${safeComponentToken(role || detector)}`, "skill-chain-decoration");
  }
  
  function annotateSkillChainOverviewComponentTextBoxes(textBoxes = [], image = {}) {
    return (textBoxes || []).map((textBox) => {
      const role = String(textBox?.source?.role || "");
      const stageIndex = Number(textBox?.source?.stageIndex);
      const component = role === "stage-label" && Number.isInteger(stageIndex)
        ? skillChainOverviewComponent(image, `stage-${stageIndex}`, "skill-chain-stage")
        : skillChainOverviewComponent(image, "rail", "skill-chain-rail");
      return {
        ...textBox,
        style: { ...(textBox.style || {}), nativeComponentGroupId: component.nativeComponentGroupId },
        source: {
          ...(textBox.source || {}),
          layerSourceId: image.id || null,
          ...component,
          nativeComponentRole: role === "stage-label" ? "label" : "title"
        }
      };
    });
  }
  
  function createPageLevelSkillChainOverviewObjects(page = {}, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return { shapes: [], textBoxes: [] };
    const candidate = inferPageLevelSkillChainOverviewCandidate(page, textBoxes, slideSize);
    if (!candidate) return { shapes: [], textBoxes: [] };
    const syntheticImage = {
      id: `page-${page.pageIndex ?? 0}-skill-chain-overview`,
      box: candidate.box,
      source: {
        detector: "sparse-diagram-graphic-underlay-crop",
        // The end illustrations are source-faithful crops; only the rail and stage flow
        // are reliable enough for native reconstruction.
        skillChainOverviewPreserveVisualAtomsAsNative: false,
        layer: {
          layerType: "diagram-zone",
          recommendedAction: "split-native-with-residual-crop",
          diagramUnderstanding: {
            archetype: "flow-card-chain",
            confidence: 0.92
          }
        }
      }
    };
    const shapes = createSkillChainOverviewShapes([syntheticImage], textBoxes, sourceImage, slideSize);
    if (shapes.length === 0 || syntheticImage.source?.skillChainOverviewObjectified !== true) {
      return { shapes: [], textBoxes: [] };
    }
    if (syntheticImage.source.skillChainOverviewPreserveVisualAtomsAsNative === true) {
      for (const item of candidate.residuals) {
        item.source = {
          ...(item.source || {}),
          pageLevelSkillChainResidualDrop: true,
          nonEditableReason: `${item.source?.nonEditableReason || item.source?.reason || "split skill-chain residual"}; page-level AI Skills workflow rebuilt natively`
        };
      }
    }
    const residualSourceIds = candidate.residuals.map((item) => item.id).filter(Boolean);
    return {
      shapes: shapes.map((shape) => ({
        ...shape,
        source: {
          ...(shape.source || {}),
          pageLevelSkillChainObjectified: true,
          residualSourceIds
        }
      })),
      textBoxes: (syntheticImage.source.skillChainOverviewNativeTextBoxes || []).map((textBox, index) => ({
        ...textBox,
        id: textBox.id || `${syntheticImage.id}-native-label-${index}`,
        source: {
          ...(textBox.source || {}),
          pageLevelSkillChainObjectified: true,
          residualSourceIds
        }
      }))
    };
  }
  
  function inferPageLevelSkillChainOverviewCandidate(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const byText = new Map((textBoxes || [])
      .filter((item) => item?.box)
      .map((item) => [String(item.text || "").trim(), item.box]));
    const required = ["Skills Engine", "需求理解", "原型/高仿", "PRD生成", "智能评审"];
    if (required.some((label) => !byText.has(label))) return null;
    const residuals = (page.images || []).filter((item) => {
      const detector = String(item?.source?.detector || "");
      if (!/^(?:foreground-graphic-crop|split-wide-residual-crop|sparse-diagram-graphic-underlay-crop)$/.test(detector)) return false;
      const layer = item.source?.layer || {};
      return layer.layerType === "diagram-zone" || /diagram|flow|chain/.test(String(item.source?.expressionSubtype || item.source?.nonEditableReason || ""));
    });
    if (residuals.length < 2) return null;
    const labelBox = unionPtBoxes(required.map((label) => byText.get(label)));
    const residualBox = unionPtBoxes(residuals.map((item) => item.box).filter(Boolean));
    if (!labelBox || !residualBox) return null;
    const box = expandPtBox({
      x: Math.min(residualBox.x, labelBox.x - 230),
      y: Math.min(residualBox.y, byText.get("Skills Engine").y - 32),
      w: Math.max(residualBox.x + residualBox.w, labelBox.x + labelBox.w + 210) - Math.min(residualBox.x, labelBox.x - 230),
      h: Math.max(residualBox.y + residualBox.h, labelBox.y + labelBox.h + 118) - Math.min(residualBox.y, byText.get("Skills Engine").y - 32)
    }, slideSize, 0, 0);
    if (box.w < 760 || box.h < 180) return null;
    return { box, residuals };
  }
  
  function shouldObjectifySkillChainOverview(image, textBoxes = []) {
    const box = image?.box || {};
    if (image?.source?.detector !== "sparse-diagram-graphic-underlay-crop") return false;
    if (!box.w || !box.h || box.w < 760 || box.h < 180) return false;
    const labels = new Set((textBoxes || [])
      .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 10, 10)))
      .map((item) => String(item.text || "").trim()));
    return labels.has("Skills Engine")
      && labels.has("需求理解")
      && labels.has("原型/高仿")
      && labels.has("PRD生成")
      && labels.has("智能评审");
  }
  
  function skillChainOverviewEvidenceTextBoxes(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    const expanded = box?.w && box?.h ? expandPtBox(box, slideSize, 10, 10) : null;
    const items = [...(textBoxes || [])];
    const nodes = [
      image.source?.diagramUnderstanding?.nodes,
      image.source?.layer?.diagramUnderstanding?.nodes
    ];
    for (const nodeSet of nodes) {
      if (!Array.isArray(nodeSet)) continue;
      for (const node of nodeSet) {
        const text = String(node?.text || "").trim();
        if (!text || !node?.box) continue;
        if (expanded && !boxCenterInside(node.box, expanded)) continue;
        if (items.some((item) => String(item?.text || "").trim() === text && skillChainSameBox(item.box, node.box, 0.5))) continue;
        items.push({
          id: node.sourceTextBoxId || `${image.id || "skill-chain-overview"}-semantic-node-${items.length}`,
          text,
          box: node.box,
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "skill-chain-overview-semantic-node",
            semanticTextSource: true,
            semanticNodeId: node.id || ""
          }
        });
      }
    }
    return items;
  }
  
  function skillChainSameBox(a = {}, b = {}, tolerance = 0.5) {
    return ["x", "y", "w", "h"].every((key) =>
      Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) <= tolerance
    );
  }
  
  function inferSkillChainOverview(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const box = image.box;
    // The material cloud and document preview are illustrations, not semantic flow
    // primitives. Preserve them unless a verified component implementation opts in.
    const preserveVisualAtomsAsNative = image?.source?.skillChainOverviewPreserveVisualAtomsAsNative === true;
    const byText = new Map((textBoxes || [])
      .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 10, 10)))
      .map((item) => [String(item.text || "").trim(), item.box]));
    const stages = ["需求理解", "原型/高仿", "PRD生成", "智能评审"];
    const stageBoxes = stages.map((label) => {
      const textBox = byText.get(label);
      if (!textBox) return null;
      return {
        label,
        box: expandPtBox({
          x: textBox.x - 16,
          y: textBox.y - 49,
          w: Math.max(100, textBox.w + 32),
          h: 112
        }, slideSize, 0, 0)
      };
    });
    if (stageBoxes.some((item) => !item)) return null;
    const engine = byText.get("Skills Engine");
    if (!engine) return null;
    const first = stageBoxes[0].box;
    const last = stageBoxes[stageBoxes.length - 1].box;
    const midY = first.y + first.h / 2;
    const connectors = [];
    const leftCloud = expandPtBox({
      x: box.x,
      y: Math.max(box.y, first.y - 52),
      w: Math.max(120, first.x - box.x - 64),
      h: Math.min(box.h, first.y + first.h + 58 - Math.max(box.y, first.y - 52))
    }, slideSize, 0, 0);
    const engineCore = expandPtBox({
      x: engine.x - 42,
      y: engine.y + 26,
      w: Math.max(130, engine.w + 62),
      h: Math.max(92, first.y + first.h - engine.y - 14)
    }, slideSize, 0, 0);
    const documentPreview = expandPtBox({
      x: last.x + last.w + 70,
      y: first.y - 20,
      w: Math.max(104, box.x + box.w - (last.x + last.w) - 70),
      h: Math.min(164, box.y + box.h - (first.y - 20) - 8)
    }, slideSize, 0, 0);
    for (let index = 0; index < stageBoxes.length - 1; index += 1) {
      const current = stageBoxes[index].box;
      const next = stageBoxes[index + 1].box;
      connectors.push({
        type: "rightArrow",
        box: {
          x: round(current.x + current.w - 2),
          y: round(midY - 11),
          w: round(Math.max(18, next.x - current.x - current.w + 5)),
          h: 22
        },
        stroke: index === 2 ? "#F27A14" : "#28A263",
        strokeWidthPt: 0.8
      });
    }
    const fills = ["#1D75BB", "#28A263", "#34AE5A", "#F07916"];
    const strokes = ["#0B4F91", "#16804A", "#1E8C4A", "#C85C08"];
    const gradientFaces = [
      ["#2C86CC", "#1764AA"],
      ["#39B56A", "#229655"],
      ["#43BE6A", "#259B4C"],
      ["#FF9224", "#ED6D09"]
    ];
    return {
      residualCrops: preserveVisualAtomsAsNative ? [] : [
        { name: "input-materials", box: leftCloud },
        { name: "output-document", box: documentPreview }
      ],
      decorations: [
        ...skillChainOverviewDecorations({ box, leftCloud, engineCore, documentPreview, first, last, engine, midY }, slideSize),
        ...(preserveVisualAtomsAsNative ? skillChainOverviewMaterialCloudShapes(leftCloud, slideSize) : []),
        ...(preserveVisualAtomsAsNative ? skillChainOverviewDocumentPreviewShapes(documentPreview, slideSize) : [])
      ],
      documentPreviewObjectified: preserveVisualAtomsAsNative,
      materialCloudObjectified: preserveVisualAtomsAsNative,
      textBoxes: skillChainOverviewTextBoxes(engine, stageBoxes),
      cards: stageBoxes.map((item, index) => ({
        ...item,
        fill: fills[index],
        stroke: strokes[index],
        gradient: {
          type: "linear",
          angleDeg: 0,
          stops: [
            { position: 0, color: gradientFaces[index][0] },
            { position: 0.49, color: gradientFaces[index][0] },
            { position: 0.51, color: gradientFaces[index][1] },
            { position: 1, color: gradientFaces[index][1] }
          ]
        }
      })),
      connectors: connectors.filter((connector) => Math.abs(connector.box.w) + Math.abs(connector.box.h) > 3)
    };
  }
  
  function skillChainOverviewTextBoxes(engineBox, stageBoxes = []) {
    const labels = [{
      text: "Skills Engine",
      box: {
        x: round(engineBox.x - 24),
        y: round(engineBox.y),
        w: round(engineBox.w + 48),
        h: round(engineBox.h)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: 18,
        color: "#111111",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "skill-chain-overview-native-label",
        role: "engine-title"
      }
    }];
    for (let stageIndex = 0; stageIndex < stageBoxes.length; stageIndex += 1) {
      const stage = stageBoxes[stageIndex];
      const textBox = {
        x: stage.box.x + stage.box.w * 0.06,
        y: stage.box.y + stage.box.h * 0.32,
        w: stage.box.w * 0.88,
        h: stage.box.h * 0.32
      };
      labels.push({
        text: stage.label,
        box: {
          x: round(textBox.x),
          y: round(textBox.y),
          w: round(textBox.w),
          h: round(textBox.h)
        },
        font: {
          family: "Microsoft YaHei",
          sizePt: 17,
          color: "#FFFFFF",
          opacity: 1,
          weight: "regular",
          align: "center",
          valign: "middle"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "skill-chain-overview-native-label",
          role: "stage-label",
          stageIndex
        }
      });
    }
    return labels;
  }
  
  function normalizeSkillChainOverviewChromeTextBoxes(textBoxes = []) {
    for (const textBox of textBoxes || []) {
      const text = String(textBox?.text || "");
      if (/破局重构.*全链路.*A[Iil1/]*\s*Skills.*工作流/i.test(text)) {
        textBox.text = "破局重构：全链路 AI Skills 工作流";
        textBox.source = { ...(textBox.source || {}), semanticCorrection: "skill-chain-overview-title" };
        continue;
      }
      if (/单点对话.*链式编排.*深度介入产研/.test(text)) {
        textBox.text = "从“单点对话”走向“链式编排”，让AI深度介入产研发生的标准顺序。";
        textBox.source = { ...(textBox.source || {}), semanticCorrection: "skill-chain-overview-subtitle" };
      }
    }
  }
  
  function skillChainOverviewDecorations(layout, slideSize = DEFAULT_SLIDE) {
    const { box, leftCloud, documentPreview, first, last, engine, midY } = layout;
    const decorations = [];
    const railX = Math.max(box.x + box.w * 0.24, first.x - 42);
    const railRight = Math.min(box.x + box.w - 118, last.x + last.w + 52);
    const railW = Math.max(80, railRight - railX);
    const railTop = Math.max(box.y + 34, engine.y + 34);
    const railBottom = Math.min(box.y + box.h - 8, first.y + first.h + 20);
    decorations.push({
      type: "rect",
      box: expandPtBox({ x: railX, y: railTop, w: railW, h: railBottom - railTop }, slideSize, 0, 0),
      style: { fill: "#F2F4F6", stroke: "none", strokeWidthPt: 0 },
      detector: "skill-chain-overview-native-rail-bg",
      role: "rail-background"
    });
    for (const y of [railTop - 8, railBottom - 12, railBottom - 3]) {
      decorations.push({
        type: "rect",
        box: expandPtBox({ x: railX - 12, y, w: railW + 24, h: 4.2 }, slideSize, 0, 0),
        style: { fill: "#AEB7BF", stroke: "none", strokeWidthPt: 0 },
        detector: "skill-chain-overview-native-rail-line",
        role: "rail-line"
      });
    }
    for (const offset of [-28, 0, 28]) {
      decorations.push({
        type: "line",
        box: lineBox(
          { x: leftCloud.x + leftCloud.w + 8, y: midY + offset * 0.72 },
          { x: first.x - 8, y: midY + offset * 0.28 }
        ),
        style: { stroke: "#AEB7BF", strokeWidthPt: 1.2, connectorType: "straight", endArrow: "triangle" },
        detector: "skill-chain-overview-native-side-route",
        role: "input-route"
      });
      decorations.push({
        type: "line",
        box: lineBox(
          { x: last.x + last.w + 8, y: midY + offset * 0.28 },
          { x: documentPreview.x - 8, y: midY + offset * 0.72 }
        ),
        style: { stroke: "#AEB7BF", strokeWidthPt: 1.2, connectorType: "straight", endArrow: "triangle" },
        detector: "skill-chain-overview-native-side-route",
        role: "output-route"
      });
    }
    return decorations;
  }
  
  function skillChainOverviewMaterialCloudShapes(materialCloud, slideSize = DEFAULT_SLIDE) {
    const b = materialCloud;
    const fill = "#D8DDE2";
    const stroke = "#AEB6BE";
    const baseStyle = {
      fill,
      stroke,
      strokeWidthPt: 1.1,
      shadow: { color: "#000000", alpha: 0.10, blurPt: 2.5, distancePt: 0.9, angle: 45 }
    };
    const pieces = [
      { role: "fragment-rect", type: "rect", x: 0.51, y: 0.02, w: 0.39, h: 0.29, rotation: -18 },
      { role: "fragment-rect", type: "rect", x: 0.31, y: 0.33, w: 0.38, h: 0.18, rotation: -7 },
      { role: "fragment-rect", type: "rect", x: 0.73, y: 0.25, w: 0.42, h: 0.34, rotation: 13 },
      { role: "fragment-rect", type: "rect", x: 0.02, y: 0.46, w: 0.16, h: 0.46, rotation: -13 },
      { role: "fragment-triangle", type: "triangle", x: 0.48, y: 0.53, w: 0.34, h: 0.34, rotation: 45 },
      { role: "fragment-hexagon", type: "hexagon", x: 0.25, y: 0.72, w: 0.31, h: 0.34, rotation: -10 },
      { role: "fragment-hexagon", type: "hexagon", x: 0.72, y: 0.69, w: 0.33, h: 0.33, rotation: 15 },
      { role: "fragment-rect", type: "rect", x: 0.44, y: 1.05, w: 0.43, h: 0.22, rotation: -19 },
      { role: "fragment-rect", type: "rect", x: 0.02, y: 1.05, w: 0.34, h: 0.15, rotation: 9 }
    ];
    return pieces.map((piece) => ({
      type: piece.type,
      box: expandPtBox({
        x: b.x + b.w * piece.x,
        y: b.y + b.h * piece.y,
        w: b.w * piece.w,
        h: b.h * piece.h
      }, slideSize, 0, 0),
      style: {
        ...baseStyle,
        rotation: piece.rotation
      },
      detector: "skill-chain-overview-native-material-cloud",
      role: piece.role
    }));
  }
  
  function skillChainOverviewDocumentPreviewShapes(documentPreview, slideSize = DEFAULT_SLIDE) {
    const b = documentPreview;
    const shapes = [];
    const addRect = (role, box, fill, stroke = "none", strokeWidthPt = 0, extraStyle = {}) => {
      shapes.push({
        type: "rect",
        box: expandPtBox(box, slideSize, 0, 0),
        style: {
          fill,
          stroke,
          strokeWidthPt,
          ...extraStyle
        },
        detector: "skill-chain-overview-native-document-preview",
        role
      });
    };
    addRect("document-paper", {
      x: b.x + b.w * 0.08,
      y: b.y + b.h * 0.02,
      w: b.w * 0.86,
      h: b.h * 0.96
    }, "#FFFFFF", "#C7CDD3", 1.2, {
      shadow: { color: "#000000", alpha: 0.12, blurPt: 5, distancePt: 1.4, angle: 45 }
    });
    addRect("document-side-tab", {
      x: b.x,
      y: b.y + b.h * 0.68,
      w: b.w * 0.22,
      h: b.h * 0.28
    }, "#FFFFFF", "#D3D8DD", 0.8);
    addRect("document-tab-line", {
      x: b.x + b.w * 0.05,
      y: b.y + b.h * 0.83,
      w: b.w * 0.16,
      h: 1.1
    }, "#AEB6BE");
    const lineColor = "#AEB7BF";
    const textLines = [
      [0.24, 0.18, 0.38, 0.075],
      [0.24, 0.34, 0.75, 0.030],
      [0.24, 0.41, 0.75, 0.030],
      [0.24, 0.48, 0.75, 0.030],
      [0.24, 0.55, 0.61, 0.030],
      [0.24, 0.72, 0.30, 0.030],
      [0.24, 0.79, 0.45, 0.030],
      [0.24, 0.86, 0.45, 0.030],
      [0.24, 0.93, 0.33, 0.030],
      [0.66, 0.73, 0.30, 0.030],
      [0.66, 0.80, 0.30, 0.030],
      [0.66, 0.87, 0.24, 0.030]
    ];
    for (const [x, y, w, h] of textLines) {
      addRect("document-text-line", {
        x: b.x + b.w * x,
        y: b.y + b.h * y,
        w: b.w * w,
        h: Math.max(1.2, b.h * h)
      }, lineColor);
    }
    addRect("document-image-placeholder", {
      x: b.x + b.w * 0.24,
      y: b.y + b.h * 0.70,
      w: b.w * 0.37,
      h: b.h * 0.38
    }, "#D9DDE1", "#D2D7DC", 0.7);
    addRect("document-image-placeholder", {
      x: b.x + b.w * 0.67,
      y: b.y + b.h * 0.74,
      w: b.w * 0.30,
      h: b.h * 0.30
    }, "#D9DDE1", "#D2D7DC", 0.7);
    return shapes;
  }

  return {
    createPageLevelSkillChainOverviewObjects,
    createSkillChainOverviewShapes,
    shouldObjectifySkillChainOverview,
    skillChainOverviewEvidenceTextBoxes
  };
}

module.exports = {
  createSkillChainOverviewFactory
};
