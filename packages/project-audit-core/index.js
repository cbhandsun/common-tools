"use strict";

const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { auditLevelPlan } = require("./audit-level");
const { auditModeOptions } = require("./audit-mode");
const { AUDIT_SCOPE_IDS, parseAuditScope } = require("./audit-scope");
const { createExperienceEvidenceTemplate, experienceReviewFinding, readExperienceEvidence } = require("./experience-evidence");

const CAPABILITY = "project-audit";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_project_audit_job", "get_project_audit_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base" });
const IGNORED_DIRECTORIES = new Set([
  ".git", ".claude", ".codex", ".codex-temp", ".codex-tmp", ".common-tools", ".tools",
  ".cache", ".next", ".turbo", ".venv", "__pycache__", "node_modules", "vendor", "venv",
  "artifacts", "runs", "bin", "obj", "target", "out", "dist", "build", "coverage"
]);
const MAX_FILES = 10000;
const MAX_SCANNED_BYTES = 2 * 1024 * 1024;
const MAX_SECRET_SCAN_BYTES = 8 * 1024 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".cjs", ".cs", ".css", ".go", ".java", ".js", ".json", ".jsx", ".md", ".mjs", ".ps1", ".py", ".rb", ".sh", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml"]);
const MAX_EVIDENCE_PER_FINDING = 25;
const MAX_GATE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_GATE_TIMEOUT_MS = 2 * 60 * 1000;
const GATE_SCRIPT_NAMES = Object.freeze(["check", "lint", "typecheck", "test", "build"]);
const PATTERNS = Object.freeze({
  apiRoute: /\b(?:router|app)\.(?:get|post|put|delete|patch)\s*\(/i,
  frontendCode: /\b(?:React|createRoot|hydrateRoot|useState|useEffect|createApp|defineComponent|customElements)\b|\b(?:document|window)\.[A-Za-z_$]|<[A-Z][A-Za-z0-9_$.-]*(?:\s|>|\/)/,
  frontendEntrypoint: /\b(?:createRoot|hydrateRoot|createApp)\s*\(|export\s+default\s+(?:async\s+)?function\s+(?:App|Page|Layout)\b|<!doctype\s+html|<html\b/i,
  productFlow: /\b(?:user\s+(?:flow|journey)|workflow|onboarding|scenario|happy\s+path|acceptance\s+criteria)\b|(?:用户|操作|业务|产品).{0,8}(?:流程|旅程|场景)|(?:→|->)/i,
  componentTest: /(?:playwright|cypress|@testing-library|testing-library|\brender\s*\(|\bpage\.(?:goto|click|fill)\s*\()/i,
  responsive: /@media|@container|useMediaQuery|matchMedia|\b(?:sm|md|lg|xl):/,
  accessibility: /aria-[a-z-]+|role\s*=|<label\b|alt\s*=/i,
  validation: /\b(?:zod|joi|yup|ajv|validate|safeParse|parseAsync)\b/i,
  errorRecovery: /\b(?:try\s*\{|catch\s*\(|errorBoundary|onError|retry)\b/i,
  persistence: /\b(?:postgres|prisma|typeorm|sequelize|mongoose|redis|sqlite|repository)\b/i,
  worker: /\b(?:worker|queue|job|bullmq|rabbitmq|sqs|retry)\b/i,
  journeyState: /\b(?:loading|isLoading|pending|empty|noResults|notFound|error|success)\b/i,
  interactionFeedback: /\b(?:onClick|onSubmit|onChange|disabled|toast|notification|dialog|modal)\b/i,
  apiContract: /\b(?:fetch|axios|graphql|openapi|swagger|request|response|status\s*[:=])\b/i,
  authorization: /\b(?:auth(?:entication|orization)?|permission|role|rbac|acl|accessControl)\b/i,
  observability: /\b(?:logger|log\.|metrics?|telemetry|trac(?:e|ing)|sentry|opentelemetry)\b/i,
  releaseGovernance: /\b(?:deploy|release|rollback|health(?:check)?|smoke|artifact|sbom)\b/i
});
const AUDIT_FINDING_IDS = new Set([
  "project-profile", "product-entrypoints", "product-flow-evidence", "visual-interaction-evidence", "responsive-evidence", "accessibility-evidence",
  "package-manifest", "dependency-lock", "automated-tests", "ci-workflows", "input-validation-evidence", "error-recovery-evidence",
  "data-lifecycle-evidence", "worker-reliability-evidence", "operations-evidence", "runtime-gates", "experience-review", "possible-secrets",
  "journey-state-evidence", "interaction-feedback-evidence", "api-contract-evidence", "authorization-evidence", "observability-evidence", "release-governance-evidence"
]);
const AUDIT_DOMAINS = Object.freeze([
  Object.freeze({ id: "product-journey", label: "产品闭环", findings: Object.freeze(["product-entrypoints", "product-flow-evidence", "journey-state-evidence"]) }),
  Object.freeze({ id: "visual-interaction", label: "视觉、交互与无障碍", findings: Object.freeze(["visual-interaction-evidence", "interaction-feedback-evidence", "responsive-evidence", "accessibility-evidence", "experience-review"]) }),
  Object.freeze({ id: "data-security", label: "数据、权限与可靠性", findings: Object.freeze(["input-validation-evidence", "error-recovery-evidence", "api-contract-evidence", "authorization-evidence", "data-lifecycle-evidence", "worker-reliability-evidence", "possible-secrets"]) }),
  Object.freeze({ id: "engineering-delivery", label: "工程与交付", findings: Object.freeze(["package-manifest", "dependency-lock", "automated-tests", "ci-workflows", "observability-evidence", "operations-evidence", "release-governance-evidence", "runtime-gates"]) })
]);

function createProjectAuditJob({ workspaceRoot, stateRoot, ownerId, projectRoot, output, idempotencyKey, level, mode, instruction, scope, experienceEvidence, runGates = false, gateTimeoutMs }) {
  const approvedRoot = insideRoot(workspaceRoot, projectRoot || workspaceRoot);
  const approvedOutput = insideRoot(workspaceRoot, output);
  const auditMode = auditModeOptions({ mode, instruction, runGates, experienceEvidence });
  const auditLevel = auditLevelPlan(level);
  const auditScopes = parseAuditScope(scope);
  const gates = auditGateOptions({ runGates, gateTimeoutMs });
  const experience = auditMode.requiresExperience ? readExperienceEvidence(approvedRoot, auditMode.experienceEvidence) : null;
  const audit = Object.freeze({ ...gates, mode: auditMode.mode, level: auditLevel.level, coverageStrategy: auditLevel.coverageStrategy, evidenceExpectation: auditLevel.evidenceExpectation, requiredExperienceScenarios: auditLevel.requiredExperienceScenarios, requiresRuntimeGates: auditLevel.requiresRuntimeGates, scopes: auditScopes, experience });
  const key = idempotencyKey || crypto.createHash("sha256").update(`${approvedRoot}\u0000${approvedOutput}\u0000${JSON.stringify(audit)}`).digest("hex");
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.project) store.write({ ...job, project: { root: approvedRoot }, output: { path: approvedOutput }, audit });
  return store.get(job.id);
}

function runProjectAuditJob({ stateRoot, ownerId, id }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.status !== "queued") throw new Error("only queued jobs can be run");
  if (!job.project?.root || !job.output?.path) throw new Error("project audit job is incomplete");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  try {
    const gates = job.audit?.runGates ? runDeclaredProjectGates(job.project.root, job.audit) : Object.freeze({ requested: false, results: Object.freeze([]) });
    const report = auditProject(job.project.root, { gates, level: job.audit?.level, mode: job.audit?.mode || "code", scope: Array.isArray(job.audit?.scopes) ? job.audit.scopes.join(",") : undefined, experience: job.audit?.experience || null });
    const artifacts = writeReport(job.output.path, report);
    return store.transition(id, "succeeded", { artifacts, quality: projectAuditQuality(report, artifacts), lease: undefined });
  } catch (error) {
    return store.transition(id, "failed", { error: { code: "PROJECT_AUDIT_FAILED", message: error instanceof Error ? error.message.slice(0, 4096) : "project audit failed", retryable: false }, lease: undefined });
  }
}

function projectAuditQuality(report, artifacts) {
  if (!report || typeof report !== "object" || !report.summary || typeof report.summary !== "object" || !Array.isArray(artifacts)) throw new TypeError("project audit quality input is invalid");
  const scannedFiles = report.summary.scannedFiles;
  const warnings = report.summary.warnings;
  if (!Number.isSafeInteger(scannedFiles) || scannedFiles < 0 || !Number.isSafeInteger(warnings) || warnings < 0) throw new TypeError("project audit quality input is invalid");
  const gateResults = Array.isArray(report.gates?.results) ? report.gates.results : [];
  const executedGateResults = gateResults.filter((result) => result && (result.status === "passed" || result.status === "failed" || result.status === "unavailable"));
  const gatesPassed = executedGateResults.every((result) => result.status === "passed");
  const experienceFinding = Array.isArray(report.findings) ? report.findings.find((findingValue) => findingValue?.id === "experience-review") : null;
  const checks = [{ name: "project-scanned", passed: true }, { name: "reports-generated", passed: true }, { name: "no-audit-warnings", passed: warnings === 0 }];
  const auditDomains = Array.isArray(report.scope?.auditDomains) ? report.scope.auditDomains : [];
  const requiredExperienceScenarios = Array.isArray(report.scope?.requiredExperienceScenarios) ? report.scope.requiredExperienceScenarios : [];
  if (auditDomains.includes("visual-interaction") && requiredExperienceScenarios.length > 0 && experienceFinding?.assessment !== "not-applicable") checks.push({ name: "level-required-experience", passed: experienceFinding?.passed === true });
  else if (Array.isArray(report.experience?.scenarios) && report.experience.scenarios.length > 0) checks.push({ name: "requested-experience-review", passed: experienceFinding?.passed === true });
  if (auditDomains.includes("engineering-delivery") && report.scope?.requiresRuntimeGates === true) checks.push({ name: "level-required-runtime-gates", passed: report.gates?.requested === true && executedGateResults.length > 0 && gatesPassed });
  else if (report.gates?.requested) checks.push({ name: "requested-runtime-gates", passed: executedGateResults.length > 0 && gatesPassed });
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { "scanned-files": scannedFiles, warnings, "runtime-gates-executed": executedGateResults.length, "experience-scenarios": Array.isArray(report.experience?.scenarios) ? report.experience.scenarios.length : 0, "required-experience-scenarios": requiredExperienceScenarios.length, artifacts: artifacts.length } });
}

function safeEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3 || typeof value.file !== "string" || typeof value.line !== "number" || typeof value.rule !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(value.rule)) return null;
  const normalized = path.posix.normalize(value.file);
  if (!value.file || value.file.length > 512 || value.file.includes("\\") || value.file.startsWith("/") || normalized !== value.file || normalized === "." || normalized.startsWith("../") || !Number.isSafeInteger(value.line) || value.line < 1 || value.line > 10000000) return null;
  return Object.freeze({ file: value.file, line: value.line, rule: value.rule });
}
function projectAuditSummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output || typeof job.output.path !== "string" || typeof workspaceRoot !== "string") throw new Error("unavailable");
    const requestedReportFile = path.resolve(job.output.path, "project-audit-report.json");
    const requestedStat = fs.lstatSync(requestedReportFile);
    if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw new Error("unavailable");
    const reportFile = insideRoot(workspaceRoot, requestedReportFile);
    const artifact = Array.isArray(job.artifacts) ? job.artifacts.find((item) => {
      if (!item || item.name !== "project-audit-report.json" || item.mediaType !== "application/json" || typeof item.uri !== "string" || typeof item.sha256 !== "string") return false;
      try { return insideRoot(workspaceRoot, item.uri) === reportFile; } catch { return false; }
    }) : null;
    const stat = fs.lstatSync(reportFile);
    const realWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
    const realReportFile = fs.realpathSync.native(reportFile);
    const reportRelative = path.relative(realWorkspaceRoot, realReportFile);
    if (!artifact || !stat.isFile() || stat.isSymbolicLink() || !reportRelative || reportRelative === ".." || reportRelative.startsWith(`..${path.sep}`) || path.isAbsolute(reportRelative) || stat.size < 2 || stat.size > MAX_REPORT_BYTES || sha256File(reportFile) !== artifact.sha256) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    const summary = report?.summary;
    if (!summary || typeof summary !== "object" || !Number.isSafeInteger(summary.scannedFiles) || summary.scannedFiles < 0 || summary.scannedFiles > MAX_FILES || !Number.isSafeInteger(summary.warnings) || summary.warnings < 0 || summary.warnings > AUDIT_FINDING_IDS.size || !Number.isSafeInteger(summary.unverified) || summary.unverified < 0 || summary.unverified > AUDIT_FINDING_IDS.size || !Array.isArray(report.findings) || report.findings.length > AUDIT_FINDING_IDS.size) throw new Error("unavailable");
    const seen = new Set();
    const auditLevel = auditLevelPlan(report?.scope?.auditLevel);
    const auditDomains = Array.isArray(report?.scope?.auditDomains) ? report.scope.auditDomains : [];
    if (auditDomains.length === 0 || new Set(auditDomains).size !== auditDomains.length || auditDomains.some((id) => !AUDIT_SCOPE_IDS.includes(id))) throw new Error("unavailable");
    const findings = report.findings.map((findingValue) => {
      if (!findingValue || typeof findingValue !== "object" || Array.isArray(findingValue) || Object.keys(findingValue).sort().join(",") !== "assessment,evidence,id,message,passed,severity" || !AUDIT_FINDING_IDS.has(findingValue.id) || seen.has(findingValue.id) || typeof findingValue.passed !== "boolean" || !["info", "warn"].includes(findingValue.severity) || !["observed", "missing", "not-applicable", "not-verified"].includes(findingValue.assessment) || !Array.isArray(findingValue.evidence) || findingValue.evidence.length > MAX_EVIDENCE_PER_FINDING) throw new Error("unavailable");
      seen.add(findingValue.id);
      const evidence = findingValue.evidence.map(safeEvidence);
      if (evidence.some((item) => item === null)) throw new Error("unavailable");
      return Object.freeze({ id: findingValue.id, passed: findingValue.passed, severity: findingValue.severity, assessment: findingValue.assessment, evidence: Object.freeze(evidence) });
    });
    return Object.freeze({
      scope: Object.freeze({ auditLevel: auditLevel.level, auditDomains: Object.freeze([...auditDomains]), coverageStrategy: auditLevel.coverageStrategy, requiredExperienceScenarios: auditLevel.requiredExperienceScenarios, requiresRuntimeGates: auditLevel.requiresRuntimeGates }),
      scannedFiles: summary.scannedFiles,
      warnings: summary.warnings,
      unverified: summary.unverified,
      findings: Object.freeze(findings)
    });
  } catch {
    return null;
  }
}

