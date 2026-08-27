"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appendOutputTail,
  buildNpmRunCommand,
  prefixLines,
  resolveNpmCli,
  sanitizeMessage
} = require("../skills/pd-hifi-slideclone/scripts/component-assets-golden-gate");

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
