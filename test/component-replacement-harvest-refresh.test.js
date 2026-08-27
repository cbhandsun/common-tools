"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAffectedPptxManifest,
  buildCloseLoopOptions,
  buildQueueBoundAliasCandidates,
  evaluateHarvestRefreshGate,
  parseArgs,
  refreshInventoryRoots
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-harvest-refresh");

test("component replacement harvest refresh parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-harvest-refresh.js",
    "--queue",
    "queue.json",
    "--out",
    "out",
    "--discover-root",
    "downloads",
    "--discover-limit",
    "12",
    "--concurrency",
    "2",
    "--decision-ir",
    "deck.ir.json",
    "--decision-search-candidates",
    "--decision-candidate-size",
    "4",
    "--min-decision-plugin-targets",
    "8",
    "--min-decision-protected-crops",
    "2",
    "--max-decision-actionable-gaps",
    "0",
    "--gate-out",
    "gate.json",
    "--fail-on-gate",
    "--no-learn-structure"
  ]);

  assert.equal(args.queue, "queue.json");
  assert.equal(args.out, "out");
  assert.equal(args.discoverRoot, "downloads");
  assert.equal(args.discoverLimit, 12);
  assert.equal(args.concurrency, 2);
  assert.equal(args.decisionIr, "deck.ir.json");
  assert.equal(args.decisionSearchCandidates, true);
  assert.equal(args.decisionCandidateSize, 4);
  assert.equal(args.minDecisionPluginTargets, 8);
  assert.equal(args.minDecisionProtectedCrops, 2);
  assert.equal(args.maxDecisionActionableGaps, 0);
  assert.equal(args.gateOut, "gate.json");
  assert.equal(args.failOnGate, true);
  assert.equal(args.learnStructure, false);
  assert.throws(() => parseArgs(["node", "script"]), /--queue is required/);
});

test("component replacement harvest refresh forwards graphic decision options to close loop", () => {
  const options = buildCloseLoopOptions({
    manifestFile: "affected.json",
    args: {
      inventoryOut: "inventory.json",
      closeLoopOut: "close-loop",
      concurrency: 3,
      decisionIr: "deck.ir.json",
      decisionSearchCandidates: true,
      decisionCandidateSize: 4,
      minDecisionPluginTargets: 8,
      minDecisionProtectedCrops: 2,
      maxDecisionActionableGaps: 0,
      allowDecisionDefer: true
    }
  });

  assert.equal(options.manifest, "affected.json");
  assert.equal(options.inventory, "inventory.json");
  assert.equal(options.out, "close-loop");
  assert.equal(options.concurrency, 3);
  assert.equal(options.allowMissing, true);
  assert.equal(options.decisionIr, "deck.ir.json");
  assert.equal(options.decisionSearchCandidates, true);
  assert.equal(options.decisionCandidateSize, 4);
  assert.equal(options.minDecisionPluginTargets, 8);
  assert.equal(options.minDecisionProtectedCrops, 2);
  assert.equal(options.maxDecisionActionableGaps, 0);
  assert.equal(options.allowDecisionDefer, true);
});

test("component replacement harvest refresh writes final close-loop gate report", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-gate-"));
  const closeLoopReport = path.join(tmp, "close-loop-report.json");
  const gateOut = path.join(tmp, "close-loop-gate.json");
  fs.writeFileSync(closeLoopReport, JSON.stringify({
    status: "needs_harvest",
    decisionGate: { status: "passed" },
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 2, canApplyAll: false },
      decisionGate: { status: "passed" }
    }
  }, null, 2));

  const gate = evaluateHarvestRefreshGate({
    args: {
      gateOut,
      allowNeedsHarvestGate: true
    },
    closeLoop: {
      reportFile: closeLoopReport
    }
  });

  assert.equal(gate.status, "passed");
  assert.equal(gate.reportFile, gateOut);
  assert.equal(fs.existsSync(gateOut), true);
  assert.equal(JSON.parse(fs.readFileSync(gateOut, "utf8")).summary.decisionGatePassed, true);
});

test("component replacement harvest refresh builds affected PPTX manifest from queue", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-"));
  const deck = path.join(tmp, "deck.pptx");
  fs.writeFileSync(deck, "PK mocked deck");
  const queue = {
    tasks: [{
      provider: "officeplus",
      affectedFiles: [{ inputPptx: deck }]
    }]
  };

  const manifest = buildAffectedPptxManifest(queue, { out: tmp });

  assert.deepEqual(manifest.files, [deck]);
  assert.equal(fs.existsSync(manifest.file), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest.file, "utf8")).files, [deck]);
});

