"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { deckIrFingerprint } = require("../packages/ppt-create-core/export");
const { startIrEditorSession } = require("../packages/ppt-create-core/ir-editor-session");

function deck() { return { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes: [{ id: "title", text: "Title", box: { x: 40, y: 40, w: 400, h: 60 } }], shapes: [], images: [], tables: [], charts: [], icons: [] }] }; }

test("local IR editor session is loopback-only, token-bound, and finalizes one output", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ir-session-"));
  try {
    const ir = deck(); fs.writeFileSync(path.join(root, "deck.json"), JSON.stringify(ir));
    let invocation;
    const session = await startIrEditorSession({ workspaceRoot: root, input: "deck.json", output: "result", buildPptx() {}, buildPdf() {}, openBrowser: false, timeoutMs: 10_000, finalize(options) { invocation = { ...options, patchExists: fs.existsSync(options.patch) }; return { output: path.join(root, "result"), revision: "a".repeat(64), operationCount: 1 }; } });
    const page = await fetch(session.url); const html = await page.text();
    assert.equal(page.status, 200); assert.match(html, /保存新版本并导出/u); assert.match(html, /connect-src 'self'/u);
    const endpoint = html.match(/"endpoint":"([^"]+)"/u)[1]; const token = html.match(/"token":"([^"]+)"/u)[1]; const origin = new URL(session.url).origin;
    const rejected = await fetch(`${origin}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Common-Tools-Session": "wrong-token" }, body: "{}" });
    assert.equal(rejected.status, 404);
    const patch = { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-text", pageIndex: 0, objectId: "title", value: "Edited" }] };
    const response = await fetch(`${origin}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Common-Tools-Session": token }, body: JSON.stringify(patch) });
    assert.equal(response.status, 200); assert.equal((await response.json()).code, "EXPORT_COMPLETED");
    assert.equal((await session.completion).status, "completed"); assert.equal(invocation.output, path.join(root, "result")); assert.equal(invocation.patchExists, true); assert.equal(fs.existsSync(invocation.patch), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
