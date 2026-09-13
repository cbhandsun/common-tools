"use strict";

const { createWorkflowComparisonMatrixFactory } = require("./native-rebuild-workflow-comparison-matrix");
const { createWorkflowCollaborationMultiplierFactory } = require("./native-rebuild-workflow-collaboration-multiplier");
const { createWorkflowChallengeTriadFactory } = require("./native-rebuild-workflow-challenge-triad");
const { createWorkflowSupplyChainFactory } = require("./native-rebuild-workflow-supply-chain");
const { createWorkflowKpiPrdFactory } = require("./native-rebuild-workflow-kpi-prd");
const { createWorkflowDemandUnderstandingFactory } = require("./native-rebuild-workflow-demand-understanding");

function createWorkflowSpecializedPagesFactory(dependencies = {}) {
  const comparison = createWorkflowComparisonMatrixFactory(dependencies);
  const sharedDependencies = { ...dependencies, ...comparison };
  const collaboration = createWorkflowCollaborationMultiplierFactory(sharedDependencies);
  const challengeTriad = createWorkflowChallengeTriadFactory(sharedDependencies);
  const supplyChain = createWorkflowSupplyChainFactory(sharedDependencies);
  const kpiPrd = createWorkflowKpiPrdFactory(sharedDependencies);
  const demandUnderstanding = createWorkflowDemandUnderstandingFactory(sharedDependencies);

  return {
    ...comparison,
    ...collaboration,
    ...challengeTriad,
    ...supplyChain,
    ...kpiPrd,
    ...demandUnderstanding
  };
}

module.exports = {
  createWorkflowSpecializedPagesFactory
};
