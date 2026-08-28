"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPptCreateJob, pptCreateSummary, runPptCreateJob } = require("../packages/ppt-create-core");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { MAX_SLIDES, parsePresentationSpec, validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { createPptCreateHandler } = require("../packages/ppt-create-core/team-worker");
const { ContentProviderRegistry } = require("../packages/ppt-create-core/content-provider");
const { resolveExecutionRoute, setCapabilityEnabled } = require("../packages/capability-runtime");
const { validUploadRequest } = require("../packages/team-runtime");
const { loadContentProviderRegistry, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { callTool } = require("../packages/mcp-server/core");

function temporaryWorkspace() { return fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-create-test-")); }
function validSpec() {
  return {
    version: "1.0",
    title: "季度经营复盘",
    subtitle: "从事实到行动",
    audience: "经营团队",
    theme: "clean-light-v1",
    slides: [
      { id: "cover", role: "cover", title: "季度经营复盘", summary: "聚焦增长质量与下一阶段动作" },
      { id: "metrics", role: "metrics", title: "核心指标", summary: "收入保持增长，交付效率仍需改善", items: [
        { id: "revenue", label: "营业收入", value: "¥12.4M", detail: "同比增长 18%" },
        { id: "margin", label: "毛利率", value: "42%", detail: "较上季度提升 3 个百分点" }
      ] },
      { id: "process", role: "process", title: "下一阶段路径", items: [
        { id: "focus", label: "聚焦", detail: "确认优先客户群" },
        { id: "pilot", label: "试点", detail: "验证交付方案" },
        { id: "scale", label: "复制", detail: "形成标准打法" }
      ] },
      { id: "closing", role: "closing", title: "以可验证结果推进下一阶段", summary: "所有动作均绑定负责人和完成标准" }
    ]
  };
}
function writeSpec(root, value = validSpec()) {
  const file = path.join(root, "presentation.json");
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
function fakePptxBuilder({ outFile }) { fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)]), { flag: "wx" }); }
function fakePdfBuilder({ outFile, sourceFingerprint, pageCount }) {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 99 0 R >> endobj`).join("\n");
  fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n99 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n%%EOF`, { flag: "wx" });
  return { sourceFingerprint };
}

test("presentation spec validates a bounded semantic deck and creates editable Deck IR", () => {
  const spec = validatePresentationSpec(validSpec());
  const ir = createDeckIr(spec);
  assert.equal(ir.pages.length, 4);
  assert.equal(ir.pages.every((page) => page.images.length === 0), true);
  assert.equal(ir.pages.every((page) => page.textBoxes.length + page.shapes.length > 0), true);
  for (const page of ir.pages) {
    for (const item of [...page.textBoxes, ...page.shapes]) {
      assert.ok(item.box.x >= 0 && item.box.y >= 0);
      assert.ok(item.box.x + item.box.w <= 960.001);
      assert.ok(item.box.y + item.box.h <= 540.001);
      assert.equal(item.source.editable, true);
    }
  }
});

test("presentation spec rejects empty, malformed, unknown, placeholder, duplicate, and incompatible content", () => {
  assert.throws(() => parsePresentationSpec(Buffer.alloc(0)), /file size/);
  assert.throws(() => parsePresentationSpec(Buffer.from("{")), /invalid JSON/);
  assert.throws(() => validatePresentationSpec({ ...validSpec(), unexpected: true }), /unsupported fields/);
  assert.throws(() => validatePresentationSpec({ ...validSpec(), title: "TODO" }), /placeholder/);
  const duplicate = validSpec(); duplicate.slides[1].id = "cover";
  assert.throws(() => validatePresentationSpec(duplicate), /unique/);
  const incompatible = validSpec(); incompatible.slides[1].items = [incompatible.slides[1].items[0]];
  assert.throws(() => validatePresentationSpec(incompatible), /incompatible/);
  const lateCover = validSpec(); lateCover.slides[2].role = "cover"; lateCover.slides[2].items = [];
  assert.throws(() => validatePresentationSpec(lateCover), /only one cover/);
});

