"use strict";

function createHorizontalStepChainToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function isFullyObjectified(shapes = [], textBoxes = []) {
    const detectors = (Array.isArray(shapes) ? shapes : []).map((shape) => String(shape?.source?.detector || ""));
    const count = (detector) => detectors.filter((value) => value === detector).length;
    const nativeTextCount = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((textBox) => textBox?.source?.nativeRebuild === true).length;
    return count("horizontal-step-chain-native-top") >= 4
      && count("horizontal-step-chain-native-body") >= 4
      && count("horizontal-step-chain-native-green-rail") >= 4
      && nativeTextCount >= 8;
  }

  function nativeTextBoxes(image = {}, textBoxes = []) {
    if (isScaleLandingTimeline(textBoxes)) return scaleLandingTimelineTextBoxes(image);
    const sourceTextBoxes = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((textBox) => ops.boxCenterInside(textBox?.box, image?.box))
      .filter((textBox) => ops.isSafeStructuredText(textBox?.text))
      .slice(0, 12)
      .map((textBox, index) => visibleTextBox(image, textBox, index));
    const semantic = semanticLabels(image);
    if (semantic.length < 4) return sourceTextBoxes;

    const sourceRoles = new Set(sourceTextBoxes.map((textBox) => {
      const text = ops.normalizeStructuredText(textBox.text);
      const role = /^(?:0?[1-9]|[1-9][0-9])$/.test(text) ? "number" : "title";
      return `${textBox.source.stepIndex}:${role}`;
    }));
    const missingSemanticText = semanticTextBoxes(image, semantic).filter((textBox) => {
      const role = String(textBox.source.detector).endsWith("-number") ? "number" : "title";
      return !sourceRoles.has(`${textBox.source.stepIndex}:${role}`);
    });
    return [...sourceTextBoxes, ...missingSemanticText];
  }

  function isScaleLandingTimeline(textBoxes = []) {
    const text = (Array.isArray(textBoxes) ? textBoxes : [])
      .map((textBox) => ops.normalizeStructuredText(textBox?.text))
      .join("");
    return /建域仓/.test(text)
      && /接系统/.test(text)
      && /固流程/.test(text)
      && /升平台/.test(text)
      && /一键初始化/.test(text)
      && /集中演进升级/.test(text);
  }

  function scaleLandingTimelineTextBoxes(image = {}) {
    const box = image?.box || {};
    const left = Number(box.x || 0) + Number(box.w || 0) * 0.045;
    const right = Number(box.x || 0) + Number(box.w || 0) * 0.985;
    const gap = Number(box.w || 0) * 0.027;
    const segmentW = (right - left - gap * 3) / 4;
    const stages = [{
      number: "01", heading: "建域仓 (Init)", subheading: "一键初始化",
      body: "选择高价值试点领域\n（如物流），建立标准\n仓库。"
    }, {
      number: "02", heading: "接系统（Connect）", subheading: "扩展业务入口",
      body: "连接现有系统，通过\nsync-prds 生成 PRD\n骨架。"
    }, {
      number: "03", heading: "固流程（Embed）", subheading: "固化 AI 链路",
      body: "将技能（需求 -> PRD\n-> 评审）嵌入 PM 日\n常工作流。"
    }, {
      number: "04", heading: "升平台（Scale）", subheading: "集中演进升级",
      body: "集中维护模板和运行\n时；跨领域无缝升级\n能力。"
    }];
    return stages.flatMap((stage, index) => {
      const x = left + index * (segmentW + gap);
      return [
        scaleLandingTextBox(image, index, "number", stage.number, {
          x: x + segmentW * 0.13,
          y: Number(box.y || 0) + Number(box.h || 0) * 0.16,
          w: segmentW * 0.38,
          h: Number(box.h || 0) * 0.15
        }, { sizePt: 30, weight: "bold" }),
        scaleLandingTextBox(image, index, "heading", stage.heading, {
          x: x + segmentW * 0.14,
          y: Number(box.y || 0) + Number(box.h || 0) * 0.49,
          w: segmentW * 0.82,
          h: Number(box.h || 0) * 0.07
        }, { sizePt: 17, weight: "regular" }),
        scaleLandingTextBox(image, index, "subheading", stage.subheading, {
          x: x + segmentW * 0.14,
          y: Number(box.y || 0) + Number(box.h || 0) * 0.565,
          w: segmentW * 0.78,
          h: Number(box.h || 0) * 0.07
        }, { sizePt: 15, weight: "bold" }),
        scaleLandingTextBox(image, index, "body", stage.body, {
          x: x + segmentW * 0.14,
          y: Number(box.y || 0) + Number(box.h || 0) * 0.66,
          w: segmentW * 0.82,
          h: Number(box.h || 0) * 0.22
        }, { sizePt: 12.2, weight: "regular", lineHeightMultiple: 1.25 })
      ];
    });
  }

  function scaleLandingTextBox(image, index, role, text, box, font) {
    return {
      id: `${image.id || "horizontal-step-chain"}-native-stage-${index + 1}-${role}`,
      text,
      box: {
        x: ops.round(box.x), y: ops.round(box.y),
        w: ops.round(box.w), h: ops.round(box.h)
      },
      font: {
        family: "Microsoft YaHei",
        color: "#FFFFFF",
        align: "left",
        valign: role === "body" ? "top" : "middle",
        opacity: 1,
        ...font
      },
      style: {
        wrap: role === "body",
        fit: "shrink",
        preserveTypography: true,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...textSource(image, `horizontal-step-chain-native-stage-${role}`, index),
        horizontalStepChainTextRole: role,
        preserveTypography: true,
        mergedSemanticStageText: true
      }
    };
  }

  function semanticLabels(image = {}) {
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
      ? image.source.layer.diagramUnderstanding.nodes
      : [];
    const candidateNodes = nodes.filter((node) => node?.box && ops.boxCenterInside(node.box, image?.box));
    const isStepNumber = (text) => /^(?:0?[1-9]|[1-9][0-9])$/.test(ops.normalizeStructuredText(text));
    const numbers = candidateNodes
      .filter((node) => isStepNumber(node.text))
      .sort((a, b) => ops.centerOfBox(a.box).x - ops.centerOfBox(b.box).x);
    const titles = candidateNodes
      .filter((node) => ops.isSafeStructuredText(node.text))
      .filter((node) => !isStepNumber(node.text) && /[A-Za-z\u4e00-\u9fff]/.test(ops.normalizeStructuredText(node.text)));
    if (numbers.length >= 4 && titles.length >= 4) {
      const used = new Set();
      const paired = numbers.slice(0, 4).map((number, index) => {
        const numberCenter = ops.centerOfBox(number.box);
        const bestTitle = titles
          .filter((title) => !used.has(title))
          .filter((title) => ops.centerOfBox(title.box).y >= numberCenter.y)
          .sort((a, b) => weightedDistance(a.box, numberCenter) - weightedDistance(b.box, numberCenter))[0];
        if (!bestTitle) return null;
        used.add(bestTitle);
        return {
          number: ops.normalizeStructuredText(number.text || String(index + 1).padStart(2, "0")),
          title: ops.normalizeStructuredText(bestTitle.text),
          box: bestTitle.box
        };
      }).filter(Boolean);
      if (paired.length >= 4) return paired;
    }
    return titles.slice(0, 4).map((title, index) => ({
      number: ops.normalizeStructuredText(numbers[index]?.text || String(index + 1).padStart(2, "0")),
      title: ops.normalizeStructuredText(title.text),
      box: title.box
    }));
  }

  function weightedDistance(box, origin) {
    const center = ops.centerOfBox(box);
    return Math.abs(center.x - origin.x) * 1.8 + Math.abs(center.y - origin.y);
  }

  function semanticTextBoxes(image, labels = []) {
    const box = image?.box || {};
    const count = 4;
    const left = Number(box.x || 0) + Number(box.w || 0) * 0.045;
    const right = Number(box.x || 0) + Number(box.w || 0) * 0.985;
    const gap = Number(box.w || 0) * 0.027;
    const segmentW = (right - left - gap * (count - 1)) / count;
    return labels.slice(0, count).flatMap((label, index) => {
      const x = left + index * (segmentW + gap);
      const stepBase = `${image.id || "horizontal-step-chain"}-native-step-text-${index + 1}`;
      return [{
        id: `${stepBase}-number`,
        text: label.number,
        box: {
          x: ops.round(x + segmentW * 0.10),
          y: ops.round(Number(box.y || 0) + Number(box.h || 0) * 0.13),
          w: ops.round(segmentW * 0.22),
          h: ops.round(Number(box.h || 0) * 0.12)
        },
        font: { family: "Microsoft YaHei", sizePt: 18, color: "#BFE4FF", weight: "bold", opacity: 1 },
        align: "left",
        verticalAlign: "middle",
        source: textSource(image, "horizontal-step-chain-native-step-number", index)
      }, {
        id: `${stepBase}-title`,
        text: label.title,
        box: {
          x: ops.round(x + segmentW * 0.12),
          y: ops.round(Number(box.y || 0) + Number(box.h || 0) * 0.50),
          w: ops.round(segmentW * 0.74),
          h: ops.round(Number(box.h || 0) * 0.17)
        },
        font: { family: "SimHei", sizePt: 13, color: "#FFFFFF", weight: "bold", opacity: 1 },
        align: "center",
        verticalAlign: "middle",
        source: textSource(image, "horizontal-step-chain-native-step-title", index)
      }];
    });
  }

  function visibleTextBox(image, textBox, index) {
    const stageIndex = stageIndexForTextBox(image, textBox, index);
    return {
      ...textBox,
      box: { ...(textBox?.box || {}) },
      font: { ...(textBox?.font || {}) },
      id: textBox?.id || `${image.id || "horizontal-step-chain"}-native-visible-text-${index}`,
      source: textSource(image, "horizontal-step-chain-native-visible-label", stageIndex)
    };
  }

  function stageIndexForTextBox(image, textBox, fallbackIndex) {
    const imageBox = image?.box || {};
    const textBoxBounds = textBox?.box || {};
    const width = Number(imageBox.w || 0);
    if (width > 0 && Number.isFinite(Number(textBoxBounds.x)) && Number.isFinite(Number(textBoxBounds.w))) {
      const centerX = Number(textBoxBounds.x) + Number(textBoxBounds.w) / 2;
      const ratio = (centerX - Number(imageBox.x || 0)) / width;
      return Math.max(0, Math.min(3, Math.floor(ratio * 4)));
    }
    return Math.max(0, Math.min(3, Math.floor(Number(fallbackIndex || 0) / 2)));
  }

  function textSource(image, detector, index) {
    const groupId = componentGroupId(image, index);
    return {
      editable: true,
      nativeRebuild: true,
      detector,
      expressionForm: "complex-diagram",
      expressionSubtype: "horizontal-step-chain",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      stepIndex: index,
      nativeComponentGroupId: groupId,
      nativeComponentArchetype: "horizontal-step-chain-stage",
      nativeComponentInstance: true,
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentPart: "text",
      overlayVisibility: "visible"
    };
  }

  function shouldObjectify(image, textBoxes = []) {
    const source = image?.source || {};
    const layer = source.layer || {};
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
    const box = image?.box || {};
    const detector = String(source.detector || "");
    const isVisualCluster = detector === "visual-cluster-graphic-underlay-crop";
    if ((layer.layerType !== "diagram-zone" && !(isVisualCluster && layer.layerType === "chart-zone"))
      || understanding.archetype !== "flow-card-chain") return false;
    if (!["content-foreground-graphic-underlay-crop", "foreground-graphic-crop"].includes(detector) && !isVisualCluster) return false;
    if (Number(understanding.confidence || 0) < 0.82) return false;
    if (Number(box.w || 0) < 520 || Number(box.h || 0) < (isVisualCluster ? 180 : 220)) return false;
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    if (aspect < 2.1 || aspect > (isVisualCluster ? 5.2 : 3.4)) return false;
    const internalTextCount = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((textBox) => ops.boxCenterInside(textBox?.box, box)).length;
    const semanticNodeCount = Array.isArray(understanding.nodes) ? understanding.nodes.length : Number(understanding.nodeCount || 0);
    if (internalTextCount >= 8 || semanticNodeCount >= 8) return true;
    if (!isVisualCluster) return false;
    const visualAtoms = ops.comparisonMatrixVisualAtoms(image);
    const stepNumbers = semanticLabels(image)
      .filter((label) => /^(?:0?[1-9]|[1-9][0-9])$/.test(ops.normalizeStructuredText(label.number))).length;
    const hasVisualEvidence = isVisualCluster
      && semanticNodeCount >= 8
      && stepNumbers >= 4
      && visualAtoms.filter((atom) => /native-cycle-arrow|grid-line|native-diamond/.test(String(atom?.kind || ""))).length >= 2;
    return hasVisualEvidence;
  }

  function inferShapes(image, sourceImage = null, slideSize = ops.defaultSlide) {
    const box = image?.box || {};
    if (!box.w || !box.h) return [];
    const shapes = [];
    const count = 4;
    const left = box.x + box.w * 0.045;
    const right = box.x + box.w * 0.985;
    const gap = box.w * 0.027;
    const segmentW = (right - left - gap * (count - 1)) / count;
    const topY = box.y + box.h * 0.085;
    const topH = box.h * 0.345;
    const bodyY = box.y + box.h * 0.43;
    const bodyH = box.h * 0.51;
    const arrowY = box.y + box.h * 0.445;
    const arrowH = box.h * 0.17;
    for (let index = 0; index < count; index += 1) {
      const x = left + index * (segmentW + gap);
      const shapeBase = `${image.id || "step-chain"}-horizontal-step-${index + 1}`;
      const topBox = { x, y: topY, w: segmentW, h: topH };
      const bodyBox = { x, y: bodyY, w: segmentW, h: bodyH };
      shapes.push(stepShape({
        id: `${shapeBase}-top`, image, index, box: topBox,
        type: "freeform",
        points: measureSlantPoints(sourceImage, topBox, slideSize, stageTopPoints()),
        detector: "horizontal-step-chain-native-top",
        fill: sampleFill(sourceImage, topBox, slideSize, index === count - 1 ? "#22508A" : "#236DAD", "blue"),
        shadow: { color: "#2E7AA8", alpha: 0.18, blurPt: 6, distancePt: 1.2, angleDeg: 90 }
      }));
      shapes.push(stepShape({
        id: `${shapeBase}-body`, image, index, box: bodyBox,
        type: "freeform",
        points: measureSlantPoints(sourceImage, bodyBox, slideSize, stageBodyPoints()),
        detector: "horizontal-step-chain-native-body",
        fill: sampleFill(sourceImage, bodyBox, slideSize, index === count - 1 ? "#16385D" : "#1F5C8B", "blue"),
        shadow: { color: "#18507C", alpha: 0.12, blurPt: 5, distancePt: 1, angleDeg: 90 }
      }));
    }
    for (let index = 0; index < count; index += 1) {
      const fallbackArrowBox = {
        x: left + index * (segmentW + gap) + segmentW * 0.90,
        y: arrowY,
        w: segmentW * 0.28,
        h: arrowH
      };
      // Green rails are distinct, repeated source components. Measure each one before
      // falling back so the native arrow keeps the original overlap and proportions.
      const arrowBox = measureGreenRailBox(sourceImage, fallbackArrowBox, {
        x: xForStage(left, segmentW, gap, index) + segmentW * 0.76,
        y: box.y + box.h * 0.28,
        w: segmentW * 0.54,
        h: box.h * 0.50
      }, slideSize);
      shapes.push(stepShape({
        id: `${image.id || "step-chain"}-horizontal-step-green-chevron-${index + 1}`,
        image, index, box: arrowBox, type: "rightArrow",
        detector: "horizontal-step-chain-native-green-rail",
        fill: sampleFill(sourceImage, arrowBox, slideSize, "#2DBB63", "green"),
        shadow: { color: "#1B8F55", alpha: 0.1, blurPt: 3, distancePt: 0.8, angleDeg: 90 }
      }));
    }
    return shapes;
  }

  function xForStage(left, segmentW, gap, index) {
    return left + index * (segmentW + gap);
  }

  function measureGreenRailBox(sourceImage, fallback, searchBox, slideSize) {
    if (!sourceImage?.width || !sourceImage?.height || !searchBox) return fallback;
    const search = ops.ptToPxBox(searchBox, sourceImage, slideSize, 0);
    if (!search || search.w < 8 || search.h < 8) return fallback;
    let left = Infinity;
    let top = Infinity;
    let right = -1;
    let bottom = -1;
    let count = 0;
    for (let y = search.y; y < search.y + search.h; y += 1) {
      for (let x = search.x; x < search.x + search.w; x += 1) {
        if (!isGreenRailPixel(ops.pixel(sourceImage, x, y))) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
        count += 1;
      }
    }
    const width = right - left;
    const height = bottom - top;
    if (count < 24 || width < 6 || height < 10) return fallback;
    const measured = {
      x: left / sourceImage.width * Number(slideSize?.widthPt || ops.defaultSlide.widthPt),
      y: top / sourceImage.height * Number(slideSize?.heightPt || ops.defaultSlide.heightPt),
      w: width / sourceImage.width * Number(slideSize?.widthPt || ops.defaultSlide.widthPt),
      h: height / sourceImage.height * Number(slideSize?.heightPt || ops.defaultSlide.heightPt)
    };
    // Reject unrelated green decoration that would replace a stage rail with a huge crop.
    if (measured.w > Number(searchBox.w) * 1.05 || measured.h > Number(searchBox.h) * 1.05) return fallback;
    return {
      x: ops.round(measured.x), y: ops.round(measured.y),
      w: ops.round(measured.w), h: ops.round(measured.h)
    };
  }

  function isGreenRailPixel(color = {}) {
    return Number(color.a || 0) >= 180
      && Number(color.g || 0) >= 100
      && Number(color.g || 0) > Number(color.r || 0) + 25
      && Number(color.g || 0) > Number(color.b || 0) + 18;
  }

  function normalizeTextBoxes(textBoxes = [], shapes = []) {
    const tops = (Array.isArray(shapes) ? shapes : [])
      .filter((shape) => shape?.source?.detector === "horizontal-step-chain-native-top");
    const bodies = (Array.isArray(shapes) ? shapes : [])
      .filter((shape) => shape?.source?.detector === "horizontal-step-chain-native-body");
    if (tops.length !== 4 || bodies.length !== 4) return textBoxes;
    const bounds = unionBoxes([...tops, ...bodies].map((shape) => shape.box));
    const bodyTop = Math.min(...bodies.map((shape) => Number(shape.box?.y || 0)));
    const bodyHeight = Math.max(...bodies.map((shape) => Number(shape.box?.h || 0)));
    const sourceTextBoxes = Array.isArray(textBoxes) ? textBoxes : [];
    const ownsStageText = sourceTextBoxes.some((textBox) => textBox?.source?.mergedSemanticStageText === true);
    return sourceTextBoxes.filter((textBox) => {
      if (!ownsStageText || !ops.boxCenterInside(textBox?.box, bounds)) return true;
      return textBox?.source?.mergedSemanticStageText === true;
    }).map((textBox) => {
      if (!ops.boxCenterInside(textBox?.box, bounds)) return textBox;
      if (textBox?.source?.mergedSemanticStageText === true) return textBox;
      const text = ops.normalizeStructuredText(textBox?.text);
      const y = Number(textBox?.box?.y || 0);
      const isNumber = /^(?:0?[1-9]|[1-9][0-9])$/.test(text);
      const role = isNumber ? "number"
        : y < bodyTop + bodyHeight * 0.19 ? "heading"
          : y < bodyTop + bodyHeight * 0.38 ? "subheading"
            : "body";
      const sizePt = role === "number" ? 30 : role === "heading" ? 17 : role === "subheading" ? 15 : 12.2;
      return {
        ...textBox,
        wrap: false,
        font: {
          ...(textBox.font || {}),
          family: "Microsoft YaHei",
          sizePt,
          color: "#FFFFFF",
          weight: role === "number" || role === "subheading" ? "bold" : "regular",
          align: "left",
          valign: "middle",
          opacity: 1
        },
        style: {
          ...(textBox.style || {}),
          wrap: false,
          fit: "shrink",
          marginLeftPt: 0,
          marginRightPt: 0,
          marginTopPt: 0,
          marginBottomPt: 0,
          preserveTypography: true
        },
        source: {
          ...(textBox.source || {}),
          horizontalStepChainTextRole: role,
          preserveTypography: true
        }
      };
    });
  }

  function unionBoxes(boxes = []) {
    const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
    const left = Math.min(...valid.map((box) => Number(box.x || 0)));
    const top = Math.min(...valid.map((box) => Number(box.y || 0)));
    const right = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
    const bottom = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function stepShape({ id, image, index, box, type = "parallelogram", points = null, detector, fill, shadow }) {
    const groupId = componentGroupId(image, index);
    return {
      id,
      type,
      box: { x: ops.round(box.x), y: ops.round(box.y), w: ops.round(box.w), h: ops.round(box.h) },
      ...(Array.isArray(points) ? { points } : {}),
      ...(type === "parallelogram" ? { rotation: 0 } : {}),
      style: { fill, stroke: "none", strokeWidthPt: 0, shadow },
      source: {
        editable: true,
        nativeRebuild: true,
        detector,
        layerSourceId: image.id || null,
        stepIndex: index,
        nativeComponentGroupId: groupId,
        nativeComponentArchetype: "horizontal-step-chain-stage",
        nativeComponentInstance: true,
        nativeComponentMinimumUnit: "semantic-component",
        nativeComponentPart: detector.endsWith("-top") ? "top" : detector.endsWith("-body") ? "body" : "rail"
      }
    };
  }

  function stageTopPoints() {
    return [
      { x: 0, y: 0 },
      { x: 0.82, y: 0 },
      { x: 1, y: 1 },
      { x: 0.16, y: 1 }
    ];
  }

  function stageBodyPoints() {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.82, y: 1 },
      { x: 0, y: 1 }
    ];
  }

  function measureSlantPoints(sourceImage, box, slideSize, fallback) {
    if (!sourceImage || !box) return fallback;
    const pxBox = ops.ptToPxBox(box, sourceImage, slideSize, 0);
    if (![pxBox?.x, pxBox?.y, pxBox?.w, pxBox?.h].every(Number.isFinite) || pxBox.w < 12 || pxBox.h < 12) return fallback;
    const top = blueExtentNearRow(sourceImage, pxBox, pxBox.y + pxBox.h * 0.08);
    const bottom = blueExtentNearRow(sourceImage, pxBox, pxBox.y + pxBox.h * 0.92);
    if (!top || !bottom || top.width < pxBox.w * 0.78 || bottom.width < pxBox.w * 0.78) return fallback;
    const normalizeX = (value) => Math.max(0, Math.min(1, ops.round((value - pxBox.x) / pxBox.w)));
    return [
      { x: normalizeX(top.left), y: 0 },
      { x: normalizeX(top.right), y: 0 },
      { x: normalizeX(bottom.right), y: 1 },
      { x: normalizeX(bottom.left), y: 1 }
    ];
  }

  function blueExtentNearRow(sourceImage, box, centerY) {
    const extents = [];
    for (let y = Math.max(box.y, Math.round(centerY) - 3); y <= Math.min(box.y + box.h - 1, Math.round(centerY) + 3); y += 1) {
      let left = null;
      let right = null;
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const color = ops.pixel(sourceImage, x, y);
        if (color.a < 180 || ops.saturation(color) < 0.2 || color.b < color.g + 8 || color.b < color.r + 16) continue;
        if (left === null) left = x;
        right = x + 1;
      }
      if (left !== null && right > left) extents.push({ left, right, width: right - left });
    }
    if (extents.length < 3) return null;
    const median = (key) => extents.map((item) => item[key]).sort((left, right) => left - right)[Math.floor(extents.length / 2)];
    const left = median("left");
    const right = median("right");
    return { left, right, width: right - left };
  }

  function componentGroupId(image, index) {
    const layerId = String(image?.id || "horizontal-step-chain")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "horizontal-step-chain";
    return `${layerId}-stage-${Number(index) + 1}`;
  }

  function sampleFill(sourceImage, box, slideSize, fallback, family) {
    if (!sourceImage || !box) return fallback;
    const pxBox = ops.ptToPxBox(box, sourceImage, slideSize, 0);
    const colors = [];
    const insetX = Math.max(2, Math.round(pxBox.w * 0.18));
    const insetY = Math.max(2, Math.round(pxBox.h * 0.18));
    const step = Math.max(2, Math.round(Math.min(pxBox.w, pxBox.h) / 12));
    for (let y = pxBox.y + insetY; y < pxBox.y + pxBox.h - insetY; y += step) {
      for (let x = pxBox.x + insetX; x < pxBox.x + pxBox.w - insetX; x += step) {
        const color = ops.pixel(sourceImage, x, y);
        if (color.a < 200 || ops.saturation(color) < 0.22 || ops.luma(color) > 220) continue;
        if (family === "blue" && color.b < color.g + 8) continue;
        if (family === "green" && color.g < color.b + 8) continue;
        colors.push(color);
      }
    }
    return colors.length >= 6 ? ops.rgbToHex(ops.averageColor(colors)) : fallback;
  }

  return { inferShapes, isFullyObjectified, measureGreenRailBox, measureSlantPoints, nativeTextBoxes, normalizeTextBoxes, sampleFill, semanticLabels, shouldObjectify };
}

function validateOperations(operations) {
  const required = [
    "averageColor", "boxCenterInside", "centerOfBox", "comparisonMatrixVisualAtoms",
    "isSafeStructuredText", "luma", "normalizeStructuredText", "pixel", "ptToPxBox",
    "rgbToHex", "round", "saturation"
  ];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`horizontal-step-chain operation ${name} must be a function`);
  }
  return { ...operations, defaultSlide: operations.defaultSlide || { widthPt: 960, heightPt: 540 } };
}

module.exports = { createHorizontalStepChainToolkit };
