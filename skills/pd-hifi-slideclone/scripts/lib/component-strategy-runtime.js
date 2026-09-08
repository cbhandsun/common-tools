"use strict";

module.exports = {
  ...require("./component-strategy-annotator"),
  getComponentAnalysisServices() {
    return {
      ...require("./component-asset-store"),
      ...require("./component-asset-matcher"),
      searchIrComponentCandidates: require("../../../../packages/slideclone-native-engine/scripts/component-candidate-search").searchIrComponentCandidates
    };
  }
};
