"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const {
  fileUrl,
  resolveLibreOffice,
  resolvePdfToPpm
} = require("../skills/pd-hifi-slideclone/scripts/libreoffice-benchmark");

test("fileUrl returns a LibreOffice-compatible file URL", () => {
  for (const name of ["lo profile", "profile#1", "profile%20", "配置文件", "profile?x=1", "profile\nnext"]) {
    const file = path.resolve("test-profiles", name);
    const url = new URL(fileUrl(file));
    assert.equal(url.protocol, "file:");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(fileURLToPath(url), file);
    assert.equal(url.href.includes(" "), false);
  }
  assert.match(fileUrl(path.resolve("lo profile")), /lo%20profile$/);
  if (process.platform === "win32") {
    assert.equal(fileUrl("C:\\Temp\\lo profile"), "file:///C:/Temp/lo%20profile");
    assert.equal(fileURLToPath(fileUrl("\\\\server\\share\\profile #1")), "\\\\server\\share\\profile #1");
  } else {
    assert.equal(fileUrl("/tmp/lo profile"), "file:///tmp/lo%20profile");
  }
});

test("fileUrl rejects invalid paths without coercing external input", () => {
  let coercions = 0;
  for (const value of [undefined, null, false, 1, "", "bad\0path", "x".repeat(32769), { toString() { coercions += 1; return "profile"; } }]) {
    assert.throws(() => fileUrl(value), TypeError);
  }
  assert.equal(coercions, 0);
  const longPath = path.resolve("x".repeat(32000));
  assert.equal(fileURLToPath(fileUrl(longPath)), longPath);
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
