"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildComponentReplacementApplyPlan
} = require("./component-replacement-apply-plan");
const {
  applyComponentReplacementsWithPowerPoint,
  parsePowerPointComponentReport
} = require("./lib/powerpoint-component-replacement");
const {
  applyComponentReplacementsWithOpenXml,
  parseOpenXmlComponentReport
} = require("./lib/openxml-component-replacement");

function parseArgs(argv) {
  const args = {
    plan: "",
    pptx: "",
    inventory: "",
    out: "",
    planOut: "",
    reportOut: "",
    engine: "openxml",
    allowMissing: false,
    dryRun: false,
    failOnMissingSamples: false,
    skillRoot: path.resolve(__dirname, "..")
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--plan" && next) {
      args.plan = next;
      i += 1;
    } else if (arg === "--pptx" && next) {
      args.pptx = next;
      i += 1;
    } else if ((arg === "--inventory" || arg === "--component-inventory") && next) {
      args.inventory = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--plan-out" && next) {
      args.planOut = next;
      i += 1;
    } else if (arg === "--report-out" && next) {
      args.reportOut = next;
      i += 1;
    } else if (arg === "--engine" && next) {
      args.engine = next;
      i += 1;
    } else if (arg === "--allow-missing") {
      args.allowMissing = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--fail-on-missing-samples") {
      args.failOnMissingSamples = true;
    } else if (arg === "--skill-root" && next) {
      args.skillRoot = next;
      i += 1;
    } else {
      throw new Error(`Unknown component-replacement-apply argument: ${arg}`);
    }
  }
  if (!args.plan && !args.pptx) throw new Error("Either --plan or --pptx is required.");
  if (args.pptx && !args.inventory) throw new Error("--inventory is required when --pptx is used.");
  if (!args.out && !args.dryRun) throw new Error("--out is required unless --dry-run is set.");
  return args;
}

async function runComponentReplacementApply(options = {}) {
  const args = normalizeOptions(options);
  const planResult = args.plan
    ? { planFile: path.resolve(args.plan), plan: readJson(args.plan), generated: false }
    : createApplyPlan(args);
  const report = await applyWithSelectedEngine({
    ...args,
    planFile: planResult.planFile,
    runner: args.runner
  });
  const result = {
    provider: "component-replacement-apply-orchestrator-v1",
    createdAt: new Date().toISOString(),
    planFile: planResult.planFile,
    generatedPlan: planResult.generated,
    outFile: args.out ? path.resolve(args.out) : null,
    report
  };
  if (args.reportOut) {
    const reportOut = path.resolve(args.reportOut);
    fs.mkdirSync(path.dirname(reportOut), { recursive: true });
    fs.writeFileSync(reportOut, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function normalizeOptions(options) {
  const args = {
    ...options,
    engine: normalizeEngine(options.engine),
    skillRoot: path.resolve(String(options.skillRoot || path.join(__dirname, ".."))),
    allowMissing: options.allowMissing === true,
    dryRun: options.dryRun === true,
    failOnMissingSamples: options.failOnMissingSamples === true
  };
  if (!args.plan && !args.pptx) throw new Error("Either plan or pptx is required.");
  if (args.pptx && !args.inventory) throw new Error("inventory is required when pptx is used.");
  if (!args.out && !args.dryRun) throw new Error("out is required unless dryRun is set.");
  return args;
}

async function applyWithSelectedEngine(args) {
  if (args.engine === "powerpoint") return applyWithPowerPoint(args);
  return applyWithOpenXml(args);
}

async function applyWithOpenXml(args) {
  return applyComponentReplacementsWithOpenXml({
    planFile: args.planFile,
    out: args.out,
    allowMissing: args.allowMissing,
    dryRun: args.dryRun,
    timeoutMs: args.timeoutMs,
    runner: args.runner,
    skillRoot: args.skillRoot,
    openXmlBuilder: args.openXmlBuilder
  });
}

function createApplyPlan(args) {
  const planOut = path.resolve(String(args.planOut || defaultPlanOut(args.pptx)));
  const plan = buildComponentReplacementApplyPlan({
    pptx: args.pptx,
    inventory: args.inventory,
    out: planOut,
    failOnMissingSamples: args.failOnMissingSamples
  });
  return {
    planFile: planOut,
    plan,
    generated: true
  };
}

async function applyWithPowerPoint(args) {
  return applyComponentReplacementsWithPowerPoint({
    planFile: args.planFile,
    out: args.out,
    allowMissing: args.allowMissing,
    dryRun: args.dryRun,
    timeoutMs: args.timeoutMs,
    runner: args.runner
  });
}

function parseBuilderReport(stdout) {
  try {
    return parseOpenXmlComponentReport(stdout);
  } catch {
    return parsePowerPointComponentReport(stdout);
  }
}

function normalizeEngine(value) {
  const engine = String(value || "openxml").trim().toLowerCase();
  if (engine !== "openxml" && engine !== "powerpoint") throw new Error(`Unsupported component replacement engine: ${value}`);
  return engine;
}

function defaultPlanOut(pptx) {
  const file = path.resolve(String(pptx || ""));
  return path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.component-replacement-apply-plan.json`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file || "")), "utf8"));
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const result = await runComponentReplacementApply(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  applyWithPowerPoint,
  applyWithOpenXml,
  applyWithSelectedEngine,
  createApplyPlan,
  defaultPlanOut,
  parseArgs,
  parseBuilderReport,
  normalizeEngine,
  runComponentReplacementApply
};
