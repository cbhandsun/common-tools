"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { buildInvocation, loadProfile, loadRegistry, parseCli, validateArguments, validateProfileName } = require("../scripts/slideclone-profile");
const { verifySlidecloneProfiles } = require("../scripts/verify-slideclone-profiles");

test("slideclone profiles resolve a versioned script and bounded arguments", () => {
  const profile = loadProfile("real-pptx-native");
  assert.equal(path.basename(profile.script), "rebuild-real-pptx-native.js");
  assert.deepEqual(profile.args.slice(0, 2), ["--work-root", "ppt文档/可编辑版本"]);
  const invocation = buildInvocation("real-pptx-native", ["--help"]);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args.at(-1), "--help");
});

test("slideclone registry centralizes package profiles and rejects direct skill-script aliases", () => {
  const registry = loadRegistry();
  assert.ok(Object.keys(registry).length >= 140);
  assert.equal(path.basename(loadProfile("component-strategy-rebuild-assets-native-turbo").script), "component-strategy-rebuild-parallel.js");
  const result = verifySlidecloneProfiles();
  assert.ok(result.profileCount >= 140);
  assert.ok(result.aliasCount >= 140);
});

test("slideclone profile boundary rejects traversal, malformed CLI input, and extreme arguments", () => {
  assert.throws(() => validateProfileName("../secret"), /name is invalid/);
  assert.throws(() => loadProfile("missing-profile"), /does not exist/);
  assert.throws(() => parseCli(["real-pptx-native", "unexpected"]), /usage/);
  assert.deepEqual(parseCli(["real-pptx-native", "--", "--help"]), { name: "real-pptx-native", extraArgs: ["--help"] });
  assert.throws(() => validateArguments(Array(129).fill("x"), "arguments"), /invalid/);
  assert.throws(() => validateArguments(["bad\0value"], "arguments"), /invalid/);
});
