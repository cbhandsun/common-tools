// @ts-check
"use strict";

const { compileSchema } = require("./schema-validator");
const { REGISTRATION } = require("../slideclone-core");
const { CAPABILITY: PROJECT_AUDIT_CAPABILITY } = require("../project-audit-core");
const { CAPABILITY: PPT_QUALITY_CAPABILITY } = require("../ppt-quality-core");
const { CAPABILITY: PPT_IMPROVE_CAPABILITY } = require("../ppt-improve-core");
const { CAPABILITY: PPT_CREATE_CAPABILITY } = require("../ppt-create-core");

/** @typedef {Record<string, unknown>} JsonObject */
/**
 * @typedef {object} ToolDefinition
 * @property {string | null} capability
 * @property {string} name
 * @property {string} description
 * @property {JsonObject} inputSchema
 * @property {JsonObject} outputSchema
 * @property {{readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean, openWorldHint: boolean}} annotations
 */

const STRING = Object.freeze({ type: "string", minLength: 1, maxLength: 4096 });
const EDITABLE_INPUTS = Object.freeze({ type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: STRING });
const JOB_ID = Object.freeze({ type: "string", minLength: 1, maxLength: 256 });
const JOB_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "capability", "status"],
  properties: {
    id: JOB_ID,
    capability: Object.freeze({ type: "string", minLength: 1, maxLength: 64 }),
    status: Object.freeze({ type: "string", enum: ["queued", "running", "input_required", "cancel_requested", "succeeded", "failed", "cancelled", "expired"] })
  },
  additionalProperties: true
});

/** @param {boolean} readOnly @param {boolean} destructive @param {boolean} idempotent */
function annotations(readOnly, destructive, idempotent) {
  return Object.freeze({ readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false });
}

/**
 * @param {string | null} capability
 * @param {string} name
 * @param {string} description
 * @param {JsonObject} inputSchema
 * @param {JsonObject} outputSchema
 * @param {ReturnType<typeof annotations>} toolAnnotations
 * @returns {Readonly<ToolDefinition>}
 */
function tool(capability, name, description, inputSchema, outputSchema, toolAnnotations) {
  return Object.freeze({ capability, name, description, inputSchema, outputSchema, annotations: toolAnnotations });
}

/** @param {Record<string, JsonObject>} properties @param {string[]} required @returns {JsonObject} */
function objectInput(properties, required = []) {
  return Object.freeze({ type: "object", properties: Object.freeze(properties), required: Object.freeze(required), additionalProperties: false });
}

const REPORT_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "capability", "status", "artifacts"],
  properties: {
    id: JOB_ID,
    capability: Object.freeze({ type: "string", minLength: 1, maxLength: 64 }),
    status: JOB_SCHEMA.properties.status,
    artifacts: Object.freeze({ type: "array", maxItems: 64, items: Object.freeze({ type: "object", additionalProperties: true }) })
  },
  additionalProperties: true
});

