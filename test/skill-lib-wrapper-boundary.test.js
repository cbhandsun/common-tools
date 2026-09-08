"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  isPackageWrapper,
  lineCount,
  verifySkillLibWrappers
} = require("../scripts/verify-skill-lib-wrappers");

test("skill lib boundary allows package wrappers and small compatibility files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lib-wrapper-boundary-"));
  const skillLib = path.join(root, "skills", "pd-hifi-slideclone", "scripts", "lib");
  fs.mkdirSync(skillLib, { recursive: true });
  fs.writeFileSync(path.join(skillLib, "wrapped.js"), [
    "\"use strict\";",
    "",
    "module.exports = require(\"../../../../packages/slideclone-native-engine/scripts/lib/wrapped\");",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(skillLib, "small.js"), "\"use strict\";\nmodule.exports = {};\n");

  assert.deepEqual(verifySkillLibWrappers({ root }).maxNonWrapperLines, 50);
});

test("skill lib boundary rejects large production implementations under skill lib", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-lib-wrapper-boundary-"));
  const skillLib = path.join(root, "skills", "pd-hifi-slideclone", "scripts", "lib");
  fs.mkdirSync(skillLib, { recursive: true });
  fs.writeFileSync(path.join(skillLib, "legacy-engine.js"), Array.from({ length: 51 }, (_, index) => `const value${index} = ${index};`).join("\n"));

  assert.throws(
    () => verifySkillLibWrappers({ root }),
    /legacy-engine\.js has 51 lines and is not a package wrapper/u
  );
});

test("skill lib wrapper detector is strict about package runtime boundary", () => {
  assert.equal(lineCount("a\nb\n"), 3);
  assert.equal(isPackageWrapper("module.exports = require(\"../../../../packages/slideclone-native-engine/scripts/lib/font-fit\");"), true);
  assert.equal(isPackageWrapper("module.exports = require(\"./font-fit\");"), false);
});
