"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { CAPABILITY_MANIFESTS, TEAM_CAPABILITY_DEFINITIONS } = require("../packages/capability-runtime");
const { MCP_JOB_SCHEMA, defineMcpObjectSchema, defineMcpToolContract, mcpToolAnnotations } = require("../packages/capability-contracts");
const { CAPABILITIES, TEAM_DEPLOYABLE_CAPABILITIES, TEAM_DEPLOYMENT_CAPABILITIES, teamDeploymentPlan, validUploadRequest } = require("../packages/team-runtime");
const { TOOLS } = require("../packages/mcp-server/core");
const { JOB_SCHEMA: LOCAL_JOB_SCHEMA, annotations: localAnnotations, validateToolOutput } = require("../packages/mcp-server/tool-contracts");
const { compileSchema } = require("../packages/mcp-server/schema-validator");
const { CAPABILITY_SCOPES } = require("../packages/remote-mcp-server/team-mcp");
const { DIRECT_CAPABILITY_CATALOG } = require("../packages/remote-mcp-server/direct-capability-catalog");
const { JOB_SCHEMA: TEAM_JOB_SCHEMA, annotations: teamAnnotations } = require("../packages/remote-mcp-server/team-tool-contracts");
const { assertDirectCapabilityCatalog } = require("../packages/cli/verification/verify-capability-catalogs");
const { assertCapabilityToolContracts, assertTeamDeploymentComposeContracts, assertTeamDeploymentManifestContracts, verifyCapabilityToolContracts } = require("../scripts/verify-capability-contracts");

function contractTool(name, capability) {
  return { name, capability, inputSchema: { type: "object" }, outputSchema: { type: "object" }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } };
}

test("capability manifests exactly match local MCP registrations", () => {
  const expected = { capabilities: ["image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit", "siyuan-note"], toolCount: 18 };
  assert.deepEqual(verifyCapabilityToolContracts(), expected);
  const localManifests = new Map([...CAPABILITY_MANIFESTS].filter(([, manifest]) => manifest.team.mode !== "direct"));
  assert.deepEqual(assertCapabilityToolContracts({ manifests: localManifests, tools: TOOLS }), { capabilities: ["image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit"], toolCount: 13 });
});

test("image-to-editable MCP admission requires one input mode and an explicit provider config", () => {
  const tool = TOOLS.find((candidate) => candidate.name === "create_editable_job");
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ["output", "config"]);
  assert.equal(tool.inputSchema.properties.inputs.minItems, 1);
  assert.equal(tool.inputSchema.properties.inputs.maxItems, 20);
  assert.equal(tool.inputSchema.properties.inputs.uniqueItems, true);
  const validate = compileSchema(tool.inputSchema);
  const common = { output: "output", config: "slideclone.config.json" };
  assert.equal(validate({ ...common, input: "page.png" }), true);
  assert.equal(validate({ ...common, inputs: ["page-02.png", "page-01.png"] }), true);
  assert.equal(validate(common), false);
  assert.equal(validate({ ...common, input: "page.png", inputs: ["page.png"] }), false);
  assert.equal(validate({ ...common, inputs: [] }), false);
  assert.equal(validate({ ...common, inputs: ["page.png", "page.png"] }), false);
  assert.equal(validate({ ...common, inputs: Array.from({ length: 21 }, (_, index) => `page-${index}.png`) }), false);
});

test("every local MCP tool publishes a closed input contract, output contract, and complete safety annotations", () => {
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.type, "object");
    assert.deepEqual(Object.keys(tool.annotations).sort(), ["destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint"]);
  }
  assert.throws(() => validateToolOutput("get_job", { id: "job-1" }), /output does not match/);
});

test("local and team MCP contracts share the common job and annotation primitives", () => {
  assert.equal(LOCAL_JOB_SCHEMA, MCP_JOB_SCHEMA);
  assert.equal(TEAM_JOB_SCHEMA, MCP_JOB_SCHEMA);
  assert.deepEqual(localAnnotations(true, false, true), mcpToolAnnotations(true, false, true));
  assert.deepEqual(teamAnnotations(false, true, true), mcpToolAnnotations(false, true, true));
});

