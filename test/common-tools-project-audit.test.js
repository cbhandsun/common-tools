"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { auditProject, createExperienceEvidenceTemplate, createProjectAuditJob, projectAuditQuality, projectAuditSummary, renderMarkdown, runProjectAuditJob } = require("../packages/project-audit-core");
const { auditLevelPlan, parseAuditLevel, promptAuditLevel, renderAuditLevelMenu } = require("../packages/project-audit-core/audit-level");
const { auditIntentPlan, auditModeOptions } = require("../packages/project-audit-core/audit-mode");
const { AUDIT_SCOPE_IDS, parseAuditScope, promptAuditScope, renderAuditScopeMenu } = require("../packages/project-audit-core/audit-scope");
const { BROWSERS, collectBrowserExperience, readExperiencePlan } = require("../packages/project-audit-core/browser-experience");
const { readExperienceEvidence } = require("../packages/project-audit-core/experience-evidence");
const { setCapabilityEnabled } = require("../packages/capability-runtime");
const { callTool } = require("../packages/mcp-server/core");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-audit-"));
  fs.mkdirSync(path.join(root, "test"));
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "ignored"), { recursive: true });
  fs.mkdirSync(path.join(root, "artifacts", "old-release"), { recursive: true });
  fs.mkdirSync(path.join(root, ".codex-tmp", "stale-audit"), { recursive: true });
  fs.mkdirSync(path.join(root, ".tools", "cache"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
  fs.writeFileSync(path.join(root, "test", "sample.test.js"), "test('ok', () => {});\n");
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), "name: ci\n");
  fs.writeFileSync(path.join(root, "src.js"), "const apiKey = 'abcdefghijklmnop';\n");
  fs.writeFileSync(path.join(root, "node_modules", "ignored", "secret.js"), "const apiKey = 'abcdefghijklmnop';\n");
  fs.writeFileSync(path.join(root, "artifacts", "old-release", "secret.js"), "const apiKey = 'abcdefghijklmnop';\n");
  fs.writeFileSync(path.join(root, ".codex-tmp", "stale-audit", "secret.js"), "const apiKey = 'abcdefghijklmnop';\n");
  fs.writeFileSync(path.join(root, ".tools", "cache", "secret.js"), "const apiKey = 'abcdefghijklmnop';\n");
  return root;
}

