'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {collectImports} = require('../scripts/verify-workspace-boundaries');
const binding = 'const core = require("node:module").createRequire(require.resolve("../slideclone-core/package.json"));';

test('boundary analysis tracks literal imports through a local standard createRequire binding', () => {
  const imports = collectImports(binding + '\ncore("@common-tools/slideclone-core/png");');
  assert.deepEqual(imports.map(row => row.specifier), ['node:module', '@common-tools/slideclone-core/png']);
});

test('local import analysis keeps dynamic, empty and multiple arguments visible as invalid', () => {
  const imports = collectImports(binding + '\ncore(input); core(); core("a", "b");');
  assert.deepEqual(imports.map(row => row.specifier), ['node:module', null, null, null]);
});

test('an unrelated or shadowed core function does not become an import capability', () => {
  const imports = collectImports(binding + '\nfunction nested(core){core("ordinary-function-argument");}\ncore("@common-tools/slideclone-core/png");');
  assert.deepEqual(imports.map(row => row.specifier), ['node:module', '@common-tools/slideclone-core/png']);
  assert.deepEqual(collectImports('const core = service.createRequire("/tmp/package.json"); core("ordinary-call");'), []);
  assert.deepEqual(collectImports('const core = require("other-module").createRequire(require.resolve("../package.json")); core("ordinary-call");').map(row => row.specifier), ['other-module']);
});
