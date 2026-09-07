"use strict";

/** @param {string | undefined} value @param {string} label */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

const ENVIRONMENT_FIELDS = Object.freeze(["COMMON_TOOLS_TEAM_MODE","COMMON_TOOLS_DATABASE_URL","COMMON_TOOLS_REDIS_URL","COMMON_TOOLS_OBJECT_STORE_ENDPOINT","COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT","COMMON_TOOLS_OBJECT_STORE_BUCKET","COMMON_TOOLS_WORKER_LEASE_SECONDS","COMMON_TOOLS_ARTIFACT_RETENTION_DAYS","COMMON_TOOLS_RETENTION_INTERVAL_SECONDS","COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT","COMMON_TOOLS_TEAM_CAPABILITIES"]);

/** @param {unknown} input @returns {Record<string, string | undefined>} */
function readEnvironment(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("team environment is invalid");
  const record = /** @type {Record<string, unknown>} */ (input);
  /** @type {Record<string, string | undefined>} */
  const environment = {};
  for (const name of ENVIRONMENT_FIELDS) {
    let value;
    try { value = record[name]; } catch { throw new Error("team environment is invalid"); }
    if (value !== undefined && typeof value !== "string") throw new Error(`${name} must be a string`);
    environment[name] = value;
  }
  return environment;
}

/**
 * @param {{capabilities: ReadonlySet<string>, defaultCapabilities: readonly string[],
 * deployments: Readonly<Record<string, {workerProfile: string, workerService: string}>>,
 * retentionScheduleSettings: (environment: Record<string, string | undefined>) => {intervalSeconds: number}}} dependencies
 */
function createTeamConfiguration(dependencies) {
  const { capabilities: CAPABILITIES, defaultCapabilities: TEAM_DEFAULT_CAPABILITIES,
    deployments: TEAM_DEPLOYMENT_CAPABILITIES, retentionScheduleSettings } = dependencies;
  /** @param {string | undefined} value @param {string} label @param {readonly string[]} protocols */
  function parseServiceUrl(value, label, protocols) {
    let url;
    try { url = new URL(assertNonEmptyString(value, label)); } catch { throw new Error(`${label} must be an absolute URL`); }
    if (!protocols.includes(url.protocol)) throw new Error(`${label} must use ${protocols.join(" or ")}`);
    if (url.username || url.password) throw new Error(`${label} must not embed credentials`);
    return url;
  }
  /** @param {unknown} value @param {string} [name] */
  function parseEnabledCapabilities(value, name = "COMMON_TOOLS_TEAM_CAPABILITIES") {
    const source = value === undefined ? [...TEAM_DEFAULT_CAPABILITIES] : typeof value === "string" ? value.split(",").map((item) => item.trim()) : [];
    if (!source.length || source.some((capability) => !CAPABILITIES.has(capability)) || new Set(source).size !== source.length) throw new Error(`${name} is invalid`);
    return Object.freeze([...source].sort());
  }
  /** @param {unknown} value */
  function teamDeploymentPlan(value) {
    const capabilities = parseEnabledCapabilities(value);
    const workers = capabilities.flatMap((capability) => {
      const deployment = Object.prototype.hasOwnProperty.call(TEAM_DEPLOYMENT_CAPABILITIES, capability) ? TEAM_DEPLOYMENT_CAPABILITIES[capability] : undefined;
      return deployment ? [deployment] : [];
    });
    return Object.freeze({
      capabilities,
      workerProfiles: Object.freeze(workers.map((deployment) => deployment.workerProfile)),
      workerServices: Object.freeze(workers.map((deployment) => deployment.workerService))
    });
  }
  /** @param {unknown} [input] */
  function loadTeamConfig(input = process.env) {
    const environment = readEnvironment(input);
    const mode = environment.COMMON_TOOLS_TEAM_MODE || "production";
    if (!["development", "production"].includes(mode)) throw new Error("COMMON_TOOLS_TEAM_MODE is invalid");
    const databaseUrl = parseServiceUrl(environment.COMMON_TOOLS_DATABASE_URL, "COMMON_TOOLS_DATABASE_URL", ["postgres:", "postgresql:"]);
    const redisUrl = parseServiceUrl(environment.COMMON_TOOLS_REDIS_URL, "COMMON_TOOLS_REDIS_URL", ["redis:", "rediss:"]);
    const objectStoreEndpoint = parseServiceUrl(environment.COMMON_TOOLS_OBJECT_STORE_ENDPOINT, "COMMON_TOOLS_OBJECT_STORE_ENDPOINT", mode === "development" ? ["http:", "https:"] : ["https:"]);
    const publicObjectStoreEndpoint = environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT === undefined || !environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT.trim()
      ? undefined
      : parseServiceUrl(environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT, "COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT", ["https:"]);
    if (mode === "production" && databaseUrl.searchParams.get("sslmode") !== "verify-full") throw new Error("production PostgreSQL must use sslmode=verify-full");
    if (mode === "production" && redisUrl.protocol !== "rediss:") throw new Error("production Redis must use rediss");
    if (objectStoreEndpoint.protocol === "http:" && !["127.0.0.1", "localhost", "minio"].includes(objectStoreEndpoint.hostname)) throw new Error("development object storage HTTP endpoint must be local");
    if (publicObjectStoreEndpoint && (publicObjectStoreEndpoint.pathname !== "/" || publicObjectStoreEndpoint.search || publicObjectStoreEndpoint.hash)) throw new Error("COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT must be an origin URL");
    const objectStoreBucket = assertNonEmptyString(environment.COMMON_TOOLS_OBJECT_STORE_BUCKET, "COMMON_TOOLS_OBJECT_STORE_BUCKET");
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(objectStoreBucket) || objectStoreBucket.includes("..")) throw new Error("COMMON_TOOLS_OBJECT_STORE_BUCKET is invalid");
    const workerLeaseSeconds = Number(environment.COMMON_TOOLS_WORKER_LEASE_SECONDS || 60);
    if (!Number.isSafeInteger(workerLeaseSeconds) || workerLeaseSeconds < 30 || workerLeaseSeconds > 600) throw new Error("COMMON_TOOLS_WORKER_LEASE_SECONDS must be between 30 and 600");
    const artifactRetentionDays = Number(environment.COMMON_TOOLS_ARTIFACT_RETENTION_DAYS || 30);
    if (!Number.isSafeInteger(artifactRetentionDays) || artifactRetentionDays < 1 || artifactRetentionDays > 3650) throw new Error("COMMON_TOOLS_ARTIFACT_RETENTION_DAYS must be between 1 and 3650");
    const retentionSchedule = retentionScheduleSettings(environment);
    const projectActiveJobLimit = Number(environment.COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT || 100);
    if (!Number.isSafeInteger(projectActiveJobLimit) || projectActiveJobLimit < 1 || projectActiveJobLimit > 10000) throw new Error("COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT must be between 1 and 10000");
    return Object.freeze({ mode, databaseUrl: databaseUrl.href, redisUrl: redisUrl.href, objectStoreEndpoint: objectStoreEndpoint.href, objectStorePublicEndpoint: publicObjectStoreEndpoint?.href, objectStoreBucket, workerLeaseSeconds, artifactRetentionDays, retentionIntervalSeconds: retentionSchedule.intervalSeconds, projectActiveJobLimit, enabledCapabilities: parseEnabledCapabilities(environment.COMMON_TOOLS_TEAM_CAPABILITIES) });
  }


  return Object.freeze({ loadTeamConfig, parseEnabledCapabilities, teamDeploymentPlan });
}

module.exports = { createTeamConfiguration };