test("project audit writes evidence-only JSON and Markdown artifacts", () => {
  const root = fixture();
  try {
    const stateRoot = path.join(root, ".audit-state");
    const output = path.join(root, "audit-output");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output });
    const completed = runProjectAuditJob({ stateRoot, ownerId: "test-user", id: job.id });
    assert.equal(completed.status, "succeeded");
    assert.deepEqual(completed.artifacts.map((artifact) => artifact.name), ["project-audit-report.json", "project-audit-report.md"]);
    const report = JSON.parse(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8"));
    assert.deepEqual(completed.quality, { passed: false, checks: [{ name: "project-scanned", passed: true }, { name: "reports-generated", passed: true }, { name: "no-audit-warnings", passed: false }, { name: "level-required-runtime-gates", passed: false }], metrics: { "scanned-files": report.summary.scannedFiles, warnings: report.summary.warnings, "runtime-gates-executed": 0, "experience-scenarios": 0, "required-experience-scenarios": 5, artifacts: 2 } });
    const secretFinding = report.findings.find((finding) => finding.id === "possible-secrets");
    assert.equal(secretFinding.passed, false);
    assert.deepEqual(secretFinding.evidence, [{ file: "src.js", line: 1, rule: "inline-secret-assignment" }]);
    assert.equal(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8").includes("abcdefghijklmnop"), false);
    assert.deepEqual(projectAuditSummary(completed, root), { scope: { auditLevel: "standard", auditDomains: ["product-journey", "visual-interaction", "data-security", "engineering-delivery"], coverageStrategy: "representative-journeys", requiredExperienceScenarios: ["first-visit", "core-flow", "state-feedback", "responsive", "keyboard"], requiresRuntimeGates: true }, scannedFiles: report.summary.scannedFiles, warnings: report.summary.warnings, unverified: report.summary.unverified, findings: report.findings.map((finding) => ({ id: finding.id, passed: finding.passed, severity: finding.severity, assessment: finding.assessment, evidence: finding.evidence })) });
    setCapabilityEnabled(stateRoot, "project-audit", true);
    const mcpJob = callTool("create_project_audit_job", { output: path.join(root, "mcp-audit"), level: "deep", scope: "3" }, { workspaceRoot: root, stateRoot, ownerId: "test-user" });
    assert.equal(mcpJob.audit.level, "deep");
    assert.deepEqual(mcpJob.audit.scopes, ["visual-interaction"]);
    assert.throws(() => callTool("create_project_audit_job", { output: path.join(root, "invalid-mcp-audit"), level: "unknown" }, { workspaceRoot: root, stateRoot, ownerId: "test-user" }), /declared input schema/);
    const mcpReport = callTool("get_project_audit_report", { id: job.id }, { workspaceRoot: root, stateRoot, ownerId: "test-user" });
    assert.deepEqual(mcpReport.audit, projectAuditSummary(completed, root));
    fs.writeFileSync(path.join(output, "project-audit-report.json"), JSON.stringify({ summary: { scannedFiles: 1, warnings: 0 }, findings: [] }));
    assert.equal(projectAuditSummary(completed, root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project audit quality exposes warnings and explicitly requested gate failures", () => {
  assert.deepEqual(projectAuditQuality({ summary: { scannedFiles: 10, warnings: 3 } }, [{}, {}]), { passed: false, checks: [{ name: "project-scanned", passed: true }, { name: "reports-generated", passed: true }, { name: "no-audit-warnings", passed: false }], metrics: { "scanned-files": 10, warnings: 3, "runtime-gates-executed": 0, "experience-scenarios": 0, "required-experience-scenarios": 0, artifacts: 2 } });
  assert.deepEqual(projectAuditQuality({ summary: { scannedFiles: 10, warnings: 0 }, gates: { requested: true, results: [{ name: "test", status: "failed", durationMs: 1 }] } }, [{}, {}]), { passed: false, checks: [{ name: "project-scanned", passed: true }, { name: "reports-generated", passed: true }, { name: "no-audit-warnings", passed: true }, { name: "requested-runtime-gates", passed: false }], metrics: { "scanned-files": 10, warnings: 0, "runtime-gates-executed": 1, "experience-scenarios": 0, "required-experience-scenarios": 0, artifacts: 2 } });
  assert.equal(projectAuditQuality({ summary: { scannedFiles: 10, warnings: 0 }, gates: { requested: true, results: [] } }, [{}, {}]).checks.at(-1).passed, false);
  assert.throws(() => projectAuditQuality({ summary: { scannedFiles: -1, warnings: 0 } }, []), /quality input/);
});

test("project audit reports product, visual, engineering and runtime evidence without claiming unrun checks", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() { return <main aria-label='home'><label>Search</label></main>; }\n");
    fs.writeFileSync(path.join(root, "src", "api.ts"), "export const handler = async (value) => { try { return schema.safeParse(value); } catch (error) { return null; } };\n");
    fs.writeFileSync(path.join(root, "src", "layout.css"), "@media (max-width: 640px) { main { display: block; } }\n");
    fs.writeFileSync(path.join(root, "README.md"), "# Product\n\nCreate → process → export\n");
    const output = path.join(root, "audit-layered");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot: path.join(root, ".state-layered"), ownerId: "test-user", projectRoot: root, output });
    const completed = runProjectAuditJob({ stateRoot: path.join(root, ".state-layered"), ownerId: "test-user", id: job.id });
    const report = JSON.parse(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8"));
    assert.equal(report.scope.projectKind, "application");
    assert.equal(report.scope.runtimeVerification, "not-verified");
    assert.equal(report.findings.find((finding) => finding.id === "runtime-gates").assessment, "not-verified");
    assert.equal(report.findings.find((finding) => finding.id === "runtime-gates").passed, false);
    for (const id of ["product-entrypoints", "product-flow-evidence", "responsive-evidence", "accessibility-evidence", "input-validation-evidence", "error-recovery-evidence"]) assert.equal(report.findings.find((finding) => finding.id === id).assessment, "observed");
    const markdown = fs.readFileSync(path.join(output, "project-audit-report.md"), "utf8");
    assert.match(markdown, /Static matches are candidate evidence/);
    assert.match(markdown, /## Review items/);
    assert.match(markdown, /src\.js:1/);
    assert.doesNotMatch(markdown, /\| pass \|/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary project audit uses the enhanced four-domain static review without running project code", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() { const loading = false; return <main><button disabled={loading} onClick={() => {}}>Continue</button></main>; }\n");
    fs.writeFileSync(path.join(root, "src", "routes", "api.ts"), "export async function handler(request) { const response = await fetch('/api'); if (!request.user?.role) throw new Error('authorization'); logger.info({ status: response.status }); return response; }\n");
    fs.writeFileSync(path.join(root, ".github", "workflows", "release.yml"), "name: release\nsteps:\n  - run: npm run build\n  - run: deploy --healthcheck --rollback\n");
    const stateRoot = path.join(root, ".state-enhanced");
    const output = path.join(root, "audit-enhanced");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output, instruction: "审计当前项目" });
    const completed = runProjectAuditJob({ stateRoot, ownerId: "test-user", id: job.id });
    const report = JSON.parse(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8"));
    assert.equal(completed.status, "succeeded");
    assert.equal(report.scope.auditMode, "enhanced");
    assert.equal(report.scope.auditLevel, "standard");
    assert.equal(report.scope.coverageStrategy, "representative-journeys");
    assert.equal(report.scope.staticAnalysis, "enhanced-four-domain-candidate-scan-completed");
    assert.deepEqual(report.reviewDomains.map((domain) => domain.id), ["product-journey", "visual-interaction", "data-security", "engineering-delivery"]);
    for (const id of ["journey-state-evidence", "interaction-feedback-evidence", "api-contract-evidence", "authorization-evidence", "observability-evidence", "release-governance-evidence"]) assert.equal(report.findings.find((finding) => finding.id === id).assessment, "observed");
    assert.equal(report.scope.runtimeVerification, "not-verified");
    const markdown = fs.readFileSync(path.join(output, "project-audit-report.md"), "utf8");
    assert.match(markdown, /## Requested review coverage/);
    assert.match(markdown, /Audit level: standard/);
    assert.match(markdown, /产品闭环/);
    assert.match(markdown, /工程与交付/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("audit implementation regexes do not make a tooling package look like a frontend application", () => {
  const packageRoot = path.join(__dirname, "..", "packages", "project-audit-core");
  const report = auditProject(packageRoot, { mode: "enhanced" });
  assert.equal(report.scope.projectKind, "library-or-tooling");
  for (const id of ["product-entrypoints", "responsive-evidence", "accessibility-evidence", "journey-state-evidence", "interaction-feedback-evidence", "experience-review"]) {
    assert.equal(report.findings.find((finding) => finding.id === id).assessment, "not-applicable");
  }
});

test("candidate evidence points to the actual matching line", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() {\n  return (\n    <main aria-label='home'>Ready</main>\n  );\n}\n");
    const report = auditProject(root, { mode: "enhanced" });
    const finding = report.findings.find((item) => item.id === "accessibility-evidence");
    assert.deepEqual(finding.evidence, [{ file: "src/App.tsx", line: 3, rule: "accessibility-evidence" }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project audit runs only declared local gates when explicitly requested", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { check: "node -e \"process.exit(0)\"", lint: "node -e \"process.exit(1)\"" } }));
    const stateRoot = path.join(root, ".state-gates");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output: path.join(root, "audit-gates"), runGates: true, gateTimeoutMs: 30000 });
    const completed = runProjectAuditJob({ stateRoot, ownerId: "test-user", id: job.id });
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.quality.passed, false);
    const report = JSON.parse(fs.readFileSync(path.join(root, "audit-gates", "project-audit-report.json"), "utf8"));
    assert.equal(report.gates.requested, true);
    assert.deepEqual(report.gates.results.map((result) => [result.name, result.status]), [["check", "passed"], ["lint", "failed"], ["typecheck", "not-configured"], ["test", "not-configured"], ["build", "not-configured"]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project audit gates do not misclassify successful verbose commands as unavailable", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { check: "node -e \"process.stdout.write('x'.repeat(70000))\"" } }));
    const stateRoot = path.join(root, ".state-verbose-gate");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output: path.join(root, "audit-verbose-gate"), runGates: true, gateTimeoutMs: 30000 });
    const completed = runProjectAuditJob({ stateRoot, ownerId: "test-user", id: job.id });
    const report = JSON.parse(fs.readFileSync(path.join(root, "audit-verbose-gate", "project-audit-report.json"), "utf8"));
    assert.equal(completed.status, "succeeded");
    assert.equal(report.gates.results.find((gate) => gate.name === "check").status, "passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("audit intent maps natural-language requests to a bounded, explainable mode", () => {
  assert.deepEqual(auditIntentPlan({ instruction: "请做完整产品体验审视，并运行测试门禁" }).mode, "full");
  assert.deepEqual(auditIntentPlan({ instruction: "只做代码审计，不要运行任何内容" }).mode, "code");
  assert.deepEqual(auditIntentPlan({ instruction: "审计当前项目" }).mode, "enhanced");
  assert.equal(auditIntentPlan({ instruction: "验证响应式、键盘操作和浏览器主链路" }).mode, "experience");
  assert.throws(() => auditModeOptions({ mode: "gates" }), /explicit --run-gates/);
  assert.throws(() => auditModeOptions({ mode: "experience" }), /experience-evidence/);
  assert.throws(() => auditModeOptions({ mode: "code", runGates: true }), /does not allow/);
});

