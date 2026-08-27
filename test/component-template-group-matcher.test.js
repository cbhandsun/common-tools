"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateComponentGroupsForLayer,
  recommendComponentGroupsForLayer,
  scoreComponentGroup,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-group-matcher");

test("component template group matcher preserves sanitized nested replay layout", () => {
  const replayChildren = Array.from({ length: 8 }, (_, index) => ({
    kind: index % 3 === 0 ? "connector" : "shape",
    box: { x: index * 0.05, y: 0.1, w: 0.08, h: 0.08 },
    style: index % 3 === 0
      ? { stroke: "#64748B", connectorType: "straight" }
      : { fill: "#F97316", shapeType: "roundRect", rotation: 90, flipH: true, flipV: true }
  }));
  const result = evaluateComponentGroupsForLayer({
    layer: { layerType: "diagram-zone", areaRatio: 0.4, templateFamily: "process-chain" },
    asset: {
      learningSummary: {
        componentCatalog: [{
          id: "nested-component",
          boundsPt: { x: 0, y: 0, w: 600, h: 240 },
          childCount: 8,
          shapeCount: 5,
          connectorCount: 3,
          pictureCount: 0,
          componentScore: 90,
          childLayout: { children: replayChildren.slice(0, 4) },
          replayChildLayout: { provider: "pptx-group-replay-layout-v1", children: replayChildren },
          reuseReadiness: { level: "high", score: 95 },
          structure: { kind: "process-chain", motifs: ["linear-arrow-chain"] }
        }]
      }
    }
  });

  assert.equal(result.recommendedGroups.length, 1);
  assert.equal(result.recommendedGroups[0].replayChildLayout.children.length, 8);
  assert.equal(result.recommendedGroups[0].replayChildLayout.children[0].kind, "connector");
  assert.equal(result.recommendedGroups[0].replayChildLayout.children[1].style.rotation, 90);
  assert.equal(result.recommendedGroups[0].replayChildLayout.children[1].style.flipH, true);
  assert.equal(result.recommendedGroups[0].replayChildLayout.children[1].style.flipV, true);
});

