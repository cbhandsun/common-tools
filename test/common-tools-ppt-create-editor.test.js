"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { applyEditorPatch, createEditorModel, createPreviewHtml, parseEditorPatch, persistEditorPatch, writeEditorPreview } = require("../packages/ppt-create-core/editor");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

function spec() {
  return { version: "1.0", title: "编辑器验证", theme: "clean-light-v1", seed: "editor-test", slides: [
    { id: "cover", role: "cover", title: "编辑器验证" },
    { id: "one", role: "content", title: "第一页", items: [{ id: "a", label: "事实 A" }] },
    { id: "two", role: "content", title: "第二页", items: [{ id: "b", label: "事实 B" }] },
    { id: "close", role: "closing", title: "结束" }
  ] };
}
function patchFor(model, operations) { return { version: "1.0", expectedRevision: model.revision, operations }; }

test("editor model and HTML preview are deterministic, self-contained, and escape embedded presentation text", () => {
  const value = spec(); value.slides[1].title = "安全 </script><img src=x>";
  const first = createEditorModel(value); const second = createEditorModel(value); const html = createPreviewHtml(value, first.ir);
  assert.equal(first.revision, second.revision);
  assert.match(first.revision, /^[a-f0-9]{64}$/u);
  assert.match(html, /PPT Preview Editor/);
  assert.match(html, /presentation-edit\.patch\.json/);
  assert.match(html, /common-tools ppt apply-edit/);
  assert.doesNotMatch(html, /安全 <\/script><img/u);
  assert.ok(html.includes("安全 \\u003c/script\\u003e\\u003cimg src=x\\u003e"));
  assert.doesNotMatch(html, /https?:\/\//u);
});

test("editor patches change bounded fields, select candidates, and reorder only into a valid narrative", () => {
  const model = createEditorModel(spec()); const selected = model.ir.pages[1].intent.candidateLayoutIds[1];
  const result = applyEditorPatch(model.spec, patchFor(model, [
    { type: "set-slide-text", slideId: "one", field: "title", value: "更新后的第一页" },
    { type: "set-slide-text", slideId: "one", field: "summary", value: "保留为结构化内容" },
    { type: "select-layout", slideId: "one", layout: selected },
    { type: "move-slide", slideId: "two", toIndex: 1 }
  ]));
  assert.deepEqual(result.spec.slides.map((slide) => slide.id), ["cover", "two", "one", "close"]);
  assert.equal(result.spec.slides[2].title, "更新后的第一页");
  assert.equal(result.spec.slides[2].layout, selected);
  assert.notEqual(result.revision, model.revision);
});

test("editor patches reject stale revisions, unknown operations, invalid layouts, and illegal cover moves", () => {
  const model = createEditorModel(spec());
  assert.throws(() => applyEditorPatch(model.spec, { ...patchFor(model, [{ type: "set-slide-text", slideId: "one", field: "title", value: "x" }]), expectedRevision: "0".repeat(64) }), /revision/);
  assert.throws(() => applyEditorPatch(model.spec, patchFor(model, [{ type: "delete-slide", slideId: "one" }])), /unsupported/);
  assert.throws(() => applyEditorPatch(model.spec, patchFor(model, [{ type: "select-layout", slideId: "one", layout: "metrics-row-v1" }])), /incompatible/);
  assert.throws(() => applyEditorPatch(model.spec, patchFor(model, [{ type: "move-slide", slideId: "cover", toIndex: 2 }])), /first slide/);
  assert.throws(() => parseEditorPatch(Buffer.alloc(0)), /file size/);
  assert.throws(() => parseEditorPatch(Buffer.from("{")), /invalid JSON/);
});

test("preview and patch persistence stay inside the workspace and never overwrite files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-editor-"));
  try {
    const input = path.join(root, "presentation.json"); const preview = path.join(root, "preview.html"); const patch = path.join(root, "edit.json"); const output = path.join(root, "edited.json");
    fs.writeFileSync(input, `${JSON.stringify(spec(), null, 2)}\n`); const previewResult = writeEditorPreview({ workspaceRoot: root, input, output: preview });
    const model = createEditorModel(spec()); fs.writeFileSync(patch, JSON.stringify(patchFor(model, [{ type: "set-slide-text", slideId: "one", field: "title", value: "已持久化" }])));
    const result = persistEditorPatch({ workspaceRoot: root, input, patch, output });
    assert.equal(result.operationCount, 1); assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).slides[1].title, "已持久化");
    assert.equal(previewResult.revision, model.revision); assert.match(fs.readFileSync(preview, "utf8"), /PPT Preview Editor/);
    assert.throws(() => persistEditorPatch({ workspaceRoot: root, input, patch, output }), /must be a new/);
    assert.throws(() => writeEditorPreview({ workspaceRoot: root, input, output: path.join(root, "..", "outside.html") }), /outside the approved root/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("CLI exposes preview generation and validated edit persistence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-editor-cli-"));
  try {
    const state = path.join(root, "state"); const input = path.join(root, "presentation.json"); const preview = path.join(root, "preview.html"); const patch = path.join(root, "edit.json"); const output = path.join(root, "edited.json");
    fs.writeFileSync(input, JSON.stringify(spec())); setCapabilityEnabled(state, "ppt-create", true); const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    const previewResult = spawnSync(process.execPath, [cli, "ppt", "preview", "--workspace", root, "--state", state, "--input", input, "--out", preview], { encoding: "utf8", windowsHide: true });
    assert.equal(previewResult.status, 0, previewResult.stderr); assert.equal(JSON.parse(previewResult.stdout).pageCount, 4);
    const model = createEditorModel(spec()); fs.writeFileSync(patch, JSON.stringify(patchFor(model, [{ type: "set-slide-text", slideId: "two", field: "title", value: "CLI 已保存" }])));
    const applied = spawnSync(process.execPath, [cli, "ppt", "apply-edit", "--workspace", root, "--state", state, "--input", input, "--patch", patch, "--out", output], { encoding: "utf8", windowsHide: true });
    assert.equal(applied.status, 0, applied.stderr); assert.equal(JSON.parse(applied.stdout).operationCount, 1); assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).slides[2].title, "CLI 已保存");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
