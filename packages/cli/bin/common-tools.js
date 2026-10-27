#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { REGISTRATION, cancelJob, createEditableJob, getJob, runEditableJob } = require("../../slideclone-core");
const { CAPABILITY: PROJECT_AUDIT_CAPABILITY, createExperienceEvidenceTemplate, createProjectAuditJob, runProjectAuditJob } = require("../../project-audit-core");
const { auditLevelPlan, parseAuditLevel, promptAuditLevel, renderAuditLevelMenu } = require("../../project-audit-core/audit-level");
const { auditIntentPlan } = require("../../project-audit-core/audit-mode");
const { parseAuditScope, promptAuditScope, renderAuditScopeMenu } = require("../../project-audit-core/audit-scope");
const { collectBrowserExperience } = require("../../project-audit-core/browser-experience");
const { CAPABILITY: PPT_QUALITY_CAPABILITY, REPORT_JSON_NAME: PPT_QUALITY_REPORT_JSON_NAME, createPptQualityJob, runPptQualityJob } = require("../../ppt-quality-core");
const { CAPABILITY: PPT_IMPROVE_CAPABILITY, createPptImproveJob, runPptImproveJob } = require("../../ppt-improve-core");
const { CAPABILITY: PPT_CREATE_CAPABILITY, createPptCreateJob, runPptCreateJob } = require("../../ppt-create-core");
const { persistEditorPatch, writeEditorPreview } = require("../../ppt-create-core/editor");
const { createImageDeliveryArtifacts } = require("../../ppt-create-core/image-delivery");
const { applyAndExportIrArtifacts, exportEditedIrArtifacts, persistIrEditorPatch } = require("../../ppt-create-core/ir-editor");
const { startIrEditorSession } = require("../../ppt-create-core/ir-editor-session");
const { loadContentProviderConfig } = require("../../ppt-create-core/content-provider-config");
const { buildPdfWithLibreOffice } = require("../../ppt-create-core/libreoffice-pdf");
const { persistPresentationPlan } = require("../../ppt-create-core/planner");
const { persistPromptPlan, persistPromptPlanAsync, promptToPresentation, promptToPresentationAsync } = require("../../ppt-create-core/prompt");
const { persistDocumentPlan } = require("../../ppt-create-core/document-ingest");
const { extractPdfLayout, extractPdfText } = require("../../ppt-create-core/pdf-text");
const { createPptCreateArchive } = require("../../ppt-create-core/team-archive");
const { buildOpenXmlDecksSync } = require("../../slideclone-core/pptx-openxml-dotnet");
const { effectivePluginConfig, readPluginConfig, readRuntimeConfig, resolveExecutionRoute, rollbackPluginConfig, setCapabilityEnabled, setEnabledCapabilities, upgradePluginConfig } = require("../../capability-runtime");
const { teamDeploymentPlan } = require("../../team-runtime");
const { doctorReport, editableProfileConfig, editableProfileProvider, initializeEditableProfile, optionalLicense, optionalPaddleOcr, optionalUmiOcr, resolveWorkspaceChild, runtimeStatus, workspaceAccess } = require("../local-doctor");
const { pluginCatalog, validateScaffoldBundle } = require("../plugin-admin");
const { teamDoctorReport } = require("../team-doctor");
const { composeProjectName, composeRuntimeSnapshot, gatewayReadiness, localTeamConfigReport, loopbackTcpPort, probeReadyEndpoint, summarizeContainerStatus, teamRuntimeReport } = require("../team-runtime-local");
const { runKeycloakMcpClientCommand, runKeycloakProjectMapperCommand } = require("../keycloak-project-mapper");
const { runKeycloakRealmCommand } = require("../keycloak-realm-hardening");
const { runKeycloakLocalTestUserCommand } = require("../keycloak-local-test-user");
const { environmentWithProductionEnvFile } = require("../production-env-file");
const { collectProductionAcceptanceEvidence, productionAcceptancePlan } = require("../production-acceptance-plan");
const { serveStdio } = require("../../mcp-server/core");
const { verifyPluginPackaging } = require("../verification/verify-plugins");
const { verifyCapabilityToolContracts } = require("../verification/verify-capability-contracts");
const { scaffoldPlan, writeScaffold } = require("../capability-scaffold");
const { createEditableSourceArchive, createRawImageArchive } = require("../../slideclone-worker-adapter/team-raw-image-archive");
const { createBundledSlidecloneRunner } = require("../slideclone-runner");
const { runHeadlessQualityCommand, runRethemeCommand, runTemplateCommand } = require("../declarative-cli");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
let executeBundledSlideclone;
function bundledSlidecloneRunner() {
  if (!executeBundledSlideclone) executeBundledSlideclone = createBundledSlidecloneRunner({ repositoryRoot: REPOSITORY_ROOT });
  return executeBundledSlideclone;
}
const COMMAND_USAGE = [
  "usage: common-tools <command>",
  "  doctor | runtime status | runtime resolve --capability <id> [--execution local|remote] | mcp serve",
  "  team doctor [--runtime] [--project <compose-project>] | team runtime [--project <compose-project>] [--capabilities <csv>] [--require-gateway] | team local-config [--project <compose-project>] | team deployment-plan [--capabilities <csv>] | team migration-status [--production-env-file <absolute.env>] | team production-acceptance-plan [--production-env-file <absolute.env>] [--out <json>] | team production-acceptance-evidence [--production-env-file <absolute.env>] --out <directory> | team editable-source-archive (--input <png|jpg|pdf|pptx|deck.json> | --inputs <ordered-images,csv>) [--semantic-fallback <json>] --out <archive.tar.gz> | team raw-image-archive (--input <png|jpg> | --inputs <ordered,csv>) [--semantic-fallback <json>] --out <archive.tar.gz> | team production-preflight [--production-env-file <absolute.env>] | team keycloak-realm [--apply --backup-file <new.json> --evidence-file <new.json>] | team keycloak-mcp-client [--apply --backup-file <new.json>] | team keycloak-local-test-user --apply [--username <name>] [--project-id <id>] [--role viewer|editor|admin]",
  "  plugin list | plugin verify | plugin status | plugin set --capabilities <id,...> | plugin enable --capability <id> [--only] | plugin disable --capability <id> | plugin rollback | plugin upgrade [--capability <id>]",
  "  template list|show|export|import|harvest | quality-headless --input <json> [--reference-png <png> --rendered-png <png>] [--min-ssim <0..1>] [--max-phash-distance <0..63>] [--out <json>] | retheme --input <json> --brand-kit <json> --out <json>",
  "  editable init|create|run|batch|apply-edit | editable batch --inputs <ordered,csv> --out <directory> --config <json> | audit levels|scopes|interactive|plan|evidence-template|experience-collect|create|run [--level 1|2|3|quick|standard|deep] --scope 1|2,3|scope-ids [--mode code|enhanced|gates|experience|full] [--instruction <text>] [--run-gates --gate-timeout-ms <1000..600000>] [--experience-evidence <json>] | ppt draft|compose [--provider-config <json> --provider-id <id>]|ingest [--deck-variants 1|2|3]|plan|archive|create|enqueue|preview|edit-session|apply-edit|apply-ir-edit|finalize-ir-edit|export-ir | ppt-quality create|run | ppt-improve create|run|pipeline [--profile safe-package|layout-safe|typography-safe|editability-safe|audit-only] | job get|run|cancel"
].join("\n");

