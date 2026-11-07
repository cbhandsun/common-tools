"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { S3Client } = require("@aws-sdk/client-s3");
const { createObjectStore } = require("../../packages/remote-mcp-server/team-providers");

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sendS3Error(res, statusCode, code, message) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${escapeXml(code)}</Code><Message>${escapeXml(message)}</Message></Error>`;
  res.writeHead(statusCode, { "Content-Type": "application/xml", "Content-Length": Buffer.byteLength(xml) });
  res.end(xml);
}

async function startIsolatedS3({ bucket = "image-recovery", accessKeyId = "image-recovery" } = {}) {
  const credentials = { accessKeyId, secretAccessKey: crypto.randomBytes(24).toString("hex") };
  const buckets = new Map();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/minio/health/ready") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const bucketName = parts[0] ? decodeURIComponent(parts[0]) : "";
    const objectKey = parts.slice(1).map((p) => decodeURIComponent(p)).join("/");

    if (!bucketName) {
      sendS3Error(res, 400, "InvalidBucketName", "Bucket name is required");
      return;
    }

    if (!objectKey) {
      if (req.method === "HEAD") {
        if (!buckets.has(bucketName)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.method === "PUT") {
        if (!buckets.has(bucketName)) buckets.set(bucketName, new Map());
        res.writeHead(200, { Location: `/${bucketName}` });
        res.end();
        return;
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const objects = buckets.get(bucketName);
        if (!objects) {
          sendS3Error(res, 404, "NoSuchBucket", "The specified bucket does not exist");
          return;
        }
        const prefix = url.searchParams.get("prefix") || "";
        const maxKeys = Math.max(1, Number(url.searchParams.get("max-keys") || 1000));
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const slice = keys.slice(0, maxKeys);
        const contentsXml = slice.map((k) => {
          const entry = objects.get(k);
          return `<Contents><Key>${escapeXml(k)}</Key><LastModified>${escapeXml(entry.lastModified)}</LastModified><ETag>&quot;${escapeXml(entry.etag)}&quot;</ETag><Size>${entry.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
        }).join("");
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${escapeXml(bucketName)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${slice.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>false</IsTruncated>${contentsXml}</ListBucketResult>`;
        res.writeHead(200, { "Content-Type": "application/xml", "Content-Length": Buffer.byteLength(xml) });
        res.end(xml);
        return;
      }
      sendS3Error(res, 405, "MethodNotAllowed", "Unsupported bucket operation");
      return;
    }

    const objects = buckets.get(bucketName);
    if (!objects) {
      sendS3Error(res, 404, "NoSuchBucket", "The specified bucket does not exist");
      return;
    }

    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const etag = crypto.createHash("md5").update(body).digest("hex");
        objects.set(objectKey, {
          body,
          contentType: req.headers["content-type"] || "application/octet-stream",
          etag,
          lastModified: new Date().toISOString()
        });
        res.writeHead(200, { ETag: `"${etag}"` });
        res.end();
      });
      return;
    }

    if (req.method === "HEAD") {
      const entry = objects.get(objectKey);
      if (!entry) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": entry.contentType,
        "Content-Length": String(entry.body.length),
        ETag: `"${entry.etag}"`
      });
      res.end();
      return;
    }

    if (req.method === "GET") {
      const entry = objects.get(objectKey);
      if (!entry) {
        sendS3Error(res, 404, "NoSuchKey", "The specified key does not exist");
        return;
      }
      res.writeHead(200, {
        "Content-Type": entry.contentType,
        "Content-Length": String(entry.body.length),
        ETag: `"${entry.etag}"`
      });
      res.end(entry.body);
      return;
    }

    if (req.method === "DELETE") {
      objects.delete(objectKey);
      res.writeHead(204);
      res.end();
      return;
    }

    sendS3Error(res, 405, "MethodNotAllowed", "Unsupported object operation");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;
  const config = {
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials,
    maxAttempts: 1,
    requestHandler: { requestTimeout: 3000, connectionTimeout: 1000 }
  };
  const client = new S3Client(config);
  const store = createObjectStore(client, bucket, 900, { readinessRetryDelaysMs: [] });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    client.destroy();
    server.closeAllConnections?.();
    server.close();
  }
  try {
    await store.ensureBucket(true);
    return { config, bucket, store, close };
  } catch (error) {
    close();
    throw error;
  }
}

module.exports = { startIsolatedS3 };
