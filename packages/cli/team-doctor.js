"use strict";

const { TEAM_DEFAULT_CAPABILITIES, loadTeamConfig } = require("../team-runtime");
const { composeProjectName, dockerComposeRuntime, dockerVersion } = require("./team-runtime-local");

function metricsState(environment) {
  const token = typeof environment.COMMON_TOOLS_METRICS_TOKEN === "string" ? environment.COMMON_TOOLS_METRICS_TOKEN.trim() : "";
  const file = environment.COMMON_TOOLS_METRICS_TOKEN_FILE;
  if (file !== undefined && token) throw new Error("COMMON_TOOLS_METRICS_TOKEN and COMMON_TOOLS_METRICS_TOKEN_FILE are mutually exclusive");
  if (file !== undefined) {
    if (typeof file !== "string" || !file.trim()) throw new Error("COMMON_TOOLS_METRICS_TOKEN_FILE is invalid");
    return Object.freeze({ enabled: true });
  }
  if (!token) return Object.freeze({ enabled: false });
  if (!/^[A-Za-z0-9._~-]{16,512}$/.test(token)) throw new Error("COMMON_TOOLS_METRICS_TOKEN must be a 16-512 character URL-safe secret");
  return Object.freeze({ enabled: true });
}

function teamDoctorReport(args = {}, environment = process.env, diagnostics = {}) {
  const docker = diagnostics.docker || dockerVersion();
  let config;
  let configurationError;
  try {
    config = loadTeamConfig(environment);
  } catch (error) {
    configurationError = error instanceof Error ? error.message : "team configuration is invalid";
  }
  let metrics;
  if (config) {
    try {
      metrics = metricsState(environment);
    } catch (error) {
      configurationError = error instanceof Error ? error.message : "team configuration is invalid";
    }
  }
  const runtimeRequested = args.runtime === true || args.runtime === "true";
  const runtime = runtimeRequested ? (diagnostics.runtime || dockerComposeRuntime)(composeProjectName(args.project), config?.enabledCapabilities || TEAM_DEFAULT_CAPABILITIES) : undefined;
  if (!config || configurationError) {
    const info = Object.freeze({ valid: false, error: configurationError || "team configuration is invalid", docker: { available: docker.available, version: docker.version }, ...(runtime ? { runtime } : {}) });
    return Object.freeze({ exitCode: 2, info });
  }
  const info = Object.freeze({ valid: true, docker: { available: docker.available, version: docker.version }, databaseHost: new URL(config.databaseUrl).host, redisHost: new URL(config.redisUrl).host, objectStoreHost: new URL(config.objectStoreEndpoint).host, objectStoreBucket: config.objectStoreBucket, enabledCapabilities: config.enabledCapabilities, workerLeaseSeconds: config.workerLeaseSeconds, artifactRetentionDays: config.artifactRetentionDays, projectActiveJobLimit: config.projectActiveJobLimit, metrics, ...(runtime ? { runtime } : {}) });
  return Object.freeze({ exitCode: docker.available && (!runtime || runtime.ok) ? 0 : 2, info });
}

module.exports = {
  metricsState,
  teamDoctorReport
};
