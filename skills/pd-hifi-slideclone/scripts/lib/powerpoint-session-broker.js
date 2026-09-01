"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { URL_KEY, TOKEN_KEY } = require("./powerpoint-session-client");

const MAX_KEEPER_LINE_BYTES = 4096;
const KEEPER_TIMEOUT_MS = 120000;

async function startPowerPointSessionBroker(options = {}, dependencies = {}) {
  const startKeeper = dependencies.startKeeper || startPowerPointKeeper;
  const keeper = await startKeeper(options);
  const token = crypto.randomBytes(32).toString("base64url");
  const metrics = { requests: 0, rejected: 0 };
  let accepting = true;
  const server = http.createServer((request, response) => {
    if (!accepting) return sendJson(response, 503, { error: "session-stopping" });
    if (request.method !== "POST" || request.url !== "/v1/lease") return sendJson(response, 404, { error: "not-found" });
    if (!authorized(request.headers.authorization, token)) {
      metrics.rejected += 1;
      return sendJson(response, 401, { error: "unauthorized" });
    }
    if (request.headers["transfer-encoding"] !== undefined || request.headers["content-length"] !== "0") {
      metrics.rejected += 1;
      request.resume();
      return sendJson(response, 400, { error: "invalid-request" });
    }
    metrics.requests += 1;
    request.resume();
    sendJson(response, 200, { provider: "powerpoint-corpus-session-v1", ready: true });
  });
  try { await listen(server); }
  catch (error) {
    await keeper.close().catch(() => {});
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server).catch(() => {});
    await keeper.close().catch(() => {});
    throw new Error("PowerPoint session did not expose a local address");
  }
  let closePromise;
  return {
    env: Object.freeze({ [URL_KEY]: `http://127.0.0.1:${address.port}/`, [TOKEN_KEY]: token }),
    async close() {
      if (!closePromise) {
        closePromise = (async () => {
          accepting = false;
          let serverError;
          try { await closeServer(server); } catch (error) { serverError = error; }
          let keeperMetrics;
          let keeperError;
          try { keeperMetrics = await keeper.close(); } catch (error) { keeperError = error; }
          if (serverError && keeperError) throw new AggregateError([serverError, keeperError], "PowerPoint session cleanup failed");
          if (serverError || keeperError) throw new Error("PowerPoint session cleanup failed", { cause: serverError || keeperError });
          return Object.freeze({ ...metrics, ...safeKeeperMetrics(keeperMetrics) });
        })();
      }
      return closePromise;
    }
  };
}

async function startPowerPointKeeper({ startupTimeoutMs = 60000 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-powerpoint-session-"));
  const script = path.join(root, "keeper.ps1");
  fs.writeFileSync(script, keeperScript(), "utf8");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
  });
  const childExit = new Promise(resolve => {
    child.once("exit", code => resolve(code));
    child.once("error", () => resolve(null));
  });
  child.stdin.on("error", () => undefined);
  let stderrBytes = 0;
  child.stderr.on("data", chunk => { stderrBytes = Math.min(65536, stderrBytes + chunk.length); });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  try {
    const ready = await nextKeeperMessage(iterator, startupTimeoutMs);
    if (ready.status !== "ready") throw new Error("PowerPoint keeper did not become ready");
    let closePromise;
    return {
      async close() {
        if (!closePromise) {
          closePromise = (async () => {
            try {
              child.stdin.end("close\n");
              const closed = await nextKeeperMessage(iterator, KEEPER_TIMEOUT_MS);
              const exitCode = await waitForExit(child, childExit, KEEPER_TIMEOUT_MS);
              if (closed.status !== "closed" || exitCode !== 0) throw keeperCleanupError(closed);
              return { createMs: ready.createMs, quitMs: closed.quitMs, collectMs: closed.collectMs,
                waitMs: closed.waitMs, exitMs: closed.exitMs, releaseRemaining: closed.releaseRemaining, stderrBytes };
            } finally {
              lines.close();
              fs.rmSync(root, { recursive: true, force: true });
            }
          })();
        }
        return closePromise;
      }
    };
  } catch (error) {
    child.stdin.end();
    await waitForExit(child, childExit, 30000).catch(() => child.kill());
    lines.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error("PowerPoint keeper startup failed", { cause: error });
  }
}

