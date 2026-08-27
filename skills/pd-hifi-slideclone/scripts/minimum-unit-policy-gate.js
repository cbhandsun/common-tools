#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROTECTED_POLICY_KINDS = new Set([
  "decorative-texture",
  "fidelity-crop",
  "standalone-visual-asset"
]);

function parseArgs(argv = process.argv) {
  const args = {
    report: "",
    out: "",
    markdownOut: "",
    minExecutableTargets: 0,
    minProtectedCrops: 0,
    requireNoUnsafe: true,
    requireNoDefer: true,
    requireCompleteExamples: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--report" || arg === "--target-audit") && next) {
      args.report = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--min-executable-targets" && next) {
      args.minExecutableTargets = Number(next);
      index += 1;
    } else if (arg === "--min-protected-crops" && next) {
      args.minProtectedCrops = Number(next);
      index += 1;
    } else if (arg === "--allow-unsafe") {
      args.requireNoUnsafe = false;
    } else if (arg === "--allow-defer") {
      args.requireNoDefer = false;
    } else if (arg === "--allow-truncated-examples") {
      args.requireCompleteExamples = false;
    } else {
      throw new Error(`Unknown minimum-unit-policy-gate argument: ${arg}`);
    }
  }
  if (!args.report) throw new Error("--report is required.");
  return args;
}

function evaluateMinimumUnitPolicyGate(options = {}) {
  const reportFile = path.resolve(String(options.report || ""));
  if (!fs.existsSync(reportFile)) throw new Error(`Target audit report was not found: ${reportFile}`);
  const report = readJson(reportFile);
  const totals = report.totals || {};
  const thresholds = {
    minExecutableTargets: normalizeNonNegativeInt(options.minExecutableTargets, 0),
    minProtectedCrops: normalizeNonNegativeInt(options.minProtectedCrops, 0),
    requireNoUnsafe: options.requireNoUnsafe !== false,
    requireNoDefer: options.requireNoDefer !== false,
    requireCompleteExamples: options.requireCompleteExamples !== false
  };
  const rows = collectRows(report);
  const findings = [];

  if (report.ok !== true) findings.push(finding("report-not-ok", "target audit report did not pass its own ok flag"));

  if (numberOrZero(totals.executableTargets) < thresholds.minExecutableTargets) {
    findings.push(finding(
      "too-few-executable-targets",
      `executableTargets ${numberOrZero(totals.executableTargets)} is below required ${thresholds.minExecutableTargets}`
    ));
  }
  if (numberOrZero(totals.protectedCropTargets) < thresholds.minProtectedCrops) {
    findings.push(finding(
      "too-few-protected-crops",
      `protectedCropTargets ${numberOrZero(totals.protectedCropTargets)} is below required ${thresholds.minProtectedCrops}`
    ));
  }
  if (thresholds.requireNoUnsafe && numberOrZero(totals.unsafeRejectedTargets) > 0) {
    findings.push(finding("unsafe-targets-remain", `unsafeRejectedTargets remain: ${numberOrZero(totals.unsafeRejectedTargets)}`));
  }
  if (thresholds.requireNoDefer && numberOrZero(totals.deferTargets) > 0) {
    findings.push(finding("deferred-targets-remain", `deferTargets remain: ${numberOrZero(totals.deferTargets)}`));
  }

  const truncated = findTruncatedDeckExamples(report);
  if (thresholds.requireCompleteExamples && truncated.length > 0) {
    findings.push(finding(
      "truncated-target-examples",
      `target examples are truncated for ${truncated.length} deck(s); rerun audit with a larger --max-examples`,
      { decks: truncated }
    ));
  }

  for (const row of rows.executableTargets) {
    const policyKind = safeString(row.expressionPolicy?.kind);
    const reasons = safeArray(row.reasons);
    const structuralReasons = safeArray(row.structural?.reasons);
    if (PROTECTED_POLICY_KINDS.has(policyKind)) {
      findings.push(rowFinding(
        "protected-asset-entered-rebuild",
        "a protected crop policy entered executable plugin/native reconstruction",
        row
      ));
    }
    if (looksLikeUnsafeAsset(row) && !hasSemanticStructureEvidence(row)) {
      findings.push(rowFinding(
        "asset-like-target-without-semantic-structure",
        "an icon, illustration, screenshot, or decorative asset entered reconstruction without semantic structure evidence",
        row
      ));
    }
    if (!hasSemanticStructureEvidence(row)) {
      findings.push(rowFinding(
        "executable-target-missing-structure-proof",
        "an executable target lacks explicit semantic-structure proof",
        row
      ));
    }
  }

  for (const row of rows.protectedCropTargets) {
    if (row.structural?.executable === true && !PROTECTED_POLICY_KINDS.has(safeString(row.expressionPolicy?.kind))) {
      findings.push(rowFinding(
        "structural-target-protected-without-crop-policy",
        "a structural target was protected as crop without a protective policy kind",
        row
      ));
    }
  }

  const gate = {
    provider: "minimum-unit-policy-gate-v1",
    createdAt: new Date().toISOString(),
    report: reportFile,
    status: findings.length === 0 ? "passed" : "failed",
    thresholds,
    summary: {
      reportOk: report.ok === true,
      decks: numberOrZero(totals.decks),
      pages: numberOrZero(totals.pages),
      images: numberOrZero(totals.images),
      embeddedPluginTargets: numberOrZero(totals.embeddedPluginTargets),
      executableTargets: numberOrZero(totals.executableTargets),
      protectedCropTargets: numberOrZero(totals.protectedCropTargets),
      unsafeRejectedTargets: numberOrZero(totals.unsafeRejectedTargets),
      deferTargets: numberOrZero(totals.deferTargets),
      checkedExecutableTargets: rows.executableTargets.length,
      checkedProtectedCropTargets: rows.protectedCropTargets.length,
      findingCount: findings.length
    },
    findings
  };
  if (options.out) writeText(options.out, `${JSON.stringify(gate, null, 2)}\n`);
  if (options.markdownOut) writeText(options.markdownOut, renderMarkdown(gate));
  return gate;
}

