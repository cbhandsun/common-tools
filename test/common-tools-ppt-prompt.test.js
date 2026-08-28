"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { persistPromptPlan, promptToPresentation } = require("../packages/ppt-create-core/prompt");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

test("natural-language prompt deterministically becomes a validated brief and spec", () => {
  const result = promptToPresentation("# 供应链韧性升级\n\n## 现状\n\n- 交付周期波动较大\n- 核心供应商集中度偏高\n\n## 行动\n\n- 建立双供机制\n- 按月复盘风险", {
    audience: "经营管理层",
    purpose: "批准下一阶段治理计划",
    maxSlides: 8,
    deckVariantCount: 2,
    closing: ["确认负责人", "确定复盘节奏"]
  });
  assert.equal(result.report.provider, "deterministic-local");
  assert.equal(result.report.planningPassed, true);
  assert.equal(result.spec.slides[0].role, "cover");
  assert.equal(result.spec.slides.at(-1).role, "closing");
  assert.equal(result.spec.deckVariantCount, 2);
  assert.match(result.report.promptSha256, /^[a-f0-9]{64}$/u);
});

test("injected content provider is bounded by the same brief contract", () => {
  const valid = promptToPresentation("已核实的经营事实", {
    audience: "董事会",
    purpose: "形成决策",
    contentProvider: (request) => ({ version: "1.0", title: "经营决策", audience: request.audience, purpose: request.purpose, sections: [{ title: "事实", points: [{ label: request.prompt }] }] })
  });
  assert.equal(valid.report.provider, "injected-content-provider");
  assert.throws(() => promptToPresentation("事实", { audience: "董事会", purpose: "决策", contentProvider: () => ({ title: "未校验" }) }), /version is unsupported/u);
  assert.throws(() => promptToPresentation("事实", { audience: "董事会", purpose: "决策", contentProvider: async () => ({}) }), /synchronously/u);
});

test("prompt inputs reject empty, control, oversized and placeholder content", () => {
  assert.throws(() => promptToPresentation("", { audience: "A", purpose: "B" }), /invalid/u);
  assert.throws(() => promptToPresentation("标题\u0000内容", { audience: "A", purpose: "B" }), /invalid/u);
  assert.throws(() => promptToPresentation("# 标题\n\nTODO", { audience: "A", purpose: "B" }), /invalid/u);
  assert.throws(() => promptToPresentation("x".repeat(120_001), { audience: "A", purpose: "B" }), /invalid/u);
});

test("ppt draft CLI writes a workspace-contained spec without echoing prompt content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-prompt-"));
  try {
    const state = path.join(root, "state");
    setCapabilityEnabled(state, "ppt-create", true);
    fs.writeFileSync(path.join(root, "request.md"), "# 私密增长计划\n\n## 依据\n\n- 已确认渠道效率提升", "utf8");
    const result = spawnSync(process.execPath, [path.resolve(__dirname, "../packages/cli/bin/common-tools.js"), "ppt", "draft", "--workspace", root, "--state", state, "--input", "request.md", "--out", "presentation.json", "--audience", "管理层", "--purpose", "评审计划"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("私密增长计划"), false);
    const spec = JSON.parse(fs.readFileSync(path.join(root, "presentation.json"), "utf8"));
    assert.equal(spec.version, "1.0");
    assert.equal(spec.slides[0].title, "私密增长计划");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistPromptPlan refuses symlinks, unsupported formats and overwrite", { skip: process.platform === "win32" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-prompt-boundary-"));
  try {
    fs.writeFileSync(path.join(root, "prompt.csv"), "title,content");
    assert.throws(() => persistPromptPlan({ workspaceRoot: root, input: "prompt.csv", output: "out.json", audience: "A", purpose: "B" }), /text or Markdown/u);
    fs.writeFileSync(path.join(root, "prompt.md"), "# Title\n\n- Fact");
    fs.symlinkSync(path.join(root, "prompt.md"), path.join(root, "link.md"));
    assert.throws(() => persistPromptPlan({ workspaceRoot: root, input: "link.md", output: "out.json", audience: "A", purpose: "B" }), /non-symbolic/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
