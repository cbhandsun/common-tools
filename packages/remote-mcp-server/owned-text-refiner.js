"use strict";
const { createOwnedTextProbe } = require("../slideclone-core/owned-text-probe");
const { createOwnedTextRefiner } = require("../slideclone-core/owned-text-refinement");
const { planOwnedTextFit } = require("../slideclone-core/owned-text-advance");
const { createOwnedTextRuntimeProfile } = require("../slideclone-core/owned-text-runtime-profile");
const { validateDeckIr } = require("../slideclone-core/deck-ir-admission");
const { auditWorkerSemanticEditability: auditSemanticEditability } = require("../slideclone-worker-adapter/worker-relationship-policy");
const { createNativeOnlyOwnedTextRefiner } = require("../slideclone-worker-adapter/native-only-owned-text-refinement");
const { finalRefinementQualityAcceptable } = require("../slideclone-worker-adapter/team-worker");
const renderPresentation = require("../slideclone-core/render-libreoffice");

function createWorkerOwnedTextRefiner({ builderExecutable }) {
  const describeRenderer = createOwnedTextRuntimeProfile({ builderExecutable });
  const probeOwnedTexts = createOwnedTextProbe({ renderPresentation, describeRenderer, validateDeck: validateDeckIr });
  const refineOwnedTexts = createOwnedTextRefiner({ probeOwnedTexts, validateDeck: validateDeckIr,
    auditSemantic: auditSemanticEditability, qualityAcceptable: finalRefinementQualityAcceptable, planTextFit: planOwnedTextFit,
    prepareSourceTargets: probeOwnedTexts.prepareTargets });
  return createNativeOnlyOwnedTextRefiner({ refineOwnedTexts, validateDeck: validateDeckIr });
}
module.exports = { createWorkerOwnedTextRefiner };
