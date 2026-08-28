"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  archiveQualityHistory,
  buildOfficeRegressionPlan,
  optionalPersistentHistoryRoot,
  parseArgs,
  prepareQualityHistory,
  readHistoryCohort,
  readHistoryCount,
  safeWorkspacePath,
  snapshotId,
  verifyPowerPointInstallation
} = require("../scripts/run-office-ppt-regression");
const { collectOfficeRegressionEvidence } = require("../scripts/lib/office-regression-evidence");
const { resolveWorkRoot } = require("../skills/pd-hifi-slideclone/scripts/complex-graphic-golden-smoke");

const root = path.resolve(__dirname, "..");

test("Office regression plan serializes the selected suite and keeps artifacts in the workspace", () => {
  const plan = buildOfficeRegressionPlan({ suite: "smoke", "work-root": "D:/ppt-corpus" }, {}, root, "win32");
  assert.equal(plan.suite, "smoke");
  assert.equal(plan.environment.SLIDECLONE_REAL_PPTX_WORK_ROOT, path.resolve("D:/ppt-corpus"));
  assert.ok(plan.corpusArgs.includes("1"));
  assert.equal(path.relative(root, plan.outDir).startsWith(".."), false);
  assert.equal(path.relative(root, plan.historyFile).startsWith(".."), false);
  assert.match(plan.historyFile, /ppt-quality-history-smoke\.json$/u);
});

test("Office regression can use a bounded persistent history root with workspace fallback", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-regression-persistent-"));
  const plan = buildOfficeRegressionPlan(
    { suite: "full", "work-root": "D:/ppt-corpus" },
    { SLIDECLONE_QUALITY_HISTORY_ROOT: directory },
    root,
    "win32"
  );
  assert.equal(plan.historyProvider, "persistent-directory");
  assert.equal(path.dirname(plan.historyFile), directory);
  assert.notEqual(plan.historyFile, plan.workspaceHistoryFile);
  assert.throws(() => optionalPersistentHistoryRoot(path.parse(directory).root), /filesystem root/);
  assert.throws(() => optionalPersistentHistoryRoot("relative/history"), /absolute path/);
});

test("Office regression boundaries reject unsupported platforms, suites, options and escaping writes", () => {
  assert.throws(() => buildOfficeRegressionPlan({ "work-root": "D:/ppt" }, {}, root, "linux"), /requires Windows/);
  assert.throws(() => buildOfficeRegressionPlan({ suite: "unknown", "work-root": "D:/ppt" }, {}, root, "win32"), /smoke or full/);
  assert.throws(() => buildOfficeRegressionPlan({}, {}, root, "win32"), /work-root/);
  assert.throws(() => safeWorkspacePath(root, "../escape", "output"), /inside the workspace/);
  assert.throws(() => parseArgs(["--token", "secret"]), /Unknown option/);
});

test("Office regression history and snapshot handling covers bootstrap, invalid and CI paths", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-regression-history-"));
  const history = path.join(directory, "history.json");
  assert.equal(readHistoryCount(history), 0);
  fs.writeFileSync(history, JSON.stringify({ version: 1, snapshots: [{ id: "one" }] }));
  assert.equal(readHistoryCount(history), 1);
  fs.writeFileSync(history, JSON.stringify({ version: 2, snapshots: [] }));
  assert.throws(() => readHistoryCount(history), /invalid/);
  assert.equal(snapshotId({ GITHUB_SHA: "abc123", GITHUB_RUN_ID: "42" }), "abc123-42");
});

test("Office regression history is mirrored atomically and grouped by environment", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-regression-mirror-"));
  const fingerprint = "c".repeat(64);
  const workspaceHistoryFile = path.join(directory, "workspace", "history.json");
  const historyFile = path.join(directory, "persistent", "history.json");
  const historyArchiveFile = path.join(directory, "artifacts", "history.json");
  fs.mkdirSync(path.dirname(workspaceHistoryFile), { recursive: true });
  fs.writeFileSync(workspaceHistoryFile, JSON.stringify({ version: 1, snapshots: [{ id: "legacy" }] }));
  const plan = { workspaceHistoryFile, historyFile, historyArchiveFile };
  prepareQualityHistory(plan);
  assert.equal(fs.existsSync(historyFile), true);
  assert.deepEqual(readHistoryCohort(historyFile, fingerprint), { total: 1, compatible: 0, fingerprinted: 0, legacyOnly: true });
  fs.writeFileSync(historyFile, JSON.stringify({ version: 1, snapshots: [{ id: "current", environmentFingerprint: fingerprint }] }));
  assert.equal(archiveQualityHistory(plan), true);
  assert.equal(JSON.parse(fs.readFileSync(historyArchiveFile, "utf8")).snapshots[0].id, "current");
  assert.deepEqual(readHistoryCohort(historyFile, fingerprint), { total: 1, compatible: 1, fingerprinted: 1, legacyOnly: false });
});

