"use strict";
// @ts-check
const path = require("node:path");
/** @param {unknown} [input] */
function resolvePptxBuildMode(input = {}) {
  const options = readBuildModeOptions(input);
  const rawEngine = String(options["pptx-engine"] || options.pptxEngine || "").trim().toLowerCase();
  const openXmlBatch = enabled(options["openxml-batch"]) || enabled(options.openXmlBatch);
  return {
    engine: openXmlBatch || ["openxml", "openxml-dotnet", "dotnet"].includes(rawEngine) ? "openxml" : "python",
    openXmlBatch,
    openXmlBuilderExe: options["openxml-builder-exe"] || options.openXmlBuilderExe || process.env.OPENXML_BUILDER_EXE || "",
    openXmlBuilderConfiguration: options["openxml-builder-configuration"] || options.openXmlBuilderConfiguration || "",
    openXmlBuilderTargetFramework: options["openxml-builder-target-framework"] || options.openXmlBuilderTargetFramework || "",
    openXmlBuildConcurrency: options["openxml-build-concurrency"] || options.openXmlBuildConcurrency || "",
    openXmlBuildCache: !disabled(options["openxml-build-cache"] ?? options.openXmlBuildCache),
    openXmlBuildCacheDir: options["openxml-build-cache-dir"] || options.openXmlBuildCacheDir || path.join("runs", "slideclone-pptx-build-cache"),
    openXmlBuildCacheMaxBytes: options["openxml-build-cache-max-bytes"] || options.openXmlBuildCacheMaxBytes || "",
    powerPointSafe: !disabled(options["powerpoint-safe"] ?? options.powerPointSafe)
  };
}

/** Only read known scalar fields. Unrelated reconstruction options remain owned by their stages.
 * @param {unknown} input @returns {Record<string, string | number | boolean | null | undefined>} */
function readBuildModeOptions(input) {
  const invalid = "PPTX build options are invalid";
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError(invalid);
  /** @type {Record<string, string | number | boolean | null | undefined>} */
  const options = {};
  const fields = ["pptx-engine", "pptxEngine", "openxml-batch", "openXmlBatch", "openxml-builder-exe", "openXmlBuilderExe",
    "openxml-builder-configuration", "openXmlBuilderConfiguration", "openxml-builder-target-framework", "openXmlBuilderTargetFramework",
    "openxml-build-concurrency", "openXmlBuildConcurrency", "openxml-build-cache", "openXmlBuildCache", "openxml-build-cache-dir",
    "openXmlBuildCacheDir", "openxml-build-cache-max-bytes", "openXmlBuildCacheMaxBytes", "powerpoint-safe", "powerPointSafe"];
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new TypeError(invalid);
    const value = /** @type {unknown} */ (descriptor.value);
    if (value != null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new TypeError(invalid);
    if (typeof value === "string" && (value.length > 32768 || value.includes("\0"))) throw new TypeError(invalid);
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(invalid);
    options[key] = value;
  }
  return options;
}

/** @param {unknown} value */
function enabled(value) { return value === true || value === "true" || value === "1" || value === "yes"; }
/** @param {unknown} value */
function disabled(value) { return value === false || String(value ?? "").trim().toLowerCase() === "false" || String(value ?? "").trim() === "0"; }

module.exports = {resolvePptxBuildMode};
