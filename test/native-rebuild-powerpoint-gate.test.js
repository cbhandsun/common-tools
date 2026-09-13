"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const adapterPath = require.resolve("../packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-com");
const runnerPath = require.resolve("../packages/slideclone-native-engine/scripts/lib/native-rebuild-cli-runner");

test("PowerPoint open gate parses repair flags through the shared flag helper", async () => {
  const adapter = require(adapterPath);
  const originalValidate = adapter.validatePowerPointOpen;
  const calls = [];
  adapter.validatePowerPointOpen = async (files, options) => {
    calls.push({ files, options });
    return { provider: "stub-powerpoint-open-gate", passed: true };
  };
  delete require.cache[runnerPath];
  try {
    const { runPowerPointGateIfNeeded } = require(runnerPath);
    const events = [];
    const report = {
      totals: { failed: 0 },
      results: [
        { status: "converted", outputPptx: path.join("runs", "deck.native-editable.pptx") }
      ],
      powerPointOpenGate: { enabled: true, status: "pending" }
    };
    await runPowerPointGateIfNeeded({
      powerPointOpenGate: true,
      report,
      outRoot: path.join("runs", "gate"),
      args: { "powerpoint-repair-in-place": "false" },
      progressReporter: { emit: (event) => events.push(event) }
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].files, [path.join("runs", "deck.native-editable.pptx")]);
    assert.equal(calls[0].options.repairInPlace, false);
    assert.equal(report.powerPointOpenGate.status, "passed");
    assert.deepEqual(events.map((event) => event.status), ["start", "done"]);
  } finally {
    adapter.validatePowerPointOpen = originalValidate;
    delete require.cache[runnerPath];
  }
});
