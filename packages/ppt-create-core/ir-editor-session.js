"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { MAX_IR_BYTES, MAX_PATCH_BYTES, applyAndExportIrArtifacts, createIrPreviewHtml, validateEditableIr } = require("./ir-editor");

const LOOPBACK_HOST = "127.0.0.1";
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function json(response, statusCode, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}
function safeInput(workspaceRoot, value) {
  const candidate = insideRoot(workspaceRoot, path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value)); let info;
  try { info = fs.lstatSync(candidate); } catch { throw new Error("editable IR session input is unavailable"); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_IR_BYTES || path.extname(candidate).toLowerCase() !== ".json") throw new Error("editable IR session input is invalid");
  try { return insideRoot(workspaceRoot, fs.realpathSync.native(candidate)); } catch { throw new Error("editable IR session input is unavailable"); }
}
function readRequest(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on("data", (chunk) => { size += chunk.length; if (size > MAX_PATCH_BYTES) { reject(new Error("request-too-large")); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
function openDefaultBrowser(url, spawn) {
  const command = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", () => {});
  child.unref();
}

async function startIrEditorSession({ workspaceRoot, input, output, template, buildPptx, buildPdf, openBrowser = true, spawn = require("node:child_process").spawn, timeoutMs = SESSION_TIMEOUT_MS, finalize = applyAndExportIrArtifacts }) {
  if (typeof buildPptx !== "function" || typeof buildPdf !== "function" || typeof finalize !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > SESSION_TIMEOUT_MS) throw new TypeError("editable IR session configuration is invalid");
  const root = fs.realpathSync.native(path.resolve(workspaceRoot)); const inputFile = safeInput(root, input);
  const outputPath = insideRoot(root, path.isAbsolute(output) ? output : path.resolve(root, output));
  const templatePath = template === undefined ? undefined : insideRoot(root, path.isAbsolute(template) ? template : path.resolve(root, template));
  const ir = validateEditableIr(JSON.parse(fs.readFileSync(inputFile, "utf8"))); const token = crypto.randomBytes(32).toString("base64url"); const sessionPath = `/session/${token}`; let busy = false; let completed = false;
  let resolveCompletion; const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const server = http.createServer(async (request, response) => {
    const address = server.address(); const expectedHost = `${LOOPBACK_HOST}:${address.port}`; const origin = `http://${expectedHost}`;
    if (request.headers.host !== expectedHost || (request.headers.origin !== undefined && request.headers.origin !== origin)) return json(response, 403, { code: "SESSION_FORBIDDEN", message: "编辑会话请求被拒绝" });
    if (request.method === "GET" && request.url === sessionPath) {
      const html = Buffer.from(createIrPreviewHtml(ir, { assetRoot: path.dirname(inputFile), sessionEndpoint: `${sessionPath}/finalize`, sessionToken: token }), "utf8");
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": html.length, "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" }); response.end(html); return;
    }
    if (request.method !== "POST" || request.url !== `${sessionPath}/finalize` || request.headers["x-common-tools-session"] !== token || request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json(response, 404, { code: "SESSION_NOT_FOUND", message: "编辑会话不可用" });
    if (completed) return json(response, 409, { code: "SESSION_COMPLETED", message: "该编辑会话已经完成" });
    if (busy) return json(response, 409, { code: "SESSION_BUSY", message: "正在生成，请勿重复提交" });
    busy = true; let patchFile;
    try {
      const body = await readRequest(request); if (!body.length) return json(response, 400, { code: "PATCH_INVALID", message: "编辑补丁无效" });
      patchFile = insideRoot(root, path.join(root, `.common-tools-editor-session-${crypto.randomUUID()}.json`)); fs.writeFileSync(patchFile, body, { flag: "wx", mode: 0o600 });
      const result = finalize({ workspaceRoot: root, input: inputFile, patch: patchFile, output: outputPath, template: templatePath, buildPptx, buildPdf }); completed = true;
      json(response, 200, { code: "EXPORT_COMPLETED", output: path.relative(root, result.output), revision: result.revision, operationCount: result.operationCount }); resolveCompletion({ status: "completed", result }); setImmediate(() => server.close());
    } catch { json(response, 422, { code: "EXPORT_FAILED", message: "生成失败；输出未发布，请检查输入与本地运行环境后重试" }); }
    finally { busy = false; if (patchFile) fs.rmSync(patchFile, { force: true }); }
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, LOOPBACK_HOST, resolve); });
  const url = `http://${LOOPBACK_HOST}:${server.address().port}${sessionPath}`; const timer = setTimeout(() => { if (!completed) { resolveCompletion({ status: "expired" }); server.close(); } }, timeoutMs); timer.unref();
  server.once("close", () => clearTimeout(timer)); if (openBrowser) openDefaultBrowser(url, spawn);
  return Object.freeze({ url, completion, close: () => server.close() });
}

module.exports = { LOOPBACK_HOST, SESSION_TIMEOUT_MS, startIrEditorSession };