test("presentation spec enforces extreme slide count and string boundaries", () => {
  const extreme = validSpec();
  extreme.slides = [extreme.slides[0], ...Array.from({ length: MAX_SLIDES }, (_, index) => ({ id: `content-${index}`, role: "content", title: `Page ${index}`, items: [{ id: "fact", label: "Fact" }] }))];
  assert.throws(() => validatePresentationSpec(extreme), /slide count/);
  const longTitle = validSpec(); longTitle.slides[1].title = "x".repeat(121);
  assert.throws(() => validatePresentationSpec(longTitle), /invalid/);
});

test("local ppt-create job writes IR, PPTX, and non-content quality reports", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeSpec(root);
    const output = path.join(root, "out");
    const stateRoot = path.join(root, "state");
    const created = createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output });
    assert.equal(created.status, "queued");
    const completed = runPptCreateJob({ stateRoot, ownerId: "owner", id: created.id, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder });
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.quality.passed, true);
    assert.deepEqual(completed.artifacts.map((item) => item.name), ["deck.ir.json", "deck.preview.html", "deck.html", "deck.pptx", "deck.pdf", "asset-manifest.json", "ppt-create-report.json", "ppt-create-report.md"]);
    const preview = fs.readFileSync(path.join(output, "deck.preview.html"), "utf8");
    assert.match(preview, /PPT Preview Editor/);
    const html = fs.readFileSync(path.join(output, "deck.html"), "utf8");
    assert.match(html, /common-tools-deck-ir-sha256/);
    assert.equal((html.match(/class="slide"/g) || []).length, 4);
    const reportText = fs.readFileSync(path.join(output, "ppt-create-report.json"), "utf8");
    assert.doesNotMatch(reportText, /季度经营复盘|营业收入/);
    assert.equal(pptCreateSummary(completed, root).pageCount, 4);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("local ppt-create fails closed when input changes or builder fails", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeSpec(root);
    const stateRoot = path.join(root, "state");
    const first = createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: path.join(root, "changed") });
    fs.appendFileSync(input, " ");
    const changed = runPptCreateJob({ stateRoot, ownerId: "owner", id: first.id, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder });
    assert.equal(changed.status, "failed");
    assert.equal(fs.existsSync(path.join(root, "changed")), false);
    fs.writeFileSync(input, `${JSON.stringify(validSpec())}\n`);
    const second = createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: path.join(root, "builder-failure"), idempotencyKey: "second" });
    const failed = runPptCreateJob({ stateRoot, ownerId: "owner", id: second.id, buildPptx: () => { throw new Error("secret content"); }, buildPdf: fakePdfBuilder });
    assert.equal(failed.status, "failed");
    assert.equal(failed.error.message, "PPT creation failed");
    assert.equal(fs.existsSync(path.join(root, "builder-failure")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("local ppt-create rejects output overwrite, traversal, and symbolic input", (t) => {
  const root = temporaryWorkspace();
  try {
    const input = writeSpec(root); const stateRoot = path.join(root, "state");
    fs.mkdirSync(path.join(root, "existing"));
    assert.throws(() => createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: path.join(root, "existing") }), /must not already exist/);
    assert.throws(() => createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: path.join(root, "..", "escape") }), /outside the approved root/);
    const link = path.join(root, "linked.json");
    try { fs.symlinkSync(input, link); }
    catch { t.skip("symbolic links are unavailable"); return; }
    assert.throws(() => createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input: link, output: path.join(root, "linked-out") }), /non-symbolic/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("team ppt-create worker uses the same spec and emits owner-scoped artifacts", async () => {
  const stored = new Map(); const input = Buffer.from(JSON.stringify(validSpec()));
  const objectStore = {
    readObject: async ({ objectKey, maxBytes }) => { assert.equal(objectKey, "owners/hash/inputs/spec"); assert.ok(input.length <= maxBytes); return input; },
    putObject: async ({ objectKey, body, contentType }) => { stored.set(objectKey, { body, contentType }); }
  };
  const handler = createPptCreateHandler({ objectStore, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder, temporaryRoot: os.tmpdir() });
  const result = await handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/spec", outputPrefix: "owners/hash/jobs/1/" }, isCancellationRequested: async () => false });
  assert.equal(result.quality.passed, true);
  assert.equal(result.artifacts.length, 8);
  assert.equal(JSON.parse(stored.get("owners/hash/jobs/1/asset-manifest.json").body.toString("utf8")).assets.length, 0);
  assert.equal(stored.get("owners/hash/jobs/1/deck.preview.html").contentType, "text/html");
  assert.equal([...stored.keys()].every((key) => key.startsWith("owners/hash/jobs/1/")), true);
});