function auditProject(projectRoot, { gates = Object.freeze({ requested: false, results: Object.freeze([]) }), level, mode = "code", scope, experience = null } = {}) {
  const selectedLevel = auditLevelPlan(level);
  const selectedScopeIds = parseAuditScope(scope);
  const files = listFiles(projectRoot);
  const relative = (file) => path.relative(projectRoot, file).split(path.sep).join("/");
  const names = new Set(files.map(relative));
  const packageFile = path.join(projectRoot, "package.json");
  const packageValue = readJson(packageFile);
  const hasLockfile = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].some((name) => names.has(name));
  const testFiles = files.filter((file) => /(^|[\\/])(test|tests)([\\/]|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(file));
  const workflowFiles = files.filter((file) => /\.github[\\/]workflows[\\/].+\.ya?ml$/i.test(file));
  const sourceFiles = files.filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const productionSourceFiles = sourceFiles.filter((file) => !testFiles.includes(file) && !/(?:^|[\\/])(?:fixtures?|__mocks__)(?:[\\/]|$)/i.test(relative(file)));
  const frontendFramework = packageUsesFrontendFramework(packageValue);
  const frontendFiles = productionSourceFiles.filter((file) => isFrontendSource(file, relative(file), frontendFramework));
  const frontendSupportFiles = frontendFiles.length > 0
    ? [...frontendFiles, ...productionSourceFiles.filter((file) => /\.(?:css|scss|sass|less)$/i.test(file))]
    : [];
  const applicationEntrypointFiles = frontendFiles.filter((file) => /(?:^|[\\/])(?:index|main|app|page|layout)\.(?:[cm]?[jt]sx?|vue|svelte|html)$/i.test(relative(file)) || fileContains(file, PATTERNS.frontendEntrypoint));
  const apiFiles = productionSourceFiles.filter((file) => /(?:^|[\\/])(?:api|routes?|controllers?|server)(?:[\\/]|$)/i.test(relative(file)) || fileContains(file, PATTERNS.apiRoute));
  const documentationFiles = files.filter((file) => /(?:^|[\\/])(?:readme|docs?)(?:[\\/]|\.[a-z]+$)/i.test(relative(file)) || path.basename(file).toLowerCase() === "readme.md");
  const productFlowFiles = documentationFiles.filter((file) => fileContains(file, PATTERNS.productFlow));
  const componentTests = testFiles.filter((file) => fileContains(file, PATTERNS.componentTest));
  const responsiveFiles = frontendSupportFiles.filter((file) => fileContains(file, PATTERNS.responsive));
  const accessibilityFiles = frontendFiles.filter((file) => fileContains(file, PATTERNS.accessibility));
  const validationFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.validation));
  const errorFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.errorRecovery));
  const persistenceFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.persistence));
  const workerFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.worker));
  const journeyStateFiles = frontendFiles.filter((file) => fileContains(file, PATTERNS.journeyState));
  const interactionFeedbackFiles = frontendFiles.filter((file) => fileContains(file, PATTERNS.interactionFeedback));
  const apiContractFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.apiContract));
  const authorizationFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.authorization));
  const observabilityFiles = productionSourceFiles.filter((file) => fileContains(file, PATTERNS.observability));
  const operationsFiles = files.filter((file) => /(?:^|[\\/])(?:dockerfile|docker-compose|compose\..*\.ya?ml|deployment|kubernetes|helm|terraform)(?:\.[^\\/]*)?$/i.test(relative(file)) || /(?:^|[\\/])\.github[\\/]workflows[\\/]/i.test(relative(file)));
  const releaseGovernanceFiles = [...new Set([...workflowFiles, ...operationsFiles])].filter((file) => fileContains(file, PATTERNS.releaseGovernance));
  const isApplication = frontendFiles.length > 0 || apiFiles.length > 0;
  const secretEvidence = scanForSecrets(files, projectRoot);
  const allFindings = [
    finding("project-profile", true, "info", "observed", `${packageValue ? "Node package" : "Repository"} profile; ${sourceFiles.length} text source file(s) examined`, evidenceForFiles(packageValue ? [packageFile] : files, projectRoot, "project-profile", 1)),
    observedFinding("product-entrypoints", applicationEntrypointFiles.length || apiFiles.length, isApplication, "candidate application entrypoint", "no recognizable application entrypoint; product flow needs manual scoping", evidenceForFiles([...applicationEntrypointFiles, ...apiFiles], projectRoot, "product-entrypoints", MAX_EVIDENCE_PER_FINDING, PATTERNS.apiRoute)),
    observedFinding("product-flow-evidence", productFlowFiles.length, isApplication, "candidate user-flow document", "no user-flow documentation was detected", evidenceForFiles(productFlowFiles, projectRoot, "product-flow-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.productFlow)),
    observedFinding("visual-interaction-evidence", componentTests.length, frontendFiles.length > 0, "candidate component or browser interaction test", "visual and interaction behavior was not automatically verified", evidenceForFiles(componentTests, projectRoot, "visual-interaction-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.componentTest), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("responsive-evidence", responsiveFiles.length, frontendFiles.length > 0, "candidate responsive layout", "responsive behavior was not automatically verified", evidenceForFiles(responsiveFiles, projectRoot, "responsive-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.responsive), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("accessibility-evidence", accessibilityFiles.length, frontendFiles.length > 0, "candidate accessibility semantic", "keyboard, focus, contrast and screen-reader behavior require runtime verification", evidenceForFiles(accessibilityFiles, projectRoot, "accessibility-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.accessibility), { missingAssessment: "not-verified", missingSeverity: "info" }),
    finding("package-manifest", Boolean(packageValue), packageValue ? "info" : "warn", packageValue ? "observed" : "missing", packageValue ? "package.json detected" : "package.json is missing", packageValue ? evidenceForFiles([packageFile], projectRoot, "package-manifest", 1) : []),
    finding("dependency-lock", hasLockfile, hasLockfile ? "info" : "warn", hasLockfile ? "observed" : "missing", hasLockfile ? "lockfile detected" : "no supported Node lockfile detected", evidenceForFiles(files.filter((file) => ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(relative(file))), projectRoot, "dependency-lock")),
    finding("automated-tests", testFiles.length > 0, testFiles.length > 0 ? "info" : "warn", testFiles.length > 0 ? "observed" : "missing", `${testFiles.length} test file(s) detected`, evidenceForFiles(testFiles, projectRoot, "automated-tests")),
    finding("ci-workflows", workflowFiles.length > 0, workflowFiles.length > 0 ? "info" : "warn", workflowFiles.length > 0 ? "observed" : "missing", `${workflowFiles.length} CI workflow file(s) detected`, evidenceForFiles(workflowFiles, projectRoot, "ci-workflows")),
    observedFinding("input-validation-evidence", validationFiles.length, isApplication, "candidate input validation", "external-input validation was not evidenced by static patterns", evidenceForFiles(validationFiles, projectRoot, "input-validation-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.validation)),
    observedFinding("error-recovery-evidence", errorFiles.length, isApplication, "candidate error or recovery handler", "error recovery was not evidenced by static patterns", evidenceForFiles(errorFiles, projectRoot, "error-recovery-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.errorRecovery)),
    observedFinding("data-lifecycle-evidence", persistenceFiles.length, apiFiles.length > 0, "candidate persistence or repository implementation", "data lifecycle and consistency require manual data-flow review", evidenceForFiles(persistenceFiles, projectRoot, "data-lifecycle-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.persistence), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("worker-reliability-evidence", workerFiles.length, isApplication, "candidate background task or retry implementation", "background task recovery was not evidenced by static patterns", evidenceForFiles(workerFiles, projectRoot, "worker-reliability-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.worker), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("operations-evidence", operationsFiles.length, true, "deployment, health or CI evidence", "no deployment, health or CI evidence detected", evidenceForFiles(operationsFiles, projectRoot, "operations-evidence")),
    ...enhancedStaticFindings({ mode, isApplication, apiFiles, journeyStateFiles, interactionFeedbackFiles, apiContractFiles, authorizationFiles, observabilityFiles, releaseGovernanceFiles, projectRoot }),
    runtimeGateFinding(gates, { required: selectedLevel.requiresRuntimeGates }),
    experienceReviewFinding(experience, isApplication, { requiredScenarioIds: selectedLevel.requiredExperienceScenarios }),
    finding("possible-secrets", secretEvidence.length === 0, secretEvidence.length === 0 ? "info" : "warn", "observed", secretEvidence.length === 0 ? "no high-confidence inline secret pattern detected" : `${secretEvidence.length} possible secret assignment(s) detected`, secretEvidence)
  ];
  const selectedDomains = AUDIT_DOMAINS.filter((domain) => selectedScopeIds.includes(domain.id));
  const selectedFindingIds = new Set(["project-profile", ...selectedDomains.flatMap((domain) => domain.findings)]);
  if (gates.requested) selectedFindingIds.add("runtime-gates");
  if (experience) selectedFindingIds.add("experience-review");
  const findings = allFindings.filter((item) => selectedFindingIds.has(item.id));
  const allDomainsSelected = selectedScopeIds.length === AUDIT_SCOPE_IDS.length;
  return {
    version: "0.3.0", capability: CAPABILITY, generatedAt: new Date().toISOString(), root: projectRoot,
    scope: { projectKind: isApplication ? "application" : "library-or-tooling", auditLevel: selectedLevel.level, coverageStrategy: selectedLevel.coverageStrategy, evidenceExpectation: selectedLevel.evidenceExpectation, requiredExperienceScenarios: selectedLevel.requiredExperienceScenarios, requiresRuntimeGates: selectedLevel.requiresRuntimeGates, auditMode: mode, auditDomains: selectedScopeIds, staticAnalysis: mode === "code" ? "baseline-candidate-scan-completed" : allDomainsSelected ? "enhanced-four-domain-candidate-scan-completed" : "enhanced-scoped-candidate-scan-completed", runtimeVerification: gates.requested ? "completed" : selectedLevel.requiresRuntimeGates ? "not-verified" : "not-required-for-level", experienceVerification: experience ? "manifest-supplied" : selectedLevel.requiredExperienceScenarios.length ? "not-verified" : "not-required-for-level", visualVerification: experience ? "evidence-manifest-supplied" : frontendFiles.length && selectedLevel.requiredExperienceScenarios.length ? "not-verified" : frontendFiles.length ? "not-required-for-level" : "not-applicable" },
    reviewDomains: mode === "code" ? [] : selectedDomains.map((domain) => ({ id: domain.id, label: domain.label, findingIds: domain.findings })),
    gates,
    experience: experience || { scenarios: [] },
    summary: { scannedFiles: files.length, warnings: findings.filter((item) => item.severity === "warn").length, unverified: findings.filter((item) => item.assessment === "not-verified").length, passed: findings.filter((item) => item.passed).length, failed: findings.filter((item) => !item.passed).length },
    findings
  };
}

function finding(id, passed, severity, assessment, message, evidence = []) { return { id, passed, severity, assessment, message, evidence }; }
function observedFinding(id, count, applicable, observedMessage, missingMessage, evidence, { missingAssessment = "missing", missingSeverity = "warn" } = {}) {
  if (!applicable) return finding(id, true, "info", "not-applicable", "not applicable to the detected project profile", []);
  return finding(id, count > 0, count > 0 ? "info" : missingSeverity, count > 0 ? "observed" : missingAssessment, count > 0 ? `${count} ${observedMessage} detected` : missingMessage, evidence);
}
function enhancedStaticFindings({ mode, isApplication, apiFiles, journeyStateFiles, interactionFeedbackFiles, apiContractFiles, authorizationFiles, observabilityFiles, releaseGovernanceFiles, projectRoot }) {
  if (mode === "code") return [];
  return [
    observedFinding("journey-state-evidence", journeyStateFiles.length, isApplication, "candidate loading, empty, success, error, or recovery UI state", "the primary user journey has no static state-transition evidence", evidenceForFiles(journeyStateFiles, projectRoot, "journey-state-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.journeyState), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("interaction-feedback-evidence", interactionFeedbackFiles.length, isApplication, "candidate interaction or user-feedback implementation", "interaction feedback and disabled/error states require browser verification", evidenceForFiles(interactionFeedbackFiles, projectRoot, "interaction-feedback-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.interactionFeedback), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("api-contract-evidence", apiContractFiles.length, apiFiles.length > 0, "candidate API request, response, or contract", "API contract and failure semantics need a focused data-flow review", evidenceForFiles(apiContractFiles, projectRoot, "api-contract-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.apiContract), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("authorization-evidence", authorizationFiles.length, apiFiles.length > 0, "candidate authentication or authorization boundary", "authorization boundaries were not evidenced by static patterns", evidenceForFiles(authorizationFiles, projectRoot, "authorization-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.authorization), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("observability-evidence", observabilityFiles.length, isApplication, "candidate observability, telemetry, or structured logging implementation", "operational observability was not evidenced by static patterns", evidenceForFiles(observabilityFiles, projectRoot, "observability-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.observability), { missingAssessment: "not-verified", missingSeverity: "info" }),
    observedFinding("release-governance-evidence", releaseGovernanceFiles.length, true, "candidate release, health, rollback, smoke, artifact, or SBOM control", "release governance and rollback evidence were not detected", evidenceForFiles(releaseGovernanceFiles, projectRoot, "release-governance-evidence", MAX_EVIDENCE_PER_FINDING, PATTERNS.releaseGovernance), { missingAssessment: "not-verified", missingSeverity: "info" })
  ];
}
function evidenceForFiles(files, root, rule, limit = MAX_EVIDENCE_PER_FINDING, expression) {
  return files.slice(0, limit).map((file) => ({ file: path.relative(root, file).split(path.sep).join("/"), line: expression ? firstMatchLine(file, expression) : 1, rule }));
}
function packageUsesFrontendFramework(packageValue) {
  const dependencies = packageValue && typeof packageValue === "object"
    ? { ...(packageValue.dependencies || {}), ...(packageValue.devDependencies || {}) }
    : {};
  return Object.keys(dependencies).some((name) => /^(?:react|react-dom|next|vue|nuxt|svelte|@sveltejs\/kit|@angular\/core|solid-js|preact)$/i.test(name));
}
function isFrontendSource(file, relativeFile, frontendFramework) {
  if (/\.(?:jsx|tsx|vue|svelte|html)$/i.test(file)) return true;
  return frontendFramework && /\.(?:[cm]?js|ts)$/i.test(file) && (/(?:^|\/)(?:app|pages?|components?|client|frontend|web|ui)(?:\/|$)/i.test(relativeFile) || fileContains(file, PATTERNS.frontendCode));
}
function firstMatchLine(file, expression) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const flags = expression.flags.replace(/g/g, "");
    const index = content.search(new RegExp(expression.source, flags));
    return index < 0 ? 1 : content.slice(0, index).split("\n").length;
  } catch { return 1; }
}
function fileContains(file, expression) {
  try {
    const stats = fs.statSync(file);
    return stats.size > 0 && stats.size <= MAX_SCANNED_BYTES && expression.test(fs.readFileSync(file, "utf8"));
  } catch { return false; }
}
function auditGateOptions({ runGates = false, gateTimeoutMs } = {}) {
  if (typeof runGates !== "boolean") throw new TypeError("runGates must be a boolean");
  const timeoutMs = gateTimeoutMs === undefined ? DEFAULT_GATE_TIMEOUT_MS : Number(gateTimeoutMs);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_GATE_TIMEOUT_MS) throw new TypeError("gateTimeoutMs must be between 1000 and 600000");
  return Object.freeze({ runGates, gateTimeoutMs: timeoutMs });
}
function runDeclaredProjectGates(projectRoot, options) {
  const gateOptions = auditGateOptions(options);
  const packageValue = readJson(path.join(projectRoot, "package.json"));
  const scripts = packageValue && typeof packageValue.scripts === "object" && !Array.isArray(packageValue.scripts) ? packageValue.scripts : {};
  const packageManager = fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml")) ? "pnpm" : fs.existsSync(path.join(projectRoot, "yarn.lock")) ? "yarn" : "npm";
  const invocation = packageManagerInvocation(packageManager);
  const results = GATE_SCRIPT_NAMES.map((name) => {
    if (typeof scripts[name] !== "string" || !scripts[name].trim()) return Object.freeze({ name, status: "not-configured", durationMs: 0 });
    const startedAt = Date.now();
    // Gate output can be large (notably TAP test output). The audit report records
    // only status and duration, so buffering child output would turn a successful
    // but verbose gate into an ENOBUFS "unavailable" result.
    const result = childProcess.spawnSync(invocation.executable, [...invocation.prefix, "run", name], { cwd: projectRoot, stdio: "ignore", windowsHide: true, timeout: gateOptions.gateTimeoutMs });
    const durationMs = Date.now() - startedAt;
    if (result.error) return Object.freeze({ name, status: "unavailable", durationMs });
    return Object.freeze({ name, status: result.status === 0 ? "passed" : "failed", durationMs });
  });
  return Object.freeze({ requested: true, results: Object.freeze(results) });
}
function packageManagerInvocation(packageManager) {
  if (packageManager === "npm") {
    const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (fs.existsSync(npmCli)) return Object.freeze({ executable: process.execPath, prefix: Object.freeze([npmCli]) });
  }
  return Object.freeze({ executable: process.platform === "win32" ? `${packageManager}.cmd` : packageManager, prefix: Object.freeze([]) });
}
function runtimeGateFinding(gates, { required = true } = {}) {
  if (typeof required !== "boolean") throw new TypeError("runtime gate requirement must be a boolean");
  const requested = gates && gates.requested === true;
  const results = Array.isArray(gates?.results) ? gates.results : [];
  if (!requested && !required) return finding("runtime-gates", true, "info", "not-applicable", "runtime gates are not required for the selected quick audit level", []);
  if (!requested) return finding("runtime-gates", false, "info", "not-verified", "runtime gates were not requested; static evidence does not prove tests, builds, SCA or production behavior", []);
  const executed = results.filter((result) => result.status !== "not-configured");
  const passed = executed.length > 0 && executed.every((result) => result.status === "passed");
  return finding("runtime-gates", passed, passed ? "info" : "warn", passed ? "observed" : "missing", passed ? `${executed.length} requested local gate(s) passed` : "one or more requested local gates failed or were unavailable", []);
}
function readJson(file) { try { return fs.existsSync(file) && fs.statSync(file).isFile() ? JSON.parse(fs.readFileSync(file, "utf8")) : null; } catch { return null; } }
function listFiles(root) {
  const files = [];
  const queue = [root];
  while (queue.length && files.length < MAX_FILES) {
    const directory = queue.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) queue.push(candidate);
      if (entry.isFile()) files.push(candidate);
      if (files.length >= MAX_FILES) break;
    }
  }
  return files.sort();
}
function scanForSecrets(files, root) {
  const pattern = /(?:api[_-]?key|access[_-]?token|secret|password)\s*[=:]\s*["'][^"'\r\n]{12,}["']/ig;
  const evidence = [];
  let scannedBytes = 0;
  for (const file of files) {
    if (evidence.length >= 25) break;
    const stats = fs.statSync(file);
    if (stats.size === 0 || stats.size > MAX_SCANNED_BYTES || scannedBytes + stats.size > MAX_SECRET_SCAN_BYTES || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    let content;
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    scannedBytes += stats.size;
    let match;
    while ((match = pattern.exec(content)) && evidence.length < 25) evidence.push({ file: path.relative(root, file).split(path.sep).join("/"), line: content.slice(0, match.index).split("\n").length, rule: "inline-secret-assignment" });
  }
  return evidence;
}
function writeReport(outputRoot, report) {
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const jsonFile = path.join(outputRoot, "project-audit-report.json");
  const markdownFile = path.join(outputRoot, "project-audit-report.md");
  writeAtomically(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomically(markdownFile, renderMarkdown(report));
  return [artifact(jsonFile, "project-audit-report.json", "application/json"), artifact(markdownFile, "project-audit-report.md", "text/markdown")];
}
function writeAtomically(file, contents) { const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 }); fs.renameSync(temporary, file); }
function artifact(file, name, mediaType) { return { name, mediaType, uri: file, sha256: sha256File(file) }; }
function renderMarkdown(report) {
  const gates = Array.isArray(report.gates?.results) && report.gates.results.length
    ? report.gates.results.map((gate) => `| ${gate.name} | ${gate.status} | ${gate.durationMs} |`).join("\n")
    : "| not requested | not-verified | 0 |";
  const findingById = new Map(Array.isArray(report.findings) ? report.findings.map((finding) => [finding.id, finding]) : []);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const reviewItems = findings.filter((item) => item?.severity === "warn" || (item?.passed === false && item?.assessment === "missing"));
  const evidenceGaps = findings.filter((item) => item?.assessment === "not-verified");
  const reviewTable = reviewItems.length
    ? `| Priority | Area | Problem | Evidence | Next action |\n| --- | --- | --- | --- | --- |\n${reviewItems.map((item) => `| ${item.severity === "warn" ? "P1" : "P2"} | ${markdownCell(item.id)} | ${markdownCell(item.message)} | ${markdownCell(renderFindingEvidence(item))} | ${markdownCell(nextAction(item.id))} |`).join("\n")}`
    : "- No confirmed warning-level static findings. This does not close the evidence gaps below.";
  const gapTable = evidenceGaps.length
    ? `| Area | Missing verification | Next evidence |\n| --- | --- | --- |\n${evidenceGaps.map((item) => `| ${markdownCell(item.id)} | ${markdownCell(item.message)} | ${markdownCell(nextAction(item.id))} |`).join("\n")}`
    : "- No evidence gaps were recorded for the requested scope.";
  const reviewDomains = Array.isArray(report.reviewDomains) && report.reviewDomains.length
    ? report.reviewDomains.map((domain) => {
      const coverage = Array.isArray(domain.findingIds)
        ? domain.findingIds.map((id) => `${id}: ${findingById.get(id)?.assessment || "not-verified"}`).join("; ")
        : "not-verified";
      return `- ${domain.label}: ${coverage}`;
    }).join("\n")
    : "- Baseline code/static review only; use enhanced mode for four-domain coverage.";
  return `# Project audit\n\n## Overall judgment\n\n${reviewItems.length} review item(s) and ${evidenceGaps.length} evidence gap(s) were identified. Static matches are candidate evidence, not proof that the related design or control is healthy.\n\n## Scope and limits\n\n- Audit level: ${report.scope?.auditLevel || "standard"}\n- Coverage strategy: ${report.scope?.coverageStrategy || "representative-journeys"}\n- Evidence expectation: ${report.scope?.evidenceExpectation || "representative journey, state, viewport, and related code evidence"}\n- Required experience scenarios: ${Array.isArray(report.scope?.requiredExperienceScenarios) && report.scope.requiredExperienceScenarios.length ? report.scope.requiredExperienceScenarios.join(", ") : "none"}\n- Runtime gates required by level: ${report.scope?.requiresRuntimeGates === true ? "yes" : "no"}\n- Audit mode: ${report.scope?.auditMode || "code"}\n- Audit domains: ${Array.isArray(report.scope?.auditDomains) ? report.scope.auditDomains.join(", ") : "all"}\n- Project profile: ${report.scope?.projectKind || "unknown"}\n- Static analysis: ${report.scope?.staticAnalysis || "unknown"}\n- Runtime verification: ${report.scope?.runtimeVerification || "unknown"}\n- Experience verification: ${report.scope?.experienceVerification || "unknown"}\n- Visual verification: ${report.scope?.visualVerification || "unknown"}\n- Scanned files: ${report.summary.scannedFiles}\n- Warnings: ${report.summary.warnings}\n- Not verified: ${report.summary.unverified}\n\n## Review items\n\n${reviewTable}\n\n## Evidence gaps\n\n${gapTable}\n\n## Requested review coverage\n\n${reviewDomains}\n\n## Evidence inventory\n\n| Area | Assessment | Status | Evidence | Candidate signal |\n| --- | --- | --- | --- | --- |\n${findings.map((item) => `| ${markdownCell(item.id)} | ${markdownCell(item.assessment)} | ${findingStatus(item)} | ${markdownCell(renderFindingEvidence(item))} | ${markdownCell(item.message)} |`).join("\n")}\n\n## Local runtime gates\n\n| Gate | Status | Duration (ms) |\n| --- | --- | ---: |\n${gates}\n\n## Experience evidence\n\n- Supplied scenarios: ${Array.isArray(report.experience?.scenarios) ? report.experience.scenarios.length : 0}\n- A supplied manifest proves only that bounded capture files exist. Inspect every screenshot and console/network artifact before promoting a scenario to verified health.\n\n## Interpretation\n\n- Audit level controls depth and evidence expectations; it does not authorize browser automation, project gates, or remote upload.\n- \`observed\` means candidate source or artifact evidence was found; it is not a design-quality pass.\n- \`not-verified\` requires real browser, keyboard, responsive, accessibility, network, gate, or deployment evidence.\n- Runtime gates run only when explicitly requested locally; this audit never runs project code by default.\n- Possible-secret evidence identifies only relative paths and line numbers. It never includes matched values.\n`;
}
function findingStatus(item) {
  if (item.assessment === "not-applicable") return "not-applicable";
  if (item.assessment === "not-verified") return "not-verified";
  if (!item.passed || item.severity === "warn") return "review";
  return "observed";
}
function renderFindingEvidence(item) {
  const evidence = Array.isArray(item?.evidence) ? item.evidence : [];
  if (!evidence.length) return "none";
  const visible = evidence.slice(0, 3).map((value) => `${value.file}:${value.line}`);
  return `${visible.join(", ")}${evidence.length > visible.length ? ` (+${evidence.length - visible.length} more)` : ""}`;
}
function markdownCell(value) { return String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }
function nextAction(id) {
  const actions = {
    "possible-secrets": "Inspect the referenced assignments without exposing values; remove or rotate any real credential and add a regression check.",
    "runtime-gates": "Run the declared check, lint, typecheck, test, and build gates only with explicit authorization.",
    "experience-review": "Capture and inspect the primary journey, responsive, keyboard, accessibility, console, and network scenarios.",
    "visual-interaction-evidence": "Exercise the primary flow in a browser and inspect stable screenshots plus interaction states.",
    "responsive-evidence": "Verify narrow, wide, zoomed, and reflowed layouts with captured evidence.",
    "accessibility-evidence": "Verify keyboard order, visible focus, labels, contrast, state announcements, and assistive-technology behavior.",
    "release-governance-evidence": "Provide and inspect release, health-check, rollback, artifact, and recovery evidence."
  };
  return actions[id] || "Inspect the referenced candidate evidence, confirm the boundary is complete, and add a focused verification or regression test.";
}

module.exports = { CAPABILITY, DEFAULT_GATE_TIMEOUT_MS, REGISTRATION, auditGateOptions, auditProject, createExperienceEvidenceTemplate, createProjectAuditJob, projectAuditQuality, projectAuditSummary, renderMarkdown, runDeclaredProjectGates, runProjectAuditJob, writeReport };