test("audit level defaults to standard and supports safe interactive selection", async () => {
  assert.equal(parseAuditLevel().id, "standard");
  assert.equal(parseAuditLevel("1").id, "quick");
  assert.equal(parseAuditLevel("standard").id, "standard");
  assert.deepEqual(auditLevelPlan("3"), {
    level: "deep",
    label: "深度审计",
    coverageStrategy: "risk-driven-comprehensive",
    evidenceExpectation: "risk-driven comprehensive runtime, accessibility, security, and delivery evidence",
    requiredExperienceScenarios: ["first-visit", "core-flow", "result-followup", "state-feedback", "recovery", "responsive", "keyboard", "console-network"],
    requiresRuntimeGates: true
  });
  for (const value of ["", "0", "4", "unknown", "quick\nstandard"]) assert.throws(() => parseAuditLevel(value), /audit level/);
  let promptText = "";
  const levelAnswers = ["unknown", "2"];
  const selected = await promptAuditLevel({ output: { write: (value) => { promptText += value; } }, ask: async () => levelAnswers.shift() });
  assert.equal(selected, "standard");
  assert.match(promptText, /2\. 标准审计/);
  assert.match(promptText, /输入无效/);
  assert.match(renderAuditLevelMenu(), /不授权运行浏览器/);
});

