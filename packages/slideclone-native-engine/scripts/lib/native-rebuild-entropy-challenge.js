"use strict";

const { entropyChallengeAnnotationEntries } = require("@common-tools/slideclone-core/entropy-challenge-crops");
const {
  entropyChallengeFooterEntries,
  entropyChallengeNativeComponentMetadata,
  hasEntropyChallengeFooterEvidence,
  DEFAULT_SLIDE
} = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { constrainPtBox, expandPtBox } = require("@common-tools/slideclone-core/raster-native-detection");

function createEntropyChallengeAnnotationObjects(textBoxes = [], images = [], slideSize = DEFAULT_SLIDE) {
  const fragment = (images || []).find((image) =>
    image?.source?.detector === "entropy-challenge-crop"
      && image?.source?.annotationTextErasedFromCrop === true
  );
  const entries = entropyChallengeAnnotationEntries(textBoxes, slideSize);
  if (!fragment || entries.length !== 4) return { shapes: [], textBoxes: [] };
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const shapes = [];
  const nativeTextBoxes = [];
  entries.forEach((entry) => {
    const component = entropyChallengeNativeComponentMetadata(`annotation-${entry.index}`, "backplate");
    shapes.push({
      id: `entropy-challenge-annotation-backplate-${entry.index}`,
      type: "rect",
      box: constrainPtBox(expandPtBox(entry.box, slideSize, 7, 4), bounds),
      style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "entropy-challenge-native-annotation-backplate",
        expressionForm: "text-and-ui-chrome",
        ...component
      }
    });
    nativeTextBoxes.push({
      id: `entropy-challenge-annotation-text-${entry.index}`,
      role: "body",
      text: entry.label,
      box: entry.box,
      font: {
        family: "Microsoft YaHei",
        sizePt: entry.index === 0 ? 16 : 15,
        color: "#C56717",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      style: {
        visibility: "visible",
        opacity: 1,
        wrap: false,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "entropy-challenge-native-annotation-text",
        layerSourceId: fragment.id,
        textErasedFromCrop: true,
        expressionForm: "text-and-ui-chrome",
        ...entropyChallengeNativeComponentMetadata(`annotation-${entry.index}`, "label")
      }
    });
  });
  return { shapes, textBoxes: nativeTextBoxes };
}

function createEntropyChallengeFooterBulletShapes(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!hasEntropyChallengeFooterEvidence(textBoxes)) return [];
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  return entropyChallengeFooterEntries().map((entry, index) => ({
    id: `entropy-challenge-footer-bullet-${index}`,
    type: "ellipse",
    box: constrainPtBox({ x: entry.bullet.x, y: entry.bullet.y, w: 10, h: 10 }, bounds),
    style: { fill: "#F07105", stroke: "#F07105", strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "entropy-challenge-native-footer-bullet",
      expressionForm: "native-shape",
      reason: "semantic entropy footer bullet rebuilt as an editable native ellipse",
      ...entropyChallengeNativeComponentMetadata(`footer-${index}`, "bullet")
    }
  }));
}

module.exports = {
  createEntropyChallengeAnnotationObjects,
  createEntropyChallengeFooterBulletShapes
};
