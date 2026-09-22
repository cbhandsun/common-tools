"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  appendOutputTail,
  buildNpmRunCommand,
  parseArgs,
  prefixLines,
  resolveNpmCli,
  runGoldenGate,
  sanitizeMessage
} = require("../packages/slideclone-native-engine/scripts/component-assets-golden-gate");

test("component assets golden gate chooses platform-safe npm command", () => {
  assert.equal(buildNpmRunCommand("demo", "win32").file, process.execPath);
  assert.deepEqual(buildNpmRunCommand("demo", "win32").args, [resolveNpmCli(), "run", "demo"]);
  assert.deepEqual(buildNpmRunCommand("demo", "linux"), {
    file: "npm",
    args: ["run", "demo"]
  });
});

test("component assets golden gate prefixes child output without changing line endings", () => {
  assert.equal(prefixLines("coverage", "one\ntwo\n"), "[coverage] one\n[coverage] two\n");
});

test("component assets golden gate keeps bounded child output tails", () => {
  assert.equal(appendOutputTail("abc", "def", 4), "cdef");
});

test("component assets golden gate redacts common secret-shaped messages", () => {
  const message = sanitizeMessage("failed token=abc123 Bearer secret-token api_key=xyz");

  assert.equal(message.includes("abc123"), false);
  assert.equal(message.includes("secret-token"), false);
  assert.equal(message.includes("xyz"), false);
  assert.match(message, /token=\[redacted\]/);
  assert.match(message, /Bearer \[redacted\]/);
  assert.match(message, /api_key=\[redacted\]/);
});

test("component assets golden gate parses strict output options", () => {
  assert.deepEqual(parseArgs([]), {
    strict: false,
    out: null
  });
  assert.deepEqual(parseArgs(["--strict", "--out", "runs/component-assets-golden-gate-strict.json"]), {
    strict: true,
    out: "runs/component-assets-golden-gate-strict.json"
  });
  assert.throws(() => parseArgs(["--out"]), /--out requires a value/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown component-assets-golden-gate argument/);
});

test("strict component assets golden gate runs all evidence before strict acceptance", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-assets-golden-gate-"));
  const out = path.join(tmp, "strict.json");
  const seen = [];
  const summary = await runGoldenGate({
    strict: true,
    out,
    runTask: async (task) => {
      seen.push(task.id);
      return {
        id: task.id,
        script: task.script,
        exitCode: 0,
        durationMs: 1
      };
    }
  });

  assert.equal(summary.passed, true);
  assert.deepEqual(seen, [
    "regression",
    "coverage",
    "image-recall",
    "image-recall-corpus",
    "self-fidelity",
    "asset-admission",
    "strict-acceptance"
  ]);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).id, "component-assets-golden-gate-strict");
});

test("strict component assets golden gate skips strict acceptance when evidence fails", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-assets-golden-gate-"));
  const seen = [];
  const summary = await runGoldenGate({
    strict: true,
    out: path.join(tmp, "strict-failed.json"),
    runTask: async (task) => {
      seen.push(task.id);
      return {
        id: task.id,
        script: task.script,
        exitCode: task.id === "image-recall" ? 1 : 0,
        durationMs: 1
      };
    }
  });

  assert.equal(summary.passed, false);
  assert.equal(seen.includes("strict-acceptance"), false);
  assert.equal(seen.includes("self-fidelity"), false);
  assert.equal(seen.includes("asset-admission"), false);
  assert.equal(summary.tasks.at(-1).id, "strict-acceptance");
  assert.equal(summary.tasks.at(-1).skipped, true);
});

test("strict component assets golden gate stops admission sequence before strict acceptance", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-assets-golden-gate-"));
  const seen = [];
  const summary = await runGoldenGate({
    strict: true,
    out: path.join(tmp, "strict-admission-failed.json"),
    runTask: async (task) => {
      seen.push(task.id);
      return {
        id: task.id,
        script: task.script,
        exitCode: task.id === "self-fidelity" ? 1 : 0,
        durationMs: 1
      };
    }
  });

  assert.equal(summary.passed, false);
  assert.equal(seen.includes("asset-admission"), false);
  assert.equal(seen.includes("strict-acceptance"), false);
  assert.equal(summary.tasks.at(-1).skipped, true);
});
