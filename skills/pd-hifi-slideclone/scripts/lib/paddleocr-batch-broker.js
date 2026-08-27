"use strict";

const crypto = require("crypto");
const http = require("http");

const MAX_REQUEST_BYTES = 1024 * 1024;

async function startPaddleOcrBatchBroker({ adapter, context, maxRequestBytes = MAX_REQUEST_BYTES } = {}) {
  if (!adapter || typeof adapter._private?.runLocalRaw !== "function" || typeof adapter._private?.runLocalRawBatch !== "function") {
    throw new TypeError("PaddleOCR broker requires a local raw OCR adapter");
  }
  const requestLimit = boundedPositiveInteger(maxRequestBytes, MAX_REQUEST_BYTES, 4096, MAX_REQUEST_BYTES);
  const token = crypto.randomBytes(32).toString("base64url");
  const metrics = { requests: 0, completed: 0, failed: 0, queueWaitMs: 0, serviceMs: 0 };
  let queue = Promise.resolve();
  let accepting = true;

  const server = http.createServer((request, response) => {
    if (!accepting) return sendJson(response, 503, { error: "broker-stopping" });
    if (request.method !== "POST" || !["/v1/ocr", "/v1/ocr-batch"].includes(request.url)) return sendJson(response, 404, { error: "not-found" });
    if (!authorized(request.headers.authorization, token)) return sendJson(response, 401, { error: "unauthorized" });
    readJsonBody(request, requestLimit).then((payload) => {
      const queuedAt = Date.now();
      metrics.requests += 1;
      const task = queue.then(async () => {
        metrics.queueWaitMs += Date.now() - queuedAt;
        const startedAt = Date.now();
        try {
          const result = request.url === "/v1/ocr-batch"
            ? await adapter._private.runLocalRawBatch(payload?.inputs, context)
            : await adapter._private.runLocalRaw(payload?.input, context);
          metrics.completed += 1;
          metrics.serviceMs += Date.now() - startedAt;
          sendJson(response, 200, result);
        } catch (error) {
          metrics.failed += 1;
          metrics.serviceMs += Date.now() - startedAt;
          sendJson(response, 500, { error: safeErrorCode(error) });
        }
      });
      queue = task.catch(() => {});
    }).catch((error) => sendJson(response, error.code === "ETOOBIG" ? 413 : 400, { error: "invalid-request" }));
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("PaddleOCR broker did not expose a local address");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    token,
    env: Object.freeze({
      SLIDECLONE_PADDLE_OCR_BROKER_URL: url,
      SLIDECLONE_PADDLE_OCR_BROKER_TOKEN: token
    }),
    metrics,
    async close() {
      accepting = false;
      await queue;
      await closeServer(server);
      adapter.closeActiveEngine?.();
      return Object.freeze({ ...metrics });
    }
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const error = new Error("request exceeds limit");
        error.code = "ETOOBIG";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once("error", reject);
    request.once("end", () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid payload");
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function authorized(header, expectedToken) {
  const value = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(value);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent || response.destroyed) return;
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store"
  });
  response.end(body);
}

function safeErrorCode(error) {
  const message = String(error?.message || "");
  if (/timed out/i.test(message)) return "ocr-timeout";
  if (/cancelled/i.test(message)) return "ocr-cancelled";
  if (/invalid|unavailable/i.test(message)) return "ocr-invalid-input";
  return "ocr-failed";
}

function boundedPositiveInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

module.exports = {
  MAX_REQUEST_BYTES,
  startPaddleOcrBatchBroker
};
