"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  countOccurrences,
  measureSkillRootScriptWrappers,
  measureSkillSourceReferences,
  validateBudget,
  verifySkillSourceMigrationBudget
} = require("../scripts/verify-skill-source-migration");

const LEGACY_PREFIX = ["skills", "pd-hifi-slideclone", "scripts"].join("/");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-source-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  return root;
}

test("skill source migration verifier counts bounded legacy script references", (t) => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, "test", "one.test.js"), `require("../${LEGACY_PREFIX}/a");\nrequire("../${LEGACY_PREFIX}/b");\n`, "utf8");
  fs.writeFileSync(path.join(root, "scripts", "clean.js"), '"use strict";\n', "utf8");
  const budget = validateBudget({ version: 1, legacySkillScriptPrefix: LEGACY_PREFIX, scanRoots: ["packages", "scripts", "test"], maxReferenceCount: 2, maxFileCount: 1 });
  assert.equal(countOccurrences("aaa", "aa"), 1);
  assert.deepEqual(measureSkillSourceReferences(root, budget), {
    legacySkillScriptPrefix: LEGACY_PREFIX,
    referenceCount: 2,
    fileCount: 1,
    files: [{ file: "test/one.test.js", referenceCount: 2 }]
  });
  assert.equal(verifySkillSourceMigrationBudget({ workspaceRoot: root, budget }).referenceCount, 2);
});

test("skill source migration budget rejects growth and requires ratcheting after improvement", (t) => {
  const root = workspace(t);
  const budget = { version: 1, legacySkillScriptPrefix: LEGACY_PREFIX, scanRoots: ["test"], maxReferenceCount: 1, maxFileCount: 1 };
  fs.writeFileSync(path.join(root, "test", "one.test.js"), `require("../${LEGACY_PREFIX}/a");\nrequire("../${LEGACY_PREFIX}/b");\n`, "utf8");
  assert.throws(() => verifySkillSourceMigrationBudget({ workspaceRoot: root, budget }), /references 2 exceed 1/);
  fs.writeFileSync(path.join(root, "test", "one.test.js"), '"use strict";\n', "utf8");
  assert.throws(() => verifySkillSourceMigrationBudget({ workspaceRoot: root, budget }), /ratchet maxReferenceCount down/);
  assert.throws(() => validateBudget({ ...budget, scanRoots: ["test", "test"] }), /scan roots/);
});

test("skill source migration verifier requires root scripts to stay thin native wrappers", (t) => {
  const root = workspace(t);
  const scriptRoot = path.join(root, "skills", "pd-hifi-slideclone", "scripts");
  fs.mkdirSync(scriptRoot, { recursive: true });
  fs.writeFileSync(path.join(scriptRoot, "good.js"), [
    '#!/usr/bin/env node',
    '"use strict";',
    'const mod = require("../../../packages/slideclone-native-engine/scripts/good");',
    "module.exports = mod;",
    ""
  ].join("\n"), "utf8");
  const budget = validateBudget({ version: 1, legacySkillScriptPrefix: LEGACY_PREFIX, scanRoots: ["packages", "scripts", "test"], maxReferenceCount: 0, maxFileCount: 0 });

  assert.deepEqual(measureSkillRootScriptWrappers(root, budget), {
    scriptCount: 1,
    violations: []
  });

  fs.writeFileSync(path.join(scriptRoot, "bad.js"), [
    '#!/usr/bin/env node',
    '"use strict";',
    "function realImplementation() { return 1; }",
    "module.exports = { realImplementation };",
    ""
  ].join("\n"), "utf8");

  assert.throws(() => verifySkillSourceMigrationBudget({ workspaceRoot: root, budget }), /not a thin native-engine wrapper/);
});
