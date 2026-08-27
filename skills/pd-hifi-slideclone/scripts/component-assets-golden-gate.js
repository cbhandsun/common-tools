"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_TASKS = [
  {
    id: "regression",
    script: "slideclone:quality-matrix-component-assets-regression"
  },
  {
    id: "coverage",
    script: "slideclone:component-assets-coverage-gate"
  }
];

function main() {
  const startedAt = new Date();
  const tasks = DEFAULT_TASKS.map((task) => runNpmScript(task));
  Promise.all(tasks).then((results) => {
    const finishedAt = new Date();
    const summary = {
      id: "component-assets-golden-gate-fast",
      mode: "parallel",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      passed: results.every((result) => result.exitCode === 0),
      tasks: results
    };
    writeSummary(summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.passed !== true) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`[golden-gate] ${sanitizeMessage(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

function runNpmScript(task, options = {}) {
  const cwd = options.cwd || process.cwd();
  const command = buildNpmRunCommand(task.script, options.platform || process.platform);
  const startedAt = new Date();
  let stdoutTail = "";
  let stderrTail = "";
  process.stdout.write(`[${task.id}] started ${task.script}\n`);
  return new Promise((resolve) => {
    const child = spawn(command.file, command.args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => {
      stdoutTail = appendOutputTail(stdoutTail, chunk);
      if (options.streamOutput === true) process.stdout.write(prefixLines(task.id, chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrTail = appendOutputTail(stderrTail, chunk);
      if (options.streamOutput === true) process.stderr.write(prefixLines(task.id, chunk));
    });
    child.on("error", (error) => {
      const finishedAt = new Date();
      resolve({
        id: task.id,
        script: task.script,
        exitCode: 1,
        error: sanitizeMessage(error.message),
        durationMs: finishedAt.getTime() - startedAt.getTime()
      });
    });
    child.on("close", (exitCode) => {
      const finishedAt = new Date();
      const result = {
        id: task.id,
        script: task.script,
        exitCode,
        durationMs: finishedAt.getTime() - startedAt.getTime()
      };
      if (exitCode !== 0) {
        result.stdoutTail = sanitizeMessage(stdoutTail);
        result.stderrTail = sanitizeMessage(stderrTail);
      }
      process.stdout.write(`[${task.id}] ${exitCode === 0 ? "passed" : "failed"} in ${result.durationMs}ms\n`);
      resolve(result);
    });
  });
}

function buildNpmRunCommand(script, platform = process.platform) {
  if (platform === "win32") {
    return {
      file: process.execPath,
      args: [resolveNpmCli(), "run", script]
    };
  }
  return {
    file: "npm",
    args: ["run", script]
  };
}

function resolveNpmCli() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  return path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

function writeSummary(summary) {
  const out = path.join(process.cwd(), "runs", "component-assets-golden-gate-fast.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function prefixLines(id, chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
  return text
    .split(/(\r?\n)/)
    .map((part) => (/^\r?\n$/.test(part) || part === "" ? part : `[${id}] ${part}`))
    .join("");
}

function appendOutputTail(current, chunk, maxLength = 4000) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
  const next = `${current}${text}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function sanitizeMessage(message) {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/(token|api[_-]?key|secret|cookie)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 500);
}

if (require.main === module) main();

module.exports = {
  appendOutputTail,
  buildNpmRunCommand,
  prefixLines,
  resolveNpmCli,
  sanitizeMessage
};