test("component template group matcher prefers connector-rich wide groups for process chains", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "simple",
          name: "simple",
          boundsPt: { x: 0, y: 0, w: 100, h: 100 },
          childCount: 3,
          shapeCount: 3,
          connectorCount: 0,
          pictureCount: 0,
          componentScore: 30
        },
        {
          id: "flow",
          name: "flow",
          boundsPt: { x: 0, y: 0, w: 600, h: 100 },
          childCount: 18,
          shapeCount: 15,
          connectorCount: 4,
          pictureCount: 0,
          topColors: [
            { value: "#185ABD", count: 5 },
            { value: "javascript:alert(1)", count: 3 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            boundsSource: "group-xfrm",
            childBoxCount: 2,
            children: [
              {
                kind: "shape",
                box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
                style: {
                  fill: "#FFAA00",
                  stroke: "#185ABD",
                  strokeWidthPt: 1.25,
                  shapeType: "bentArrow",
                  adjustments: [0.36, 99, "bad"],
                  opacity: 0.6,
                  gradient: {
                    type: "linear",
                    angleDeg: 420,
                    stops: [
                      { position: 1, color: "#00AAFF" },
                      { position: 0, color: "#FFAA00" },
                      { position: 0.5, color: "bad" }
                    ]
                  },
                  shadow: {
                    color: "#111111",
                    alpha: 0.2,
                    blurPt: 3,
                    distancePt: 2,
                    angleDeg: 45
                  },
                  text: {
                    placeholderText: "输入标题",
                    fontSizePt: 14,
                    color: "#333333",
                    weight: "bold",
                    align: "center",
                    valign: "middle",
                    family: "Microsoft YaHei",
                    unsafeHtml: "<script>alert(1)</script>"
                  }
                }
              },
              {
                kind: "connector",
                box: { x: 0.45, y: 0.38, w: 0.2, h: 0.02 },
                style: {
                  stroke: "#22C55E",
                  strokeWidthPt: 1.75,
                  endArrow: "triangle",
                  startArrow: "javascript",
                  connectorType: "curve",
                  dash: "dot"
                }
              },
              {
                kind: "picture",
                box: { x: 0.7, y: 0.1, w: 0.2, h: 0.3 },
                style: {
                  picture: {
                    embedRelId: "rId7",
                    mediaTarget: "ppt/media/icon.svg",
                    crop: { left: 0.1, top: 0.02, right: 2, bottom: "bad" },
                    opacity: 0.72
                  }
                }
              },
              {
                kind: "bad",
                box: { x: 0, y: 0, w: 1, h: 1 },
                style: { fill: "url(javascript:alert(1))", shapeType: "script", picture: { mediaTarget: "https://example.com/x.png" } }
              }
            ]
          },
          componentScore: 90,
          structure: {
            kind: "process-chain",
            roles: {
              background: 1,
              node: 3,
              connector: 2,
              textSlot: 3,
              pictureSlot: 1,
              decoration: 9999,
              unsafe: 1
            },
            nodeCount: 3,
            connectorCount: 2,
            textSlotCount: 3,
            pictureSlotCount: 1,
            secret: "nope"
          },
          reuseReadiness: {
            level: "high",
            score: 86,
            reasons: ["has-child-layout", "structured-process-chain", "<script>bad</script>"]
          }
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "process-chain",
      layerType: "diagram-zone",
      areaRatio: 0.25
    },
    asset
  });

  assert.equal(groups[0].id, "flow");
  assert.ok(groups[0].matchReasons.includes("process-chain-connectors"));
  assert.ok(groups[0].matchReasons.includes("learned-process-structure"));
  assert.ok(groups[0].matchReasons.includes("reuse-high"));
  assert.deepEqual(groups[0].topColors, [{ value: "#185ABD", count: 5 }]);
  assert.deepEqual(groups[0].reuseReadiness, {
    level: "high",
    score: 86,
    reasons: ["has-child-layout", "structured-process-chain"]
  });
  assert.deepEqual(groups[0].structure, {
    kind: "process-chain",
    roles: {
      background: 1,
      node: 3,
      connector: 2,
      textSlot: 3,
      pictureSlot: 1,
      decoration: 1000
    },
    nodeCount: 3,
    connectorCount: 2,
    textSlotCount: 3,
    pictureSlotCount: 1
  });
  assert.deepEqual(groups[0].childLayout.children, [
    {
      kind: "shape",
      box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      style: {
        fill: "#FFAA00",
        stroke: "#185ABD",
        strokeWidthPt: 1.25,
        shapeType: "bentarrow",
        adjustments: [0.36, 10],
        opacity: 0.6,
        gradient: {
          type: "linear",
          angleDeg: 360,
          stops: [
            { position: 0, color: "#FFAA00" },
            { position: 1, color: "#00AAFF" }
          ]
        },
        shadow: {
          color: "#111111",
          alpha: 0.2,
          blurPt: 3,
          distancePt: 2,
          angleDeg: 45
        },
        text: {
          placeholderText: "输入标题",
          fontSizePt: 14,
          color: "#333333",
          weight: "bold",
          align: "center",
          valign: "middle",
          family: "Microsoft YaHei"
        }
      }
    },
    {
      kind: "connector",
      box: { x: 0.45, y: 0.38, w: 0.2, h: 0.02 },
      style: {
        stroke: "#22C55E",
        strokeWidthPt: 1.75,
        endArrow: "triangle",
        connectorType: "curve",
        dash: "dot"
      }
    },
    {
      kind: "picture",
      box: { x: 0.7, y: 0.1, w: 0.2, h: 0.3 },
      style: {
        picture: {
          embedRelId: "rId7",
          mediaTarget: "ppt/media/icon.svg",
          crop: { left: 0.1, top: 0.02, right: 1 },
          opacity: 0.72
        }
      }
    }
  ]);
});

test("component template group matcher uses layer aspect ratio to avoid one group for every layer", () => {
  const wide = {
    id: "wide",
    boundsPt: { x: 0, y: 0, w: 700, h: 70 },
    childCount: 30,
    shapeCount: 28,
    connectorCount: 4,
    pictureCount: 0,
    componentScore: 100
  };
  const balanced = {
    id: "balanced",
    boundsPt: { x: 0, y: 0, w: 300, h: 220 },
    childCount: 20,
    shapeCount: 18,
    connectorCount: 4,
    pictureCount: 0,
    componentScore: 90
  };

  const wideScore = scoreComponentGroup({
    layer: { templateFamily: "hub-spoke", layerType: "diagram-zone", aspectRatio: 1.35, areaRatio: 0.4 },
    group: wide
  });
  const balancedScore = scoreComponentGroup({
    layer: { templateFamily: "hub-spoke", layerType: "diagram-zone", aspectRatio: 1.35, areaRatio: 0.4 },
    group: balanced
  });

  assert.ok(balancedScore.matchScore > wideScore.matchScore);
  assert.ok(balancedScore.matchReasons.includes("aspect-close"));
});

