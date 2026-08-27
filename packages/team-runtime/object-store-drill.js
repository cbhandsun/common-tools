"use strict";

const crypto = require("node:crypto");
const { CopyObjectCommand, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function assertBucket(value, label) {
  if (typeof value !== "string" || !BUCKET_PATTERN.test(value) || value.includes("..")) throw new TypeError(`${label} is invalid`);
  return value;
}
async function bodyBuffer(body, maximumBytes) {
  if (!body || typeof body[Symbol.asyncIterator] !== "function" || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new TypeError("object drill response is invalid");
  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) throw new Error("object drill response exceeds maximum size");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function copySource(bucket, key) {
  return `/${assertBucket(bucket, "source bucket")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
async function runObjectStoreRestoreDrill({ client, sourceBucket, backupBucket, content = crypto.randomBytes(1024) } = {}) {
  if (!client || typeof client.send !== "function") throw new TypeError("object drill client is incomplete");
  const source = assertBucket(sourceBucket, "source bucket");
  const backup = assertBucket(backupBucket, "backup bucket");
  if (source === backup) throw new Error("object drill buckets must differ");
  if (!Buffer.isBuffer(content) || content.length < 1 || content.length > 1024 * 1024) throw new TypeError("object drill content is invalid");
  const key = "restore-drill.bin";
  const expected = crypto.createHash("sha256").update(content).digest("hex");
  let sourceCreated = false;
  let backupCreated = false;
  let result;
  let primaryFailure;
  const cleanupFailures = [];
  try {
    await client.send(new CreateBucketCommand({ Bucket: source }));
    sourceCreated = true;
    await client.send(new CreateBucketCommand({ Bucket: backup }));
    backupCreated = true;
    await client.send(new PutObjectCommand({ Bucket: source, Key: key, Body: content, ContentType: "application/octet-stream" }));
    await client.send(new CopyObjectCommand({ Bucket: backup, Key: key, CopySource: copySource(source, key) }));
    await client.send(new DeleteObjectCommand({ Bucket: source, Key: key }));
    await client.send(new CopyObjectCommand({ Bucket: source, Key: key, CopySource: copySource(backup, key) }));
    const restored = await client.send(new GetObjectCommand({ Bucket: source, Key: key }));
    const actual = crypto.createHash("sha256").update(await bodyBuffer(restored.Body, 1024 * 1024)).digest("hex");
    if (actual !== expected) throw new Error("object restore checksum mismatch");
    result = Object.freeze({ sha256: expected });
  } catch (error) {
    primaryFailure = error;
  } finally {
    const cleanup = async (operation) => {
      try { await operation(); } catch (error) { cleanupFailures.push(error); }
    };
    if (sourceCreated) await cleanup(() => client.send(new DeleteObjectCommand({ Bucket: source, Key: key })));
    if (backupCreated) await cleanup(() => client.send(new DeleteObjectCommand({ Bucket: backup, Key: key })));
    if (sourceCreated) await cleanup(() => client.send(new DeleteBucketCommand({ Bucket: source })));
    if (backupCreated) await cleanup(() => client.send(new DeleteBucketCommand({ Bucket: backup })));
  }
  if (primaryFailure && cleanupFailures.length) throw new AggregateError([primaryFailure, ...cleanupFailures], "object restore drill failed and cleanup failed");
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailures.length) throw new AggregateError(cleanupFailures, "object restore drill cleanup failed");
  return result;
}

module.exports = { bodyBuffer, copySource, runObjectStoreRestoreDrill };