test("component replacement harvest refresh includes harvested roots before default roots", () => {
  const roots = refreshInventoryRoots([
    { out: "runs/plugin-component-inventory/harvested-officeplus-local-components" },
    { out: "runs/plugin-component-inventory/harvested-islide-local-components" }
  ]);

  assert.equal(roots[0], "runs/plugin-component-inventory/harvested-officeplus-local-components");
  assert.equal(roots[1], "runs/plugin-component-inventory/harvested-islide-local-components");
  assert.ok(roots.some((root) => /plugin-component-inventory/.test(root)));
});

test("component replacement harvest refresh safely binds one harvested sample to one queue task", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-alias-"));
  const sample = path.join(tmp, "downloaded-component.pptx");
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(sample, "PK plugin component");
  fs.writeFileSync(manifestFile, JSON.stringify({
    components: [{
      provider: "officeplus",
      path: sample,
      roleTags: ["applied-component"],
      structureSignature: {
        motifs: ["linear-arrow-chain"],
        primaryKind: "timeline"
      }
    }]
  }, null, 2));

  const aliases = buildQueueBoundAliasCandidates([{
    provider: "officeplus",
    componentId: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    targetMotifs: ["linear-arrow-chain"]
  }], [{
    provider: "officeplus",
    copiedCount: 1,
    manifestFile
  }]);

  assert.equal(aliases.length, 1);
  assert.equal(aliases[0].id, "MatlComponentContent-3611");
  assert.equal(aliases[0].path, sample);
  assert.ok(aliases[0].roleTags.includes("queue-bound-component-sample"));
  assert.equal(aliases[0].queueBinding.title, "渐变4项流程箭头");
  assert.equal(aliases[0].queueBinding.compatibility.compatible, true);
});

test("component replacement harvest refresh rejects motif-mismatched queue-bound samples", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-mismatch-"));
  const sample = path.join(tmp, "downloaded-cycle-component.pptx");
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(sample, "PK plugin component");
  fs.writeFileSync(manifestFile, JSON.stringify({
    components: [{
      provider: "officeplus",
      path: sample,
      structureSignature: {
        primaryKind: "cycle-loop",
        motifs: ["arc-arrow"]
      }
    }]
  }, null, 2));

  const aliases = buildQueueBoundAliasCandidates([{
    provider: "officeplus",
    componentId: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    targetMotifs: ["linear-arrow-chain"]
  }], [{
    provider: "officeplus",
    copiedCount: 1,
    manifestFile
  }]);

  assert.deepEqual(aliases, []);
});

test("component replacement harvest refresh rejects queue-bound samples without structure signal", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-no-signal-"));
  const sample = path.join(tmp, "downloaded-plain-component.pptx");
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(sample, "PK plugin component");
  fs.writeFileSync(manifestFile, JSON.stringify({
    components: [{
      provider: "officeplus",
      path: sample,
      structureSignature: {
        primaryKind: "mixed",
        motifs: []
      }
    }]
  }, null, 2));

  const aliases = buildQueueBoundAliasCandidates([{
    provider: "officeplus",
    componentId: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    targetMotifs: ["linear-arrow-chain"]
  }], [{
    provider: "officeplus",
    copiedCount: 1,
    manifestFile
  }]);

  assert.deepEqual(aliases, []);
});

test("component replacement harvest refresh refuses ambiguous queue-bound aliases", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-refresh-ambiguous-"));
  const sample = path.join(tmp, "downloaded-component.pptx");
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(sample, "PK plugin component");
  fs.writeFileSync(manifestFile, JSON.stringify({ components: [{ path: sample }] }, null, 2));

  assert.deepEqual(buildQueueBoundAliasCandidates([
    { provider: "officeplus", componentId: "A" },
    { provider: "officeplus", componentId: "B" }
  ], [{ provider: "officeplus", copiedCount: 1, manifestFile }]), []);
  assert.deepEqual(buildQueueBoundAliasCandidates([
    { provider: "officeplus", componentId: "A" }
  ], [{ provider: "officeplus", copiedCount: 2, manifestFile }]), []);
});