test("component template group matcher can derive aspect ratio from layer box", () => {
  const scored = scoreComponentGroup({
    layer: {
      templateFamily: "process-chain",
      layerType: "diagram-zone",
      box: { width: 600, height: 100 },
      areaRatio: 0.2
    },
    group: {
      id: "wide",
      boundsPt: { x: 0, y: 0, w: 720, h: 120 },
      childCount: 10,
      shapeCount: 8,
      connectorCount: 2,
      pictureCount: 0,
      componentScore: 80
    }
  });

  assert.ok(scored.matchReasons.includes("aspect-close"));
});

test("component template group matcher penalizes missing bounds and bitmap-heavy groups", () => {
  const scored = scoreComponentGroup({
    layer: {
      templateFamily: "hub-spoke",
      layerType: "diagram-zone",
      detector: "cycle-illustration-underlay-crop",
      areaRatio: 0.5
    },
    group: {
      id: "bad",
      boundsPt: { x: 0, y: 0, w: 0, h: 0 },
      childCount: 10,
      shapeCount: 2,
      pictureCount: 8,
      connectorCount: 0,
      componentScore: 60
    }
  });

  assert.ok(scored.matchScore < 35);
  assert.ok(scored.matchReasons.includes("structural-layer-type"));
});

test("component template group matcher prefers native arc-heavy cycle-loop groups", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "native-cycle",
          boundsPt: { x: 0, y: 0, w: 500, h: 320 },
          childCount: 20,
          shapeCount: 20,
          pictureCount: 0,
          connectorCount: 0,
          componentScore: 70,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.1, y: 0.2, w: 0.4, h: 0.5 }, style: { shapeType: "arc" } },
              { kind: "shape", box: { x: 0.5, y: 0.2, w: 0.1, h: 0.1 }, style: { shapeType: "triangle" } },
              { kind: "shape", box: { x: 0.2, y: 0.1, w: 0.1, h: 0.1 }, style: { shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.3, y: 0.5, w: 0.2, h: 0.1 }, style: { shapeType: "roundRect" } }
            ]
          }
        },
        {
          id: "picture-cycle",
          boundsPt: { x: 0, y: 0, w: 500, h: 320 },
          childCount: 12,
          shapeCount: 4,
          pictureCount: 8,
          connectorCount: 0,
          componentScore: 90
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "cycle-loop",
      layerType: "diagram-zone",
      aspectRatio: 1.56,
      areaRatio: 0.3
    },
    asset
  });

  assert.equal(groups[0].id, "native-cycle");
  assert.ok(groups[0].matchReasons.includes("cycle-loop-native-shapes"));
  assert.ok(groups[0].matchReasons.includes("cycle-loop-arc-or-node-layout"));
  assert.equal(groups[0].childLayout.children[0].style.shapeType, "arc");
});

test("component template group matcher rejects learned groups with conflicting explicit target motifs", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [{
        id: "arc-arrow-cycle",
        boundsPt: { x: 0, y: 0, w: 500, h: 420 },
        childCount: 14,
        shapeCount: 14,
        pictureCount: 0,
        connectorCount: 0,
        componentScore: 90,
        structure: {
          kind: "cycle-loop",
          motifs: ["arc-arrow"],
          motifCounts: { "arc-arrow": 13 }
        },
        reuseReadiness: { level: "medium", score: 62 }
      }]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "hub-spoke",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["radial-link"] },
      aspectRatio: 0.92,
      areaRatio: 0.31
    },
    asset
  });

  assert.deepEqual(groups, []);
});

