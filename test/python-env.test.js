"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  pythonEnv,
  resolvePythonExecutable,
  usesBundledPython
} = require("../skills/pd-hifi-slideclone/scripts/lib/python-env");

test("resolvePythonExecutable honors explicit and slideclone python overrides", () => {
  const previousPythonBin = process.env.PYTHON_BIN;
  const previousSlideclonePython = process.env.SLIDECLONE_PYTHON;
  const previousPython = process.env.PYTHON;
  try {
    delete process.env.PYTHON_BIN;
    process.env.SLIDECLONE_PYTHON = "slideclone-python";
    process.env.PYTHON = "ambient-python";

    assert.equal(resolvePythonExecutable("explicit-python"), "explicit-python");
    assert.equal(resolvePythonExecutable(), "slideclone-python");
  } finally {
    restoreEnv("PYTHON_BIN", previousPythonBin);
    restoreEnv("SLIDECLONE_PYTHON", previousSlideclonePython);
    restoreEnv("PYTHON", previousPython);
  }
});

test("pythonEnv can skip local python-site injection for bundled runtimes", () => {
  const previousSkip = process.env.SLIDECLONE_SKIP_LOCAL_PYTHON_SITE;
  const previousPythonPath = process.env.PYTHONPATH;
  try {
    process.env.SLIDECLONE_SKIP_LOCAL_PYTHON_SITE = "true";
    process.env.PYTHONPATH = "existing-site";

    assert.deepEqual(pythonEnv("skills/pd-hifi-slideclone"), {});
  } finally {
    restoreEnv("SLIDECLONE_SKIP_LOCAL_PYTHON_SITE", previousSkip);
    restoreEnv("PYTHONPATH", previousPythonPath);
  }
});

test("pythonEnv skips local python-site for bundled Python executable", () => {
  const previousSkip = process.env.SLIDECLONE_SKIP_LOCAL_PYTHON_SITE;
  const previousPythonPath = process.env.PYTHONPATH;
  try {
    delete process.env.SLIDECLONE_SKIP_LOCAL_PYTHON_SITE;
    process.env.PYTHONPATH = "existing-site";
    const bundled = "C:\\Users\\tester\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

    assert.equal(usesBundledPython(bundled), true);
    assert.deepEqual(pythonEnv("skills/pd-hifi-slideclone", { python: bundled }), {});
  } finally {
    restoreEnv("SLIDECLONE_SKIP_LOCAL_PYTHON_SITE", previousSkip);
    restoreEnv("PYTHONPATH", previousPythonPath);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
