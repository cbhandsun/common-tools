"use strict";

const { loadTeamComponentCatalog } = require("../slideclone-core/archetypes/team-component-catalog");
const { createTeamComponentAnalysis } = require("../slideclone-core/archetypes/team-component-analysis");
const { buildComponentStrategyIndex, buildComponentAssetIndex } = require("../slideclone-core/archetypes/component-strategy-annotator");

function createImageComponentResolver({ root, implementation }) {
  if (root === undefined || root === "") return undefined;
  const services = implementation.getComponentAnalysisServices();
  const { inventory } = loadTeamComponentCatalog({ root, readRegistry: services.readComponentAssetRegistry, registryCandidates: services.registryCandidates });
  return createTeamComponentAnalysis({
    inventory,
    rebuildDeckFromWorkDir: implementation.rebuildDeckFromWorkDir,
    searchIrComponentCandidates: services.searchIrComponentCandidates,
    buildComponentAssetManifest: services.buildComponentAssetManifest,
    buildComponentStrategyIndex,
    buildComponentAssetIndex
  }).resolve;
}

module.exports = { createImageComponentResolver };
