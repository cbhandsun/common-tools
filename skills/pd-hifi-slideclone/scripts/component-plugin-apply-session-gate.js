"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROVIDER = "component-plugin-apply-session-gate-v1";

function parseArgs(argv) {
  const args = {
    report: "",
    out: "",
    requiredFulfilledMotifs: [],
    failOnPending: false,
    allowPending: false,
    minFulfilled: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--report") {
      args.report = takeValue(argv, (index += 1), token);
    } else if (token === "--out") {
      args.out = takeValue(argv, (index += 1), token);
    } else if (token === "--require-fulfilled-motifs" || token === "--required-motifs") {
      args.requiredFulfilledMotifs = takeValue(argv, (index += 1), token);
    } else if (token === "--fail-on-pending") {
      args.failOnPending = true;
    } else if (token === "--allow-pending") {
      args.allowPending = true;
    } else if (token === "--min-fulfilled") {
      args.minFulfilled = takeValue(argv, (index += 1), token);
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.help && !args.report) {
    throw new Error("--report is required");
  }
  args.requiredFulfilledMotifs = normalizeMotifs(args.requiredFulfilledMotifs);
  args.minFulfilled = normalizeNonNegativeInteger(args.minFulfilled, 0, "--min-fulfilled");
  return args;
}

function buildPluginApplySessionGate(options) {
  const reportFile = path.resolve(String(options.report || ""));
  if (!reportFile || !fs.existsSync(reportFile)) {
    throw new Error(`Plugin apply session report was not found: ${reportFile}`);
  }

  const report = readJsonFile(reportFile);
  const fulfillment = report && typeof report.fulfillment === "object" ? report.fulfillment : {};
  const rows = Array.isArray(fulfillment.rows) ? fulfillment.rows.map(normalizeFulfillmentRow).filter((row) => row.motif) : [];
  const fulfilledRows = rows.filter((row) => row.status === "fulfilled");
  const pendingRows = rows.filter((row) => row.status !== "fulfilled");
  const byMotif = new Map(rows.map((row) => [row.motif, row]));
  const requiredFulfilledMotifs = normalizeMotifs(options.requiredFulfilledMotifs || []);
  const missingRequiredMotifs = requiredFulfilledMotifs.filter((motif) => byMotif.get(motif)?.status !== "fulfilled");
  const minFulfilled = normalizeNonNegativeInteger(options.minFulfilled, 0, "minFulfilled");
  const failOnPending = options.failOnPending === true && options.allowPending !== true;
  const failures = [];

  if (missingRequiredMotifs.length > 0) {
    failures.push({
      code: "required-motif-not-fulfilled",
      message: "One or more required motifs are not fulfilled by harvested plugin component structures.",
      motifs: missingRequiredMotifs
    });
  }
  if (failOnPending && pendingRows.length > 0) {
    failures.push({
      code: "pending-motifs",
      message: "Pending motifs remain in the plugin apply session fulfillment report.",
      motifs: pendingRows.map((row) => row.motif)
    });
  }
  if (fulfilledRows.length < minFulfilled) {
    failures.push({
      code: "min-fulfilled-not-met",
      message: "The plugin apply session did not fulfill enough target motifs.",
      expected: minFulfilled,
      actual: fulfilledRows.length
    });
  }

  const gate = {
    provider: PROVIDER,
    createdAt: new Date().toISOString(),
    report: reportFile,
    passed: failures.length === 0,
    summary: {
      targetMotifs: rows.length,
      fulfilled: fulfilledRows.length,
      pending: pendingRows.length,
      requiredFulfilledMotifs,
      missingRequiredMotifs,
      minFulfilled,
      failOnPending
    },
    failures,
    pendingRows,
    fulfilledRows
  };

  if (options.out) {
    writeJsonFile(path.resolve(String(options.out)), gate);
  }
  return gate;
}

function normalizeFulfillmentRow(row) {
  const source = row && typeof row === "object" ? row : {};
  return {
    motif: safeString(source.motif),
    status: source.status === "fulfilled" ? "fulfilled" : "pending",
    structureMatches: normalizeNonNegativeInteger(source.structureMatches, 0, "structureMatches"),
    relatedActions: normalizeRelatedActions(source)
  };
}

function normalizeRelatedActions(source = {}) {
  const rawActions = Array.isArray(source.relatedActions)
    ? source.relatedActions
    : Array.isArray(source.actions)
      ? source.actions
      : [];
  return rawActions
    .map((action) => normalizeRelatedAction(action, source.motif))
    .filter((action) => action.targetMotif || action.provider);
}

function normalizeRelatedAction(action, fallbackMotif = "") {
  const source = action && typeof action === "object" ? action : {};
  return {
    id: safeString(source.id || source.order),
    provider: safeString(source.provider),
    kind: safeString(source.kind),
    targetMotif: safeString(source.targetMotif || fallbackMotif),
    searchQuery: safeString(source.searchQuery || source.searchText)
  };
}

function normalizeMotifs(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => safeString(item)).filter(Boolean))];
}

function normalizeNonNegativeInteger(value, fallback, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    if (value === undefined || value === null || value === "") return fallback;
    throw new Error(`${label} must be a finite number`);
  }
  if (number < 0) {
    throw new Error(`${label} must be non-negative`);
  }
  return Math.floor(number);
}

function safeString(value) {
  return String(value || "").trim();
}

function takeValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON file ${file}: ${error.message}`);
  }
}

function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function printHelp() {
  process.stdout.write(`Usage: node component-plugin-apply-session-gate.js --report <plugin-apply-session.json> [options]

Options:
  --out <file>                         Write the gate report JSON.
  --require-fulfilled-motifs <list>    Comma-separated motifs that must be fulfilled.
  --min-fulfilled <n>                  Require at least n fulfilled motifs.
  --fail-on-pending                    Fail if any target motif is still pending.
  --allow-pending                      Override --fail-on-pending.
`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  const gate = buildPluginApplySessionGate(args);
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  return gate.passed ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  buildPluginApplySessionGate,
  _private: {
    normalizeRelatedActions,
    normalizeFulfillmentRow,
    normalizeMotifs
  }
};