test("team ppt-create worker accepts a bounded prompt envelope and persists reproducibility evidence", async () => {
  const stored = new Map(); const input = Buffer.from(JSON.stringify({ version: "1.0", kind: "prompt", prompt: "# 供应链提效\n\n## 现状\n- 交付周期偏长\n\n## 行动\n- 建立周度协同", audience: "管理层", purpose: "决策汇报", language: "zh-CN", maxSlides: 6 }));
  const handler = createPptCreateHandler({ objectStore: { readObject: async () => input, putObject: async ({ objectKey, body }) => stored.set(objectKey, body) }, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder, temporaryRoot: os.tmpdir() });
  const result = await handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/prompt", outputPrefix: "owners/hash/jobs/prompt/" }, isCancellationRequested: async () => false });
  assert.equal(result.quality.passed, true); assert.ok(result.artifacts.some((artifact) => artifact.name === "generation-manifest.json")); assert.ok(result.artifacts.some((artifact) => artifact.name === "presentation.generated.json")); const manifest = JSON.parse(stored.get("owners/hash/jobs/prompt/generation-manifest.json")); assert.equal(manifest.generation.provider, "deterministic-local"); assert.match(manifest.request.promptSha256, /^[a-f0-9]{64}$/u);
});

test("team ppt-create worker routes an explicit prompt provider through the bounded registry", async () => {
  const stored = new Map(); const input = Buffer.from(JSON.stringify({ version: "1.0", kind: "prompt", providerId: "grounded-provider", prompt: "Approved facts", audience: "Board", purpose: "Decision", language: "en-US", maxSlides: 6 }));
  const contentProviderRegistry = new ContentProviderRegistry([{ id: "grounded-provider", generate: async (request) => ({ brief: { version: "1.0", title: "Grounded deck", audience: request.audience, purpose: request.purpose, sections: [{ id: "facts", title: "Facts", points: [{ label: "Verified result" }] }] }, provenance: { providerId: "grounded-provider", model: "grounded-v1", requestId: "req-1", retrievedAt: "2026-08-28T12:00:00Z", sources: [{ id: "s1", title: "Source", locator: "https://example.test/source", accessedAt: "2026-08-28" }] }, citationsBySection: { facts: ["s1"] } }) }]);
  const handler = createPptCreateHandler({ objectStore: { readObject: async () => input, putObject: async ({ objectKey, body }) => stored.set(objectKey, body) }, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder, contentProviderRegistry, temporaryRoot: os.tmpdir() });
  const result = await handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/prompt", outputPrefix: "owners/hash/jobs/provider/" }, isCancellationRequested: async () => false });
  assert.equal(result.quality.passed, true); const manifest = JSON.parse(stored.get("owners/hash/jobs/provider/generation-manifest.json")); assert.equal(manifest.generation.provider, "grounded-provider"); assert.equal(manifest.generation.provenance.sources[0].id, "s1");
});

