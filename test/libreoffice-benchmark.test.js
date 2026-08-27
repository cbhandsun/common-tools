"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fileUrl,
  resolveLibreOffice,
  resolvePdfToPpm
} = require("../skills/pd-hifi-slideclone/scripts/libreoffice-benchmark");

test("fileUrl returns a LibreOffice-compatible file URL", () => {
  const url = fileUrl("C:\\Temp\\lo profile");
  assert.equal(url, "file:///C:/Temp/lo profile");
});

test("explicit LibreOffice and pdftoppm paths are preferred", () => {
  assert.equal(resolveLibreOffice("custom-soffice"), "custom-soffice");
  assert.equal(resolvePdfToPpm("custom-pdftoppm"), "custom-pdftoppm");
});
