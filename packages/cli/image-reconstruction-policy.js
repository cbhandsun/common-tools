// @ts-check
"use strict";

const { types } = require("node:util");
const { parseNativeOutputPolicy } = require("../slideclone-core/quality/native-output-policy");
const { parseConnectorCornerMode } = require("../slideclone-core/routing/source-route-corner-mode");

/** @typedef {Readonly<{outputPolicy: 'source-fidelity'|'semantic-native', connectorCornerMode: 'auto'|'rounded-freeform'|'reroutable-elbow'}>} ImageReconstructionPolicy */

function invalid() { return new TypeError("Image reconstruction policy is invalid"); }

/** Read known own data without executing getters, proxies or coercion.
 * @param {unknown} input @param {string} key @returns {unknown} */
function ownValue(input, key) {
  if (!input || typeof input !== "object" || Array.isArray(input) || types.isProxy(input)) throw invalid();
  const property = Object.getOwnPropertyDescriptor(input, key);
  if (property && !("value" in property)) throw invalid();
  return /** @type {unknown} */ (property?.value);
}

/** @param {unknown} input @param {string} outputKey @param {string} cornerKey @returns {ImageReconstructionPolicy} */
function parsePolicy(input, outputKey, cornerKey) {
  const output = ownValue(input, outputKey), corner = ownValue(input, cornerKey);
  try {
    return Object.freeze({ outputPolicy: parseNativeOutputPolicy(output), connectorCornerMode: parseConnectorCornerMode(corner) });
  } catch (error) {
    if (error instanceof TypeError) throw invalid();
    throw error;
  }
}

/** Validate before deployment IO; the running Worker still validates at startup.
 * @param {unknown} environment @returns {ImageReconstructionPolicy} */
function readImageReconstructionPolicy(environment) {
  return parsePolicy(environment, "COMMON_TOOLS_IMAGE_OUTPUT_POLICY", "COMMON_TOOLS_IMAGE_CONNECTOR_CORNER_MODE");
}

/** A Compose override must preserve the selected semantic and connector modes.
 * @param {unknown} environment @param {unknown} [expected] @returns {void} */
function assertResolvedImageReconstructionPolicy(environment, expected) {
  const actual = readImageReconstructionPolicy(environment);
  if (expected === undefined) return;
  const selected = parsePolicy(expected, "outputPolicy", "connectorCornerMode");
  if (actual.outputPolicy !== selected.outputPolicy || actual.connectorCornerMode !== selected.connectorCornerMode) {
    throw new TypeError("Image reconstruction policy does not match deployment configuration");
  }
}

module.exports = { readImageReconstructionPolicy, assertResolvedImageReconstructionPolicy };
