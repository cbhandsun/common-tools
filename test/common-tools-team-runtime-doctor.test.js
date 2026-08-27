"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CODEX_NATIVE_LOOPBACK_REDIRECT_URI, metadataAuthorizationServer, metadataCapabilities, parseArguments, parseComposeServices, parseExpectedCapabilities, parseGatewayUrl, runTeamRuntimeDoctor } = require("../scripts/team-runtime-doctor");

function record(service, state = "running", health = "") { return JSON.stringify({ Service: service, State: state, Health: health, Status: state === "running" ? "Up" : "Exited" }); }
function runner(command, args) {
  assert.equal(command, "docker");
  assert.deepEqual(args, ["compose", "-p", "deploy", "ps", "--format", "json"]);
  return { status: 0, stdout: [record("postgres", "running", "healthy"), record("redis", "running", "healthy"), record("minio", "running", "healthy"), record("keycloak", "running", "healthy"), record("remote-mcp", "running", "healthy"), record("remote-mcp-gateway")].join("\n") };
}
test("team runtime doctor parses bounded state and permits a loopback gateway", () => {
  assert.equal(CODEX_NATIVE_LOOPBACK_REDIRECT_URI, "http://127.0.0.1:43123/callback/common-tools-mcp");
  assert.equal(parseArguments([]).scope, "all");
  assert.equal(parseGatewayUrl("http://127.0.0.1:54000", false).hostname, "127.0.0.1");
  assert.throws(() => parseGatewayUrl("https://mcp.example.test", false), /allow-remote/);
  assert.throws(() => parseGatewayUrl("http://mcp.example.test", true), /HTTPS/);
  assert.throws(() => parseComposeServices('{"Service":"../../bad","State":"running"}'), /invalid/);
  assert.deepEqual(parseExpectedCapabilities("project-audit,image-to-editable"), ["image-to-editable", "project-audit"]);
  assert.throws(() => parseExpectedCapabilities("project-audit,project-audit"), /expected capabilities/);
  assert.deepEqual(metadataCapabilities({ scopes_supported: ["common-tools:capability:project-audit", "unrelated:scope"] }), ["project-audit"]);
  assert.equal(metadataCapabilities({ scopes_supported: ["common-tools:capability:project-audit", "common-tools:capability:project-audit"] }), null);
  assert.equal(metadataAuthorizationServer({ authorization_servers: ["https://mcp.example.test/id/realms/common-tools"] }, "https://mcp.example.test"), "https://mcp.example.test/id/realms/common-tools");
  assert.equal(metadataAuthorizationServer({ authorization_servers: ["https://169.254.169.254/id/realms/common-tools"] }, "https://mcp.example.test"), null);
});
test("team runtime doctor reports core success and detects omitted optional or required services", async () => {
  const result = await runTeamRuntimeDoctor(parseArguments(["--scope", "core"]), { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }) });
  assert.equal(result.healthy, true);
  assert.equal(result.gateway.ready, true);
  assert.equal(result.services.observed.some((service) => Object.hasOwn(service, "Status")), false);
  const allResult = await runTeamRuntimeDoctor(parseArguments([]), { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }) });
  assert.equal(allResult.healthy, false);
  const unavailableGateway = await runTeamRuntimeDoctor(parseArguments(["--scope", "core"]), { commandRunner: runner, gatewayProbe: async () => ({ status: 503 }) });
  assert.equal(unavailableGateway.healthy, false);

  const partialReplicaRunner = (command, args) => {
    assert.equal(command, "docker");
    assert.deepEqual(args, ["compose", "-p", "deploy", "ps", "--format", "json"]);
    return { status: 0, stdout: [record("postgres", "running", "healthy"), record("redis", "running", "healthy"), record("minio", "running", "healthy"), record("keycloak", "running", "healthy"), record("remote-mcp", "running", "healthy"), record("remote-mcp", "running", "unhealthy"), record("remote-mcp-gateway")].join("\n") };
  };
  const partialReplica = await runTeamRuntimeDoctor(parseArguments(["--scope", "core"]), { commandRunner: partialReplicaRunner, gatewayProbe: async () => ({ status: 200 }) });
  assert.equal(partialReplica.healthy, false);
  assert.equal(partialReplica.services.expected.find((service) => service.service === "remote-mcp").healthOk, false);
});

test("team runtime doctor verifies requested public capability declarations", async () => {
  const matching = await runTeamRuntimeDoctor(
    parseArguments(["--scope", "core", "--expected-capabilities", "project-audit,image-to-editable"]),
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: ["image-to-editable", "project-audit"] }) }
  );
  assert.equal(matching.healthy, true);
  assert.equal(matching.gateway.expectedCapabilitiesAvailable, true);
  assert.deepEqual(matching.gateway.advertisedCapabilities, ["image-to-editable", "project-audit"]);

  const missing = await runTeamRuntimeDoctor(
    parseArguments(["--scope", "core", "--expected-capabilities", "ppt-quality"]),
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: ["project-audit"] }) }
  );
  assert.equal(missing.healthy, false);
  assert.equal(missing.gateway.expectedCapabilitiesAvailable, false);

  const malformed = await runTeamRuntimeDoctor(
    parseArguments(["--scope", "core", "--expected-capabilities", "project-audit"]),
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: null }) }
  );
  assert.equal(malformed.healthy, false);
  assert.equal(malformed.gateway.advertisedCapabilities, null);
});

test("team runtime doctor requires a valid OAuth challenge for a remote gateway", async () => {
  const remoteOptions = parseArguments(["--scope", "core", "--gateway-url", "https://mcp.example.test", "--allow-remote"]);
  const verified = await runTeamRuntimeDoctor(
    remoteOptions,
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: [], authorizationServer: "https://mcp.example.test/id/realms/common-tools" }), mcpAuthorizationProbe: async () => ({ status: 401, resourceMetadata: "https://mcp.example.test/.well-known/oauth-protected-resource/mcp", verified: true }), nativeLoopbackProbe: async () => ({ verified: true }) }
  );
  assert.equal(verified.healthy, true);
  assert.equal(verified.gateway.oauthChallenge.verified, true);

  const missingChallenge = await runTeamRuntimeDoctor(
    remoteOptions,
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: [], authorizationServer: "https://mcp.example.test/id/realms/common-tools" }), mcpAuthorizationProbe: async () => ({ status: 401, resourceMetadata: null, verified: false }), nativeLoopbackProbe: async () => ({ verified: true }) }
  );
  assert.equal(missingChallenge.healthy, false);
  assert.equal(missingChallenge.gateway.oauthChallenge.verified, false);
  assert.equal(missingChallenge.gateway.oauthChallenge.resourceMetadata, null);
});

test("team runtime doctor rejects an OAuth server that will not accept a native loopback callback", async () => {
  const result = await runTeamRuntimeDoctor(
    parseArguments(["--scope", "core", "--gateway-url", "https://mcp.example.test", "--allow-remote"]),
    { commandRunner: runner, gatewayProbe: async () => ({ status: 200 }), gatewayMetadataProbe: async () => ({ status: 200, capabilities: [], authorizationServer: "https://mcp.example.test/id/realms/common-tools" }), mcpAuthorizationProbe: async () => ({ verified: true }), nativeLoopbackProbe: async () => ({ verified: false }) }
  );
  assert.equal(result.healthy, false);
  assert.equal(result.gateway.nativeLoopbackRedirect.verified, false);
});
