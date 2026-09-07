"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { S3Client } = require("@aws-sdk/client-s3");
const { createObjectStore } = require("../../packages/remote-mcp-server/team-providers");

function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error("isolated image S3 command failed");
  return result.stdout.trim();
}

async function startIsolatedS3() {
  const credentials = { accessKeyId: "image-recovery", secretAccessKey: crypto.randomBytes(24).toString("hex") };
  const id = docker(["run", "--detach", "--rm", "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--tmpfs", "/data:rw,size=128m", "--publish", "127.0.0.1::9000", "--env", `MINIO_ROOT_USER=${credentials.accessKeyId}`, "--env", `MINIO_ROOT_PASSWORD=${credentials.secretAccessKey}`, "minio/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e", "server", "/data", "--console-address", ":9001"]);
  assert.match(id, /^[a-f0-9]{64}$/);
  let client;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    client?.destroy();
    docker(["rm", "--force", id]);
  }
  try {
    const binding = docker(["port", id, "9000/tcp"]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    const endpoint = `http://${binding}`;
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = (await fetch(`${endpoint}/minio/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; } catch { ready = false; }
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready, "isolated image S3 did not become ready");
    const config = { endpoint, region: "us-east-1", forcePathStyle: true, credentials, maxAttempts: 1, requestHandler: { requestTimeout: 3000, connectionTimeout: 1000 } };
    client = new S3Client(config);
    const bucket = "image-recovery";
    const store = createObjectStore(client, bucket, 900, { readinessRetryDelaysMs: [] });
    await store.ensureBucket(true);
    return { config, bucket, store, close };
  } catch (error) { close(); throw error; }
}

module.exports = { startIsolatedS3 };
