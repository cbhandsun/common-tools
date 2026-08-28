"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPptCreateJob, runPptCreateJob } = require("../packages/ppt-create-core");
const { createDeckVariants } = require("../packages/ppt-create-core/layout");
const { validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { createPptCreateHandler } = require("../packages/ppt-create-core/team-worker");

function spec() {
  return { version: "1.0", title: "Two complete directions", deckVariantCount: 2, variantCount: 3, slides: [
    { id: "cover", role: "cover", title: "Two complete directions" },
    { id: "content", role: "content", title: "Verified outcome", summary: "A bounded source-backed result", items: [{ id: "one", label: "Outcome one" }, { id: "two", label: "Outcome two" }], speakerNotes: "Clarify the cohort and date boundary.", citations: [{ id: "report", title: "Primary measurement report", locator: "https://example.com/report", accessedAt: "2026-08-28" }] },
    { id: "closing", role: "closing", title: "Next step", items: [{ id: "act", label: "Approve pilot" }] }
  ] };
}
function fakePptx({ outFile }) { fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)]), { flag: "wx" }); }
function fakePdf({ outFile, sourceFingerprint, pageCount }) { const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 99 0 R >> endobj`).join("\n"); fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n%%EOF`, { flag: "wx" }); return { sourceFingerprint }; }

test("whole-deck variants select distinct layout sequences while keeping citations editable and notes traceable", () => {
  const normalized = validatePresentationSpec(spec()); const variants = createDeckVariants(normalized); assert.equal(variants.length, 2);
  const signatures = variants.map((variant) => variant.ir.pages.map((page) => page.intent.layoutId).join("|")); assert.equal(new Set(signatures).size, 2);
  for (const variant of variants) { const page = variant.ir.pages[1]; assert.equal(page.textBoxes.some((item) => item.role === "citation" && item.text.includes("Primary measurement report")), true); assert.match(page.speakerNotes, /Sources:/); assert.match(page.speakerNotes, /https:\/\/example.com\/report/); }
  const badCount = spec(); badCount.deckVariantCount = 3; badCount.variantCount = 2; assert.throws(() => validatePresentationSpec(badCount), /cannot exceed/);
  const unsafeUrl = spec(); unsafeUrl.slides[1].citations[0].locator = "https://user:secret@example.com/report"; assert.throws(() => validatePresentationSpec(unsafeUrl), /URL/);
  const longNotes = spec(); longNotes.slides[1].speakerNotes = "x".repeat(4001); assert.throws(() => validatePresentationSpec(longNotes), /speakerNotes/);
});

test("local ppt-create emits two complete multi-format deck alternatives and a non-content variant manifest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-deck-variants-"));
  try {
    const input = path.join(root, "spec.json"); fs.writeFileSync(input, JSON.stringify(spec())); const stateRoot = path.join(root, "state"); const output = path.join(root, "out"); const job = createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output });
    const completed = runPptCreateJob({ stateRoot, ownerId: "owner", id: job.id, buildPptx: fakePptx, buildPdf: fakePdf }); assert.equal(completed.status, "succeeded"); assert.equal(completed.quality.metrics["deck-variants"], 2);
    for (const name of ["deck.pptx", "deck.pdf", "deck.preview.html", "deck.variant-2.pptx", "deck.variant-2.pdf", "deck.variant-2.preview.html", "deck.variants.json"]) assert.equal(fs.existsSync(path.join(output, name)), true, name);
    const manifest = fs.readFileSync(path.join(output, "deck.variants.json"), "utf8"); assert.match(manifest, /whole-deck-layout-alternatives/); assert.doesNotMatch(manifest, /cohort|measurement report|example[.]com/);
    const report = fs.readFileSync(path.join(output, "ppt-create-report.json"), "utf8"); assert.doesNotMatch(report, /Clarify the cohort|Primary measurement report|example[.]com/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("team ppt-create publishes the same bounded whole-deck variant contract", async () => {
  const input = Buffer.from(JSON.stringify(spec())); const stored = new Map(); const handler = createPptCreateHandler({ objectStore: { readObject: async () => input, putObject: async ({ objectKey, body }) => stored.set(objectKey, body) }, buildPptx: fakePptx, buildPdf: fakePdf });
  const result = await handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/input", outputPrefix: "owners/hash/jobs/id/" }, isCancellationRequested: async () => false });
  assert.equal(result.quality.metrics["deck-variants"], 2); assert.ok(stored.has("owners/hash/jobs/id/deck.variant-2.pptx")); assert.ok(stored.has("owners/hash/jobs/id/deck.variants.json")); assert.ok(result.artifacts.length <= 32);
});
