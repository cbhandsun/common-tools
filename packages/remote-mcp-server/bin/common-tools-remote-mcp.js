#!/usr/bin/env node
"use strict";

const { createOidcVerifier, createRemoteMcpServer, loadRemoteConfig } = require("..");
const { loadTeamConfig } = require("../../team-runtime");
const { createTeamProviderBundle, loadTeamSecrets, optionalSecretFromEnvironment } = require("../team-providers");
const { createOtlpTraceExporter, loadOtlpTraceConfig } = require("../telemetry");

function startupFailureCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("COMMON_TOOLS_") || message.includes("remote configuration") || message.includes("team enabled capabilities")) return "invalid-configuration";
  if (message.includes("OIDC") || message.includes("issuer") || message.includes("JWKS")) return "invalid-identity-configuration";
  return "provider-initialization";
}

async function main() {
  const config = loadRemoteConfig();
  let bundle;
  if (config.backend === "postgres-redis-s3") {
    const teamConfig = loadTeamConfig();
    if (JSON.stringify(teamConfig.enabledCapabilities) !== JSON.stringify(config.enabledCapabilities)) throw new Error("remote and team enabled capabilities do not match");
    bundle = await createTeamProviderBundle({ config: teamConfig, secrets: loadTeamSecrets(), allowCreateBucket: process.env.COMMON_TOOLS_TEAM_MODE === "development", rateLimit: config.rateLimit });
  }
  const metricsToken = optionalSecretFromEnvironment(process.env, "COMMON_TOOLS_METRICS_TOKEN");
  const serverOptions = bundle ? { teamServices: bundle.services, readinessCheck: bundle.readinessCheck, rateLimiter: bundle.rateLimiter } : {};
  const telemetryConfig = loadOtlpTraceConfig();
  if (telemetryConfig) serverOptions.traceExporter = createOtlpTraceExporter(telemetryConfig);
  if (metricsToken !== undefined) {
    serverOptions.metricsProvider = bundle?.metricsProvider;
    serverOptions.metricsToken = metricsToken;
  }
  const server = createRemoteMcpServer(config, createOidcVerifier(config), process.env, serverOptions);
  server.once("error", async () => { process.stderr.write("remote MCP server failed\n"); await bundle?.close(); process.exitCode = 1; });
  server.listen(config.port, config.host);
  const close = async () => { server.close(); await bundle?.close(); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`remote MCP could not start (${startupFailureCode(error)})\n`); process.exitCode = 1; });

module.exports = { main, startupFailureCode };
