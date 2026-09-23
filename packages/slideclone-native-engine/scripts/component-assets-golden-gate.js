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

const STRICT_PARALLEL_EVIDENCE_TASKS = [
  ...DEFAULT_TASKS
];

const STRICT_RECALL_ARTIFACT_TASKS = [
  {
    id: "image-recall-fixtures",
    script: "slideclone:image-to-editable-component-recall-fixtures"
  },
  {
    id: "image-recall-corpus-artifacts",
    script: "slideclone:image-to-editable-component-recall-corpus-artifacts"
  },
  {
    id: "image-recall-report",
    script: "slideclone:image-to-editable-component-recall-report"
  },
  {
    id: "image-recall",
    script: "slideclone:image-to-editable-component-recall-gate"
  }
];

const STRICT_ADMISSION_TASKS = [
  {
    id: "self-fidelity",
    script: "slideclone:component-self-fidelity-batch"
  },
  {
    id: "asset-admission",
    script: "slideclone:component-asset-admission-gate"
  }
];

const STRICT_ACCEPTANCE_TASK = {
  id: "strict-acceptance",
  script: "slideclone:component-richness-acceptance-report-strict"
};

function main() {
  const options = parseArgs(process.argv.slice(2));
  runGoldenGate(options).then((summary) => {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.passed !== true) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`[golden-gate] ${sanitizeMessage(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

async function runGoldenGate(options = {}) {
  const startedAt = new Date();
  const strict = options.strict === true;
  const runner = options.runTask || runNpmScript;
  const evidenceTasks = strict ? STRICT_PARALLEL_EVIDENCE_TASKS : DEFAULT_TASKS;
  const evidenceResults = await Promise.all(evidenceTasks.map((task) => runner(task, options)));
  const tasks = [...evidenceResults];
  if (strict && resultsPassed(tasks)) {
    for (const task of STRICT_RECALL_ARTIFACT_TASKS) {
      const result = await runner(task, options);
      tasks.push(result);
      if (result.exitCode !== 0) break;
    }
  }
  if (strict && resultsPassed(tasks)) {
    for (const task of STRICT_ADMISSION_TASKS) {
      const result = await runner(task, options);
      tasks.push(result);
      if (result.exitCode !== 0) break;
    }
  }
  if (strict && resultsPassed(tasks)) {
    tasks.push(await runner(STRICT_ACCEPTANCE_TASK, options));
  } else if (strict) {
    tasks.push({
      id: STRICT_ACCEPTANCE_TASK.id,
      script: STRICT_ACCEPTANCE_TASK.script,
      exitCode: null,
      skipped: true,
      reason: "strict prerequisite tasks failed"
    });
  }
  const finishedAt = new Date();
  const summary = {
    id: strict ? "component-assets-golden-gate-strict" : "component-assets-golden-gate-fast",
    mode: strict ? "parallel-evidence-then-fresh-recall-artifacts-admission-and-strict-acceptance" : "parallel",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    passed: tasks.every((result) => result.exitCode === 0),
    tasks
  };
  writeSummary(summary, options);
  return summary;
}

function resultsPassed(results) {
  return results.every((result) => result.exitCode === 0);
}

function parseArgs(argv = []) {
  const options = {
    strict: false,
    out: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error("--out requires a value");
      options.out = value;
      index += 1;
    } else {
      throw new Error(`Unknown component-assets-golden-gate argument: ${arg}`);
    }
  }
  return options;
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

function writeSummary(summary, options = {}) {
  const out = options.out || path.join(process.cwd(), "runs", `${summary.id}.json`);
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
  parseArgs,
  main,
  prefixLines,
  resolveNpmCli,
  resultsPassed,
  runGoldenGate,
  sanitizeMessage
};
