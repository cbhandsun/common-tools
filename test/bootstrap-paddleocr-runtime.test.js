"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { assertManagedPath, pythonInVenv, runChecked, versionProbeArgs } = require("../scripts/bootstrap-paddleocr-runtime");

test("PaddleOCR bootstrap confines replacement to its managed tools directory", () => {
  const tools = path.resolve(".tools");
  assert.doesNotThrow(() => assertManagedPath(tools, path.join(tools, "paddleocr-venv")));
  assert.throws(() => assertManagedPath(tools, path.resolve("outside")), /outside/);
  assert.match(pythonInVenv(path.resolve("runtime")), process.platform === "win32" ? /Scripts[\\/]python\.exe$/ : /bin[\\/]python$/);
});

test("PaddleOCR bootstrap fails closed when a setup process fails", () => {
  assert.throws(() => runChecked(() => ({ status: 7 }), "python", [], {}), /exit code 7/);
  assert.match(versionProbeArgs()[1], /paddleocr\.__version__ == '3\.7\.0'/);
});