test("component template group matcher keeps learned groups when target motifs match", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [{
        id: "arc-arrow-cycle",
        boundsPt: { x: 0, y: 0, w: 500, h: 420 },
        childCount: 14,
        shapeCount: 14,
        pictureCount: 0,
        connectorCount: 0,
        componentScore: 90,
        structure: {
          kind: "cycle-loop",
          motifs: ["arc-arrow"],
          motifCounts: { "arc-arrow": 13 }
        },
        reuseReadiness: { level: "medium", score: 62 }
      }]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "cycle-loop",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["arc-arrow"] },
      aspectRatio: 1.2,
      areaRatio: 0.31
    },
    asset
  });

  assert.equal(groups[0].id, "arc-arrow-cycle");
  assert.equal(groups[0].structure.motifs[0], "arc-arrow");
});

test("component template group matcher prefers groups matching native semantic component metadata", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "oversized-process",
          boundsPt: { x: 0, y: 0, w: 780, h: 220 },
          childCount: 24,
          shapeCount: 20,
          pictureCount: 0,
          connectorCount: 4,
          componentScore: 96,
          structure: { kind: "process-chain" },
          reuseReadiness: { level: "high", score: 92 }
        },
        {
          id: "semantic-bar-chart",
          boundsPt: { x: 0, y: 0, w: 320, h: 180 },
          childCount: 5,
          shapeCount: 5,
          pictureCount: 0,
          connectorCount: 0,
          componentScore: 76,
          structure: { kind: "bar-chart" },
          reuseReadiness: { level: "medium", score: 70 }
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "bar-chart",
      layerType: "chart-zone",
      nativeComponentArchetype: "bar-chart",
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentPartCount: 5,
      nativeComponentReplacementKey: "visual-component-chart-zone-layer-bar-chart:bar-chart:5",
      nativeComponentBounds: { x: 40, y: 56, w: 292, h: 150 },
      box: { x: 40, y: 56, w: 292, h: 150 }
    },
    asset
  });

  assert.equal(groups[0].id, "semantic-bar-chart");
  assert.ok(groups[0].matchReasons.includes("native-component-archetype:bar-chart"));
  assert.ok(groups[0].matchReasons.includes("native-component-part-count-close"));
  assert.ok(groups[0].matchReasons.includes("native-component-editable-group"));
});

test("component template group matcher prefers lens funnel branch card flow motifs", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "generic-process",
          boundsPt: { x: 0, y: 0, w: 720, h: 320 },
          childCount: 9,
          shapeCount: 7,
          pictureCount: 0,
          connectorCount: 2,
          componentScore: 92,
          structure: {
            kind: "process-chain",
            motifs: ["linear-arrow-chain"],
            motifCounts: { "linear-arrow-chain": 8 },
            nodeCount: 5,
            connectorCount: 2
          },
          reuseReadiness: { level: "high", score: 88 }
        },
        {
          id: "lens-branch-flow",
          boundsPt: { x: 0, y: 0, w: 760, h: 340 },
          childCount: 14,
          shapeCount: 11,
          pictureCount: 0,
          connectorCount: 3,
          componentScore: 84,
          structure: {
            kind: "process-chain",
            motifs: ["lens-funnel-flow", "branch-card-flow"],
            motifCounts: { "lens-funnel-flow": 9, "branch-card-flow": 8 },
            nodeCount: 6,
            connectorCount: 3,
            textSlotCount: 4
          },
          reuseReadiness: { level: "medium", score: 74 }
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "process-chain",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["lens-funnel-flow", "branch-card-flow"] },
      aspectRatio: 2.1,
      areaRatio: 0.34,
      nodeCount: 6,
      textSlotCount: 4
    },
    asset
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "lens-branch-flow");
  assert.ok(groups[0].matchReasons.includes("learned-lens-funnel-flow-motif"));
  assert.ok(groups[0].matchReasons.includes("learned-branch-card-flow-motif"));
});

