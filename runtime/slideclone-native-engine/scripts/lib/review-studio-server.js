"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { applyReviewPatches, ReviewPatchError } = require("./review-patch");
const { validateIr } = require("../slideclone");

const STATIC_DIR = path.resolve(__dirname, "..", "review-studio");
const MAX_BODY_BYTES = 256 * 1024;

function createReviewStudioServer(options) {
  const irFile = requireReadableFile(options?.irFile, "IR file");
  const baseDir = path.resolve(options?.baseDir || path.dirname(irFile));
  const token = options?.token || crypto.randomBytes(32).toString("hex");
  const state = loadState(irFile, baseDir);
  const server = http.createServer((request, response) => {
    handleRequest({ request, response, irFile, baseDir, token, state, maxBodyBytes: options?.maxBodyBytes || MAX_BODY_BYTES })
      .catch((error) => sendError(response, error));
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return { server, token, irFile, state };
}

async function handleRequest(context) {
  const { request, response, token, state } = context;
  setSecurityHeaders(response);
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") return sendStatic(response, "index.html", "text/html; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/app.js") return sendStatic(response, "app.js", "text/javascript; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/style.css") return sendStatic(response, "style.css", "text/css; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/api/deck") return sendJson(response, 200, { token, revision: state.revision, deck: state.reviewModel });
  const sourceMatch = request.method === "GET" ? /^\/api\/pages\/(\d+)\/source$/.exec(url.pathname) : null;
  if (sourceMatch) return sendSourceImage(response, state, Number(sourceMatch[1]));
  if (request.method === "POST" && url.pathname === "/api/apply") {
    if (!timingSafeToken(request.headers["x-review-token"], token)) throw httpError(403, "invalid review token");
    requireLocalOrigin(request);
    const body = await readJsonBody(request, context.maxBodyBytes);
    const expectedRevision = requireRevision(body?.revision);
    if (expectedRevision !== state.revision) throw httpError(409, "review deck revision is stale; reload before applying changes");
    assertCurrentRevision(context.irFile, expectedRevision);
    const patches = body?.patches;
    const result = applyReviewPatches(state.ir, patches, {
      validateIr,
      validateOptions: { baseDir: context.baseDir },
      allowManualRequired: true
    });
    const receipt = persistReviewResult(context.irFile, result.ir, result.audit, expectedRevision);
    state.ir = result.ir;
    state.revision = receipt.afterSha256;
    state.reviewModel = buildReviewModel(result.ir);
    state.sources = buildSourceMap(result.ir, context.baseDir);
    return sendJson(response, 200, { applied: result.audit.length, receipt, deck: state.reviewModel });
  }
  sendJson(response, 404, { error: "not found" });
}

function loadState(irFile, baseDir) {
  let ir;
  let content;
  try {
    content = fs.readFileSync(irFile);
    ir = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("IR file is not valid JSON");
  }
  const validation = validateIr(ir, { allowManualRequired: true, baseDir });
  if (validation.ok === false) throw new Error(`IR validation failed: ${(validation.errors || []).slice(0, 5).join("; ")}`);
  return { ir, revision: sha256(content), reviewModel: buildReviewModel(ir), sources: buildSourceMap(ir, baseDir) };
}

function buildReviewModel(ir) {
  const collections = ["textBoxes", "shapes", "images", "tables", "charts", "icons"];
  return {
    version: ir.version,
    slideSize: ir.slideSize,
    pages: (Array.isArray(ir.pages) ? ir.pages : []).map((page) => ({
      pageIndex: page.pageIndex,
      sourceUrl: `/api/pages/${page.pageIndex}/source`,
      elements: collections.flatMap((collection) => (Array.isArray(page[collection]) ? page[collection] : []).map((item) => ({
        collection,
        id: item.id,
        type: item.type || item.role || collection,
        text: collection === "textBoxes" ? item.text : undefined,
        box: pickFinite(item.box, ["x", "y", "w", "h"]),
        font: collection === "textBoxes" ? pickAllowed(item.font, ["family", "sizePt", "weight", "color", "align"]) : undefined,
        style: pickAllowed(item.style, ["fill", "stroke", "strokeWidthPt", "opacity", "rotationDeg"]),
        review: pickAllowed(item.review, ["note", "status"]),
        reconstruction: item.source?.reconstruction ? {
          realization: item.source.reconstruction.realization,
          sourceSufficiency: item.source.reconstruction.sourceSufficiency,
          boundaryState: item.source.reconstruction.boundaryState
        } : undefined
      })))
    }))
  };
}

function buildSourceMap(ir, baseDir) {
  const sources = new Map();
  for (const page of Array.isArray(ir.pages) ? ir.pages : []) {
    if (!Number.isSafeInteger(page.pageIndex) || typeof page.sourceImage !== "string" || page.sourceImage.length === 0) continue;
    const resolved = path.isAbsolute(page.sourceImage) ? path.resolve(page.sourceImage) : path.resolve(baseDir, page.sourceImage);
    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    if (stat?.isFile() && isSupportedImage(resolved)) sources.set(page.pageIndex, resolved);
  }
  return sources;
}

function sendSourceImage(response, state, pageIndex) {
  const file = state.sources.get(pageIndex);
  if (!file) return sendJson(response, 404, { error: "source image unavailable" });
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > 100 * 1024 * 1024) return sendJson(response, 404, { error: "source image unavailable" });
  response.writeHead(200, { "Content-Type": imageMime(file), "Content-Length": stat.size, "Cache-Control": "no-store" });
  fs.createReadStream(file).on("error", () => response.destroy()).pipe(response);
}

function persistReviewResult(irFile, ir, audit, expectedRevision) {
  const directory = path.dirname(irFile);
  const backupDirectory = path.join(directory, ".review-backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const before = fs.readFileSync(irFile);
  const beforeSha256 = sha256(before);
  if (expectedRevision !== undefined && beforeSha256 !== expectedRevision) {
    throw httpError(409, "review deck changed on disk; reload before applying changes");
  }
  const after = Buffer.from(`${JSON.stringify(ir, null, 2)}\n`, "utf8");
  const afterSha256 = sha256(after);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeBase = path.basename(irFile).replace(/[^A-Za-z0-9._-]/g, "_");
  const backupFile = path.join(backupDirectory, `${safeBase}.${stamp}.${beforeSha256.slice(0, 12)}.${crypto.randomBytes(4).toString("hex")}.json`);
  fs.copyFileSync(irFile, backupFile, fs.constants.COPYFILE_EXCL);
  atomicWrite(irFile, after);
  const auditFile = path.join(backupDirectory, "review-audit.jsonl");
  const auditRecord = {
    schemaVersion: 1,
    appliedAt: new Date().toISOString(),
    beforeSha256,
    afterSha256,
    operationCount: audit.length,
    operations: audit
  };
  try {
    fs.appendFileSync(auditFile, `${JSON.stringify(auditRecord)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    atomicWrite(irFile, before);
    throw error;
  }
  return { beforeSha256, afterSha256, operationCount: audit.length, backupCreated: true };
}

function assertCurrentRevision(irFile, expectedRevision) {
  const current = sha256(fs.readFileSync(irFile));
  if (current !== expectedRevision) throw httpError(409, "review deck changed on disk; reload before applying changes");
}

function requireRevision(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw httpError(400, "a valid review deck revision is required");
  }
  return value;
}

function atomicWrite(file, content) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temp, content, { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") return reject(httpError(415, "content-type must be application/json"));
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) return reject(httpError(413, "request body is too large"));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(httpError(400, "request body is not valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function requireLocalOrigin(request) {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  let hostname;
  try { hostname = new URL(String(origin)).hostname; } catch { throw httpError(403, "invalid origin"); }
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") throw httpError(403, "non-local origin is forbidden");
}

function timingSafeToken(value, expected) {
  if (typeof value !== "string") return false;
  const actualBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendStatic(response, name, contentType) {
  const file = path.join(STATIC_DIR, name);
  const content = fs.readFileSync(file);
  response.writeHead(200, { "Content-Type": contentType, "Content-Length": content.length, "Cache-Control": "no-store" });
  response.end(content);
}

function sendJson(response, status, value) {
  if (response.headersSent) return;
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
  response.end(body);
}

function sendError(response, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : error instanceof ReviewPatchError ? 400 : 500;
  const message = status >= 500 ? "internal review studio error" : String(error.message || "request failed").slice(0, 500);
  sendJson(response, status, { error: message });
}

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function requireReadableFile(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required`);
  const file = path.resolve(value);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error(`${label} does not exist`);
  return file;
}

function isSupportedImage(file) { return /\.(?:png|jpe?g|gif|bmp|webp)$/i.test(file); }
function pickAllowed(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out = {};
  for (const key of keys) if (Object.hasOwn(value, key) && ["string", "number", "boolean"].includes(typeof value[key])) out[key] = value[key];
  return Object.keys(out).length > 0 ? out : undefined;
}
function pickFinite(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out = {};
  for (const key of keys) if (Number.isFinite(value[key])) out[key] = value[key];
  return Object.keys(out).length > 0 ? out : undefined;
}
function imageMime(file) {
  const extension = path.extname(file).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp" })[extension] || "application/octet-stream";
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }

module.exports = {
  MAX_BODY_BYTES,
  atomicWrite,
  buildReviewModel,
  createReviewStudioServer,
  handleRequest,
  persistReviewResult
};