test("audit scope accepts all, single and combined numbered choices and rejects ambiguous input", async () => {
  assert.deepEqual(parseAuditScope(), AUDIT_SCOPE_IDS);
  assert.deepEqual(parseAuditScope("1"), AUDIT_SCOPE_IDS);
  assert.deepEqual(parseAuditScope("all"), AUDIT_SCOPE_IDS);
  assert.deepEqual(parseAuditScope("2,4"), ["product-journey", "data-security"]);
  assert.deepEqual(parseAuditScope("engineering-delivery,visual-interaction"), ["visual-interaction", "engineering-delivery"]);
  for (const value of ["", "0", "1,2", "2,2", "2,,3", "unknown"]) assert.throws(() => parseAuditScope(value), /audit scope/);
  let promptText = "";
  const scopeAnswers = ["1,2", "3,5"];
  const selected = await promptAuditScope({ output: { write: (value) => { promptText += value; } }, ask: async () => scopeAnswers.shift() });
  assert.equal(selected, "visual-interaction,engineering-delivery");
  assert.match(promptText, /1\. 全部四域/);
  assert.match(promptText, /输入无效/);
  assert.equal(renderAuditScopeMenu().includes("2,3"), true);
});

test("audit levels change required evidence without expanding authorization", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() { return <main aria-label='home'>Ready</main>; }\n");
    fs.mkdirSync(path.join(root, "evidence"));
    fs.writeFileSync(path.join(root, "evidence", "screen.png"), "bounded-capture-reference");
    const standardScenarioIds = ["first-visit", "core-flow", "state-feedback", "responsive", "keyboard"];
    fs.writeFileSync(path.join(root, "standard-experience.json"), JSON.stringify({ schemaVersion: 1, scenarios: standardScenarioIds.map((id) => ({ id, status: "passed", evidence: [{ kind: "screenshot", file: "evidence/screen.png" }] })) }));
    const standardExperience = readExperienceEvidence(root, "standard-experience.json");
    const quick = auditProject(root, { level: "quick", mode: "enhanced", scope: "3,5" });
    assert.equal(quick.scope.runtimeVerification, "not-required-for-level");
    assert.equal(quick.scope.experienceVerification, "not-required-for-level");
    assert.equal(quick.findings.find((finding) => finding.id === "runtime-gates").assessment, "not-applicable");
    assert.equal(quick.findings.find((finding) => finding.id === "experience-review").assessment, "not-applicable");

    const standard = auditProject(root, { level: "standard", mode: "enhanced", scope: "3,5" });
    assert.equal(standard.scope.requiredExperienceScenarios.length, 5);
    assert.equal(standard.scope.runtimeVerification, "not-verified");
    assert.equal(standard.findings.find((finding) => finding.id === "runtime-gates").assessment, "not-verified");
    assert.equal(standard.findings.find((finding) => finding.id === "experience-review").assessment, "not-verified");
    assert.ok(projectAuditQuality(standard, [{}, {}]).checks.some((check) => check.name === "level-required-experience" && check.passed === false));
    assert.ok(projectAuditQuality(standard, [{}, {}]).checks.some((check) => check.name === "level-required-runtime-gates" && check.passed === false));
    assert.equal(projectAuditQuality(quick, [{}, {}]).checks.some((check) => check.name.startsWith("level-required-")), false);

    const evidencedStandard = auditProject(root, { level: "standard", mode: "enhanced", scope: "3", experience: standardExperience });
    assert.equal(evidencedStandard.findings.find((finding) => finding.id === "experience-review").passed, true);

    const deep = auditProject(root, { level: "deep", mode: "enhanced", scope: "3,5", experience: standardExperience });
    assert.equal(deep.scope.requiredExperienceScenarios.length, 8);
    assert.equal(deep.scope.requiresRuntimeGates, true);
    assert.equal(deep.findings.find((finding) => finding.id === "experience-review").passed, false);
    assert.match(deep.findings.find((finding) => finding.id === "experience-review").message, /3 not verified/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scoped audit records selected domains and excludes unrelated findings", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() { return <main aria-label='home'><button onClick={() => {}}>Continue</button></main>; }\n");
    const report = auditProject(root, { mode: "enhanced", scope: "3" });
    assert.deepEqual(report.scope.auditDomains, ["visual-interaction"]);
    assert.equal(report.scope.staticAnalysis, "enhanced-scoped-candidate-scan-completed");
    assert.deepEqual(report.reviewDomains.map((domain) => domain.id), ["visual-interaction"]);
    assert.equal(report.findings.some((finding) => finding.id === "accessibility-evidence"), true);
    assert.equal(report.findings.some((finding) => finding.id === "input-validation-evidence"), false);
    assert.equal(report.findings.some((finding) => finding.id === "package-manifest"), false);
    assert.match(renderMarkdown(report), /Audit domains: visual-interaction/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("experience evidence template creates the complete bounded checklist without overwriting files", () => {
  const root = fixture();
  try {
    const created = createExperienceEvidenceTemplate(root, "audit-evidence/experience.json");
    assert.equal(created.scenarioIds.length, 8);
    const template = JSON.parse(fs.readFileSync(created.file, "utf8"));
    assert.equal(template.schemaVersion, 1);
    assert.deepEqual(template.scenarios.map((scenario) => scenario.status), Array(8).fill("not-verified"));
    assert.throws(() => createExperienceEvidenceTemplate(root, "audit-evidence/experience.json"), /already exists/);
    assert.throws(() => createExperienceEvidenceTemplate(root, "audit-evidence/experience.txt"), /JSON file/);
    assert.throws(() => createExperienceEvidenceTemplate(root, "../experience.json"), /outside the approved root/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("browser experience collector accepts only a bounded local plan and emits reusable evidence references", async () => {
  const root = fixture();
  try {
    const scenarios = ["first-visit", "core-flow", "result-followup", "state-feedback", "recovery", "responsive", "keyboard", "console-network"].map((id) => ({ id, actions: [{ type: "navigate", path: "/" }] }));
    fs.writeFileSync(path.join(root, "experience-plan.json"), JSON.stringify({ schemaVersion: 1, baseUrl: "http://127.0.0.1:3000/", scenarios }));
    assert.equal(readExperiencePlan(root, "experience-plan.json").scenarios.length, 8);
    fs.writeFileSync(path.join(root, "external-plan.json"), JSON.stringify({ schemaVersion: 1, baseUrl: "https://example.com/", scenarios }));
    assert.throws(() => readExperiencePlan(root, "external-plan.json"), /loopback host/);
    fs.writeFileSync(path.join(root, "unsafe-plan.json"), JSON.stringify({ schemaVersion: 1, baseUrl: "http://127.0.0.1:3000/", scenarios: [{ id: "first-visit", actions: [{ type: "fill", selector: "#password", value: "never-store-this" }] }] }));
    assert.throws(() => readExperiencePlan(root, "unsafe-plan.json"), /fill action/);
    const listeners = new Map();
    const calls = [];
    const fakeClient = {
      async send(method, params = {}) {
        calls.push({ method, params });
        if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
        return {};
      },
      on(method, listener) { listeners.set(method, listener); },
      close() {}
    };
    let killed = false;
    const collected = await collectBrowserExperience({
      projectRoot: root,
      planFile: "experience-plan.json",
      output: "browser-evidence",
      processFactory: () => ({ kill() { killed = true; } }),
      browserResolver: () => "browser.exe",
      fetchVersion: async () => ([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:12345/devtools/page/test" }]),
      cdpFactory: async () => fakeClient
    });
    assert.equal(killed, true);
    assert.equal(collected.scenarios.length, 8);
    assert.ok(calls.some((call) => call.method === "Fetch.enable"));
    const evidence = readExperienceEvidence(root, "browser-evidence/experience.json");
    assert.equal(evidence.scenarios.length, 8);
    assert.equal(evidence.scenarios.every((scenario) => scenario.status === "not-verified"), true);
    assert.equal(evidence.scenarios[0].evidence[0].file, "browser-evidence/first-visit.png");
    assert.equal(fs.readFileSync(path.join(root, "browser-evidence", "experience.json"), "utf8").includes("never-store-this"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("browser experience collector completes against a local browser only when Chrome is installed", async (t) => {
  if (!BROWSERS.chrome.some((file) => file && fs.existsSync(file))) {
    t.skip("Chrome is not installed in this test environment");
    return;
  }
  const root = fixture();
  const server = http.createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><main aria-label='audit fixture'>ready</main>");
      return;
    }
    response.writeHead(404).end();
  });
  try {
    await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
    const address = server.address();
    const scenarios = ["first-visit", "core-flow", "result-followup", "state-feedback", "recovery", "responsive", "keyboard", "console-network"].map((id) => ({ id, actions: [{ type: "navigate", path: "/" }] }));
    fs.writeFileSync(path.join(root, "live-plan.json"), JSON.stringify({ schemaVersion: 1, baseUrl: `http://127.0.0.1:${address.port}/`, scenarios }));
    const collected = await collectBrowserExperience({ projectRoot: root, planFile: "live-plan.json", output: "live-evidence", timeoutMs: 20000 });
    assert.equal(collected.scenarios.every((scenario) => scenario.status === "not-verified"), true);
    assert.equal(readExperienceEvidence(root, "live-evidence/experience.json").scenarios.length, 8);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("full audit stores only bounded experience capture references and fails its quality check on a failed scenario", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "App.tsx"), "export function App() { return <main />; }\n");
    fs.mkdirSync(path.join(root, "evidence"));
    fs.writeFileSync(path.join(root, "evidence", "screen.png"), "not-a-real-png-but-a-capture-reference");
    const scenarios = ["first-visit", "core-flow", "result-followup", "state-feedback", "recovery", "responsive", "keyboard", "console-network"].map((id) => ({ id, status: id === "recovery" ? "failed" : "passed", evidence: [{ kind: "screenshot", file: "evidence/screen.png" }] }));
    fs.writeFileSync(path.join(root, "experience.json"), JSON.stringify({ schemaVersion: 1, scenarios }));
    const stateRoot = path.join(root, ".state-full");
    const output = path.join(root, "audit-full");
    const job = createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output, mode: "full", runGates: true, gateTimeoutMs: 5000, experienceEvidence: "experience.json" });
    const completed = runProjectAuditJob({ stateRoot, ownerId: "test-user", id: job.id });
    const report = JSON.parse(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8"));
    assert.equal(report.scope.auditMode, "full");
    assert.equal(report.scope.experienceVerification, "manifest-supplied");
    assert.equal(report.findings.find((finding) => finding.id === "experience-review").passed, false);
    assert.equal(completed.quality.passed, false);
    assert.ok(completed.quality.checks.some((check) => check.name === "level-required-experience" && check.passed === false));
    assert.equal(fs.readFileSync(path.join(output, "project-audit-report.json"), "utf8").includes("not-a-real-png"), false);
    assert.throws(() => createProjectAuditJob({ workspaceRoot: root, stateRoot, ownerId: "test-user", projectRoot: root, output: path.join(root, "outside"), mode: "experience", experienceEvidence: "../experience.json" }), /outside the approved root/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("audit capability is individually installable and CLI supports queued and direct execution", () => {
  const root = fixture();
  try {
    const stateRoot = path.join(root, ".state");
    const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    assert.throws(() => setCapabilityEnabled(stateRoot, "unknown-capability", true), /not installed/);
    const enabled = spawnSync(process.execPath, [cli, "plugin", "enable", "--workspace", root, "--state", stateRoot, "--capability", "project-audit"], { encoding: "utf8", windowsHide: true });
    assert.equal(enabled.status, 0, enabled.stderr);
    assert.deepEqual(JSON.parse(enabled.stdout).enabledCapabilities, ["image-to-editable", "project-audit"]);
    const enabledAgain = spawnSync(process.execPath, [cli, "plugin", "enable", "--workspace", root, "--state", stateRoot, "--capability", "project-audit"], { encoding: "utf8", windowsHide: true });
    assert.equal(enabledAgain.status, 0, enabledAgain.stderr);
    assert.equal(JSON.parse(enabledAgain.stdout).generation, 1);
    const created = spawnSync(process.execPath, [cli, "audit", "create", "--workspace", root, "--state", stateRoot, "--out", path.join(root, "audit")], { encoding: "utf8", windowsHide: true });
    assert.equal(created.status, 0, created.stderr);
    const job = JSON.parse(created.stdout);
    const ran = spawnSync(process.execPath, [cli, "job", "run", "--workspace", root, "--state", stateRoot, "--id", job.id], { encoding: "utf8", windowsHide: true });
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(JSON.parse(ran.stdout).status, "succeeded");
    const direct = spawnSync(process.execPath, [cli, "audit", "run", "--workspace", root, "--state", stateRoot, "--level", "quick", "--scope", "2,4", "--out", path.join(root, "audit-direct")], { encoding: "utf8", windowsHide: true });
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(JSON.parse(direct.stdout).status, "succeeded");
    assert.equal(JSON.parse(direct.stdout).audit.level, "quick");
    assert.deepEqual(JSON.parse(direct.stdout).audit.scopes, ["product-journey", "data-security"]);
    const missingOutput = spawnSync(process.execPath, [cli, "audit", "run", "--workspace", root, "--state", stateRoot], { encoding: "utf8", windowsHide: true });
    assert.equal(missingOutput.status, 1);
    assert.match(missingOutput.stderr, /audit run requires --out/);
    const invalidTimeout = spawnSync(process.execPath, [cli, "audit", "run", "--workspace", root, "--state", stateRoot, "--out", path.join(root, "audit-invalid"), "--run-gates", "--gate-timeout-ms", "10"], { encoding: "utf8", windowsHide: true });
    assert.equal(invalidTimeout.status, 1);
    assert.match(invalidTimeout.stderr, /gateTimeoutMs/);
    const scopes = spawnSync(process.execPath, [cli, "audit", "scopes"], { encoding: "utf8", windowsHide: true });
    assert.equal(scopes.status, 0, scopes.stderr);
    assert.match(scopes.stdout, /1\. 全部四域/);
    const levels = spawnSync(process.execPath, [cli, "audit", "levels"], { encoding: "utf8", windowsHide: true });
    assert.equal(levels.status, 0, levels.stderr);
    assert.match(levels.stdout, /2\. 标准审计/);
    const invalidScope = spawnSync(process.execPath, [cli, "audit", "run", "--workspace", root, "--state", stateRoot, "--scope", "1,2", "--out", path.join(root, "audit-invalid-scope")], { encoding: "utf8", windowsHide: true });
    assert.equal(invalidScope.status, 1);
    assert.match(invalidScope.stderr, /audit scope all/);
    const nonInteractive = spawnSync(process.execPath, [cli, "audit", "interactive", "--workspace", root, "--state", stateRoot], { encoding: "utf8", windowsHide: true });
    assert.equal(nonInteractive.status, 1);
    assert.match(nonInteractive.stderr, /requires a TTY/);
    const plan = spawnSync(process.execPath, [cli, "audit", "plan", "--level", "deep", "--scope", "3,5", "--instruction", "完整产品体验审视并运行测试门禁"], { encoding: "utf8", windowsHide: true });
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).mode, "full");
    assert.equal(JSON.parse(plan.stdout).level, "deep");
    assert.deepEqual(JSON.parse(plan.stdout).auditDomains, ["visual-interaction", "engineering-delivery"]);
    const template = spawnSync(process.execPath, [cli, "audit", "evidence-template", "--workspace", root, "--state", stateRoot, "--out", ".common-tools/experience.json"], { encoding: "utf8", windowsHide: true });
    assert.equal(template.status, 0, template.stderr);
    assert.equal(JSON.parse(template.stdout).scenarioIds.length, 8);
    const browserWithoutApproval = spawnSync(process.execPath, [cli, "audit", "experience-collect", "--workspace", root, "--state", stateRoot, "--plan", "experience-plan.json", "--out", "browser-evidence"], { encoding: "utf8", windowsHide: true });
    assert.equal(browserWithoutApproval.status, 1);
    assert.match(browserWithoutApproval.stderr, /explicit --run-browser/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