function keeperScript() {
  return String.raw`$ErrorActionPreference = "Stop"
$mutex = $null; $held = $false; $app = $null; $powerPointProcess = $null
$stage = "initialization"
function Get-ErrorCode($Exception) {
  $value = $Exception
  for ($depth = 0; $depth -lt 4 -and $null -ne $value.InnerException; $depth++) { $value = $value.InnerException }
  if ($null -eq $value.HResult) { return $null }
  return ("0x{0:X8}" -f ([long]$value.HResult -band 4294967295L))
}
function Test-TransientComFailure($Exception) {
  return (Get-ErrorCode $Exception) -in @("0x80010001", "0x8001010A")
}
function Quit-PowerPointWithRetry($Application) {
  if ($null -eq $Application) { throw "PowerPoint application is unavailable" }
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try { $Application.Quit() | Out-Null; return }
    catch {
      if (-not (Test-TransientComFailure $_.Exception) -or $attempt -eq 5) { throw }
    }
    Start-Sleep -Milliseconds (200 * $attempt)
  }
}
try {
  $stage = "mutex"
  $mutex = New-Object System.Threading.Mutex($false, "Local\SlideclonePowerPointOpenGate")
  $held = $mutex.WaitOne(0)
  if (-not $held) { throw "PowerPoint session mutex unavailable" }
  $stage = "ownership"
  if (@(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count -ne 0) { throw "PowerPoint is already running" }
  $stage = "create"
  $create = [Diagnostics.Stopwatch]::StartNew()
  $app = New-Object -ComObject PowerPoint.Application
  $create.Stop()
  $powerPointProcesses = @(Get-Process -Name POWERPNT -ErrorAction Stop)
  if ($powerPointProcesses.Count -ne 1) { throw "PowerPoint session process ownership is ambiguous" }
  $powerPointProcess = $powerPointProcesses[0]
  [Console]::Out.WriteLine(([pscustomobject]@{status="ready";createMs=[long]$create.ElapsedMilliseconds}|ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  $stage = "command"
  if ([Console]::In.ReadLine() -ne "close") { throw "Invalid keeper command" }
  $stage = "quit"
  $quit = [Diagnostics.Stopwatch]::StartNew(); Quit-PowerPointWithRetry $app; $quit.Stop()
  $stage = "release"
  $remaining = [Runtime.InteropServices.Marshal]::ReleaseComObject($app); $app = $null
  $stage = "collect"
  $collect = [Diagnostics.Stopwatch]::StartNew(); [GC]::Collect(); $collect.Stop()
  $wait = [Diagnostics.Stopwatch]::StartNew(); [GC]::WaitForPendingFinalizers(); $wait.Stop()
  $stage = "process-exit"
  $exit = [Diagnostics.Stopwatch]::StartNew()
  if (-not $powerPointProcess.WaitForExit(30000)) { throw "PowerPoint process did not exit" }
  $exit.Stop()
  $stage = "complete"
  [Console]::Out.WriteLine(([pscustomobject]@{status="closed";quitMs=[long]$quit.ElapsedMilliseconds;releaseRemaining=[int]$remaining;collectMs=[long]$collect.ElapsedMilliseconds;waitMs=[long]$wait.ElapsedMilliseconds;exitMs=[long]$exit.ElapsedMilliseconds}|ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
catch {
  [Console]::Out.WriteLine(([pscustomobject]@{status="failed";phase=$stage;hresult=(Get-ErrorCode $_.Exception)}|ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  throw
}
finally {
  if ($app -ne $null) { try { $app.Quit() | Out-Null } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
  if ($held -and $mutex -ne $null) { try { $mutex.ReleaseMutex() } catch {} }
  if ($mutex -ne $null) { $mutex.Dispose() }
}`;
}

function keeperCleanupError(value) {
  const phases = new Set(["initialization", "mutex", "ownership", "create", "command", "quit", "release", "collect", "process-exit", "complete"]);
  const phase = phases.has(value?.phase) ? value.phase : "unknown";
  const hresult = /^0x[0-9A-F]{8}$/u.test(value?.hresult || "") ? value.hresult : null;
  const error = new Error("PowerPoint keeper cleanup failed");
  error.code = "POWERPOINT_KEEPER_CLEANUP";
  error.diagnostic = Object.freeze({ phase, hresult });
  return error;
}

async function nextKeeperMessage(iterator, timeoutMs) {
  const result = await withTimeout(iterator.next(), timeoutMs);
  if (result.done || Buffer.byteLength(result.value || "", "utf8") > MAX_KEEPER_LINE_BYTES) throw new Error("PowerPoint keeper output is invalid");
  let value;
  try { value = JSON.parse(result.value); } catch { throw new Error("PowerPoint keeper output is invalid"); }
  if (!value || typeof value.status !== "string") throw new Error("PowerPoint keeper output is invalid");
  return value;
}

function safeKeeperMetrics(value) {
  const result = {};
  for (const key of ["createMs", "quitMs", "collectMs", "waitMs", "exitMs", "releaseRemaining", "stderrBytes"]) {
    if (!Number.isSafeInteger(value?.[key]) || value[key] < 0 || value[key] > 86400000) throw new Error("PowerPoint keeper metrics are invalid");
    result[key] = value[key];
  }
  return result;
}

function waitForExit(child, exitPromise, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return withTimeout(exitPromise, timeoutMs);
}
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("PowerPoint keeper timed out")), timeoutMs); promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }); });
}
function listen(server) {
  return new Promise((resolve, reject) => {
    const failed = (error) => reject(error);
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => { server.off("error", failed); resolve(); });
  });
}
function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function authorized(header, token) { const value = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : ""; const actual = Buffer.from(value), expected = Buffer.from(token); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); }
function sendJson(response, status, payload) { const body = Buffer.from(JSON.stringify(payload)); response.writeHead(status, { "content-type": "application/json", "content-length": body.length, "cache-control": "no-store" }); response.end(body); }

module.exports = { keeperCleanupError, keeperScript, safeKeeperMetrics, startPowerPointKeeper, startPowerPointSessionBroker };
