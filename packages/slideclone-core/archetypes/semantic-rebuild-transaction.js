// @ts-check
"use strict";

const MAX_ADMITTED_SHAPES = 10_000;
const MAX_PAGE_GRAPH_NODES = 100_000;
const MAX_PAGE_GRAPH_DEPTH = 64;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {Record<string, unknown>} page */
function validatePageCloneVolume(page) {
  /** @type {{ value: unknown, depth: number }[]} */
  const pending = [{ value: page, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    nodes += 1;
    if (nodes > MAX_PAGE_GRAPH_NODES || current.depth > MAX_PAGE_GRAPH_DEPTH) {
      throw new RangeError("semantic rebuild page exceeds the clone volume limit");
    }
    if (Array.isArray(current.value) && current.value.length > MAX_ADMITTED_SHAPES) {
      throw new RangeError("semantic rebuild page array exceeds the clone volume limit");
    }
    if (ArrayBuffer.isView(current.value) || current.value instanceof ArrayBuffer) continue;
    const values = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const value of values) pending.push({ value, depth: current.depth + 1 });
  }
}

/** @param {unknown} value @param {string} stage @returns {Record<string, unknown>} */
function validateStageResult(value, stage) {
  if (!isRecord(value)) throw new TypeError(`semantic rebuild ${stage} result is invalid`);
  return value;
}

/** @param {unknown} value @returns {{ shapes: Record<string, unknown>[], evidence: Record<string, unknown> & { rejected: number } }} */
function validateAdmission(value) {
  if (!isRecord(value) || !Array.isArray(value.shapes) || value.shapes.length > MAX_ADMITTED_SHAPES || !isRecord(value.evidence)) {
    throw new TypeError("semantic rebuild admission result is invalid");
  }
  if (value.shapes.some((shape) => !isRecord(shape))) throw new TypeError("semantic rebuild admission shapes are invalid");
  const rejected = value.evidence.rejected;
  if (typeof rejected !== "number" || !Number.isSafeInteger(rejected) || rejected < 0 || rejected > MAX_ADMITTED_SHAPES) {
    throw new TypeError("semantic rebuild admission evidence is invalid");
  }
  return {
    shapes: structuredClone(value.shapes),
    evidence: { ...structuredClone(value.evidence), rejected }
  };
}

/** @param {unknown} check */
async function throwIfCancelled(check) {
  if (check === undefined) return;
  if (typeof check !== "function") throw new TypeError("semantic rebuild cancellation check is invalid");
  let cancelled;
  try {
    cancelled = await check();
  } catch {
    throw new Error("semantic rebuild cancellation could not be verified");
  }
  if (typeof cancelled !== "boolean") throw new TypeError("semantic rebuild cancellation result is invalid");
  if (cancelled) throw new Error("editable job was cancelled");
}

/**
 * Runs a mutating semantic reconstruction pipeline against an isolated page.
 * The caller publishes the returned page only when `published` is true.
 *
 * @param {unknown} input
 */
async function runSemanticRebuildTransaction(input) {
  if (!isRecord(input) || !isRecord(input.page) || typeof input.rebuild !== "function") {
    throw new TypeError("semantic rebuild transaction input is invalid");
  }
  for (const stage of ["refine", "connect", "admit"]) {
    if (input[stage] !== undefined && typeof input[stage] !== "function") {
      throw new TypeError(`semantic rebuild ${stage} stage is invalid`);
    }
  }
  if (input.isCancellationRequested !== undefined && typeof input.isCancellationRequested !== "function") {
    throw new TypeError("semantic rebuild cancellation check is invalid");
  }

  const originalPage = input.page;
  validatePageCloneVolume(originalPage);
  await throwIfCancelled(input.isCancellationRequested);
  const draft = structuredClone(originalPage);
  if (!isRecord(draft)) throw new TypeError("semantic rebuild page is invalid");

  const rebuildResult = validateStageResult(await input.rebuild({ page: draft }), "rebuild");
  if (typeof rebuildResult.matched !== "boolean") throw new TypeError("semantic rebuild match result is invalid");
  await throwIfCancelled(input.isCancellationRequested);
  if (!rebuildResult.matched) {
    return Object.freeze({ status: "unmatched", published: false, page: originalPage, rebuildResult: structuredClone(rebuildResult) });
  }

  let refinement;
  if (typeof input.refine === "function") {
    refinement = validateStageResult(await input.refine({ page: draft, rebuildResult }), "refine");
    await throwIfCancelled(input.isCancellationRequested);
  }

  let connection;
  if (typeof input.connect === "function") {
    connection = validateStageResult(await input.connect({ page: draft, rebuildResult, refinement }), "connect");
    await throwIfCancelled(input.isCancellationRequested);
  }

  let admissionEvidence;
  if (typeof input.admit === "function") {
    const admission = validateAdmission(await input.admit({ page: draft, rebuildResult, refinement, connection }));
    admissionEvidence = admission.evidence;
    await throwIfCancelled(input.isCancellationRequested);
    if (admissionEvidence.rejected > 0) {
      return Object.freeze({
        status: "rejected",
        published: false,
        page: originalPage,
        rebuildResult: structuredClone(rebuildResult),
        ...(refinement === undefined ? {} : { refinement: structuredClone(refinement) }),
        ...(connection === undefined ? {} : { connection: structuredClone(connection) }),
        admissionEvidence
      });
    }
    draft.shapes = admission.shapes;
  }

  return Object.freeze({
    status: "published",
    published: true,
    page: draft,
    rebuildResult: structuredClone(rebuildResult),
    ...(refinement === undefined ? {} : { refinement: structuredClone(refinement) }),
    ...(connection === undefined ? {} : { connection: structuredClone(connection) }),
    ...(admissionEvidence === undefined ? {} : { admissionEvidence })
  });
}

module.exports = { MAX_ADMITTED_SHAPES, runSemanticRebuildTransaction };
