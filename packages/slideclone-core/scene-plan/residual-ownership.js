"use strict";

const CONTRACT_VERSION = "1.0";
const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,160}$/;
const OWNER_BY_FLAG = Object.freeze({
  networkDiagramObjectified: "network-native",
  triangleTopologyObjectified: "triangle-topology",
  coverEngineCoreObjectified: "cover-engine-core",
  skillChainOverviewObjectified: "skill-chain-overview",
  horizontalStepChainObjectified: "horizontal-step-chain",
  sparseFlowCardChainSkeletonObjectified: "horizontal-step-chain",
  visualClusterStackObjectified: "visual-cluster-stack",
  wmsRouteChainObjectified: "wms-route-chain",
  prdGenerationFlowObjectified: "prd-generation-flow",
  semanticCycleDiagramObjectified: "semantic-cycle-diagram",
  reviewRiskGateFlowObjectified: "review-risk-gate-flow"
});

function syncCandidateResidualOwnership(images = [], candidates = [], options = {}) {
  if (!Array.isArray(images) || !Array.isArray(candidates)) return false;
  const claims = collectCandidateClaims(candidates, options);
  return applyResidualClaims(images, claims);
}

function collectCandidateClaims(candidates = [], options = {}) {
  if (!Array.isArray(candidates)) return [];
  const flags = normalizeTokens(options.objectifiedFlags);
  if (flags.length === 0) return [];
  const claims = [];
  for (const candidate of candidates) {
    const sourceId = safeToken(candidate?.id, "");
    const source = plainObject(candidate?.source) ? candidate.source : {};
    const claimedByFlags = flags.filter((flag) => source[flag] === true);
    if (!sourceId || claimedByFlags.length === 0) continue;
    const ownerFamily = safeToken(options.ownerFamily, "") || ownerForFlags(claimedByFlags, source);
    claims.push(Object.freeze({
      contractVersion: CONTRACT_VERSION,
      sourceId,
      ownerFamily,
      claimedByFlags: Object.freeze(claimedByFlags),
      dropResidual: options.dropResidual === true || source.dropErasedResidualAfterNativeRebuild === true,
      box: normalizeBox(candidate?.box),
      source
    }));
  }
  return claims;
}

function migrateLegacyResidualOwnership(images = []) {
  if (!Array.isArray(images)) return 0;
  let migrated = 0;
  for (const image of images) {
    const source = plainObject(image?.source) ? image.source : null;
    if (!source) continue;
    const flags = Object.keys(source).filter((key) => /Objectified$/.test(key) && source[key] === true).slice(0, 128);
    const shouldDrop = source.dropErasedResidualAfterNativeRebuild === true;
    if (flags.length === 0 && !shouldDrop) continue;
    const previous = plainObject(source.residualOwnership) ? source.residualOwnership : {};
    const owners = [...new Set([
      ...(Array.isArray(previous.owners) ? previous.owners : []),
      ownerForFlags(flags, source)
    ])].filter((item) => SAFE_TOKEN.test(String(item)));
    const claimedByFlags = flags.length > 0 ? flags : ["dropErasedResidualAfterNativeRebuild"];
    source.residualOwnership = {
      contractVersion: CONTRACT_VERSION,
      owners,
      claimedByFlags: [...new Set([...(Array.isArray(previous.claimedByFlags) ? previous.claimedByFlags : []), ...claimedByFlags])]
        .filter((item) => SAFE_TOKEN.test(String(item))),
      dropResidual: previous.dropResidual === true || shouldDrop,
      claimedBox: previous.claimedBox || normalizeBox(image?.box) || undefined
    };
    migrated += 1;
  }
  return migrated;
}

function shouldDropResidual(value = {}) {
  const source = plainObject(value?.source) ? value.source : value;
  return source?.residualOwnership?.dropResidual === true || source?.dropErasedResidualAfterNativeRebuild === true;
}

function resolveResidualDropDecision(decisions = []) {
  const matched = (Array.isArray(decisions) ? decisions : []).slice(0, 64)
    .find((decision) => plainObject(decision) && decision.matched === true);
  if (!matched) return Object.freeze({ contractVersion: CONTRACT_VERSION, dropResidual: false, owner: null, reasonCode: null });
  const owner = safeToken(matched.owner, "residual-policy");
  const reasonCode = safeToken(matched.reasonCode, "residual.drop-policy-matched");
  return Object.freeze({ contractVersion: CONTRACT_VERSION, dropResidual: true, owner, reasonCode });
}

