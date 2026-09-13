"use strict";

function createFunnelHubDiagramFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    constrainPtBox,
    lineBox,
    normalizeCjkText,
    round,
    shouldKeepFunnelHubDiagramText,
    safeComponentToken
  } = dependencies;

  function createFunnelHubDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage) return [];  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyFunnelHubDiagram(image, textBoxes)) continue;  
      const diagram = inferFunnelHubDiagram(image, slideSize);  
      const localShapes = funnelHubDiagramShapes(image, diagram);  
      if (localShapes.length === 0) continue;  
      image.source = {  
        ...(image.source || {}),  
        funnelHubObjectified: true,  
        objectifiedFunnelHubShapes: localShapes.length,  
        funnelHubResidualBoxes: diagram.residualCrops,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; funnel hub diagram rebuilt as native shapes with local icon crops`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function shouldObjectifyFunnelHubDiagram(image, textBoxes = []) {  
    if (!shouldKeepFunnelHubDiagramText(image)) return false;  
    const box = image?.box || {};  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    if (Number(box.w || 0) < 480 || Number(box.h || 0) < 280) return false;  
    const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;  
    const understoodNodeCount = Number(understanding.nodeCount || 0);  
    return understoodNodeCount >= 10 && internalTextCount >= 6;  
  }  
    
  function inferFunnelHubDiagram(image, slideSize = DEFAULT_SLIDE) {  
    const box = image.box;  
    const cx = box.x + box.w * 0.5;  
    const bowl = {  
      x: box.x + box.w * 0.26,  
      y: box.y + box.h * 0.16,  
      w: box.w * 0.48,  
      h: box.h * 0.42  
    };  
    const body = {  
      x: box.x + box.w * 0.28,  
      y: box.y + box.h * 0.30,  
      w: box.w * 0.44,  
      h: box.h * 0.46  
    };  
    const lower = {  
      x: box.x + box.w * 0.42,  
      y: box.y + box.h * 0.61,  
      w: box.w * 0.16,  
      h: box.h * 0.21  
    };  
    const neck = {  
      x: box.x + box.w * 0.445,  
      y: box.y + box.h * 0.74,  
      w: box.w * 0.11,  
      h: box.h * 0.13  
    };  
    const bottomPanel = {  
      x: box.x + box.w * 0.0,  
      y: box.y + box.h * 0.84,  
      w: box.w,  
      h: box.h * 0.14  
    };  
    const pills = [  
      { name: "left", box: { x: box.x + box.w * 0.20, y: box.y + box.h * 0.43, w: box.w * 0.19, h: box.h * 0.08 }, fill: "#2E79B9" },  
      { name: "center", box: { x: box.x + box.w * 0.43, y: box.y + box.h * 0.48, w: box.w * 0.18, h: box.h * 0.08 }, fill: "#41B878" },  
      { name: "right", box: { x: box.x + box.w * 0.69, y: box.y + box.h * 0.43, w: box.w * 0.22, h: box.h * 0.08 }, fill: "#2E79B9" }  
    ];  
    const connectors = [  
      lineBox({ x: cx, y: body.y + body.h * 0.48 }, { x: cx, y: lower.y + lower.h * 0.90 }),  
      lineBox({ x: cx, y: lower.y + lower.h * 0.90 }, { x: box.x + box.w * 0.28, y: box.y + box.h * 0.76 }),  
      lineBox({ x: cx, y: lower.y + lower.h * 0.90 }, { x: box.x + box.w * 0.77, y: box.y + box.h * 0.76 }),  
      lineBox({ x: body.x + body.w * 0.18, y: body.y + body.h * 0.45 }, { x: pills[0].box.x + pills[0].box.w, y: pills[0].box.y + pills[0].box.h * 0.5 }),  
      lineBox({ x: body.x + body.w * 0.82, y: body.y + body.h * 0.45 }, { x: pills[2].box.x, y: pills[2].box.y + pills[2].box.h * 0.5 })  
    ];  
    return {  
      bowl: constrainPtBox(bowl, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),  
      body: constrainPtBox(body, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),  
      lower: constrainPtBox(lower, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),  
      neck: constrainPtBox(neck, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),  
      bottomPanel: constrainPtBox(bottomPanel, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),  
      pills: pills.map((pill) => ({ ...pill, box: constrainPtBox(pill.box, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) })),  
      connectors,  
      residualCrops: [  
        { name: "input-docs-html", box: constrainPtBox({ x: box.x + box.w * 0.11, y: box.y + box.h * 0.02, w: box.w * 0.32, h: box.h * 0.29 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },  
        { name: "input-screenshots", box: constrainPtBox({ x: box.x + box.w * 0.42, y: box.y + box.h * 0.01, w: box.w * 0.26, h: box.h * 0.30 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },  
        { name: "input-mock-data", box: constrainPtBox({ x: box.x + box.w * 0.63, y: box.y + box.h * 0.05, w: box.w * 0.31, h: box.h * 0.25 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },  
        { name: "left-output-icon", box: constrainPtBox({ x: box.x + box.w * 0.22, y: box.y + box.h * 0.61, w: box.w * 0.18, h: box.h * 0.23 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },  
        { name: "right-output-icon", box: constrainPtBox({ x: box.x + box.w * 0.68, y: box.y + box.h * 0.61, w: box.w * 0.20, h: box.h * 0.23 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) }  
      ]  
    };  
  }  
    
  function funnelHubDiagramShapes(image, diagram) {  
    const base = image.id || "funnel-hub";  
    const shapes = [];  
    shapes.push({  
      id: `${base}-funnel-bowl`,  
      type: "freeform",  
      box: diagram.bowl,  
      points: [  
        { x: 0.02, y: 0.1 },  
        { x: 0.98, y: 0.1 },  
        { x: 0.78, y: 1 },  
        { x: 0.22, y: 1 }  
      ],  
      style: {  
        fill: "#2E7EC4",  
        stroke: "#1E5E96",  
        strokeWidthPt: 0.7,  
        shadow: { color: "#000000", alpha: 0.12, blurPt: 5, distancePt: 1.2, angleDeg: 90 }  
      },  
      source: funnelHubShapeSource(image, "funnel-hub-native-bowl")  
    });  
    shapes.push({  
      id: `${base}-funnel-body`,  
      type: "freeform",  
      box: diagram.body,  
      points: [  
        { x: 0, y: 0 },  
        { x: 1, y: 0 },  
        { x: 0.64, y: 1 },  
        { x: 0.36, y: 1 }  
      ],  
      style: {  
        fill: "#2370B8",  
        stroke: "#1C5D96",  
        strokeWidthPt: 0.5,  
        shadow: { color: "#000000", alpha: 0.08, blurPt: 4, distancePt: 1, angleDeg: 90 }  
      },  
      source: funnelHubShapeSource(image, "funnel-hub-native-body")  
    });  
    shapes.push({  
      id: `${base}-funnel-lower`,  
      type: "freeform",  
      box: diagram.lower,  
      points: [  
        { x: 0, y: 0 },  
        { x: 1, y: 0 },  
        { x: 0.66, y: 1 },  
        { x: 0.34, y: 1 }  
      ],  
      style: {  
        fill: "#33B873",  
        stroke: "#279A60",  
        strokeWidthPt: 0.5  
      },  
      source: funnelHubShapeSource(image, "funnel-hub-native-body")  
    });  
    shapes.push({  
      id: `${base}-funnel-neck`,  
      type: "roundRect",  
      box: diagram.neck,  
      style: {  
        fill: "#2FAC73",  
        stroke: "#238A5B",  
        strokeWidthPt: 0.5,  
        radiusRatio: 0.25  
      },  
      source: funnelHubShapeSource(image, "funnel-hub-native-neck")  
    });  
    for (let index = 0; index < diagram.pills.length; index += 1) {  
      const pill = diagram.pills[index];  
      shapes.push({  
        id: `${base}-pill-${pill.name}`,  
        type: "roundRect",  
        box: pill.box,  
        style: {  
          fill: pill.fill,  
          stroke: "#1F5F96",  
          strokeWidthPt: 0.8,  
          radiusRatio: 0.08,  
          shadow: { color: "#000000", alpha: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }  
        },  
        source: {  
          ...funnelHubShapeSource(image, "funnel-hub-native-pill"),  
          pill: pill.name,  
          stepIndex: index  
        }  
      });  
    }  
    shapes.push({  
      id: `${base}-bottom-panel`,  
      type: "roundRect",  
      box: diagram.bottomPanel,  
      style: {  
        fill: "#E8F7F1",  
        stroke: "#35B777",  
        strokeWidthPt: 1.4,  
        radiusRatio: 0.12,  
        shadow: { color: "#2D8BC0", alpha: 0.14, blurPt: 7, distancePt: 1.5, angleDeg: 90 }  
      },  
      source: funnelHubShapeSource(image, "funnel-hub-native-bottom-panel")  
    });  
    for (let index = 0; index < diagram.connectors.length; index += 1) {  
      shapes.push({  
        id: `${base}-connector-${index}`,  
        type: "line",  
        box: diagram.connectors[index],  
        style: {  
          stroke: index < 3 ? "#FFFFFF" : "#D7F2FF",  
          strokeWidthPt: index < 3 ? 2 : 1.4,  
          connectorType: "straight",  
          endArrow: "triangle"  
        },  
        source: {  
          ...funnelHubShapeSource(image, "funnel-hub-native-connector"),  
          connectorIndex: index  
        }  
      });  
    }  
    return shapes;  
  }  
    
  function funnelHubShapeSource(image, detector) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone"  
    };  
  }

  return {
    createFunnelHubDiagramShapes,
    shouldObjectifyFunnelHubDiagram,
    inferFunnelHubDiagram,
    funnelHubDiagramShapes,
    funnelHubShapeSource
  };
}

module.exports = {
  createFunnelHubDiagramFactory
};
