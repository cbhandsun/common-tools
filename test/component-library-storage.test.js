"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyStorageRole,
  buildComponentLibraryStoragePlan
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-library-storage");

function record(relativePath, bytes, sha256, role = classifyStorageRole(relativePath)) {
  return { relativePath, bytes, sha256, role, extension: relativePath.slice(relativePath.lastIndexOf(".")) };
}

test("component storage plan keeps source PPTX as duplicate canonical and reports reclaimable copies", () => {
  const plan = buildComponentLibraryStoragePlan([
    record("repair-coverage/batch/arrow.pptx", 100, "same"),
    record("learned-islide/arrow.pptx", 100, "same"),
    record("repair-coverage/visual-regression/arrow.png", 50, "preview"),
    record("repair-coverage/visual-regression/arrow-copy.png", 50, "preview")
  ]);

  assert.equal(plan.summary.exactDuplicateGroups, 2);
  assert.equal(plan.summary.exactDuplicateCopies, 2);
  assert.equal(plan.summary.exactDuplicateReclaimableBytes, 150);
  assert.equal(plan.duplicateGroups[0].canonical, "learned-islide/arrow.pptx");
  assert.deepEqual(plan.duplicateGroups[0].duplicatePaths, ["repair-coverage/batch/arrow.pptx"]);
  assert.equal(plan.summary.regenerableEvidenceBytes, 200);
});

test("component storage roles separate durable sources, evidence and accidental build output", () => {
  assert.equal(classifyStorageRole("runs/plugin-component-inventory/learned-islide/item.pptx"), "component-source");
  assert.equal(classifyStorageRole("runs/plugin-component-inventory/repair/before/render/page.png"), "regenerable-evidence");
  assert.equal(classifyStorageRole("runs/plugin-component-inventory/ListTypes/bin/Debug/net8.0/lib.dll"), "tool-build-output");
  assert.equal(classifyStorageRole("runs/plugin-component-inventory/inventory.json"), "metadata");
});
