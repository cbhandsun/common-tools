"use strict";
const { readPng } = require("../slideclone-core/png");
const { admitSemanticArcs } = require("../slideclone-core/semantic-arc-admission");
const { fitSourceHorizontalConnectors } = require("../slideclone-core/source-horizontal-connector-fit");
const { fitKnowledgeGraphRelations } = require("../slideclone-core/knowledge-graph-relation-fit");
const { fitSourceSemanticCurves } = require("../slideclone-core/source-semantic-curves");

function admitImageSemanticShapes({ page, slideSize, sourceFile }) {
  const image = readPng(sourceFile);
  const fitted = fitSourceHorizontalConnectors({ shapes: page.shapes, slideSize, image });
  page.shapes = fitted.shapes;
  const relations = fitKnowledgeGraphRelations({ shapes: page.shapes, slideSize, image });
  page.shapes = relations.shapes;
  const curves = fitSourceSemanticCurves({ shapes: page.shapes, slideSize, image });
  page.shapes = curves.shapes;
  const admission = admitSemanticArcs({ page, slideSize, image });
  const relationFit = { upperAccepted: relations.evidence.upperAccepted, lowerAccepted: relations.evidence.lowerAccepted };
  return { ...admission, evidence: { ...admission.evidence, horizontalConnectorFit: fitted.evidence, relationFit, sourceCurveFit: curves.evidence } };
}
module.exports = { admitImageSemanticShapes };
