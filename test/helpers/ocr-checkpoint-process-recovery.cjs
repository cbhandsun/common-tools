"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createTeamJob, runTeamRetention } = require("../../packages/team-runtime");
const { readZipEntry } = require("../../packages/slideclone-core/pptx-zip");
const { startWorker, phase } = require("./worker-process-recovery.cjs");

function sourceArchive() {
  const body = fs.readFileSync(path.resolve(__dirname, "../../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  const header = Buffer.alloc(512);
  header.write("assets/source.png"); header.write("0000600\0", 100);
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("0", 156); header.write("ustar\0", 257);
  return zlib.gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]));
}

async function verifyOcrCheckpointProcessRecovery({ primary, repository, fixture, database, redis, queueClient, storage, imageFixture, workers }) {
  const seed = fixture("ocr-checkpoint-kill");
  const job = createTeamJob({ capability: "image-to-editable", ownerId: seed.ownerId, inputObjectKey: seed.inputObjectKey, expiresAt: seed.expiresAt, idempotencyKey: "ocr-checkpoint-kill", maxAttempts: 3 });
  const source = sourceArchive();
  await storage.store.putObject({ objectKey: job.inputObjectKey, body: source, contentType: "application/gzip" });
  const neighborKey = `${job.inputObjectKey}.keep`;
  await storage.store.putObject({ objectKey: neighborKey, body: Buffer.from("keep"), contentType: "text/plain" });
  await repository.create(job);
  const settings = { database, redis, imageFixture: { ...imageFixture, checkpoint: true } };
  const original = startWorker({ ...settings, workerId: "ocr-original", pause: true }); workers.push(original);
  const checkpoint = await phase(original, "checkpoint-written");
  assert.equal(checkpoint.attempt, 1);
  assert.ok(checkpoint.objectKey.startsWith(`${job.outputPrefix}.internal/ocr/`));
  assert.equal(original.messages.filter(message => message.phase === "ocr-called").length, 1);
  assert.equal(original.messages.filter(message => message.phase === "rebuilt").length, 0);
  const checkpointBytes = await storage.store.readObject({ objectKey: checkpoint.objectKey, maxBytes: 1024 * 1024 });
  original.child.kill("SIGKILL"); await original.exit;
  const interrupted = await repository.get(job.id, job.ownerId);
  assert.equal(interrupted.status, "running"); assert.equal(interrupted.artifacts.length, 0);
  await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
  const replacement = startWorker({ ...settings, workerId: "ocr-replacement", pause: false }); workers.push(replacement);
  const artifact = await phase(replacement, "artifact-written");
  assert.equal(artifact.attempt, 2);
  assert.ok(artifact.objectKey.startsWith(`${job.outputPrefix}attempts/2/`));
  assert.equal((await phase(replacement, "completed")).status, "failed", "cache reuse must not bypass missing visual verification");
  assert.equal((await replacement.exit).code, 0);
  assert.equal(replacement.messages.filter(message => message.phase === "ocr-called").length, 0, "new process reads persisted OCR without rerunning recognition");
  assert.equal(replacement.messages.filter(message => message.phase === "checkpoint-written").length, 0);
  assert.equal(replacement.messages.filter(message => message.phase === "rebuilt").length, 1);
  const saved = await repository.get(job.id, job.ownerId);
  assert.equal(saved.attempt, 2); assert.equal(saved.error.code, "QUALITY_GATE_FAILED");
  assert.equal(saved.quality.passed, false);
  assert.ok(saved.quality.checks.some(check => check.name === "quality-render-not-configured" && !check.passed));
  const bytes = await storage.store.readObject({ objectKey: artifact.objectKey, maxBytes: 20 * 1024 * 1024 });
  assert.match(readZipEntry(bytes, "ppt/slides/slide1.xml").toString("utf8"), /Checkpoint recovery/);
  assert.deepEqual(await storage.store.readObject({ objectKey: checkpoint.objectKey, maxBytes: 1024 * 1024 }), checkpointBytes);
  assert.deepEqual(await storage.store.readObject({ objectKey: job.inputObjectKey, maxBytes: source.length }), source);
  assert.equal((await storage.store.listObjects({ prefix: job.outputPrefix })).keys.length, 2);
  assert.equal(await repository.heartbeat(job.id, "ocr-original", 30, 1), false);
  await assert.rejects(repository.transition({ id: job.id, workerId: "ocr-original", attempt: 1, from: "running", to: "succeeded" }), /lease is no longer valid/);
  for (const suffix of ["", ":processing"]) assert.equal(await queueClient.lLen(`recovery-fixture:jobs:image-to-editable${suffix}`), 0);
  await primary.query("UPDATE capability_jobs SET updated_at = NOW() - INTERVAL '2 days' WHERE id = $1", [job.id]);
  assert.ok((await runTeamRetention({ repository, objectStore: storage.store, actorId: "ocr-retention", retentionDays: 1 })).cleaned >= 1);
  assert.equal((await storage.store.listObjects({ prefix: job.outputPrefix })).keys.length, 0, "retention removes checkpoint and output together");
  assert.equal((await storage.store.readObject({ objectKey: neighborKey, maxBytes: 10 })).toString(), "keep");
}

module.exports = { verifyOcrCheckpointProcessRecovery };