/** @type {ReadonlyArray<Readonly<ToolDefinition>>} */
const TOOLS = Object.freeze([
  tool(null, "health_check", "Inspect locally available common-tools capability metadata.", objectInput({}, []), Object.freeze({ type: "object", required: ["runtime", "enabledCapabilities", "registrations"], properties: { runtime: STRING, enabledCapabilities: { type: "array", items: STRING }, registrations: { type: "array", items: { type: "object", additionalProperties: true } } }, additionalProperties: false }), annotations(true, false, true)),
  tool(REGISTRATION.capability, "create_editable_job", "Create a controlled local image-to-editable job from one PNG/JPEG/PDF/PPTX source or an ordered image batch, with an explicit workspace-contained slideclone config.", Object.freeze({
    ...objectInput({ input: STRING, inputs: EDITABLE_INPUTS, output: STRING, config: STRING, idempotencyKey: STRING }, ["output", "config"]),
    oneOf: Object.freeze([
      Object.freeze({ type: "object", required: Object.freeze(["input"]), properties: Object.freeze({ input: STRING }), additionalProperties: true }),
      Object.freeze({ type: "object", required: Object.freeze(["inputs"]), properties: Object.freeze({ inputs: EDITABLE_INPUTS }), additionalProperties: true })
    ])
  }), JOB_SCHEMA, annotations(false, false, false)),
  tool(REGISTRATION.capability, "get_job", "Read a previously created job.", objectInput({ id: JOB_ID }, ["id"]), JOB_SCHEMA, annotations(true, false, true)),
  tool(REGISTRATION.capability, "cancel_job", "Request cooperative cancellation of a local job.", objectInput({ id: JOB_ID }, ["id"]), JOB_SCHEMA, annotations(false, false, true)),
  tool(REGISTRATION.capability, "list_job_artifacts", "List verified artifacts for a local job.", objectInput({ id: JOB_ID }, ["id"]), Object.freeze({ type: "object", required: ["id", "artifacts"], properties: { id: JOB_ID, artifacts: { type: "array", maxItems: 64, items: { type: "object", additionalProperties: true } } }, additionalProperties: false }), annotations(true, false, true)),
  tool(PROJECT_AUDIT_CAPABILITY, "create_project_audit_job", "Create a read-only, evidence-based local project audit job for an explicit audit level and scope.", objectInput({ projectRoot: STRING, output: STRING, level: Object.freeze({ type: "string", enum: ["1", "2", "3", "quick", "standard", "deep"], description: "Audit depth; defaults to standard." }), scope: Object.freeze({ ...STRING, description: "1 for all domains, or comma-separated choices 2 to 5 / scope IDs." }), idempotencyKey: STRING }, ["output"]), JOB_SCHEMA, annotations(false, false, false)),
  tool(PROJECT_AUDIT_CAPABILITY, "get_project_audit_report", "Read verified artifacts for a completed project audit.", objectInput({ id: JOB_ID }, ["id"]), REPORT_SCHEMA, annotations(true, false, true)),
  tool(PPT_QUALITY_CAPABILITY, "create_ppt_quality_job", "Create a read-only local PPTX quality audit job.", objectInput({ input: STRING, output: STRING, idempotencyKey: STRING }, ["input", "output"]), JOB_SCHEMA, annotations(false, false, false)),
  tool(PPT_QUALITY_CAPABILITY, "get_ppt_quality_report", "Read a verified quality report for a completed PPTX audit.", objectInput({ id: JOB_ID }, ["id"]), REPORT_SCHEMA, annotations(true, false, true)),
  tool(PPT_IMPROVE_CAPABILITY, "create_ppt_improve_job", "Create a report-bound, copy-on-write PPTX improvement job.", objectInput({ input: STRING, report: STRING, output: STRING, profile: Object.freeze({ type: "string", enum: ["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"] }), idempotencyKey: STRING }, ["input", "report", "output"]), JOB_SCHEMA, annotations(false, false, false)),
  tool(PPT_IMPROVE_CAPABILITY, "get_ppt_improve_report", "Read a verified report for a completed PPTX improvement job.", objectInput({ id: JOB_ID }, ["id"]), REPORT_SCHEMA, annotations(true, false, true)),
  tool(PPT_CREATE_CAPABILITY, "create_ppt_create_job", "Create an editable PPTX from a validated PresentationSpec JSON file.", objectInput({ input: STRING, output: STRING, idempotencyKey: STRING }, ["input", "output"]), JOB_SCHEMA, annotations(false, false, false)),
  tool(PPT_CREATE_CAPABILITY, "get_ppt_create_report", "Read the verified report for a completed PPT creation job.", objectInput({ id: JOB_ID }, ["id"]), REPORT_SCHEMA, annotations(true, false, true))
]);

const inputValidators = new Map(TOOLS.map((definition) => [definition.name, compileSchema(definition.inputSchema)]));
const outputValidators = new Map(TOOLS.map((definition) => [definition.name, compileSchema(definition.outputSchema)]));

/** @param {string} name @param {unknown} rawArgs @returns {Record<string, unknown>} */
function validateToolArguments(name, rawArgs) {
  const definition = TOOLS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error("tool not found");
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) throw new TypeError("tool arguments must be an object");
  const args = /** @type {Record<string, unknown>} */ (rawArgs);
  const properties = /** @type {Record<string, unknown>} */ (definition.inputSchema.properties || {});
  for (const key of Object.keys(args)) if (!Object.prototype.hasOwnProperty.call(properties, key)) throw new TypeError(`unexpected tool argument: ${key}`);
  for (const required of /** @type {string[]} */ (definition.inputSchema.required || [])) if (typeof args[required] !== "string" || !args[required].trim()) throw new TypeError(`tool argument ${required} must be a non-empty string`);
  const validator = inputValidators.get(name);
  if (!validator || !validator(args)) throw new TypeError("tool arguments do not match the declared input schema");
  return args;
}

/** @param {string} name @param {unknown} value @returns {unknown} */
function validateToolOutput(name, value) {
  const validator = outputValidators.get(name);
  if (!validator) throw new Error("tool not found");
  if (!validator(value)) throw new Error(`tool output does not match the declared output schema: ${name}`);
  return value;
}

module.exports = { JOB_SCHEMA, REPORT_SCHEMA, TOOLS, annotations, objectInput, validateToolArguments, validateToolOutput };
