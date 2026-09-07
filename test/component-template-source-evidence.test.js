"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createComponentTemplateNativeObjects,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-native-shapes");

function cardGridImage() {
  return {
    id: "four-card-grid",
    box: { x: 80, y: 100, w: 500, h: 260 },
    source: {
      componentRenderStrategy: { mode: "plugin-component-template" },
      layer: {
        layerType: "diagram-zone",
        templateFamily: "grid-or-matrix",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          targetMotifs: ["card-grid"]
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        assetKind: "presentation-template",
        recommendedComponentGroups: [{
          id: "four-card-grid-with-center-decoration",
          score: 82,
          childCount: 24,
          shapeCount: 24,
          pictureCount: 0,
          structure: {
            kind: "matrix",
            motifs: ["card-grid", "ring-node"],
            motifCounts: { "card-grid": 4, "ring-node": 1 }
          }
        }]
      }]
    }
  };
}

test("explicit native card matrices are not vetoed by a generic case-study label", () => {
  const image = cardGridImage();
  image.source.reason = "case-study-diagram-graphics-preserved-as-content-region-crop";
  assert.ok(createComponentTemplateNativeObjects([image]).shapes.length > 0);
});

test("actual screenshot regions remain protected despite candidate card templates", () => {
  for (const fields of [
    { residualSplitMode: "process-with-screenshots-semantic-regions" },
    { reason: "process-with-screenshots" },
    { reason: "case-study-diagram", expressionForm: "ui-screenshot" },
    { reason: "case-study-diagram", layer: { layerType: "diagram-zone", diagramUnderstanding: { archetype: "screenshot-card-grid" } } }
  ]) {
    const image = cardGridImage();
    Object.assign(image.source, fields);
    assert.deepEqual(createComponentTemplateNativeObjects([image]).shapes, []);
  }
});

test("card-grid ring decoration does not select concentric replay", () => {
  const image = cardGridImage();
  const match = { structure: { kind: "matrix", motifs: ["card-grid", "ring-node"] } };

  assert.equal(_private.componentFamily(image, match), "matrix");
  const result = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 });
  assert.ok(result.shapes.length > 0);
  assert.equal(image.source.componentTemplateFamilyApplied, "matrix");
  assert.ok(result.shapes.every((shape) => shape.source.componentTemplatePart.startsWith("matrix-")));
});

test("uncertain source geometry rejects trusted templates before they can consume original text", () => {
  const { isProtectedFidelityFirstDiagram } = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-source-evidence");
  const { filterTextBoxesConsumedByComponentTemplateBackfill } = require("../packages/slideclone-core/page-text-rules");
  const sourceTextBoxes = [1, 2, 3, 4].map(index => ({ id: `original-${index}`, text: `Body ${index}`, box: { x: 100, y: 110 + index * 20, w: 80, h: 15 } }));
  const image = cardGridImage();
  image.source.layer.diagramUnderstanding.evidence = { nativeGeometryUnverified: true };
  assert.equal(isProtectedFidelityFirstDiagram(image.source, true), true);
  const result = createComponentTemplateNativeObjects([image], undefined, { sourceTextBoxes });
  assert.deepEqual(result, { shapes: [], textBoxes: [], images: [] });
  assert.deepEqual(filterTextBoxesConsumedByComponentTemplateBackfill(sourceTextBoxes, result.textBoxes), sourceTextBoxes);
  const normalBackfill = [{ source: { pluginPlaceholderTextBackfilled: true, pluginTextBackfillSourceId: sourceTextBoxes[0].id } }];
  assert.deepEqual(filterTextBoxesConsumedByComponentTemplateBackfill(sourceTextBoxes, normalBackfill), sourceTextBoxes.slice(1));
});
