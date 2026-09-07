"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createTeamJob, runTeamRetention } = require("../../packages/team-runtime");
const { readZipEntries, readZipEntry } = require("../../packages/slideclone-core/pptx-zip");
const { startWorker, phase } = require("./worker-process-recovery.cjs");
const { startIsolatedS3 } = require("./isolated-s3.cjs");

function deckArchive() {
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0,
    textBoxes: [{ id: "title", text: "Recovery fixture", box: { x: 20, y: 20, w: 300, h: 40 }, font: { family: "Arial", sizePt: 20 } }],
    shapes: [{ id: "card", type: "rect", box: { x: 20, y: 100, w: 200, h: 100 }, style: { fill: "#FFFFFF", stroke: "#000000" } }], images: [] }] };
  const body = Buffer.from(JSON.stringify(deck));
  const header = Buffer.alloc(512);
  header.write("deck.json"); header.write("0000600\0", 100); header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("0", 156); header.write("ustar\0", 257);
  return zlib.gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]));
}

async function verifyImageWorkerProcessRecovery({ primary, repository, fixture, database, redis, queueClient }) {
  const root = path.resolve(__dirname, "../..");
  const dotnetName = process.platform === "win32" ? "dotnet.exe" : "dotnet";
  const local = path.join(root, ".tools/dotnet", dotnetName);
  const dotnet = fs.existsSync(local) ? local : path.join(process.env.DOTNET_ROOT || "", dotnetName);
  assert.ok(path.isAbsolute(dotnet) && fs.existsSync(dotnet), "recovery test requires an installed .NET SDK");
  const project = path.join(root, "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder");
  const build = spawnSync(dotnet, ["build", path.join(project, "OpenXmlDeckBuilder.csproj"), "--configuration", "Release", "-p:RestoreLockedMode=true"], { windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(build.status, 0, "locked OpenXML fixture build failed");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-worker-recovery-"));
  const imageFixture = { dotnet, builderDll: path.join(project, "bin/Release/net8.0/OpenXmlDeckBuilder.dll"), work: path.join(directory, "work") };
  fs.mkdirSync(imageFixture.work);
  const workers = [];
  let storage;
  try {
    storage = await startIsolatedS3();
    imageFixture.s3 = { config: storage.config, bucket: storage.bucket };
    const seed = fixture("image-worker-kill");
    const job = createTeamJob({ capability: "image-to-editable", ownerId: seed.ownerId, inputObjectKey: seed.inputObjectKey, expiresAt: seed.expiresAt, idempotencyKey: "image-worker-kill", maxAttempts: 3 });
    await storage.store.putObject({ objectKey: job.inputObjectKey, body: deckArchive(), contentType: "application/gzip" });
    const neighborKey = `${job.inputObjectKey}.keep`;
    await storage.store.putObject({ objectKey: neighborKey, body: Buffer.from("keep"), contentType: "text/plain" });
    await repository.create(job);
    const original = startWorker({ database, redis, workerId: "image-original", pause: true, imageFixture }); workers.push(original);
    const firstArtifact = await phase(original, "artifact-written");
    assert.equal(firstArtifact.attempt, 1);
    const firstBytes = await storage.store.readObject({ objectKey: firstArtifact.objectKey, maxBytes: 20 * 1024 * 1024 });
    assert.ok(readZipEntries(firstBytes).some((entry) => entry.name === "ppt/slides/slide1.xml"), "real builder produced a slide");
    assert.match(readZipEntry(firstBytes, "ppt/slides/slide1.xml").toString("utf8"), /Recovery fixture/);
    original.child.kill("SIGKILL"); await original.exit;
    const interrupted = await repository.get(job.id, job.ownerId);
    assert.equal(interrupted.status, "running"); assert.equal(interrupted.artifacts.length, 0);
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
    const replacement = startWorker({ database, redis, workerId: "image-replacement", pause: false, imageFixture }); workers.push(replacement);
    const secondArtifact = await phase(replacement, "artifact-written");
    assert.equal(secondArtifact.attempt, 2);
    assert.notEqual(secondArtifact.objectKey, firstArtifact.objectKey);
    assert.equal((await phase(replacement, "completed")).status, "succeeded");
    assert.equal((await replacement.exit).code, 0);
    const saved = await repository.get(job.id, job.ownerId);
    assert.equal(saved.attempt, 2); assert.equal(saved.status, "succeeded");
    assert.equal(saved.artifacts.length, 1); assert.equal(saved.artifacts[0].objectKey, secondArtifact.objectKey);
    assert.deepEqual(await storage.store.readObject({ objectKey: firstArtifact.objectKey, maxBytes: 20 * 1024 * 1024 }), firstBytes, "retry does not overwrite the abandoned artifact");
    const deliveredBytes = await storage.store.readObject({ objectKey: secondArtifact.objectKey, maxBytes: 20 * 1024 * 1024 });
    assert.match(readZipEntry(deliveredBytes, "ppt/slides/slide1.xml").toString("utf8"), /Recovery fixture/);
    assert.equal(saved.artifacts[0].sha256, crypto.createHash("sha256").update(deliveredBytes).digest("hex"));
    assert.equal((await storage.store.listObjects({ prefix: job.outputPrefix })).keys.length, 2);
    assert.equal(await repository.heartbeat(job.id, "image-original", 30, 1), false);
    await assert.rejects(repository.transition({ id: job.id, workerId: "image-original", attempt: 1, from: "running", to: "succeeded" }), /lease is no longer valid/);
    assert.equal(await queueClient.lLen("recovery-fixture:jobs:image-to-editable:processing"), 0);
    assert.equal(await queueClient.lLen("recovery-fixture:jobs:image-to-editable"), 0);
    await primary.query("UPDATE capability_jobs SET updated_at = NOW() - INTERVAL '2 days' WHERE id = $1", [job.id]);
    const retained = await runTeamRetention({ repository, objectStore: storage.store, actorId: "image-retention", retentionDays: 1 });
    assert.ok(retained.cleaned >= 1);
    assert.equal((await storage.store.listObjects({ prefix: job.outputPrefix })).keys.length, 0, "both abandoned and winning attempts are cleaned after retention");
    assert.equal((await storage.store.readObject({ objectKey: neighborKey, maxBytes: 10 })).toString(), "keep");
    assert.ok((await primary.query("SELECT retention_cleaned_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0].retention_cleaned_at);
    await require("./ocr-checkpoint-process-recovery.cjs").verifyOcrCheckpointProcessRecovery({ primary, repository, fixture, database, redis, queueClient, storage, imageFixture, workers });
  } finally {
    for (const worker of workers) if (!worker.exited) { worker.child.kill("SIGKILL"); await worker.exit; }
    try { storage?.close(); }
    finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 }); }
  }
}

module.exports = { verifyImageWorkerProcessRecovery };