function collectRows(report = {}) {
  const executableTargets = [];
  const protectedCropTargets = [];
  for (const deck of safeArray(report.decks)) {
    for (const row of safeArray(deck.executableTargets)) executableTargets.push({ deck: deck.deck, ...row });
    for (const row of safeArray(deck.protectedCropTargets)) protectedCropTargets.push({ deck: deck.deck, ...row });
  }
  return { executableTargets, protectedCropTargets };
}

function findTruncatedDeckExamples(report = {}) {
  const result = [];
  for (const deck of safeArray(report.decks)) {
    const summary = deck.summary || {};
    const executableTotal = numberOrZero(summary.executableTargets);
    const protectedTotal = numberOrZero(summary.protectedCropTargets);
    const executableListed = safeArray(deck.executableTargets).length;
    const protectedListed = safeArray(deck.protectedCropTargets).length;
    if (executableListed < executableTotal || protectedListed < protectedTotal) {
      result.push({
        deck: safeString(deck.deck),
        executableListed,
        executableTotal,
        protectedListed,
        protectedTotal
      });
    }
  }
  return result;
}

function looksLikeUnsafeAsset(row = {}) {
  const text = [
    row.detector,
    row.layerType,
    row.expressionFamily,
    row.structural?.expressionFamily,
    row.expressionPolicy?.expressionFamily,
    row.expressionForm,
    row.expressionSubtype,
    row.recommendedAction
  ].map(safeString).join(" ").toLowerCase();
  return /pictorial-asset|icon-or-illustration|illustration-zone|visual-example|screenshot|screen-capture|ui-capture|photo|bitmap|logo|brand|decorative|texture|图标|截图|插画/.test(text);
}

function hasSemanticStructureEvidence(row = {}) {
  const reasons = [
    ...safeArray(row.reasons),
    ...safeArray(row.structural?.reasons),
    ...safeArray(row.expressionPolicy?.reasons)
  ];
  if (reasons.includes("semantic-structure-evidence")) return true;
  if (reasons.includes("structured-expression-with-semantic-atoms")) return true;
  const structural = row.structural || {};
  const expressionFamily = [
    row.expressionFamily,
    structural.expressionFamily,
    row.expressionPolicy?.expressionFamily
  ].map(safeString).join(" ").toLowerCase();
  if (/data-chart|structured-process|layout-grid|relationship-diagram|generic-structured-diagram/.test(expressionFamily)) return true;
  return numberOrZero(structural.nodeCount) >= 2
    || numberOrZero(structural.connectorCount) >= 1
    || /chart-table-matrix-minimum-unit|diagram-flow-relationship-minimum-unit/.test(reasons.join(" "));
}

function renderMarkdown(gate = {}) {
  const lines = [
    "# Minimum Unit Policy Gate",
    "",
    `Status: ${gate.status || "unknown"}`,
    `Executable structural targets: ${gate.summary?.executableTargets || 0}`,
    `Protected crop targets: ${gate.summary?.protectedCropTargets || 0}`,
    `Unsafe/deferred: ${gate.summary?.unsafeRejectedTargets || 0}/${gate.summary?.deferTargets || 0}`,
    `Findings: ${gate.summary?.findingCount || 0}`,
    "",
    "Rule: semantic charts, tables, matrices, flows, and relationship diagrams may be rebuilt as native or plugin components. Obvious icons, illustrations, screenshots, decorative textures, and standalone visual examples must remain fidelity crops unless semantic structure evidence is explicit.",
    ""
  ];
  for (const item of safeArray(gate.findings).slice(0, 50)) {
    const target = item.target ? ` (${item.target.deck || ""} p${item.target.slide || "?"} ${item.target.imageId || ""})` : "";
    lines.push(`- ${item.code}: ${item.message}${target}`);
  }
  return `${lines.join("\n")}\n`;
}

function rowFinding(code, message, row) {
  return finding(code, message, {
    target: {
      deck: safeString(row.deck),
      slide: numberOrZero(row.slide),
      imageId: safeString(row.imageId),
      decision: safeString(row.decision),
      policyKind: safeString(row.expressionPolicy?.kind),
      detector: safeString(row.detector),
      expressionFamily: safeString(row.expressionFamily || row.structural?.expressionFamily || row.expressionPolicy?.expressionFamily),
      expressionForm: safeString(row.expressionForm),
      expressionSubtype: safeString(row.expressionSubtype)
    }
  });
}

function finding(code, message, extra = {}) {
  return { code, message, ...extra };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function writeText(file, text) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, "utf8");
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const gate = evaluateMinimumUnitPolicyGate(args);
    console.log(JSON.stringify(gate, null, 2));
    if (gate.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  PROTECTED_POLICY_KINDS,
  collectRows,
  evaluateMinimumUnitPolicyGate,
  findTruncatedDeckExamples,
  hasSemanticStructureEvidence,
  parseArgs,
  renderMarkdown
};
