"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createConfig, loadAdapter, validateIr } = require("../skills/pd-hifi-slideclone/scripts/slideclone");
const { assertValidConfig, validateConfig } = require("../skills/pd-hifi-slideclone/scripts/lib/config-validation");
const configSchema = require("../skills/pd-hifi-slideclone/schemas/slideclone.config.schema.json");

test("config rejects embedded NUL and oversized paths before execution", () => {
  for (const value of ["input\0hidden", "x".repeat(32769)]) {
    for (const field of ["inputDir", "outputDir"]) {
      const config = structuredClone(createConfig("input", "output"));
      config[field] = value;
      assert.equal(validateConfig(config).ok, false, field);
    }
    const config = structuredClone(createConfig("input", "output"));
    config.adapters.ocr = value;
    assert.equal(validateConfig(config).ok, false, "adapter path");
  }
});

test("config errors do not echo arbitrary unsupported field names", () => {
  const secretField = "private-token\n" + "secret-content".repeat(1000);
  for (const section of [null, "adapters", "paddleOcr", "openXmlBuilder"]) {
    const config = structuredClone(createConfig("input", "output"));
    if (section) config[section] = { ...(config[section] || {}), [secretField]: true };
    else config[secretField] = true;
    const result = validateConfig(config);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.errors.join(" "), /private-token|secret-content/);
    assert.ok(result.errors.join(" ").length < 2000);
  }
});

test("config rejects malformed nested settings without coercion or unbounded diagnostics", () => {
  for (const value of [null, [], false, 1, "invalid"]) {
    for (const section of ["normalize", "thresholds", "umiOcr", "paddleOcr", "openXmlBuilder", "tesseract"]) {
      const config = structuredClone(createConfig("input", "output"));
      config[section] = value;
      assert.equal(validateConfig(config).ok, false, section);
    }
  }
  const config = structuredClone(createConfig("input", "output"));
  const hostile = { valueOf() { throw new Error("must not coerce"); }, toString() { throw new Error("must not stringify"); } };
  config.maxIterations = hostile;
  config.slide.widthPt = hostile;
  assert.equal(validateConfig(config).ok, false);
  for (let index = 0; index < 10000; index += 1) config[`unknown-${index}`] = true;
  const result = validateConfig(config);
  assert.ok(result.errors.length < 10);
  assert.throws(() => assertValidConfig(config), (error) => error.code === "ERR_SLIDECLONE_CONFIG" && error.message.length < 2000);
});

test("runtime and schema bound input, output and adapter path strings", () => {
  for (const schema of [configSchema.properties.inputDir, configSchema.properties.outputDir, ...Object.values(configSchema.properties.adapters.properties)]) {
    assert.equal(schema.maxLength, 32768);
    assert.equal(new RegExp(schema.pattern).test("path\0hidden"), false);
    assert.equal(new RegExp(schema.pattern).test("C:\\合法 路径\\adapter.js"), true);
  }
  const config = structuredClone(createConfig("input", "output"));
  config.inputDir = "x".repeat(32768);
  assert.equal(validateConfig(config).ok, true);
});

test("generated slideclone config passes its runtime boundary validation", () => {
  const config = createConfig("input", "output");
  assert.deepEqual(validateConfig(config), { ok: true, errors: [] });
  assert.equal(assertValidConfig(config), config);
  for (const key of Object.keys(config)) {
    assert.ok(configSchema.properties[key], `schema is missing generated config property ${key}`);
  }
  assert.equal(configSchema.properties.pageConcurrency.maximum, 8);
});

test("slideclone config rejects empty, unknown, and extreme boundary values", () => {
  const config = createConfig("input", "output");
  config.outputDir = "";
  config.unknownExecutionFlag = true;
  config.maxIterations = 1000;
  config.normalize = { exportWidthPx: 1 };
  const result = validateConfig(config);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("outputDir")));
  assert.ok(result.errors.includes("config contains an unsupported field"));
  assert.ok(result.errors.some((error) => error.includes("maxIterations")));
  assert.ok(result.errors.some((error) => error.includes("exportWidthPx")));
});

test("slideclone config rejects retired commercial OCR configuration", () => {
  const config = createConfig("input", "output");
  config.asposeOcr = {
    dllPath: "vendor/Aspose.OCR.dll",
    timeoutMs: 999
  };
  const invalid = validateConfig(config);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("config contains an unsupported field"));
});

test("slideclone config validates official PaddleOCR runtime boundaries", () => {
  const config = createConfig("input", "output");
  config.paddleOcr = {
    lang: "../unsafe",
    ocrVersion: "latest",
    engine: "shell",
    cpuThreads: 0,
    timeoutMs: 999,
    enableHpi: "yes",
    unknown: true
  };
  const invalid = validateConfig(config);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("config.paddleOcr contains an unsupported field"));
  for (const field of ["lang", "ocrVersion", "engine", "cpuThreads", "timeoutMs", "enableHpi"]) {
    assert.ok(invalid.errors.some((error) => error.includes(field)), `missing validation error for ${field}`);
  }
});

test("slideclone config validates OpenXML builder diagnostics and executable boundaries", () => {
  const config = createConfig("input", "output");
  config.openXmlBuilder = {
    configuration: "Release",
    targetFramework: "net8.0-windows",
    powerPointSafe: true,
    retainBuildArtifacts: false
  };
  assert.equal(validateConfig(config).ok, true);

  config.openXmlBuilder.retainBuildArtifacts = "yes";
  config.openXmlBuilder.targetFramework = "../unsafe";
  config.openXmlBuilder.unknown = true;
  const invalid = validateConfig(config);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("retainBuildArtifacts must be a boolean")));
  assert.ok(invalid.errors.some((error) => error.includes("targetFramework is invalid")));
  assert.ok(invalid.errors.includes("config.openXmlBuilder contains an unsupported field"));
});

test("slideclone rejects external adapters unless the CLI explicitly opts in", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-external-adapter-"));
  try {
    const adapter = path.join(root, "adapter.js");
    fs.writeFileSync(adapter, "module.exports = async () => ({ ok: true });\n", "utf8");
    await assert.rejects(
      loadAdapter(root, adapter),
      (error) => error?.code === "ERR_EXTERNAL_ADAPTER"
    );
    const loaded = await loadAdapter(root, adapter, { allowExternal: true });
    assert.equal(typeof loaded, "function");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("IR validation returns errors instead of throwing for invalid collection types", () => {
  assert.doesNotThrow(() => {
    const result = validateIr({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: {} });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("pages must be an array"));
  });

  const result = validateIr({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "missing.png",
      textBoxes: {},
      shapes: {},
      images: {},
      tables: {},
      charts: {},
      icons: {}
    }]
  }, { checkFiles: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("textBoxes must be an array")));
});
