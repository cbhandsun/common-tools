// @ts-check
"use strict";

const {
  MCP_JOB_SCHEMA,
  MCP_NON_EMPTY_STRING,
  defineMcpObjectSchema,
  defineMcpToolContract,
  mcpToolAnnotations
} = require("../capability-contracts");
const { compileSchema } = require("../mcp-server/schema-validator");
const { directToolContracts } = require("./direct-capability-catalog");

const NON_EMPTY_STRING = MCP_NON_EMPTY_STRING;
const JOB_SCHEMA = MCP_JOB_SCHEMA;

/** @param {boolean} readOnlyHint @param {boolean} destructiveHint @param {boolean} idempotentHint */
function annotations(readOnlyHint, destructiveHint, idempotentHint) {
  return mcpToolAnnotations(readOnlyHint, destructiveHint, idempotentHint);
}

/**
 * @param {string | null} capability
 * @param {string} name
 * @param {string} description
 * @param {readonly string[]} required
 * @param {Record<string, unknown>} outputSchema
 * @param {ReturnType<typeof annotations>} toolAnnotations
 */
function teamTool(capability, name, description, required, outputSchema, toolAnnotations) {
  const contract = defineMcpToolContract({
    capability,
    name,
    description,
    inputSchema: defineMcpObjectSchema({}, required),
    outputSchema,
    annotations: toolAnnotations
  });
  return Object.freeze({ ...contract, required: Object.freeze([...required]) });
}

const TEAM_TOOLS = Object.freeze([
  teamTool(null, "create_team_upload_target", "Create a short-lived upload target for a team capability input.", ["capability", "contentType", "contentLength"], Object.freeze({ type: "object", required: ["objectKey", "uploadUrl"], properties: { objectKey: NON_EMPTY_STRING, uploadUrl: NON_EMPTY_STRING, expiresAt: NON_EMPTY_STRING }, additionalProperties: false }), annotations(false, false, false)),
  teamTool(null, "create_team_job", "Create a team job from an owner-scoped uploaded object.", ["capability", "inputObjectKey", "idempotencyKey"], JOB_SCHEMA, annotations(false, false, true)),
  teamTool(null, "get_team_job", "Read a team job owned by the current principal.", ["id"], JOB_SCHEMA, annotations(true, false, true)),
  teamTool(null, "cancel_team_job", "Request cancellation of a team job owned by the current principal.", ["id"], JOB_SCHEMA, annotations(false, true, true)),
  teamTool(null, "get_team_artifact_target", "Create a short-lived download target for a completed team artifact.", ["id", "name"], Object.freeze({ type: "object", required: ["downloadUrl"], properties: { objectKey: NON_EMPTY_STRING, downloadUrl: NON_EMPTY_STRING, expiresAt: NON_EMPTY_STRING }, additionalProperties: false }), annotations(false, false, false)),
  ...directToolContracts()
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

module.exports = { JOB_SCHEMA, TEAM_TOOLS, annotations, teamTool, validateTeamToolOutput };
