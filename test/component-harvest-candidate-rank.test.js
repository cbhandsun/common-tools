"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  rankHarvestCandidates,
  scoreCandidateForTask
} = require("../skills/pd-hifi-slideclone/scripts/component-harvest-candidate-rank");

test("component harvest candidate rank parses required inputs", () => {
  const args = parseArgs([
    "node",
    "component-harvest-candidate-rank.js",
    "--queue",
    "queue.json",
    "--manifest",
    "manifest.json",
    "--root",
    "harvests",
    "--out",
    "rank.json",
    "--min-score",
    "90"
  ]);

  assert.equal(args.queue, "queue.json");
  assert.deepEqual(args.manifests, ["manifest.json"]);
  assert.deepEqual(args.roots, ["harvests"]);
  assert.equal(args.out, "rank.json");
  assert.equal(args.minScore, 90);
  assert.throws(() => parseArgs(["node", "script"]), /--queue is required/);
});

test("component harvest candidate rank promotes high-readiness process samples", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-rank-"));
  const queueFile = path.join(tmp, "queue.json");
  const manifestFile = path.join(tmp, "manifest.json");
  const sample = path.join(tmp, "process.pptx");
  fs.writeFileSync(sample, "PK process sample");
  fs.writeFileSync(queueFile, JSON.stringify({
    tasks: [{
      provider: "islide",
      componentId: "flow",
      title: "流程箭头",
      targetMotifs: ["linear-arrow-chain"],
      totalAnchorCount: 120
    }]
  }, null, 2));
  fs.writeFileSync(manifestFile, JSON.stringify({
    components: [{
      provider: "islide",
      path: sample,
      name: "process.pptx",
      roleTags: ["applied-component"],
      structureSignature: {
        primaryKind: "process-chain",
        primaryMotif: "linear-arrow-chain",
        motifs: ["linear-arrow-chain"]
      },
      learningSummary: {
        componentCatalog: [{
          reuseReadiness: { level: "high", score: 86 },
          structure: { kind: "process-chain", motifs: ["linear-arrow-chain"] }
        }]
      }
    }]
  }, null, 2));

  const report = rankHarvestCandidates({ queue: queueFile, manifests: [manifestFile], minScore: 80 });

  assert.equal(report.summary.readyTasks, 1);
  assert.equal(report.tasks[0].bestStatus, "ready_candidate");
  assert.equal(report.tasks[0].candidates[0].component.name, "process.pptx");
});

test("component harvest candidate rank does not promote low-readiness mixed samples", () => {
  const candidate = scoreCandidateForTask({
    targetMotifs: ["linear-arrow-chain"]
  }, {
    provider: "islide",
    path: "mixed.pptx",
    name: "mixed.pptx",
    roleTags: ["applied-component"],
    signature: {
      primaryKind: "mixed",
      primaryMotif: "",
      motifs: [],
      reuseReadinessScore: 33,
      reuseReadinessLevel: "low"
    },
    readinessScore: 33
  });

  assert.equal(candidate.score, 0);
  assert.equal(candidate.status, "weak_candidate");
  assert.ok(candidate.reasons.includes("motif-mismatch-or-missing"));
});

test("component harvest candidate rank keeps motif-matched medium samples out of ready set", () => {
  const candidate = scoreCandidateForTask({
    templateFamily: "process-chain",
    targetMotifs: ["linear-arrow-chain"]
  }, {
    provider: "islide",
    path: "medium-arrow-chain.pptx",
    name: "medium-arrow-chain.pptx",
    roleTags: ["applied-component"],
    signature: {
      primaryKind: "process-chain",
      primaryMotif: "linear-arrow-chain",
      motifs: ["linear-arrow-chain"],
      reuseReadinessScore: 51,
      reuseReadinessLevel: "medium"
    },
    readinessScore: 51
  }, { minScore: 80 });

  assert.equal(candidate.score, 53);
  assert.equal(candidate.status, "weak_candidate");
  assert.ok(candidate.reasons.includes("motif-overlap:linear-arrow-chain"));
  assert.ok(candidate.reasons.includes("low-readiness:51"));
});