function parse(argv) { const result = { _: [] }; for (let index = 0; index < argv.length; index += 1) { const item = argv[index]; if (!item.startsWith("--")) { result._.push(item); continue; } const next = argv[index + 1]; if (next && !next.startsWith("--")) { result[item.slice(2)] = next; index += 1; } else result[item.slice(2)] = true; } return result; }
function parseCapabilityList(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("--capabilities must be a non-empty comma-separated list");
  const capabilities = value.split(",").map((capability) => capability.trim());
  if (capabilities.some((capability) => !capability) || new Set(capabilities).size !== capabilities.length) throw new Error("--capabilities must not contain empty or duplicate capability IDs");
  return capabilities;
}
function productionEnvironmentFromArgs(args, environment = process.env) {
  return args["production-env-file"] ? environmentWithProductionEnvFile(environment, args["production-env-file"]) : environment;
}
function context(args) { const workspaceRoot = path.resolve(args.workspace || process.cwd()); const stateRoot = path.resolve(args.state || path.join(workspaceRoot, ".common-tools")); return { workspaceRoot, stateRoot, ownerId: args.owner || "local-user" }; }
function requireEnabledCapability(ctx, capability) {
  let config;
  try {
    config = effectivePluginConfig(ctx.stateRoot, ctx.workspaceRoot);
  } catch {
    throw new Error("runtime configuration is invalid");
  }
  if (!config.effectiveCapabilities.includes(capability)) throw new Error(`capability is not enabled: ${capability}`);
}
function newPipelineOutputRoot(workspaceRoot, output) {
  if (typeof output !== "string" || !output.trim()) throw new Error("ppt-improve pipeline requires --out");
  const workspace = fs.realpathSync.native(workspaceRoot);
  const root = path.resolve(workspace, output);
  const relative = path.relative(workspace, root);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT improvement pipeline output must be a new child directory of the workspace");
  if (fs.existsSync(root)) throw new Error("PPT improvement pipeline output already exists");
  return root;
}
function runPptImprovePipeline(ctx, args) {
  if (!args.input) throw new Error("ppt-improve pipeline requires --input and --out");
  requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
  requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
  const root = newPipelineOutputRoot(ctx.workspaceRoot, args.out);
  const qualityOutput = path.join(root, "quality");
  const improveOutput = path.join(root, "improve");
  const quality = runCreatedLocalJob(ctx, createPptQualityJob({ ...ctx, input: args.input, output: qualityOutput }));
  if (quality.status !== "succeeded") return Object.freeze({ quality, improvement: null, outputs: Object.freeze({ root, qualityOutput, improveOutput }) });
  const report = path.join(qualityOutput, PPT_QUALITY_REPORT_JSON_NAME);
  const improvement = runCreatedLocalJob(ctx, createPptImproveJob({ ...ctx, input: args.input, report, output: improveOutput, profile: args.profile }));
  return Object.freeze({ quality, improvement, outputs: Object.freeze({ root, qualityOutput, improveOutput }) });
}
function doctor(args = {}) { const report = doctorReport(args); process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`); return report.exitCode; }
function teamDoctor(args = {}) {
  const report = teamDoctorReport(args);
  process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
  return report.exitCode;
}
function teamRuntime(args = {}) {
  const report = teamRuntimeReport(args);
  process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
  return report.exitCode;
}
function runCreatedLocalJob(ctx, job) {
  if (!job || typeof job !== "object" || typeof job.id !== "string" || typeof job.capability !== "string") throw new TypeError("created job is invalid");
  if (job.status !== "queued") return job;
  if (job.capability === PROJECT_AUDIT_CAPABILITY) return runProjectAuditJob({ ...ctx, id: job.id });
  if (job.capability === PPT_QUALITY_CAPABILITY) return runPptQualityJob({ ...ctx, id: job.id });
  if (job.capability === PPT_IMPROVE_CAPABILITY) return runPptImproveJob({ ...ctx, id: job.id });
  if (job.capability === PPT_CREATE_CAPABILITY) return runPptCreateJob({ ...ctx, id: job.id, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
  if (job.capability === REGISTRATION.capability) return runEditableJob({ ...ctx, id: job.id, executeSlideclone: bundledSlidecloneRunner(), enhanceArtifacts: ({ outputDir }) => createImageDeliveryArtifacts({ outputDir, buildPdf: buildPdfWithLibreOffice }) });
  throw new Error("job capability cannot be run locally");
}
function requireExplicitAuditScope(args, command) {
  if (typeof args.scope !== "string" || !args.scope.trim()) throw new Error(`audit ${command} requires --scope; run audit interactive to choose one`);
}
function buildCreatedPptx({ irFile, outFile, templatePptx }) {
  const nativeEngineRoot = path.join(REPOSITORY_ROOT, "packages", "slideclone-native-engine");
  const openXmlBuilderRoot = path.join(nativeEngineRoot, "dotnet", "OpenXmlDeckBuilder");
  buildOpenXmlDecksSync([{ irFile, outFile, templatePptx }], { skillRoot: nativeEngineRoot, openXmlBuilderRoot, config: { openXmlBuilder: { cache: false, configuration: "Release", targetFramework: "net8.0" } }, metrics: {} }, openXmlBuilderRoot, { powerPointSafe: true });
}
async function main() {
  const args = parse(process.argv.slice(2));
  const [area, action] = args._;
  const ctx = context(args);
  if (area === "doctor") return doctor(args);
  if (area === "runtime" && action === "status") {
    process.stdout.write(`${JSON.stringify(runtimeStatus(args), null, 2)}\n`);
    return 0;
  }
  if (area === "runtime" && action === "resolve") {
    if (typeof args.capability !== "string" || !args.capability.trim()) throw new Error("runtime resolve requires --capability");
    const configuration = readRuntimeConfig();
    const route = resolveExecutionRoute({ capability: args.capability, executionMode: configuration.executionMode, requestedExecution: args.execution });
    process.stdout.write(`${JSON.stringify({ capability: args.capability, ...route, configuration }, null, 2)}\n`);
    return 0;
  }
  if (area === "mcp" && action === "serve") {
    serveStdio({ context: ctx });
    return 0;
  }
  if (area === "team" && action === "doctor") return teamDoctor(args);
  if (area === "team" && action === "deployment-plan") {
    const result = teamDeploymentPlan(args.capabilities === undefined ? process.env.COMMON_TOOLS_TEAM_CAPABILITIES : args.capabilities);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "local-config") {
    const report = localTeamConfigReport(args);
    process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
    return report.exitCode;
  }
  if (area === "team" && action === "raw-image-archive") {
    if ((!args.input && !args.inputs) || (args.input && args.inputs) || !args.out) throw new Error("team raw-image-archive requires exactly one of --input or --inputs, plus --out");
    const listedInputs = args.inputs === undefined ? undefined : String(args.inputs).split(",").map((item) => item.trim());
    if (listedInputs && (listedInputs.some((item) => !item) || new Set(listedInputs).size !== listedInputs.length)) throw new Error("--inputs must be an ordered comma-separated list without empty or duplicate paths");
    const result = createRawImageArchive({
      ...(listedInputs ? { inputFiles: listedInputs.map((item) => resolveWorkspaceChild(ctx.workspaceRoot, item, "raw image archive input")) } : { inputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.input, "raw image archive input") }),
      outputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.out, "raw image archive output"),
      ...(args["semantic-fallback"] === undefined ? {} : { semanticFallbackFile: resolveWorkspaceChild(ctx.workspaceRoot, args["semantic-fallback"], "semantic fallback input") })
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "editable-source-archive") {
    if ((!args.input && !args.inputs) || (args.input && args.inputs) || !args.out) throw new Error("team editable-source-archive requires exactly one of --input or --inputs, plus --out");
    const listedInputs = args.inputs === undefined ? undefined : String(args.inputs).split(",").map((item) => item.trim());
    if (listedInputs && (listedInputs.some((item) => !item) || new Set(listedInputs).size !== listedInputs.length)) throw new Error("--inputs must be an ordered comma-separated list without empty or duplicate paths");
    const result = createEditableSourceArchive({
      ...(listedInputs ? { inputFiles: listedInputs.map((item) => resolveWorkspaceChild(ctx.workspaceRoot, item, "editable source archive input")) } : { inputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.input, "editable source archive input") }),
      outputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.out, "editable source archive output"),
      ...(args["semantic-fallback"] === undefined ? {} : { semanticFallbackFile: resolveWorkspaceChild(ctx.workspaceRoot, args["semantic-fallback"], "semantic fallback input") })
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "production-preflight") {
    const { runProductionPreflight } = require("../production-preflight");
    const productionEnvironment = productionEnvironmentFromArgs(args);
    const result = runProductionPreflight(productionEnvironment, { repositoryRoot: REPOSITORY_ROOT });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "migration-status") {
    const productionEnvironment = productionEnvironmentFromArgs(args);
    const { runMigrationCommand } = require("../../remote-mcp-server/bin/common-tools-team-migrate");
    await runMigrationCommand(productionEnvironment, ["--status"]);
    return 0;
  }
  if (area === "team" && action === "production-acceptance-plan") {
    const productionEnvironment = productionEnvironmentFromArgs(args);
    const result = productionAcceptancePlan(productionEnvironment);
    if (args.out) {
      const outputFile = resolveWorkspaceChild(ctx.workspaceRoot, args.out, "production acceptance plan output");
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify({ status: result.status, output: outputFile }, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "production-acceptance-evidence") {
    if (!args.out) throw new Error("team production-acceptance-evidence requires --out");
    const productionEnvironment = productionEnvironmentFromArgs(args);
    const outputDirectory = resolveWorkspaceChild(ctx.workspaceRoot, args.out, "production acceptance evidence output");
    const result = await collectProductionAcceptanceEvidence(productionEnvironment, { repositoryRoot: REPOSITORY_ROOT, outputDirectory });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === "ready-for-controlled-apply" ? 0 : 2;
  }
  if (area === "team" && action === "keycloak-project-mapper") {
    const result = await runKeycloakProjectMapperCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "keycloak-realm") {
    const result = await runKeycloakRealmCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "keycloak-mcp-client") {
    const result = await runKeycloakMcpClientCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "keycloak-local-test-user") {
    const result = await runKeycloakLocalTestUserCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "scaffold") {
    if (!args.name || !args.out) throw new Error("plugin scaffold requires --name and --out");
    const plan = scaffoldPlan({ name: args.name, output: args.out });
    if (args.write !== true) {
      process.stdout.write(`${JSON.stringify({ ...plan, written: false }, null, 2)}\n`);
      return 0;
    }
    const result = writeScaffold(plan);
    try {
      validateScaffoldBundle(plan.output, plan.capability);
    } catch (error) {
      fs.rmSync(plan.output, { recursive: true, force: true });
      throw error;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "list") {
    process.stdout.write(`${JSON.stringify(pluginCatalog(ctx.stateRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "verify") {
    const capabilityContracts = verifyCapabilityToolContracts(REPOSITORY_ROOT);
    process.stdout.write(`${JSON.stringify({ ...verifyPluginPackaging(REPOSITORY_ROOT), capabilityContracts }, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && ["status", "enable", "disable", "rollback", "upgrade"].includes(action)) {
    if (action === "upgrade") {
      verifyCapabilityToolContracts(REPOSITORY_ROOT);
      verifyPluginPackaging(REPOSITORY_ROOT);
    }
    if (args.only === true && action !== "enable") throw new Error("--only is valid only with plugin enable");
    const config = action === "status" ? readPluginConfig(ctx.stateRoot)
      : action === "rollback" ? rollbackPluginConfig(ctx.stateRoot)
        : action === "upgrade" ? upgradePluginConfig(ctx.stateRoot, args.capability)
          : setCapabilityEnabled(ctx.stateRoot, args.capability, action === "enable", { exclusive: args.only === true });
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "run") {
    if (!args.input || !args.out || !args.config) throw new Error("editable run requires --input, --out, and --config");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    const job = runCreatedLocalJob(ctx, createEditableJob({ ...ctx, input: args.input, output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "batch") {
    if (!args.inputs || !args.out || !args.config) throw new Error("editable batch requires --inputs, --out, and --config");
    const inputs = String(args.inputs).split(",").map((item) => item.trim());
    if (inputs.length < 2 || inputs.length > 20 || inputs.some((item) => !item) || new Set(inputs).size !== inputs.length) throw new Error("editable batch --inputs must contain two to twenty ordered, unique paths");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    const job = runCreatedLocalJob(ctx, createEditableJob({ ...ctx, inputs: inputs.map((item) => resolveWorkspaceChild(ctx.workspaceRoot, item, "editable batch input")), output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "create") {
    if (!args.input || !args.out || !args.config) throw new Error("editable create requires --input, --out, and --config");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(createEditableJob({ ...ctx, input: args.input, output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }), null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "apply-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("editable apply-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(persistIrEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "plan") {
    process.stdout.write(`${JSON.stringify({ ...auditLevelPlan(args.level), ...auditIntentPlan({ mode: args.mode, instruction: args.instruction }), auditDomains: parseAuditScope(args.scope) }, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "levels") {
    process.stdout.write(`${renderAuditLevelMenu()}\n`);
    return 0;
  }
  if (area === "audit" && action === "scopes") {
    process.stdout.write(`${renderAuditScopeMenu()}\n`);
    return 0;
  }
  if (area === "audit" && action === "evidence-template") {
    if (!args.out) throw new Error("audit evidence-template requires --out");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    process.stdout.write(`${JSON.stringify(createExperienceEvidenceTemplate(args.root || ctx.workspaceRoot, args.out), null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "experience-collect") {
    if (!args.plan || !args.out) throw new Error("audit experience-collect requires --plan and --out");
    if (args["run-browser"] !== true) throw new Error("audit experience-collect requires explicit --run-browser");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const result = await collectBrowserExperience({ projectRoot: args.root || ctx.workspaceRoot, planFile: args.plan, output: args.out, browser: args.browser, timeoutMs: args["browser-timeout-ms"], allowExternalUrl: args["allow-external-url"] === true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "run") {
    if (!args.out) throw new Error("audit run requires --out");
    requireExplicitAuditScope(args, "run");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output: args.out, idempotencyKey: args.idempotencyKey, level: args.level, mode: args.mode, instruction: args.instruction, scope: args.scope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "interactive") {
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const selectedLevel = args.level === undefined ? await promptAuditLevel() : parseAuditLevel(args.level).id;
    const selectedScope = args.scope === undefined ? await promptAuditScope() : parseAuditScope(args.scope).join(",");
    const output = args.out || path.join(ctx.workspaceRoot, ".common-tools", "reports", "project-audit");
    const job = runCreatedLocalJob(ctx, createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output, idempotencyKey: args.idempotencyKey, level: selectedLevel, mode: args.mode, instruction: args.instruction, scope: selectedScope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "create") {
    if (!args.out) throw new Error("audit create requires --out");
    requireExplicitAuditScope(args, "create");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    process.stdout.write(`${JSON.stringify(createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output: args.out, idempotencyKey: args.idempotencyKey, level: args.level, mode: args.mode, instruction: args.instruction, scope: args.scope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }), null, 2)}\n`);
    return 0;
  }
  if (area === "job" && ["get", "cancel", "run"].includes(action)) {
    if (!args.id) throw new Error(`job ${action} requires --id`);
    const current = getJob({ ...ctx, id: args.id });
    if (!current) return 3;
    if (action === "run") requireEnabledCapability(ctx, current.capability);
    const job = action === "get" ? current : action === "cancel" ? cancelJob({ ...ctx, id: args.id }) : runCreatedLocalJob(ctx, current);
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  throw new Error(COMMAND_USAGE);
}
async function mainWithPptQuality() {
  const args = parse(process.argv.slice(2));
  const [area, action] = args._;
  const ctx = context(args);
  if (area === "help" || args.help === true) {
    process.stdout.write(`${COMMAND_USAGE}\n`);
    return 0;
  }
  if (area === "plugin" && action === "list") {
    process.stdout.write(`${JSON.stringify(pluginCatalog(ctx.stateRoot, ctx.workspaceRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "status") {
    process.stdout.write(`${JSON.stringify(effectivePluginConfig(ctx.stateRoot, ctx.workspaceRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "set") {
    const config = setEnabledCapabilities(ctx.stateRoot, parseCapabilityList(args.capabilities));
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "init") {
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(initializeEditableProfile(ctx, args), null, 2)}\n`);
    return 0;
  }
  if (area === "template") return runTemplateCommand(ctx, action, args);
  if (area === "quality-headless") return runHeadlessQualityCommand(ctx, args);
  if (area === "retheme") return runRethemeCommand(ctx, args);
  if (area === "team" && action === "runtime") return teamRuntime(args);
  if (area === "ppt" && ["draft", "compose"].includes(action)) {
    if (!args.input || !args.out || !args.audience || !args.purpose) throw new Error(`ppt ${action} requires --input, --out, --audience and --purpose`);
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const promptOptions = {
      audience: args.audience,
      purpose: args.purpose,
      language: args.language,
      theme: args.theme,
      maxSlides: args["max-slides"] === undefined ? undefined : Number(args["max-slides"]),
      deckVariantCount: args["deck-variants"] === undefined ? undefined : Number(args["deck-variants"]),
      closing: args.closing === undefined ? [] : String(args.closing).split("|").map((item) => item.trim()).filter(Boolean)
    };
    if ((args["provider-config"] === undefined) !== (args["provider-id"] === undefined)) throw new Error("ppt content provider requires both --provider-config and --provider-id");
    if (args["provider-config"] !== undefined) {
      promptOptions.contentProviderId = args["provider-id"];
      promptOptions.contentProviderRegistry = loadContentProviderConfig({ configFile: args["provider-config"], allowedRoot: ctx.workspaceRoot });
    }
    if (action === "draft") {
      const result = args["provider-config"] === undefined
        ? persistPromptPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, outputFormat: args["output-format"], ...promptOptions })
        : await persistPromptPlanAsync({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, outputFormat: args["output-format"], ...promptOptions });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    const source = resolveWorkspaceChild(ctx.workspaceRoot, args.input, "--input");
    const info = fs.lstatSync(source);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 256 * 1024 || ![".md", ".markdown", ".txt"].includes(path.extname(source).toLowerCase())) throw new Error("ppt compose input must be a bounded, non-symbolic text or Markdown file");
    const generated = args["provider-config"] === undefined ? promptToPresentation(fs.readFileSync(source, "utf8"), promptOptions) : await promptToPresentationAsync(fs.readFileSync(source, "utf8"), promptOptions);
    const temporarySpec = path.join(ctx.workspaceRoot, `.common-tools-compose-${crypto.randomUUID()}.json`);
    try {
      fs.writeFileSync(temporarySpec, `${JSON.stringify(generated.spec, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      const created = createPptCreateJob({ ...ctx, input: temporarySpec, output: args.out, idempotencyKey: args.idempotencyKey, generationManifest: generated.manifest });
      const job = runCreatedLocalJob(ctx, created);
      process.stdout.write(`${JSON.stringify({ job, generation: generated.report }, null, 2)}\n`);
      return job.status === "succeeded" ? 0 : 2;
    } finally {
      fs.rmSync(temporarySpec, { force: true });
    }
  }
  if (area === "ppt" && action === "plan") {
    if (!args.input || !args.out) throw new Error("ppt plan requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistPresentationPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "ingest") {
    if (!args.input || !args.out || !args.audience || !args.purpose) throw new Error("ppt ingest requires --input, --out, --audience and --purpose");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const maxSlides = args["max-slides"] === undefined ? undefined : Number(args["max-slides"]);
    const deckVariantCount = args["deck-variants"] === undefined ? undefined : Number(args["deck-variants"]);
    const closing = args.closing === undefined ? [] : String(args.closing).split("|").map((item) => item.trim()).filter(Boolean);
    const result = persistDocumentPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, audience: args.audience, purpose: args.purpose, language: args.language, theme: args.theme, maxSlides, deckVariantCount, closing, outputFormat: args["output-format"], extractPdfLayout, extractPdfText });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "archive") {
    if (!args.input || !args.out) throw new Error("ppt archive requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = createPptCreateArchive({ specFile: resolveWorkspaceChild(ctx.workspaceRoot, args.input, "--input"), outputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.out, "--out") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "preview") {
    if (!args.input || !args.out) throw new Error("ppt preview requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(writeEditorPreview({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "apply-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt apply-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "apply-ir-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt apply-ir-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistIrEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "export-ir") {
    if (!args.input || !args.out) throw new Error("ppt export-ir requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = exportEditedIrArtifacts({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "finalize-ir-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt finalize-ir-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = applyAndExportIrArtifacts({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "edit-session") {
    if (!args.input || !args.out) throw new Error("ppt edit-session requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const session = await startIrEditorSession({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice, openBrowser: args["no-open"] !== true });
    process.stdout.write(`${JSON.stringify({ status: "ready", url: session.url }, null, 2)}\n`);
    const completion = await session.completion;
    process.stdout.write(`${JSON.stringify({ status: completion.status, ...(completion.result ? { output: completion.result.output, revision: completion.result.revision } : {}) }, null, 2)}\n`);
    return completion.status === "completed" ? 0 : 1;
  }
  if (area === "ppt" && ["create", "enqueue"].includes(action)) {
    if (!args.input || !args.out) throw new Error(`ppt ${action} requires --input and --out`);
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const created = createPptCreateJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey });
    const job = action === "create" ? runCreatedLocalJob(ctx, created) : created;
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-quality" && action === "run") {
    if (!args.input || !args.out) throw new Error("ppt-quality run requires --input and --out");
    requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createPptQualityJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-quality" && action === "create") {
    if (!args.input || !args.out) throw new Error("ppt-quality create requires --input and --out");
    requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
    const job = createPptQualityJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey });
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "run") {
    if (!args.input || !args.report || !args.out) throw new Error("ppt-improve run requires --input, --report and --out");
    requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createPptImproveJob({ ...ctx, input: args.input, report: args.report, output: args.out, idempotencyKey: args.idempotencyKey, profile: args.profile }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "pipeline") {
    const result = runPptImprovePipeline(ctx, args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "create") {
    if (!args.input || !args.report || !args.out) throw new Error("ppt-improve create requires --input, --report and --out");
    requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
    const job = createPptImproveJob({ ...ctx, input: args.input, report: args.report, output: args.out, idempotencyKey: args.idempotencyKey, profile: args.profile });
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "job" && action === "run" && args.id) {
    const current = getJob({ ...ctx, id: args.id });
    if (current?.capability === PPT_QUALITY_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
      const job = runPptQualityJob({ ...ctx, id: args.id });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
    if (current?.capability === PPT_IMPROVE_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
      const job = runPptImproveJob({ ...ctx, id: args.id });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
    if (current?.capability === PPT_CREATE_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
      const job = runPptCreateJob({ ...ctx, id: args.id, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
  }
  return main();
}

if (require.main === module) mainWithPptQuality().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });

module.exports = { COMMAND_USAGE, collectProductionAcceptanceEvidence, composeProjectName, composeRuntimeSnapshot, doctorReport, editableProfileConfig, editableProfileProvider, gatewayReadiness, initializeEditableProfile, localTeamConfigReport, loopbackTcpPort, main: mainWithPptQuality, newPipelineOutputRoot, optionalLicense, optionalPaddleOcr, optionalUmiOcr, parse, pluginCatalog, probeReadyEndpoint, productionAcceptancePlan, requireEnabledCapability, resolveWorkspaceChild, runHeadlessQualityCommand, runPptImprovePipeline, runRethemeCommand, runTemplateCommand, runtimeStatus, summarizeContainerStatus, teamDoctor, teamDoctorReport, teamRuntime, teamRuntimeReport, validateScaffoldBundle, workspaceAccess };
