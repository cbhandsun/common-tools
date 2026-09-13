"use strict";

function createTraditionalCollaborationBreakdownFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxAreaValue,
    cropPng,
    ensureDir,
    normalizeCjkText,
    path,
    ptToPxBox,
    regularPolygonPoints,
    roundedBox,
    safeComponentToken,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createTraditionalCollaborationBreakdownObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/传统产研协作的系统性断点/.test(labels)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-crop");  
    if (sourceImages.length < 2) return { shapes: [], textBoxes: [] };  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        traditionalCollaborationBreakdownObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: "traditional collaboration breakdown rebuilt as native inputs, broken links, risk markers, dashboard, and explanatory text"  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.93,  
      expressionForm: "linear-relationship-diagram",  
      expressionSubtype: "traditional-collaboration-breakdown",  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const gray = "#8996A8";  
    const orange = "#FF6A00";  
    const inputs = [  
      { id: "requirement", text: "需求", box: { x: 112, y: 115, w: 126, h: 88 }, rotate: -8 },  
      { id: "prd", text: "PRD", box: { x: 246, y: 177, w: 126, h: 88 }, rotate: 6 },  
      { id: "prototype", text: "原型", box: { x: 90, y: 244, w: 126, h: 88 }, rotate: -8 },  
      { id: "review", text: "评审", box: { x: 244, y: 318, w: 126, h: 88 }, rotate: 7 }  
    ];  
    const fallbackMarkers = [  
      { x: 458, y: 151, w: 52, h: 52, symbol: "×" },  
      { x: 458, y: 232, w: 52, h: 52, symbol: "" },  
      { x: 458, y: 312, w: 52, h: 52, symbol: "×" },  
      { x: 458, y: 391, w: 52, h: 52, symbol: "×" }  
    ];  
    const detectedMarkerBoxes = detectTraditionalCollaborationMarkerBoxes(options.sourceImage, slideSize);  
    const markers = fallbackMarkers.map((marker, index) => ({ ...marker, ...(detectedMarkerBoxes[index] || {}) }));  
    const dashboard = { x: 718, y: 156, w: 165, h: 200 };  
    // Broken routes are simple editable connectors. Never turn them into crops  
    // merely because their source pixels are available; fidelity crops remain an  
    // explicit diagnostic fallback for experiments only.  
    const routeFidelityImages = options.allowRouteFidelity === true  
      ? materializeTraditionalCollaborationRouteFidelity(  
        options.sourceImage,  
        inputs,  
        markers,  
        dashboard,  
        slideSize,  
        options  
      )  
      : [];  
    const useRouteFidelity = routeFidelityImages.length > 0;  
    // Draw broken connectors first so nodes and markers remain readable above the routes.  
    if (!useRouteFidelity) inputs.forEach((input, index) => {  
      const y = input.box.y + input.box.h * 0.5;  
      const markerX = markers[index].x;  
      const markerCenterY = markers[index].y + markers[index].h * 0.5;  
      const routing = traditionalBreakdownComponent("routing", "broken-collaboration-routing");  
      const marker = traditionalBreakdownComponent(`breakpoint-${index}`, "collaboration-breakpoint");  
      add({ id: `traditional-collaboration-breakdown-native-link-left-${index}`, type: "line", box: { x: input.box.x + input.box.w, y, w: markerX - (input.box.x + input.box.w) - 30, h: markerCenterY - y }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-link", { index, segment: "left", ...routing, nativeComponentRole: `left-${index}` }) });  
      add({ id: `traditional-collaboration-breakdown-native-link-right-${index}`, type: "line", box: { x: markerX + markers[index].w, y: markerCenterY, w: dashboard.x - (markerX + markers[index].w), h: dashboard.y + 89 - markerCenterY }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-link", { index, segment: "right", ...routing, nativeComponentRole: `right-${index}` }) });  
      add({ id: `traditional-collaboration-breakdown-native-break-left-${index}`, type: "line", box: { x: markerX - 18, y: markers[index].y + markers[index].h * 0.2, w: 10, h: markers[index].h * 0.35 }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-break", { index, side: "left", ...marker, nativeComponentRole: "break-left" }) });  
      add({ id: `traditional-collaboration-breakdown-native-break-right-${index}`, type: "line", box: { x: markerX + markers[index].w + 6, y: markers[index].y + markers[index].h * 0.2, w: -10, h: markers[index].h * 0.35 }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-break", { index, side: "right", ...marker, nativeComponentRole: "break-right" }) });  
    });  
    inputs.forEach((input, index) => {  
      const component = traditionalBreakdownComponent(`input-${input.id}`, "collaboration-input-card");  
      add({ id: `traditional-collaboration-breakdown-native-input-${input.id}`, type: "rect", box: input.box, style: { fill: gray, stroke: gray, strokeWidthPt: 0, rotate: input.rotate, shadow: { color: "#5B6571", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("traditional-collaboration-breakdown-native-input", { index, role: input.id, ...component, nativeComponentRole: "card" }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-input-text-${input.id}`, input.text, { x: input.box.x + 22, y: input.box.y + 28, w: input.box.w - 44, h: 32 }, { sizePt: 22, color: "#FFFFFF", weight: "bold", align: "center", nativeComponentGroupId: component.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: input.id, ...component, nativeComponentRole: "label" })));  
    });  
    markers.forEach((marker, index) => {  
      const component = traditionalBreakdownComponent(`breakpoint-${index}`, "collaboration-breakpoint");  
      add({ id: `traditional-collaboration-breakdown-native-marker-${index}`, type: "ellipse", box: { x: marker.x, y: marker.y, w: marker.w, h: marker.h }, style: { fill: orange, stroke: orange, strokeWidthPt: 0 }, source: source("traditional-collaboration-breakdown-native-marker", { index, ...component, nativeComponentRole: "marker" }) });  
      if (index === 1) {  
        add({ id: "traditional-collaboration-breakdown-native-marker-octagon", type: "freeform", box: { x: marker.x + marker.w * 0.23, y: marker.y + marker.h * 0.23, w: marker.w * 0.54, h: marker.h * 0.54 }, points: regularPolygonPoints(8, Math.PI / 8), style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 3 }, source: source("traditional-collaboration-breakdown-native-marker-symbol", { index, symbol: "octagon", ...component, nativeComponentRole: "symbol" }) });  
      } else {  
        textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-marker-text-${index}`, marker.symbol, { x: marker.x + marker.w * 0.19, y: marker.y + marker.h * 0.13, w: marker.w * 0.62, h: marker.h * 0.74 }, { sizePt: Math.max(20, marker.h * 0.58), color: "#FFFFFF", weight: "bold", align: "center", nativeComponentGroupId: component.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "risk-marker", index, ...component, nativeComponentRole: "symbol" })));  
      }  
    });  
    const dashboardComponent = traditionalBreakdownComponent("dashboard", "delivery-dashboard");  
    add({ id: "traditional-collaboration-breakdown-native-dashboard", type: "roundRect", box: dashboard, style: { fill: "#EEF0F4", stroke: "#E1E4E8", strokeWidthPt: 1, radiusPt: 7 }, source: source("traditional-collaboration-breakdown-native-dashboard", { ...dashboardComponent, nativeComponentRole: "container" }) });  
    textBoxes.push(  
      temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-title", "传统产研协作的系统性断点", { x: 260, y: 37, w: 440, h: 42 }, { sizePt: 29, color: "#000000", weight: "bold", align: "center" }, source("traditional-collaboration-breakdown-native-text", { role: "title" })),  
      temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-dashboard-title", "交付看板", { x: dashboard.x + 22, y: dashboard.y + 25, w: dashboard.w - 44, h: 32 }, { sizePt: 22, color: "#99A0AA", weight: "bold", align: "center", nativeComponentGroupId: dashboardComponent.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "dashboard-title", ...dashboardComponent, nativeComponentRole: "title" })),  
      temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-dashboard-question", "?", { x: dashboard.x + 45, y: dashboard.y + 72, w: 75, h: 82 }, { sizePt: 62, color: "#B8BEC7", weight: "bold", align: "center", nativeComponentGroupId: dashboardComponent.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "dashboard-question", ...dashboardComponent, nativeComponentRole: "question" }))  
    );  
    const notes = [  
      ["文档分散：", "多工具并存导致极高的查找成本与信息差。"],  
      ["原型割裂：", "设计与文档脱节，缺乏统一的审阅入口。"],  
      ["版本漂移：", "资产难以沉淀，历史经验无法转化为组织级复用资产。"],  
      ["交付不稳：", "质量控制严重依赖个人经验，缺乏系统性标准。"]  
    ];  
    notes.forEach(([heading, body], index) => {  
      const x = 53 + index * 222;  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-note-${index}`, `• ${heading}${body}`, { x, y: 438, w: 192, h: 72 }, { sizePt: 14, color: "#111111", weight: "regular", align: "left" }, source("traditional-collaboration-breakdown-native-text", { role: "note", index })));  
    });  
    return { shapes, textBoxes, images: routeFidelityImages };  
  }  
    
  function createTraditionalCollaborationDetectedRouteShapes(sourceImage, inputs, markers, dashboard, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage || !Number(sourceImage.width) || !Number(sourceImage.height) || !sourceImage.rgba) return [];  
    const markerX = 458;  
    const leftEnd = markerX - 14;  
    const rightStart = markerX + 52;  
    const rightEnd = dashboard.x - 8;  
    const regions = inputs.flatMap((input, index) => {  
      const inputCenterY = input.box.y + input.box.h * 0.5;  
      const markerCenterY = markers[index].y + 26;  
      const inputRouteStart = input.box.x + input.box.w + (index % 2 === 1 ? 30 : 16);  
      return [  
        { id: `input-${index}`, index, segment: "left", box: routeFidelityRegion(inputRouteStart, inputCenterY, leftEnd, markerCenterY) },  
        { id: `output-${index}`, index, segment: "right", box: routeFidelityRegion(rightStart, markerCenterY, rightEnd, dashboard.y + dashboard.h * 0.445) }  
      ];  
    });  
    return regions.flatMap((region) => {  
      const fitted = fitTraditionalRouteSegment(sourceImage, region.box, slideSize);  
      if (!fitted) return [];  
      return [{  
        id: `traditional-collaboration-breakdown-detected-route-${region.id}`,  
        type: "line",  
        box: fitted,  
        style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" },  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "traditional-collaboration-breakdown-detected-native-link",  
          confidence: 0.9,  
          expressionForm: "linear-relationship-diagram",  
          expressionSubtype: "traditional-collaboration-breakdown",  
          routeSegment: region.id,  
          index: region.index,  
          segment: region.segment,  
          nativeComponentInstance: true,  
          nativeComponentGroupId: "traditional-collaboration-breakdown-routing",  
          nativeComponentArchetype: "broken-collaboration-routing",  
          nativeComponentRole: region.id,  
          componentOwnerId: "traditional-collaboration-breakdown-routing",  
          componentOwnerKind: "broken-collaboration-routing"  
        }  
      }];  
    });  
  }  
    
  function fitTraditionalRouteSegment(sourceImage, box, slideSize = DEFAULT_SLIDE) {  
    const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);  
    const cropped = cropPng(sourceImage, pxBox);  
    const component = strongestTraditionalRouteComponent(cropped);  
    if (!component || component.maxX - component.minX < 18) return null;  
    const edgeWidth = Math.max(2, Math.round((component.maxX - component.minX + 1) * 0.08));  
    const leftPoints = component.points.filter((point) => point.x <= component.minX + edgeWidth);  
    const rightPoints = component.points.filter((point) => point.x >= component.maxX - edgeWidth);  
    if (!leftPoints.length || !rightPoints.length) return null;  
    const meanY = (points) => points.reduce((sum, point) => sum + point.y, 0) / points.length;  
    const toPt = (x, y) => ({  
      x: (pxBox.x + x) * slideSize.widthPt / sourceImage.width,  
      y: (pxBox.y + y) * slideSize.heightPt / sourceImage.height  
    });  
    const start = toPt(component.minX, meanY(leftPoints));  
    const end = toPt(component.maxX, meanY(rightPoints));  
    return roundedBox({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });  
  }  
    
  function strongestTraditionalRouteComponent(image) {  
    const width = Number(image.width || 0);  
    const height = Number(image.height || 0);  
    if (!width || !height || !image.rgba) return null;  
    const pixels = width * height;  
    const eligible = new Uint8Array(pixels);  
    for (let index = 0; index < pixels; index += 1) {  
      const offset = index * 4;  
      const r = image.rgba[offset];  
      const g = image.rgba[offset + 1];  
      const b = image.rgba[offset + 2];  
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);  
      const lumaValue = (r + g + b) / 3;  
      if (lumaValue >= 105 && lumaValue <= 205 && chroma <= 28) eligible[index] = 1;  
    }  
    const visited = new Uint8Array(pixels);  
    let strongest = null;  
    for (let seed = 0; seed < pixels; seed += 1) {  
      if (!eligible[seed] || visited[seed]) continue;  
      const queue = [seed];  
      const points = [];  
      visited[seed] = 1;  
      let minX = width;  
      let maxX = 0;  
      let minY = height;  
      let maxY = 0;  
      for (let cursor = 0; cursor < queue.length; cursor += 1) {  
        const current = queue[cursor];  
        const x = current % width;  
        const y = Math.floor(current / width);  
        points.push({ x, y });  
        minX = Math.min(minX, x);  
        maxX = Math.max(maxX, x);  
        minY = Math.min(minY, y);  
        maxY = Math.max(maxY, y);  
        for (let dy = -1; dy <= 1; dy += 1) {  
          for (let dx = -1; dx <= 1; dx += 1) {  
            if (!dx && !dy) continue;  
            const nx = x + dx;  
            const ny = y + dy;  
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;  
            const neighbor = ny * width + nx;  
            if (!eligible[neighbor] || visited[neighbor]) continue;  
            visited[neighbor] = 1;  
            queue.push(neighbor);  
          }  
        }  
      }  
      const spanX = maxX - minX;  
      const spanY = maxY - minY;  
      if (points.length < 16 || spanX < 18 || spanX < spanY * 1.4) continue;  
      const candidate = { points, minX, maxX, minY, maxY, score: spanX * 3 + points.length };  
      if (!strongest || candidate.score > strongest.score) strongest = candidate;  
    }  
    return strongest;  
  }  
    
  function materializeTraditionalCollaborationRouteFidelity(sourceImage, inputs, markers, dashboard, slideSize, options = {}) {  
    if (!sourceImage || !options.assetDir || !options.irDir) return [];  
    if (!Number(sourceImage.width) || !Number(sourceImage.height) || !sourceImage.rgba) return [];  
    ensureDir(options.assetDir);  
    const rightEnd = dashboard.x - 8;  
    const routeRegions = inputs.flatMap((input, index) => {  
      const inputCenterY = input.box.y + input.box.h * 0.5;  
      const marker = markers[index];  
      const markerCenterY = marker.y + marker.h * 0.5;  
      const leftEnd = marker.x - 14;  
      const rightStart = marker.x + marker.w;  
      // The second and fourth source cards lean right farther than their native bounds.  
      // Leave a larger margin so their anti-aliased border cannot enter the line crop.  
      const inputRouteStart = input.box.x + input.box.w + (index % 2 === 1 ? 30 : 16);  
      return [  
        // Start beyond the rotated card edge. This keeps the route crop text-free and avoids  
        // inheriting a neutral-gray card border into the otherwise transparent line layer.  
        { id: `input-${index}`, box: routeFidelityRegion(inputRouteStart, inputCenterY, leftEnd, markerCenterY) },  
        { id: `output-${index}`, box: routeFidelityRegion(rightStart, markerCenterY, rightEnd, dashboard.y + dashboard.h * 0.445) }  
      ];  
    });  
    const deck = safeIdentifier(options.deckName || "deck", "deck");  
    const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");  
    return routeRegions.flatMap((region) => {  
      const pxBox = ptToPxBox(region.box, sourceImage, slideSize, 0);  
      const cropped = cropPng(sourceImage, pxBox);  
      const isolated = isolateTraditionalCollaborationRoutePixels(cropped);  
      if (countVisiblePixels(isolated) < 16) return [];  
      const file = path.join(options.assetDir, `${deck}-p${page}-traditional-collaboration-${region.id}-route.png`);  
      writePng(file, isolated);  
      return [{  
        id: `traditional-collaboration-breakdown-route-${region.id}`,  
        type: "fidelity-crop",  
        assetPath: path.relative(options.irDir, file).replace(/\\\\/g, "/"),  
        box: region.box,  
        source: {  
          editable: false,  
          nativeRebuild: true,  
          detector: "traditional-collaboration-breakdown-route-fidelity-crop",  
          expressionForm: "complex-diagram",  
          expressionSubtype: "broken-collaboration-route-layer",  
          strategy: "local-fidelity-crop",  
          recommendedAction: "keep-local-crop",  
          intentionalMinimumUnitCrop: true,  
          protectedMinimumUnit: true,  
          skipVisualAtomRebuild: true,  
          textFreeVisualLayer: true,  
          nonEditableReason: "source-faithful complex connector route retained as a text-free local visual layer",  
          nativeComponentGroupId: "traditional-collaboration-breakdown-routing",  
          nativeComponentArchetype: "broken-collaboration-routing",  
          nativeComponentRole: region.id,  
          nativeComponentPart: "route-fidelity"  
        }  
      }];  
    });  
  }  
    
  function detectTraditionalCollaborationMarkerBoxes(sourceImage, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage || !sourceImage.rgba || !Number(sourceImage.width) || !Number(sourceImage.height)) return [];  
    const width = sourceImage.width;  
    const height = sourceImage.height;  
    const pixelCount = width * height;  
    const isOrange = new Uint8Array(pixelCount);  
    for (let index = 0; index < pixelCount; index += 1) {  
      const offset = index * 4;  
      const r = sourceImage.rgba[offset];  
      const g = sourceImage.rgba[offset + 1];  
      const b = sourceImage.rgba[offset + 2];  
      if (r > 220 && g >= 55 && g <= 155 && b < 55) isOrange[index] = 1;  
    }  
    const visited = new Uint8Array(pixelCount);  
    const candidates = [];  
    for (let seed = 0; seed < pixelCount; seed += 1) {  
      if (!isOrange[seed] || visited[seed]) continue;  
      const queue = [seed];  
      visited[seed] = 1;  
      let minX = width;  
      let maxX = 0;  
      let minY = height;  
      let maxY = 0;  
      for (let cursor = 0; cursor < queue.length; cursor += 1) {  
        const pixel = queue[cursor];  
        const x = pixel % width;  
        const y = Math.floor(pixel / width);  
        minX = Math.min(minX, x);  
        maxX = Math.max(maxX, x);  
        minY = Math.min(minY, y);  
        maxY = Math.max(maxY, y);  
        for (let dy = -1; dy <= 1; dy += 1) {  
          for (let dx = -1; dx <= 1; dx += 1) {  
            if (!dx && !dy) continue;  
            const nx = x + dx;  
            const ny = y + dy;  
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;  
            const neighbor = ny * width + nx;  
            if (!isOrange[neighbor] || visited[neighbor]) continue;  
            visited[neighbor] = 1;  
            queue.push(neighbor);  
          }  
        }  
      }  
      const box = roundedBox({  
        x: minX * slideSize.widthPt / width,  
        y: minY * slideSize.heightPt / height,  
        w: (maxX - minX + 1) * slideSize.widthPt / width,  
        h: (maxY - minY + 1) * slideSize.heightPt / height  
      });  
      const area = box.w * box.h;  
      if (box.w >= 35 && box.w <= 90 && box.h >= 35 && box.h <= 90 && area >= 1200) candidates.push(box);  
    }  
    if (candidates.length < 4) return [];  
    return candidates.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 4);  
  }  
    
  function routeFidelityRegion(x1, y1, x2, y2) {  
    const pad = 3;  
    return roundedBox({  
      x: Math.min(x1, x2) - pad,  
      y: Math.min(y1, y2) - pad,  
      w: Math.abs(x2 - x1) + pad * 2,  
      h: Math.abs(y2 - y1) + pad * 2  
    });  
  }  
    
  function isolateTraditionalCollaborationRoutePixels(image) {  
    const rgba = Buffer.from(image.rgba);  
    for (let offset = 0; offset < rgba.length; offset += 4) {  
      const r = rgba[offset];  
      const g = rgba[offset + 1];  
      const b = rgba[offset + 2];  
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);  
      const lumaValue = (r + g + b) / 3;  
      const isRouteInk = lumaValue >= 105 && lumaValue <= 205 && chroma <= 28;  
      if (!isRouteInk) {  
        rgba[offset + 3] = 0;  
        continue;  
      }  
      // Preserve antialiasing while dropping the white canvas around the route.  
      rgba[offset + 3] = Math.min(rgba[offset + 3], Math.round(255 * Math.min(1, (215 - lumaValue) / 90)));  
    }  
    return { ...image, rgba };  
  }  
    
  function countVisiblePixels(image) {  
    let count = 0;  
    for (let offset = 3; offset < image.rgba.length; offset += 4) if (image.rgba[offset] > 10) count += 1;  
    return count;  
  }  
    
  function traditionalBreakdownComponent(role = "component", archetype = "traditional-collaboration-breakdown") {  
    const safeRole = safeComponentToken(role);  
    const groupId = `traditional-collaboration-breakdown-${safeRole}`;  
    return {  
      nativeComponentInstance: true,  
      nativeComponentGroupId: groupId,  
      nativeComponentArchetype: archetype,  
      componentOwnerId: groupId,  
      componentOwnerKind: archetype  
    };  
  }  
    
    
    
  return {
    createTraditionalCollaborationBreakdownObjects
  };
}

module.exports = { createTraditionalCollaborationBreakdownFactory };