test("component template group matcher preserves expanded semantic motifs for strict matching", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "generic-venn",
          boundsPt: { x: 0, y: 0, w: 360, h: 240 },
          childCount: 6,
          shapeCount: 6,
          pictureCount: 0,
          connectorCount: 0,
          componentScore: 92,
          structure: {
            kind: "venn-overlap",
            nodeCount: 3
          },
          reuseReadiness: { level: "high", score: 90 }
        },
        {
          id: "semantic-venn",
          boundsPt: { x: 0, y: 0, w: 360, h: 240 },
          childCount: 6,
          shapeCount: 6,
          pictureCount: 0,
          connectorCount: 0,
          componentScore: 84,
          structure: {
            kind: "venn-overlap",
            motifs: ["venn-overlap", "intersection-overlap"],
            motifCounts: { "venn-overlap": 3, "intersection-overlap": 2 },
            nodeCount: 3
          },
          reuseReadiness: { level: "medium", score: 78 }
        }
      ]
    }
  };

  const result = evaluateComponentGroupsForLayer({
    layer: {
      templateFamily: "venn-overlap",
      layerType: "diagram-zone",
      targetMotifs: ["venn-overlap", "intersection-overlap"],
      aspectRatio: 1.5,
      nodeCount: 3
    },
    asset
  });

  assert.equal(result.recommendedGroups.length, 1);
  assert.equal(result.recommendedGroups[0].id, "semantic-venn");
  assert.ok(result.recommendedGroups[0].matchReasons.includes("learned-venn-overlap-motif"));
  assert.ok(result.rejectedGroups.some((group) => group.id === "generic-venn" && group.rejectionReasons.includes("strict-motif-evidence-missing")));
});

test("component template group matcher requires explicit motif evidence for high-risk radial targets", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "unknown-hub",
          boundsPt: { x: 0, y: 0, w: 420, h: 380 },
          childCount: 18,
          shapeCount: 16,
          pictureCount: 0,
          connectorCount: 5,
          componentScore: 95,
          structure: {
            kind: "hub-spoke",
            nodeCount: 5,
            connectorCount: 4
          },
          reuseReadiness: { level: "high", score: 90 }
        },
        {
          id: "radial-hub",
          boundsPt: { x: 0, y: 0, w: 420, h: 380 },
          childCount: 18,
          shapeCount: 16,
          pictureCount: 0,
          connectorCount: 5,
          componentScore: 88,
          structure: {
            kind: "hub-spoke",
            motifs: ["radial-link"],
            motifCounts: { "radial-link": 5 },
            nodeCount: 5,
            connectorCount: 4
          },
          reuseReadiness: { level: "medium", score: 74 }
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "hub-spoke",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["radial-link"] },
      aspectRatio: 1.1,
      areaRatio: 0.28
    },
    asset
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "radial-hub");
  assert.equal(groups[0].structure.motifs[0], "radial-link");
});

test("component template group matcher rejects strict motif groups with incompatible aspect, nodes, or text slots", () => {
  const baseStructure = {
    kind: "hub-spoke",
    motifs: ["radial-link"],
    motifCounts: { "radial-link": 5 },
    nodeCount: 5,
    connectorCount: 4,
    textSlotCount: 5
  };
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "too-wide",
          boundsPt: { x: 0, y: 0, w: 1200, h: 120 },
          childCount: 20,
          shapeCount: 18,
          pictureCount: 0,
          connectorCount: 5,
          textRuns: 5,
          componentScore: 100,
          structure: baseStructure,
          reuseReadiness: { level: "high", score: 90 }
        },
        {
          id: "too-many-nodes",
          boundsPt: { x: 0, y: 0, w: 420, h: 380 },
          childCount: 60,
          shapeCount: 55,
          pictureCount: 0,
          connectorCount: 20,
          textRuns: 5,
          componentScore: 98,
          structure: { ...baseStructure, nodeCount: 18, textSlotCount: 5 },
          reuseReadiness: { level: "high", score: 90 }
        },
        {
          id: "too-many-text-slots",
          boundsPt: { x: 0, y: 0, w: 420, h: 380 },
          childCount: 30,
          shapeCount: 26,
          pictureCount: 0,
          connectorCount: 5,
          textRuns: 18,
          componentScore: 97,
          structure: { ...baseStructure, nodeCount: 5, textSlotCount: 18 },
          reuseReadiness: { level: "high", score: 90 }
        },
        {
          id: "compatible-radial",
          boundsPt: { x: 0, y: 0, w: 420, h: 380 },
          childCount: 20,
          shapeCount: 18,
          pictureCount: 0,
          connectorCount: 5,
          textRuns: 5,
          componentScore: 82,
          structure: baseStructure,
          reuseReadiness: { level: "medium", score: 70 }
        }
      ]
    }
  };

  const groups = recommendComponentGroupsForLayer({
    layer: {
      templateFamily: "hub-spoke",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["radial-link"] },
      aspectRatio: 1.05,
      areaRatio: 0.28,
      diagramUnderstanding: {
        nodeCount: 5,
        textSlotCount: 5
      }
    },
    asset
  });

  assert.deepEqual(groups.map((group) => group.id), ["compatible-radial"]);
  assert.equal(_private.aspectCompatibleForStrictMotif({
    boundsPt: { w: 1200, h: 120 }
  }, {
    aspectRatio: 1.05
  }), false);
  assert.equal(_private.groupNodeCount({ structure: { nodeCount: 18 } }), 18);
  assert.equal(_private.layerTextSlotCount({ diagramUnderstanding: { textSlotCount: 5 } }), 5);
});