test("MCP tool contracts use one validated shared shape", () => {
  const contract = defineMcpToolContract({
    capability: "example-capability",
    name: "example_tool",
    description: "Example tool.",
    inputSchema: defineMcpObjectSchema({ id: { type: "string", minLength: 1 } }, ["id"]),
    outputSchema: defineMcpObjectSchema({ ok: { type: "boolean" } }, ["ok"]),
    annotations: mcpToolAnnotations(true, false, true)
  });
  assert.deepEqual(Object.keys(contract).sort(), ["annotations", "capability", "description", "inputSchema", "name", "outputSchema"]);
  assert.equal(contract.inputSchema.additionalProperties, false);
  assert.throws(() => defineMcpToolContract({ ...contract, name: "Invalid-Name" }), /name is invalid/);
  assert.throws(() => defineMcpToolContract({ ...contract, inputSchema: { type: "string" } }), /object schema/);
  assert.throws(() => defineMcpToolContract({ ...contract, annotations: { readOnlyHint: true } }), /annotations/);
});

test("portable schema validation covers empty, invalid, extreme, and undeclared values", () => {
  const validate = compileSchema({ type: "object", required: ["name", "count", "items"], properties: { name: { type: "string", minLength: 1, maxLength: 4, pattern: "^[a-z]+$" }, count: { type: "integer", minimum: 1, maximum: 2 }, items: { type: "array", minItems: 1, maxItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } } }, additionalProperties: false });
  assert.equal(validate({ name: "safe", count: 2, items: ["x"] }), true);
  assert.equal(validate({ name: "", count: 1, items: ["x"] }), false);
  assert.equal(validate({ name: "SAFE", count: 1, items: ["x"] }), false);
  assert.equal(validate({ name: "toolong", count: 1, items: ["x"] }), false);
  assert.equal(validate({ name: "safe", count: Number.MAX_SAFE_INTEGER, items: ["x"] }), false);
  assert.equal(validate({ name: "safe", count: 1, items: [] }), false);
  assert.equal(validate({ name: "safe", count: 1, items: ["x", "y"] }), false);
  assert.equal(validate({ name: "safe", count: 1, items: [], secret: "unexpected" }), false);
  assert.equal(validate(null), false);
  assert.throws(() => compileSchema({ type: "number" }), /schema is invalid/);
});

test("team authorization and upload policy derive from the capability manifest", () => {
  const expectedCapabilities = [...CAPABILITY_MANIFESTS.keys()].sort();
  assert.deepEqual([...CAPABILITIES].sort(), expectedCapabilities);
  assert.deepEqual(CAPABILITY_SCOPES, Object.fromEntries(expectedCapabilities.map((capability) => [capability, CAPABILITY_MANIFESTS.get(capability).team.oauthScope])));
  for (const capability of expectedCapabilities) {
    assert.equal(validUploadRequest(capability, CAPABILITY_MANIFESTS.get(capability).team.acceptedUploadMediaTypes[0], 1), TEAM_DEPLOYABLE_CAPABILITIES.includes(capability));
    assert.equal(validUploadRequest(capability, "application/json", 1), capability === "ppt-create");
  }
});

test("team deployment plan is derived from one bounded capability-to-worker mapping", () => {
  assert.deepEqual(Object.keys(TEAM_DEPLOYMENT_CAPABILITIES).sort(), TEAM_DEPLOYABLE_CAPABILITIES);
  assert.deepEqual(teamDeploymentPlan("ppt-improve,ppt-quality,project-audit"), {
    capabilities: ["ppt-improve", "ppt-quality", "project-audit"],
    workerProfiles: ["team-worker-ppt-improve", "team-worker-ppt-quality", "team-worker-audit"],
    workerServices: ["ppt-improve-worker", "ppt-quality-worker", "project-audit-worker"]
  });
  assert.throws(() => teamDeploymentPlan("ppt-improve,ppt-improve"), /invalid/);
});

test("team deployment mapping is derived exactly from capability manifests", () => {
  assert.equal(assertTeamDeploymentManifestContracts({ manifests: CAPABILITY_MANIFESTS, deploymentCapabilities: TEAM_DEPLOYMENT_CAPABILITIES }), true);
  assert.throws(() => assertTeamDeploymentManifestContracts({ manifests: CAPABILITY_MANIFESTS, deploymentCapabilities: { ...TEAM_DEPLOYMENT_CAPABILITIES, "unexpected-worker": TEAM_DEPLOYMENT_CAPABILITIES["project-audit"] } }), /do not match/);
});

