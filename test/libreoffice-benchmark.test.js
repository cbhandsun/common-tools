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

test("Linux renderer resolution never selects Windows or missing profile paths", () => {
  const environment = {
    LIBREOFFICE_BIN: "C:\\Program Files\\LibreOffice\\program\\soffice.com",
    PDFTOPPM_BIN: "C:\\Tools\\pdftoppm.exe",
    USERPROFILE: "C:\\Users\\worker"
  };
  assert.equal(resolveLibreOffice(undefined, { environment, platform: "linux" }), "soffice");
  assert.equal(resolvePdfToPpm(undefined, { environment, platform: "linux" }), "pdftoppm");
});