test("Office environment evidence is path-free, deterministic and hash-bound to dependencies", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-regression-evidence-"));
  const files = {
    powerPointExecutable: path.join(directory, "POWERPNT.EXE"),
    libreOfficeExecutable: path.join(directory, "soffice.exe"),
    pdfToPpmExecutable: path.join(directory, "pdftoppm.exe"),
    corpusFile: path.join(directory, "corpus.json"),
    builderRoot: path.join(directory, "builder")
  };
  fs.mkdirSync(files.builderRoot);
  for (const file of Object.values(files).filter((item) => item !== files.builderRoot)) fs.writeFileSync(file, "fixture");
  fs.writeFileSync(path.join(files.builderRoot, "Program.cs"), "class Program {}");
  fs.writeFileSync(path.join(files.builderRoot, "OpenXmlDeckBuilder.csproj"), "<Project />");
  const options = {
    ...files,
    platform: "win32",
    arch: "x64",
    osRelease: "fixture-os",
    nodeVersion: "v22.0.0",
    powerPointVersion: "16.0.1",
    libreOfficeVersion: "LibreOffice 26.2",
    pdfToPpmVersion: "pdftoppm 26.2",
    fontInventoryFingerprint: "d".repeat(64)
  };
  const first = collectOfficeRegressionEvidence(options);
  const second = collectOfficeRegressionEvidence(options);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(first).includes(directory), false);
  fs.writeFileSync(path.join(files.builderRoot, "Program.cs"), "class Program { static void Main() {} }");
  assert.notEqual(collectOfficeRegressionEvidence(options).fingerprint, first.fingerprint);
});

test("PowerPoint preflight reads fixed installation keys without starting Office", () => {
  const calls = [];
  const executable = verifyPowerPointInstallation((command, args) => {
    calls.push([command, args]);
    return { status: 0, stdout: "    (Default)    REG_SZ    C:\\Program Files\\Microsoft Office\\POWERPNT.EXE\r\n" };
  }, () => ({ isFile: () => true }));
  assert.equal(executable, "C:\\Program Files\\Microsoft Office\\POWERPNT.EXE");
  assert.equal(calls[0][0], "reg.exe");
  assert.throws(() => verifyPowerPointInstallation(() => ({ status: 1, stdout: "" }), () => null), /preflight failed/);
});

test("golden smoke work root accepts explicit CI environment configuration with argument precedence", () => {
  assert.equal(resolveWorkRoot("D:/argument", "D:/environment"), path.resolve("D:/argument"));
  assert.equal(resolveWorkRoot(null, "D:/environment"), path.resolve("D:/environment"));
  assert.throws(() => resolveWorkRoot(null, " "), /invalid/);
});

test("Office workflow is scheduled, manually selectable, serialized and isolated to a labeled runner", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ppt-office-regression.yml"), "utf8");
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /github[.]event_name == 'pull_request' && 'smoke'/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /runs-on: \[self-hosted, Windows, X64, slideclone-office\]/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /actions\/cache\/restore@[a-f0-9]{40} # v4/u);
  assert.match(workflow, /actions\/cache\/save@[a-f0-9]{40} # v4/u);
  assert.match(workflow, /ppt-quality-history-\$\{\{ env\.CORPUS_SUITE \}\}/u);
  assert.match(workflow, /SLIDECLONE_QUALITY_HISTORY_ROOT/u);
  assert.match(workflow, /Upload bounded regression reports/u);
  assert.match(workflow, /scripts\/ppt-create-office-smoke[.]js/u);
  assert.match(workflow, /ppt-create-smoke\/[*][.]json/u);
  assert.match(workflow, /retention-days: 90/u);
  assert.doesNotMatch(workflow, /secrets\./u);
});

test("GitHub workflows pin every action to an immutable commit", () => {
  const workflowRoot = path.join(root, ".github", "workflows");
  for (const file of fs.readdirSync(workflowRoot).filter((name) => /\.ya?ml$/u.test(name))) {
    const source = fs.readFileSync(path.join(workflowRoot, file), "utf8");
    const uses = [...source.matchAll(/uses:\s+([^\s#]+)(?:\s+#\s*(v\d+))?/gu)];
    assert.ok(uses.length > 0, `${file} must declare at least one action`);
    for (const match of uses) {
      assert.match(match[1], /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\/-]+@[a-f0-9]{40}$/u, `${file} has a mutable action reference`);
      assert.match(match[2] || "", /^v\d+$/u, `${file} action pin must retain its major-version update hint`);
    }
  }
});
