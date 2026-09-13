"use strict";

function hybridRebuildStrategyProfile(options = {}) {
  return {
    name: "hybrid-native-editable-with-local-fidelity-crops",
    mode: options.preserveGraphics ? "fidelity-first-hybrid" : "native-editable-first",
    editablePolicy: {
      text: "native-editable-textboxes",
      simpleShapes: "native-office-shapes-when-confident",
      connectors: "native-office-connectors-when-confident",
      statusIcons: options.vectorizeStatusIcons ? "native-icon-approximation-opt-in" : "local-fidelity-crops-by-default",
      diagrams: "preserve-as-local-crops-unless-native-structure-is-confident",
      charts: "preserve-as-local-crops-unless-chart-series-are-reconstructed",
      screenshots: "preserve-as-local-crops",
      layerText: options.objectifyLayerText ? "native-text-over-text-erased-residual-crops-for-high-confidence-layers" : "preserve-inside-fidelity-crops",
      layerContainers: options.objectifyLayerContainers ? "native-card-and-node-containers-over-residual-crops" : "preserve-containers-inside-fidelity-crops",
      layerConnectors: options.objectifyLayerConnectors ? "native-connectors-between-high-confidence-layer-containers" : "preserve-connectors-inside-fidelity-crops",
      networkDiagrams: options.objectifyLayerConnectors ? "native-radial-nodes-rays-and-dense-center-emblems-when-confident" : "preserve-network-diagrams-inside-fidelity-crops",
      hierarchyDiagrams: options.objectifyLayerConnectors ? "native-three-column-hierarchy-cards-connectors-and-root-node-when-confident" : "preserve-hierarchy-diagrams-inside-fidelity-crops",
      triangleTopologyDiagrams: options.objectifyLayerConnectors ? "native-triangle-edges-arrows-and-center-with-residual-icon-label-crops-when-confident" : "preserve-triangle-topology-diagrams-inside-fidelity-crops",
      coverEngineCoreDiagrams: options.objectifyLayerConnectors ? "native-cover-engine-core-axis-shield-and-label-cards-when-confident" : "preserve-cover-engine-core-diagrams-inside-fidelity-crops",
      skillChainOverviews: options.objectifyLayerConnectors ? "native-skill-stage-cards-route-lines-and-rails-with-input-and-document-decoration-crops-preserved" : "preserve-skill-chain-overviews-inside-fidelity-crops",
      assetHubCycleIllustrations: options.objectifyAssetHubInputIcons ? "native-asset-hub-connectors-shield-input-icons-and-output-gems-when-cycle-evidence-is-confident" : "native-asset-hub-connectors-shield-and-output-gems-with-input-icon-crops-preserved",
      linearProcessDiagrams: options.objectifyLayerConnectors ? "native-horizontal-stage-cards-and-connectors-when-row-evidence-is-confident" : "preserve-linear-process-diagrams-inside-fidelity-crops",
      prdGenerationFlows: options.objectifyLayerConnectors ? "native-document-card-generation-node-and-connectors-with-screenshot-crops-preserved" : "preserve-prd-generation-flows-inside-fidelity-crops",
      prototypeValidationFlows: options.objectifyLayerConnectors ? "native-validation-connectors-and-label-pills-with-screenshot-and-icon-crops-preserved" : "preserve-prototype-validation-flows-inside-fidelity-crops",
      demandUnderstandingFlows: options.objectifyLayerConnectors ? "native-input-materials-lens-output-cards-and-branch-connectors-when-semantic-evidence-is-confident" : "preserve-demand-understanding-flows-inside-fidelity-crops",
      reviewRiskGateFlows: options.objectifyLayerConnectors ? "native-prd-approved-risk-cards-routing-lines-and-scanner-gem-facets-when-evidence-is-confident" : "preserve-review-risk-gate-flows-inside-fidelity-crops",
      residualPrimitiveErasure: options.eraseObjectifiedLayerPrimitives ? "erase-native-rebuilt-containers-and-connectors-from-residual-crops" : "keep-objectified-primitives-visible-inside-residual-crops",
      residualCropSplitting: options.splitErasedResidualCrops ? "split-diagram-residual-crops-after-native-primitive-erasure" : "keep-erased-residual-crops-at-original-region-bounds",
      valueBanners: options.objectifyValueBanners ? "native-solid-or-gradient-background-shapes-when-color-is-stable" : "preserve-value-banners-as-local-crops",
      tableGrid: options.objectifyTableGrid ? "native-grid-lines-over-table-zone-residual-crops" : "preserve-table-grid-inside-fidelity-crops",
      quadrantDividers: options.objectifyTableGrid ? "native-cross-dividers-over-icon-quadrant-residual-crops" : "preserve-quadrant-dividers-inside-fidelity-crops"
    },
    guardrails: [
      "avoid-full-slide-raster-fallbacks",
      "avoid-duplicate-editable-text-inside-fidelity-crops",
      "prefer-visual-fidelity-over-forced-native-reconstruction-for-complex-diagrams",
      "record-detector-and-reason-for-every-non-editable-local-crop"
    ],
    borrowedPatterns: [
      {
        source: "ppt-master",
        lesson: "separate native DrawingML reconstruction from snapshot/fidelity fallbacks"
      },
      {
        source: "frontend-slides / huashu-design / html-ppt-skill",
        lesson: "treat visual style and preview verification as first-class quality signals"
      },
      {
        source: "baoyu slide workflow",
        lesson: "persist reproducible run metadata instead of relying on manual memory"
      }
    ]
  };
}

module.exports = {
  hybridRebuildStrategyProfile
};
