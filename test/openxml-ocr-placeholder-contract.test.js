"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolveOpenXmlBuilderRoot } = require("../packages/slideclone-native-engine");

const source = fs.readFileSync(path.join(resolveOpenXmlBuilderRoot(path.join(__dirname, "..")), "Program.cs"), "utf8");

test("OpenXmlDeckBuilder keeps absolute OCR text independent from semantic placeholders", () => {
  assert.match(source, /allowRolePlaceholder = !usesTemplateBindings && !IsAbsoluteOcrTextBox\(textBox\)/);
  assert.match(source, /GetString\(textBox[.]Source, "ocrProvider"\)/);
});

test("OpenXmlDeckBuilder disables inherited bullets only on actual placeholders", () => {
  assert.match(source, /GetFirstChild<P[.]PlaceholderShape>\(\) is not null[\s\S]*new A[.]NoBullet\(\)/);
});