function recordResidualDropDecision(image = {}, decision = {}) {
  if (!plainObject(image) || !plainObject(decision) || decision.dropResidual !== true) return false;
  const owner = safeToken(decision.owner, "residual-policy");
  const reasonCode = safeToken(decision.reasonCode, "residual.drop-policy-matched");
  const source = plainObject(image.source) ? image.source : {};
  const previous = plainObject(source.residualOwnership) ? source.residualOwnership : {};
  image.source = {
    ...source,
    residualSplitDropped: true,
    residualOwnership: {
      ...previous,
      contractVersion: CONTRACT_VERSION,
      owners: [...new Set([...(Array.isArray(previous.owners) ? previous.owners : []), owner])]
        .filter((item) => SAFE_TOKEN.test(String(item)))
        .slice(0, 128),
      claimedByFlags: [...new Set([...(Array.isArray(previous.claimedByFlags) ? previous.claimedByFlags : []), reasonCode])]
        .filter((item) => SAFE_TOKEN.test(String(item)))
        .slice(0, 128),
      reasonCodes: [...new Set([...(Array.isArray(previous.reasonCodes) ? previous.reasonCodes : []), reasonCode])]
        .filter((item) => SAFE_TOKEN.test(String(item)))
        .slice(0, 128),
      dropResidual: true,
      claimedBox: previous.claimedBox || normalizeBox(image?.box) || undefined
    }
  };
  return true;
}

function applyResidualClaims(images = [], claims = []) {
  if (!Array.isArray(images) || !Array.isArray(claims) || claims.length === 0) return false;
  const claimsById = new Map(claims.filter(validClaim).map((claim) => [claim.sourceId, claim]));
  if (claimsById.size === 0) return false;
  let changed = false;
  for (const image of images) {
    const id = safeToken(image?.id, "");
    const claim = claimsById.get(id);
    if (!claim) continue;
    const previousOwnership = plainObject(image?.source?.residualOwnership) ? image.source.residualOwnership : {};
    const owners = [...new Set([...(Array.isArray(previousOwnership.owners) ? previousOwnership.owners : []), claim.ownerFamily])]
      .filter((item) => SAFE_TOKEN.test(String(item)));
    const claimedByFlags = [...new Set([...(Array.isArray(previousOwnership.claimedByFlags) ? previousOwnership.claimedByFlags : []), ...claim.claimedByFlags])]
      .filter((item) => SAFE_TOKEN.test(String(item)));
    image.source = {
      ...(plainObject(image.source) ? image.source : {}),
      ...claim.source,
      dropErasedResidualAfterNativeRebuild: claim.dropResidual
        ? true
        : claim.source.dropErasedResidualAfterNativeRebuild,
      residualOwnership: {
        contractVersion: CONTRACT_VERSION,
        owners,
        claimedByFlags,
        dropResidual: claim.dropResidual || previousOwnership.dropResidual === true,
        claimedBox: claim.box || previousOwnership.claimedBox || undefined
      },
      layer: {
        ...(plainObject(image?.source?.layer) ? image.source.layer : {}),
        ...(plainObject(claim.source.layer) ? claim.source.layer : {})
      }
    };
    changed = true;
  }
  return changed;
}

function validateResidualOwnership(value) {
  const errors = [];
  if (!plainObject(value)) return { ok: false, errors: ["residual ownership must be an object"] };
  if (value.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (!Array.isArray(value.owners) || value.owners.length === 0 || value.owners.some((item) => !SAFE_TOKEN.test(String(item)))) errors.push("owners must contain safe tokens");
  if (!Array.isArray(value.claimedByFlags) || value.claimedByFlags.length === 0 || value.claimedByFlags.some((item) => !SAFE_TOKEN.test(String(item)))) errors.push("claimedByFlags must contain safe tokens");
  if (typeof value.dropResidual !== "boolean") errors.push("dropResidual must be a boolean");
  if (value.claimedBox !== undefined && normalizeBox(value.claimedBox) === null) errors.push("claimedBox must be a finite positive box");
  return { ok: errors.length === 0, errors };
}

function validClaim(claim) {
  return plainObject(claim) && SAFE_TOKEN.test(String(claim.sourceId || ""))
    && SAFE_TOKEN.test(String(claim.ownerFamily || "")) && Array.isArray(claim.claimedByFlags);
}

function normalizeTokens(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter((item) => SAFE_TOKEN.test(item)))].slice(0, 128);
}

function safeToken(value, fallback) {
  const normalized = String(value || "").trim();
  return SAFE_TOKEN.test(normalized) ? normalized : fallback;
}

function ownerForFlags(flags, source = {}) {
  for (const flag of flags) if (OWNER_BY_FLAG[flag]) return OWNER_BY_FLAG[flag];
  const detector = String(source.detector || "").split("-").slice(0, 4).join("-");
  return safeToken(detector, "legacy-native-rebuilder");
}

function normalizeBox(value) {
  const numbers = [value?.x, value?.y, value?.w, value?.h].map(Number);
  if (!numbers.every(Number.isFinite) || numbers[2] <= 0 || numbers[3] <= 0
      || numbers.some((item) => Math.abs(item) > 1e7)) return null;
  return Object.freeze({ x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] });
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CONTRACT_VERSION,
  applyResidualClaims,
  collectCandidateClaims,
  migrateLegacyResidualOwnership,
  recordResidualDropDecision,
  resolveResidualDropDecision,
  shouldDropResidual,
  syncCandidateResidualOwnership,
  validateResidualOwnership
};