test("direct capability catalog is fail-closed against manifests and team definitions", () => {
  assert.equal(assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: DIRECT_CAPABILITY_CATALOG, teamDefinitions: TEAM_CAPABILITY_DEFINITIONS }), true);
  assert.throws(() => assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: [...DIRECT_CAPABILITY_CATALOG, DIRECT_CAPABILITY_CATALOG[0]], teamDefinitions: TEAM_CAPABILITY_DEFINITIONS }), /duplicate direct capability/);
  assert.throws(() => assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: DIRECT_CAPABILITY_CATALOG, teamDefinitions: { ...TEAM_CAPABILITY_DEFINITIONS, "siyuan-note": { ...TEAM_CAPABILITY_DEFINITIONS["siyuan-note"], mode: "worker" } } }), /team definition is not direct/);
  assert.throws(() => assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: [{ ...DIRECT_CAPABILITY_CATALOG[0], registration: { ...DIRECT_CAPABILITY_CATALOG[0].registration, toolNames: ["siyuan_save_note", "siyuan_save_note"] } }], teamDefinitions: TEAM_CAPABILITY_DEFINITIONS }), /duplicate tools/);
});

test("team deployment plan is verified against the actual Compose Worker services", () => {
  const root = path.resolve(__dirname, "..");
  const composeSource = fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8");
  assert.equal(assertTeamDeploymentComposeContracts({ deploymentCapabilities: TEAM_DEPLOYMENT_CAPABILITIES, composeSource }), true);
  assert.throws(() => assertTeamDeploymentComposeContracts({ deploymentCapabilities: { "ppt-quality": { ...TEAM_DEPLOYMENT_CAPABILITIES["ppt-quality"], workerProfile: "missing-profile" } }, composeSource }), /profile does not match/);
  assert.throws(() => assertTeamDeploymentComposeContracts({ deploymentCapabilities: { "ppt-quality": { ...TEAM_DEPLOYMENT_CAPABILITIES["ppt-quality"], workerCommand: "packages/remote-mcp-server/bin/common-tools-team-missing-worker.js" } }, composeSource }), /command does not match/);
});

test("local Keycloak realm exposes every remote capability as an optional scope", () => {
  const root = path.resolve(__dirname, "..");
  const realm = JSON.parse(fs.readFileSync(path.join(root, "deploy", "keycloak", "realm-common-tools.json"), "utf8"));
  const expectedScopes = [...CAPABILITY_MANIFESTS.values()].map((manifest) => manifest.team.oauthScope).sort();
  // offline_access is required by the desktop OAuth client to retain the
  // capability-scoped session across a client restart. It is not a capability
  // declaration and must remain distinct from the manifest-derived scopes.
  assert.deepEqual(realm.clients[0].optionalClientScopes.slice().sort(), ["offline_access", ...expectedScopes].sort());
  assert.deepEqual(realm.clientScopes.map((scope) => scope.name).sort(), expectedScopes);
});

test("capability contract validation rejects orphan, duplicate, and stale tool declarations", () => {
  assert.throws(() => assertCapabilityToolContracts({ manifests: new Map([["project-audit", { toolNames: ["create_project_audit_job"] }]]), tools: [contractTool("orphan", "missing")] }), /not declared/);
  assert.throws(() => assertCapabilityToolContracts({ manifests: new Map([["project-audit", { toolNames: ["create_project_audit_job"] }]]), tools: [contractTool("create_project_audit_job", "project-audit"), contractTool("create_project_audit_job", "project-audit")] }), /duplicate MCP tool/);
  assert.throws(() => assertCapabilityToolContracts({ manifests: new Map([["project-audit", { toolNames: ["get_project_audit_report"] }]]), tools: [contractTool("create_project_audit_job", "project-audit")] }), /does not match/);
  assert.throws(() => assertCapabilityToolContracts({ manifests: new Map([["project-audit", { toolNames: ["create_project_audit_job", "create_project_audit_job"] }]]), tools: [contractTool("create_project_audit_job", "project-audit")] }), /duplicate tools/);
  assert.throws(() => assertCapabilityToolContracts({ manifests: new Map(), tools: [{ ...contractTool("invalid", null), outputSchema: undefined }] }), /outputSchema is invalid/);
});