test("component template group matcher explains rejected component groups", () => {
  const evaluation = evaluateComponentGroupsForLayer({
    layer: {
      templateFamily: "hub-spoke",
      layerType: "diagram-zone",
      plan: { targetMotifs: ["radial-link"] },
      aspectRatio: 1,
      diagramUnderstanding: { nodeCount: 5, textSlotCount: 5 }
    },
    asset: {
      learningSummary: {
        componentCatalog: [
          {
            id: "arc-cycle",
            boundsPt: { x: 0, y: 0, w: 500, h: 420 },
            childCount: 14,
            shapeCount: 14,
            pictureCount: 0,
            connectorCount: 0,
            componentScore: 90,
            structure: {
              kind: "cycle-loop",
              motifs: ["arc-arrow"],
              motifCounts: { "arc-arrow": 13 },
              nodeCount: 4,
              textSlotCount: 4
            }
          },
          {
            id: "unknown-radial",
            boundsPt: { x: 0, y: 0, w: 420, h: 380 },
            childCount: 18,
            shapeCount: 16,
            pictureCount: 0,
            connectorCount: 5,
            componentScore: 88,
            structure: {
              kind: "hub-spoke",
              nodeCount: 5,
              textSlotCount: 5
            }
          },
          {
            id: "wide-radial",
            boundsPt: { x: 0, y: 0, w: 1200, h: 120 },
            childCount: 18,
            shapeCount: 16,
            pictureCount: 0,
            connectorCount: 5,
            componentScore: 86,
            structure: {
              kind: "hub-spoke",
              motifs: ["radial-link"],
              motifCounts: { "radial-link": 5 },
              nodeCount: 5,
              textSlotCount: 5
            }
          }
        ]
      }
    }
  });

  assert.deepEqual(evaluation.recommendedGroups, []);
  const byId = new Map(evaluation.rejectedGroups.map((group) => [group.id, group.rejectionReasons]));
  assert.ok(byId.get("arc-cycle").includes("target-motif-conflict"));
  assert.ok(byId.get("unknown-radial").includes("strict-motif-evidence-missing"));
  assert.ok(byId.get("wide-radial").includes("strict-aspect-incompatible"));
});

test("component template group matcher accepts timeline child layouts when group bounds are missing", () => {
  const scored = scoreComponentGroup({
    layer: {
      templateFamily: "timeline",
      layerType: "diagram-zone",
      box: { w: 700, h: 120 },
      areaRatio: 0.2
    },
    group: {
      id: "office-timeline-zero-bounds",
      boundsPt: { x: 0, y: 0, w: 0, h: 0 },
      childCount: 30,
      shapeCount: 24,
      pictureCount: 0,
      connectorCount: 4,
      componentScore: 90,
      childLayout: {
        provider: "pptx-group-child-layout-v1",
        children: [
          { kind: "shape", box: { x: 0.05, y: 0.45, w: 0.04, h: 0.08 } },
          { kind: "shape", box: { x: 0.35, y: 0.42, w: 0.04, h: 0.08 } },
          { kind: "shape", box: { x: 0.65, y: 0.50, w: 0.04, h: 0.08 } },
          { kind: "shape", box: { x: 0.92, y: 0.46, w: 0.04, h: 0.08 } }
        ]
      }
    }
  });

  assert.ok(scored.matchScore >= 35);
  assert.ok(scored.matchReasons.includes("timeline-child-layout"));
  assert.ok(!scored.matchReasons.includes("missing-group-bounds"));
});
