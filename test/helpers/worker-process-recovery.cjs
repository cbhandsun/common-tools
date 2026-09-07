"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { fork } = require("node:child_process");

function startWorker(settings) {
  const child = fork(path.join(__dirname, "team-worker-process.cjs"), [], { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
  const messages = [];
  let exited = false;
  const exit = new Promise((resolve) => child.once("close", (code, signal) => { exited = true; resolve({ code, signal }); }));
  child.on("error", () => { messages.push({ phase: "failed" }); });
  child.on("message", (message) => messages.push(message));
  child.send(settings);
  return { child, exit, messages, get exited() { return exited; } };
}

async function phase(worker, expected) {
  const { setTimeout: delay } = require("node:timers/promises");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const found = worker.messages.find((message) => message.phase === expected);
    if (found) return found;
    assert.ok(!worker.exited && !worker.messages.some((message) => message.phase === "failed"), "isolated worker failed before expected phase");
    await delay(50);
  }
  throw new Error("isolated worker phase timed out");
}

async function verifyWorkerProcessRecovery({ primary, repository, fixture, database, redis, queueClient }) {
  const workers = [];
  try {
    const job = { ...fixture("actual-worker-kill"), maxAttempts: 3 };
    await repository.create(job);
    const original = startWorker({ database, redis, workerId: "process-original", pause: true });
    workers.push(original);
    assert.deepEqual(await phase(original, "claimed"), { phase: "claimed", id: job.id, attempt: 1 });
    assert.equal((await repository.get(job.id, job.ownerId)).status, "running");
    assert.equal(await queueClient.lLen("recovery-fixture:jobs:project-audit:processing"), 1);
    original.child.kill("SIGKILL");
    const interrupted = await original.exit;
    assert.ok(interrupted.signal || interrupted.code !== 0);
    assert.equal((await repository.get(job.id, job.ownerId)).status, "running", "killed process made no terminal transition");
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
    const replacement = startWorker({ database, redis, workerId: "process-replacement", pause: false });
    workers.push(replacement);
    assert.deepEqual(await phase(replacement, "claimed"), { phase: "claimed", id: job.id, attempt: 2 });
    const completed = await phase(replacement, "completed");
    assert.equal(completed.status, "succeeded");
    assert.equal((await replacement.exit).code, 0);
    const saved = await repository.get(job.id, job.ownerId);
    assert.equal(saved.status, "succeeded");
    assert.equal(saved.attempt, 2);
    assert.equal(await queueClient.lLen("recovery-fixture:jobs:project-audit:processing"), 0);
    assert.equal(await queueClient.lLen("recovery-fixture:jobs:project-audit"), 0);
    assert.equal(await repository.heartbeat(job.id, "process-original", 30, 1), false);
  } finally {
    for (const worker of workers) if (!worker.exited) { worker.child.kill("SIGKILL"); await worker.exit; }
  }
}

module.exports = { verifyWorkerProcessRecovery, startWorker, phase };
