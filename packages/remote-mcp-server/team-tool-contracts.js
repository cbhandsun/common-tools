// @ts-check
"use strict";

const { compileSchema } = require("../mcp-server/schema-validator");

const NON_EMPTY_STRING = Object.freeze({ type: "string", minLength: 1, maxLength: 4096 });
const JOB_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "capability", "status"],
  properties: {
    id: Object.freeze({ type: "string", minLength: 1, maxLength: 256 }),
    capability: Object.freeze({ type: "string", minLength: 1, maxLength: 64 }),
    status: Object.freeze({ type: "string", minLength: 1, maxLength: 64 })
  },
  additionalProperties: true
});

/** @param {boolean} readOnlyHint @param {boolean} destructiveHint @param {boolean} idempotentHint */
function annotations(readOnlyHint, destructiveHint, idempotentHint) {
  return Object.freeze({ readOnlyHint, destructiveHint, idempotentHint, openWorldHint: false });
}

const TEAM_TOOLS = Object.freeze([
  Object.freeze({ name: "create_team_upload_target", capability: null, description: "Create a short-lived upload target for a team capability input.", required: ["capability", "contentType", "contentLength"], outputSchema: Object.freeze({ type: "object", required: ["objectKey", "uploadUrl"], properties: { objectKey: NON_EMPTY_STRING, uploadUrl: NON_EMPTY_STRING, expiresAt: NON_EMPTY_STRING }, additionalProperties: false }), annotations: annotations(false, false, false) }),
  Object.freeze({ name: "create_team_job", capability: null, description: "Create a team job from an owner-scoped uploaded object.", required: ["capability", "inputObjectKey", "idempotencyKey"], outputSchema: JOB_SCHEMA, annotations: annotations(false, false, true) }),
  Object.freeze({ name: "get_team_job", capability: null, description: "Read a team job owned by the current principal.", required: ["id"], outputSchema: JOB_SCHEMA, annotations: annotations(true, false, true) }),
  Object.freeze({ name: "cancel_team_job", capability: null, description: "Request cancellation of a team job owned by the current principal.", required: ["id"], outputSchema: JOB_SCHEMA, annotations: annotations(false, true, true) }),
  Object.freeze({ name: "get_team_artifact_target", capability: null, description: "Create a short-lived download target for a completed team artifact.", required: ["id", "name"], outputSchema: Object.freeze({ type: "object", required: ["downloadUrl"], properties: { objectKey: NON_EMPTY_STRING, downloadUrl: NON_EMPTY_STRING, expiresAt: NON_EMPTY_STRING }, additionalProperties: false }), annotations: annotations(false, false, false) })
]);

/** @type {Map<string, (value: unknown) => boolean>} */
const outputValidators = new Map(TEAM_TOOLS.map((tool) => [tool.name, compileSchema(tool.outputSchema)]));

/** @param {string} name @param {unknown} value @returns {unknown} */
function validateTeamToolOutput(name, value) {
  const validator = outputValidators.get(name);
  if (!validator) throw new Error("team tool not found");
  if (!validator(value)) throw new Error(`team tool output does not match the declared output schema: ${name}`);
  return value;
}

module.exports = { JOB_SCHEMA, TEAM_TOOLS, annotations, validateTeamToolOutput };
