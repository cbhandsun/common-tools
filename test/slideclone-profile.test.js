"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { buildInvocation, loadProfile, loadRegistry, parseCli, validateArguments, validateProfileName } = require("../scripts/slideclone-profile");
const { verifySlidecloneProfiles } = require("../scripts/verify-slideclone-profiles");

test("slideclone profiles resolve a versioned script and bounded arguments", () => {
  const profile = loadProfile("real-pptx-native");
  assert.equal(path.basename(profile.script), "rebuild-real-pptx-native.js");
  assert.match(profile.script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/rebuild-real-pptx-native\.js$/);
  assert.deepEqual(profile.args.slice(0, 2), ["--work-root", "ppt文档/可编辑版本"]);
  const invocation = buildInvocation("real-pptx-native", ["--help"]);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args.at(-1), "--help");
  assert.match(invocation.args[0].replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/rebuild-real-pptx-native\.js$/);
});

test("slideclone registry centralizes package profiles and rejects direct skill-script aliases", () => {
  const registry = loadRegistry();
  assert.ok(Object.keys(registry).length >= 140);
  assert.match(loadProfile("component-strategy-rebuild-assets-native-turbo").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/component-strategy-rebuild-parallel\.js$/);
  assert.match(loadProfile("component-strategy-rebuild-assets-native-page-shards").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/component-strategy-rebuild-page-shards\.js$/);
  assert.match(loadProfile("quality-gate-real-pptx").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/quality-gate-real-pptx\.js$/);
  assert.match(loadProfile("watch-plugin-component-downloads").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/watch-plugin-component-downloads\.js$/);
  assert.match(loadProfile("smoke-flow-e2e").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/flow-e2e-smoke\.js$/);
  assert.match(loadProfile("smoke-flow-e2e-matrix").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/flow-e2e-matrix\.js$/);
  assert.match(loadProfile("smoke-real-pptx").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/real-pptx-normalize-smoke\.js$/);
  assert.match(loadProfile("smoke-sample-deck-hifi").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/ir-delivery-smoke\.js$/);
  assert.match(loadProfile("smoke-ocr-text").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/ocr-text-smoke\.js$/);
  assert.match(loadProfile("smoke-text-micro-adjust").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/ocr-text-smoke\.js$/);
  assert.match(loadProfile("convert-real-pptx").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/real-pptx-editable-batch\.js$/);
  assert.match(loadProfile("rebuild-real-pptx-native-parallel").script.replace(/\\/gu, "/"), /packages\/slideclone-native-engine\/scripts\/rebuild-real-pptx-native-parallel\.js$/);
  const result = verifySlidecloneProfiles();
  assert.ok(result.profileCount >= 140);
  assert.ok(result.nativeProfileCount >= 140);
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
