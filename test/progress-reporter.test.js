"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createProgressLineForwarder,
  createProgressReporter,
  sanitizeEvent
} = require("../skills/pd-hifi-slideclone/scripts/lib/progress-reporter");

test("progress reporter emits safe structured events without paths or secrets", () => {
  let output = "";
  const stream = { write(value) { output += value; } };
  const reporter = createProgressReporter({ enabled: true, stream, context: { scope: "native-rebuild", deck: "sample" } });

  reporter.emit({
    phase: "page",
    status: "done",
    page: 3,
    pageTotal: 11,
    elapsedMs: 1200,
    token: "secret-value",
    filePath: "C:\\private\\deck.pptx"
  });

  assert.match(output, /^\[slideclone-progress\] /);
  assert.match(output, /"page":3/);
  assert.doesNotMatch(output, /secret-value|private|filePath|token/);
});

test("progress reporter can be disabled and rejects incomplete events", () => {
  let output = "";
  const stream = { write(value) { output += value; } };
  const disabled = createProgressReporter({ enabled: false, stream });
  const enabled = createProgressReporter({ enabled: true, stream });

  assert.equal(disabled.emit({ phase: "page", status: "start" }), false);
  assert.equal(enabled.emit({ phase: "page" }), false);
  assert.equal(output, "");
});

test("progress event sanitizer clamps invalid numeric fields and limits strings", () => {
  const event = sanitizeEvent({
    phase: "x".repeat(200),
    status: "done",
    elapsedMs: -20,
    page: Infinity,
    unknown: "ignored"
  });

  assert.equal(event.phase.length, 120);
  assert.equal(event.elapsedMs, 0);
  assert.equal("page" in event, false);
  assert.equal("unknown" in event, false);
});

test("progress line forwarder handles chunked safe events and rejects arbitrary stderr", () => {
  let output = "";
  const forwarder = createProgressLineForwarder({ stream: { write: (value) => { output += value; } } });
  forwarder.write("ordinary error with token=secret\n[slideclone-pro");
  forwarder.write("gress] {\"phase\":\"page\",\"status\":\"done\",\"page\":2,\"path\":\"private\"}\n");
  forwarder.write("[slideclone-progress] not-json\n");
  forwarder.flush();

  assert.equal(output, "[slideclone-progress] {\"phase\":\"page\",\"status\":\"done\",\"page\":2}\n");
});
