"use strict";

const api = {
  ...require("./diagram-geometry"),
  ...require("./diagram-visual-topology"),
  ...require("./diagram-archetypes"),
  ...require("./diagram-residual-analysis"),
  ...require("./diagram-metrics"),
  ...require("./diagram-component-strategy"),
  ...require("./diagram-structure-signature"),
  ...require("./diagram-understanding-entry"),
};
const { understandDiagramLayer, inferArchetype, inferConnectors, inferNodes, inferVisualAtomConnectors, inferVisualAtomNodes, inferVisualGridStructure, inferComponentStrategy, inferExpressionFamily, inferTargetMotifs, readinessFor, textBoxesInside } = api;

module.exports = {
  understandDiagramLayer,
  _private: {
    inferArchetype,
    inferConnectors,
    inferNodes,
    inferVisualAtomConnectors,
    inferVisualAtomNodes,
    inferVisualGridStructure,
    inferComponentStrategy,
    inferExpressionFamily,
    inferTargetMotifs,
    readinessFor,
    textBoxesInside
  }
};