test("team ppt-create worker honors cancellation before reading input", async () => {
  let read = false;
  const handler = createPptCreateHandler({ objectStore: { readObject: async () => { read = true; }, putObject: async () => {} }, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder });
  await assert.rejects(() => handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/spec", outputPrefix: "owners/hash/jobs/1/" }, isCancellationRequested: async () => true }), /cancelled/);
  assert.equal(read, false);
});

test("team ppt-create worker rejects file-bound JSON and requires the bounded archive transport", async () => {
  const spec = validSpec(); spec.assets = [{ id: "hero", path: "media/hero.png", sha256: "0".repeat(64), source: { kind: "original", locator: "internal://hero", license: "company-owned" } }];
  spec.slides[1].role = "content"; spec.slides[1].visual = { kind: "media", mediaType: "image", alt: "hero", assetId: "hero" }; spec.slides[1].layout = "media-frame-v1";
  const handler = createPptCreateHandler({ objectStore: { readObject: async () => Buffer.from(JSON.stringify(spec)), putObject: async () => assert.fail("must not upload") }, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder });
  await assert.rejects(() => handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/spec", outputPrefix: "owners/hash/jobs/1/" }, isCancellationRequested: async () => false }), /ppt-create archive/);
});

test("ppt-create routing and remote upload boundaries are explicit", () => {
  assert.deepEqual(resolveExecutionRoute({ capability: "ppt-create", executionMode: "local-preferred" }), { execution: "local", reason: "local-capability-default", locallySupported: true });
  assert.deepEqual(resolveExecutionRoute({ capability: "ppt-create", executionMode: "remote-only" }), { execution: "remote", reason: "configured-remote-only", locallySupported: true });
  assert.equal(validUploadRequest("ppt-create", "application/json", 1024 * 1024), true);
  assert.equal(validUploadRequest("ppt-create", "application/json", 1024 * 1024 + 1), false);
  assert.equal(validUploadRequest("ppt-create", "application/gzip", 100 * 1024 * 1024), true);
  assert.equal(validUploadRequest("ppt-create", "application/x-gzip", 100 * 1024 * 1024), true);
  assert.equal(validUploadRequest("ppt-create", "application/gzip", 100 * 1024 * 1024 + 1), false);
  assert.equal(validUploadRequest("ppt-create", "text/json", 100), false);
  assert.equal(workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-create" }).pollSeconds, 5);
  assert.deepEqual(loadContentProviderRegistry({}).ids(), []);
  assert.throws(() => loadContentProviderRegistry({ COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_ID: "provider" }), /incomplete/u);
  const providers = loadContentProviderRegistry({ COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_ID: "provider", COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_ENDPOINT: "https://provider.example.test/generate", COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_MODEL: "model-v1", COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_TOKEN: "secret" });
  assert.deepEqual(providers.ids(), ["provider"]);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-quality" }), /supports only ppt-create/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-create", COMMON_TOOLS_WORKER_POLL_SECONDS: "0" }), /between 1 and 60/);
});

test("PPT create worker accepts a multi-provider config and rejects mixed legacy settings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-worker-providers-"));
  try {
    const token = path.join(root, "provider.token"); const config = path.join(root, "providers.json");
    fs.writeFileSync(token, "secret\n");
    fs.writeFileSync(config, JSON.stringify({ version: "1.0", providers: [{ id: "provider-a", endpoint: "https://provider.example.test/generate", model: "m1", tokenFile: token }] }));
    assert.deepEqual(loadContentProviderRegistry({ COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDERS_FILE: config }).ids(), ["provider-a"]);
    assert.throws(() => loadContentProviderRegistry({ COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDERS_FILE: config, COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_ID: "legacy" }), /ambiguous/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("local MCP creates a ppt-create job and returns only its verified creation summary", () => {
  const root = temporaryWorkspace();
  try {
    const stateRoot = path.join(root, "state");
    setCapabilityEnabled(stateRoot, "ppt-create", true);
    const context = { workspaceRoot: root, stateRoot, ownerId: "owner" };
    const created = callTool("create_ppt_create_job", { input: writeSpec(root), output: path.join(root, "mcp-out") }, context);
    assert.equal(created.capability, "ppt-create");
    runPptCreateJob({ stateRoot, ownerId: "owner", id: created.id, buildPptx: fakePptxBuilder, buildPdf: fakePdfBuilder });
    const report = callTool("get_ppt_create_report", { id: created.id }, context);
    assert.deepEqual(Object.keys(report).sort(), ["artifacts", "capability", "creation", "id", "quality", "status"]);
    assert.deepEqual(report.creation, { theme: "clean-light-v1", pageCount: 4, pptxSha256: report.creation.pptxSha256 });
    assert.doesNotMatch(JSON.stringify(report), /季度经营复盘|营业收入/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
