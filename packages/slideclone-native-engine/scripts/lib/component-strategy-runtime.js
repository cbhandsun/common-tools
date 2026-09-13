"use strict";

module.exports = {
  ...require("./component-strategy-annotator"),
  getComponentAnalysisServices() {
    return {
      ...require("./component-asset-store"),
      ...require("./component-asset-matcher"),
      searchIrComponentCandidates: require("../component-candidate-search").searchIrComponentCandidates
    };
  }
};
