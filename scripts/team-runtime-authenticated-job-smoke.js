#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { localTeamConfigReport } = require("../packages/cli/team-runtime-local");
const { runAuthenticatedJobSmoke } = require("../packages/cli/team-job-smoke");

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`unexpected argument: ${item}`);
    const name = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[name] = next;
      index += 1;
    } else {
      result[name] = true;
    }
  }
  return result;
}

function parseJobOptions(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("--job-options-json is invalid");
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("--job-options-json is invalid");
  }
}

function readLocalGateway(project) {
  const report = localTeamConfigReport({ project });
  if (report.exitCode !== 0 || typeof report.info?.configuration?.COMMON_TOOLS_REMOTE_PUBLIC_URL !== "string") throw new Error("Local team gateway configuration is unavailable; pass --gateway-url explicitly");
  return report.info.configuration.COMMON_TOOLS_REMOTE_PUBLIC_URL;
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const args = parse(argv);
  const tokenEnv = typeof args["token-env"] === "string" && args["token-env"].trim() ? args["token-env"].trim() : "COMMON_TOOLS_JOB_SMOKE_TOKEN";
  if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(tokenEnv)) throw new Error("--token-env is invalid");
  const token = environment[tokenEnv];
  if (typeof token !== "string" || !token) throw new Error(`Set ${tokenEnv} to a bearer token with the required Common Tools capability scope`);
  const project = typeof args.project === "string" ? args.project : "deploy";
  const origin = args["gateway-url"] || environment.COMMON_TOOLS_JOB_SMOKE_URL || readLocalGateway(project);
  const inputFile = args["input-file"] || environment.COMMON_TOOLS_JOB_SMOKE_INPUT_FILE;
  if (typeof inputFile !== "string" || !inputFile.trim()) throw new Error("Pass --input-file or set COMMON_TOOLS_JOB_SMOKE_INPUT_FILE");
  const resolvedInput = path.resolve(inputFile);
  if (!fs.existsSync(resolvedInput) || !fs.statSync(resolvedInput).isFile()) throw new Error("authenticated job smoke input file is unavailable");
  const report = await runAuthenticatedJobSmoke({
    origin,
    token,
    inputFile: resolvedInput,
    capability: args.capability || environment.COMMON_TOOLS_JOB_SMOKE_CAPABILITY || "image-to-editable",
    projectId: args["project-id"] || environment.COMMON_TOOLS_JOB_SMOKE_PROJECT_ID,
    contentType: args["content-type"] || environment.COMMON_TOOLS_JOB_SMOKE_CONTENT_TYPE || "application/gzip",
    idempotencyKey: args["idempotency-key"],
    jobOptions: parseJobOptions(args["job-options-json"] || environment.COMMON_TOOLS_JOB_SMOKE_JOB_OPTIONS_JSON),
    artifactName: args["artifact-name"] || environment.COMMON_TOOLS_JOB_SMOKE_ARTIFACT_NAME,
    wait: args.wait === true,
    maxWaitMs: args["max-wait-ms"] || environment.COMMON_TOOLS_JOB_SMOKE_MAX_WAIT_MS,
    pollIntervalMs: args["poll-interval-ms"] || environment.COMMON_TOOLS_JOB_SMOKE_POLL_INTERVAL_MS,
    timeoutMs: args["timeout-ms"] || environment.COMMON_TOOLS_JOB_SMOKE_TIMEOUT_MS,
    allowRemote: args["allow-remote"] === true
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.passed ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "authenticated job smoke failed"}\n`);
    process.exitCode = 2;
  });
}

module.exports = { main, parse, parseJobOptions, readLocalGateway };
