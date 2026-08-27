#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createExperienceEvidenceTemplate,
  createProjectAuditJob,
  runProjectAuditJob
} = require("../../project-audit-core");
const { auditLevelPlan, parseAuditLevel, promptAuditLevel, renderAuditLevelMenu } = require("../../project-audit-core/audit-level");
const { auditIntentPlan } = require("../../project-audit-core/audit-mode");
const { parseAuditScope, promptAuditScope, renderAuditScopeMenu } = require("../../project-audit-core/audit-scope");
const { collectBrowserExperience } = require("../../project-audit-core/browser-experience");

const VERSION = "0.1.0";
const MAX_ARGUMENTS = 48;
const USAGE = [
  "usage: common-tools-audit <command>",
  "  doctor [--workspace <directory>]",
  "  levels | scopes | plan [--level <value>] [--scope <value>] [--mode <value>] [--instruction <text>]",
  "  run --out <directory> [--workspace <directory>] [--root <directory>] [--level <value>] [--scope <value>] [--mode <value>]",
  "  interactive [--out <directory>] [--workspace <directory>]",
  "  evidence-template --out <json> [--workspace <directory>]",
  "  experience-collect --plan <json> --out <directory> --run-browser [--workspace <directory>]"
].join("\n");

function parse(argv) {
  if (!Array.isArray(argv) || argv.length > MAX_ARGUMENTS || argv.some((value) => typeof value !== "string" || value.length > 8192 || /[\0\r\n]/.test(value))) throw new Error("command arguments are invalid");
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) { result._.push(item); continue; }
    const key = item.slice(2);
    if (!/^[a-z][a-z0-9-]*$/.test(key) || Object.prototype.hasOwnProperty.call(result, key)) throw new Error("command option is invalid or duplicated");
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) { result[key] = next; index += 1; } else result[key] = true;
  }
  return result;
}

function realDirectory(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  let resolved;
  try { resolved = fs.realpathSync.native(path.resolve(value)); } catch { throw new Error(`${label} is unavailable`); }
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} is invalid`);
  return resolved;
}

function context(args) {
  const workspaceRoot = realDirectory(args.workspace || process.cwd(), "workspace");
  return Object.freeze({ workspaceRoot, stateRoot: path.join(workspaceRoot, ".common-tools-audit"), ownerId: "local-user" });
}

function booleanOption(args, key) { return args[key] === true; }

function jobInput(ctx, args) {
  return {
    ...ctx,
    projectRoot: args.root || ctx.workspaceRoot,
    output: args.out,
    idempotencyKey: args["idempotency-key"],
    level: args.level,
    mode: args.mode,
    instruction: args.instruction,
    scope: args.scope,
    experienceEvidence: args["experience-evidence"],
    runGates: booleanOption(args, "run-gates"),
    gateTimeoutMs: args["gate-timeout-ms"]
  };
}

function writeJson(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function main(argv = process.argv.slice(2)) {
  const args = parse(argv);
  const [command, extra] = args._;
  if (extra !== undefined) throw new Error("unexpected positional argument");
  if (command === "help" || args.help === true || command === undefined) { process.stdout.write(`${USAGE}\n`); return 0; }
  if (command === "version") { process.stdout.write(`${VERSION}\n`); return 0; }
  if (command === "doctor") {
    const ctx = context(args);
    writeJson({ healthy: true, runtime: "project-audit-local", version: VERSION, node: process.versions.node, workspace: { readable: true, writable: fs.accessSync(ctx.workspaceRoot, fs.constants.W_OK) === undefined }, excludedHeavyComponents: ["slideclone", "ocr", "dotnet", "docker"] });
    return 0;
  }
  if (command === "levels") { process.stdout.write(`${renderAuditLevelMenu()}\n`); return 0; }
  if (command === "scopes") { process.stdout.write(`${renderAuditScopeMenu()}\n`); return 0; }
  if (command === "plan") {
    writeJson({ ...auditLevelPlan(args.level), ...auditIntentPlan({ mode: args.mode, instruction: args.instruction }), auditDomains: parseAuditScope(args.scope) });
    return 0;
  }
  const ctx = context(args);
  if (command === "evidence-template") {
    if (typeof args.out !== "string") throw new Error("evidence-template requires --out");
    writeJson(createExperienceEvidenceTemplate(args.root || ctx.workspaceRoot, args.out));
    return 0;
  }
  if (command === "experience-collect") {
    if (typeof args.plan !== "string" || typeof args.out !== "string" || args["run-browser"] !== true) throw new Error("experience-collect requires --plan, --out, and --run-browser");
    writeJson(await collectBrowserExperience({ projectRoot: args.root || ctx.workspaceRoot, planFile: args.plan, output: args.out, browser: args.browser, timeoutMs: args["browser-timeout-ms"], allowExternalUrl: args["allow-external-url"] === true }));
    return 0;
  }
  if (command === "run") {
    if (typeof args.out !== "string") throw new Error("run requires --out");
    const created = createProjectAuditJob(jobInput(ctx, args));
    writeJson(created.status === "queued" ? runProjectAuditJob({ ...ctx, id: created.id }) : created);
    return 0;
  }
  if (command === "interactive") {
    const level = args.level === undefined ? await promptAuditLevel() : parseAuditLevel(args.level).id;
    const scope = args.scope === undefined ? await promptAuditScope() : parseAuditScope(args.scope).join(",");
    const output = args.out || path.join(ctx.workspaceRoot, ".common-tools", "reports", "project-audit");
    const created = createProjectAuditJob(jobInput(ctx, { ...args, level, scope, out: output }));
    writeJson(created.status === "queued" ? runProjectAuditJob({ ...ctx, id: created.id }) : created);
    return 0;
  }
  throw new Error(USAGE);
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "project audit failed"}\n`); process.exitCode = 1; });

module.exports = { MAX_ARGUMENTS, USAGE, context, jobInput, main, parse, realDirectory };
