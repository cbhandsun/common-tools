"use strict";

const childProcess = require("node:child_process");
const { TEAM_DEPLOYMENT_CAPABILITIES, teamDeploymentPlan } = require("../team-runtime");

function dockerVersion() {
  const result = childProcess.spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return Object.freeze({ available: false, status: result.status ?? null, version: null });
  return Object.freeze({ available: true, status: 0, version: String(result.stdout || "").trim() || null });
}

function composeProjectName(value) {
  const project = value || "deploy";
  if (typeof project !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(project)) throw new Error("compose project name is invalid");
  return project;
}

function summarizeContainerStatus(status) {
  const source = typeof status === "string" ? status : "";
  return Object.freeze({ running: /^Up\b/.test(source), healthy: /\(healthy\)/.test(source), unhealthy: /\(unhealthy\)/.test(source), completed: /^Exited \(0\)/.test(source) });
}

function composeServiceName(row) {
  if (!row || typeof row !== "object") return undefined;
  if (typeof row.Service === "string" && row.Service) return row.Service;
  if (typeof row.Labels !== "string") return undefined;
  return /(?:^|,)com\.docker\.compose\.service=([^,]+)/.exec(row.Labels)?.[1];
}

function composeRows(project) {
  const result = childProcess.spawnSync("docker", ["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{json .}}"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return Object.freeze({ available: false, rows: Object.freeze([]) });
  const rows = String(result.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  return Object.freeze({ available: true, rows: Object.freeze(rows) });
}

function loopbackTcpPort(value, containerPort) {
  if (typeof value !== "string" || !Number.isSafeInteger(containerPort) || containerPort < 1 || containerPort > 65535) return undefined;
  const pattern = new RegExp(`(?:^|,\\s*)(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):(\\d+)->${containerPort}/tcp(?:,|$)`);
  const match = pattern.exec(value);
  if (!match) return undefined;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : undefined;
}

function probeReadyEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !/^http:\/\/127\.0\.0\.1:\d{4,5}\/readyz$/.test(endpoint)) throw new TypeError("gateway ready endpoint is invalid");
  const source = "const http=require('node:http');const request=http.get(process.argv[1],{timeout:5000},(response)=>{response.resume();response.on('end',()=>process.exit(response.statusCode===200?0:1));});request.on('timeout',()=>request.destroy());request.on('error',()=>process.exit(1));";
  const result = childProcess.spawnSync(process.execPath, ["-e", source, endpoint], { encoding: "utf8", windowsHide: true, timeout: 6000 });
  return result.status === 0;
}

function gatewayReadiness(rows, probe = probeReadyEndpoint) {
  if (!Array.isArray(rows) || typeof probe !== "function") throw new TypeError("gateway readiness input is invalid");
  const gateway = rows.find((row) => composeServiceName(row) === "remote-mcp-gateway");
  const port = loopbackTcpPort(gateway?.Ports, 8080);
  if (port === undefined) return Object.freeze({ checked: true, ready: false, endpoint: null });
  const endpoint = `http://127.0.0.1:${port}/readyz`;
  return Object.freeze({ checked: true, ready: probe(endpoint) === true, endpoint });
}

function localTeamConfigReport(args = {}, diagnostics = {}) {
  const project = composeProjectName(args.project);
  const inventory = diagnostics.inventory || composeRows(project);
  if (!inventory || inventory.available !== true || !Array.isArray(inventory.rows)) return Object.freeze({ exitCode: 2, info: Object.freeze({ project, available: false, missing: Object.freeze(["Docker Compose runtime"]) }) });
  const byService = new Map();
  for (const row of inventory.rows) {
    const service = composeServiceName(row);
    if (service && !byService.has(service)) byService.set(service, row);
  }
  const gatewayPort = loopbackTcpPort(byService.get("remote-mcp-gateway")?.Ports, 8080);
  const keycloakPort = loopbackTcpPort(byService.get("keycloak")?.Ports, 8080);
  const minioPort = loopbackTcpPort(byService.get("minio")?.Ports, 9000);
  const missing = [
    ...(gatewayPort === undefined ? ["remote-mcp-gateway loopback port 8080"] : [])
  ];
  if (missing.length) return Object.freeze({ exitCode: 2, info: Object.freeze({ project, available: true, missing: Object.freeze(missing) }) });
  const remotePublicUrl = `http://127.0.0.1:${gatewayPort}`;
  const configuration = {
    COMMON_TOOLS_REMOTE_PUBLIC_URL: remotePublicUrl,
    COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS: remotePublicUrl,
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp"
  };
  if (minioPort !== undefined) configuration.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT = `http://127.0.0.1:${minioPort}`;
  const optionalMissing = [];
  if (keycloakPort === undefined) optionalMissing.push("keycloak loopback port 8080");
  if (minioPort === undefined) optionalMissing.push("minio loopback port 9000");
  else {
    configuration.COMMON_TOOLS_OIDC_ISSUER = `http://127.0.0.1:${keycloakPort}/realms/common-tools`;
    configuration.COMMON_TOOLS_OIDC_JWKS_URL = "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs";
  }
  return Object.freeze({
    exitCode: 0,
    info: Object.freeze({
      project,
      available: true,
      configuration: Object.freeze(configuration),
      optionalMissing: Object.freeze(optionalMissing)
    })
  });
}

function composeRuntimeSnapshot(rows, enabledCapabilities, options = {}) {
  if (!Array.isArray(rows) || !Array.isArray(enabledCapabilities) || !options || typeof options !== "object" || Array.isArray(options) || (options.requireGateway !== undefined && typeof options.requireGateway !== "boolean") || (options.gatewayReady !== undefined && typeof options.gatewayReady !== "boolean")) throw new TypeError("Compose runtime snapshot input is invalid");
  const requireGateway = options.requireGateway === true;
  const services = new Map();
  for (const row of rows) {
    const service = composeServiceName(row);
    if (!row || typeof row !== "object" || !service || typeof row.Status !== "string") continue;
    const state = summarizeContainerStatus(row.Status);
    const current = services.get(service) || { count: 0, running: 0, healthy: 0, unhealthy: 0, completed: 0 };
    current.count += 1;
    current.running += state.running ? 1 : 0;
    current.healthy += state.healthy ? 1 : 0;
    current.unhealthy += state.unhealthy ? 1 : 0;
    current.completed += state.completed ? 1 : 0;
    services.set(service, current);
  }
  const report = Object.fromEntries([...services].sort(([left], [right]) => left.localeCompare(right)));
  const active = (name) => report[name]?.running > 0 && report[name]?.unhealthy === 0;
  const requiredActiveServices = ["postgres", "redis", "minio", "remote-mcp", "team-retention"];
  const workers = enabledCapabilities.map((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability]?.workerService).filter(Boolean);
  const requiredServices = Object.freeze([...new Set([...requiredActiveServices, ...workers, ...(requireGateway ? ["remote-mcp-gateway"] : []), "team-migrate"])]);
  const missingServices = Object.freeze(requiredServices.filter((name) => !report[name]));
  const inactiveServices = Object.freeze(requiredServices.filter((name) => {
    if (!report[name]) return false;
    if (name === "team-migrate") return report[name].completed === 0;
    if (name === "remote-mcp-gateway" && requireGateway) return !active(name) || (options.gatewayReady === undefined ? report[name].healthy === 0 : options.gatewayReady !== true);
    return !active(name);
  }));
  const ok = missingServices.length === 0 && inactiveServices.length === 0;
  return Object.freeze({ ok, requiredServices, missingServices, inactiveServices, services: report });
}

function dockerComposeRuntime(project, enabledCapabilities, options = {}) {
  const inventory = composeRows(project);
  if (!inventory.available) return Object.freeze({ available: false, ok: false, services: {} });
  const gateway = options.requireGateway === true ? gatewayReadiness(inventory.rows) : Object.freeze({ checked: false, ready: null, endpoint: null });
  const snapshotOptions = options.requireGateway === true ? { ...options, gatewayReady: gateway.ready } : options;
  return Object.freeze({ available: true, ...composeRuntimeSnapshot(inventory.rows, enabledCapabilities, snapshotOptions), gateway });
}

function teamRuntimeReport(args = {}, diagnostics = {}) {
  const docker = diagnostics.docker || dockerVersion();
  const plan = teamDeploymentPlan(args.capabilities);
  const project = composeProjectName(args.project);
  const requireGateway = args["require-gateway"] === true || args["require-gateway"] === "true";
  const runtime = (diagnostics.runtime || dockerComposeRuntime)(project, plan.capabilities, { requireGateway });
  const info = Object.freeze({ project, enabledCapabilities: plan.capabilities, requireGateway, docker: Object.freeze({ available: docker.available, version: docker.version }), runtime });
  return Object.freeze({ exitCode: docker.available && runtime.ok ? 0 : 2, info });
}

module.exports = {
  composeProjectName,
  composeRuntimeSnapshot,
  dockerComposeRuntime,
  dockerVersion,
  gatewayReadiness,
  localTeamConfigReport,
  loopbackTcpPort,
  probeReadyEndpoint,
  summarizeContainerStatus,
  teamRuntimeReport
};
