"use strict";

const ERROR_CODES = new Set(["ENOENT", "EACCES", "EPERM", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOBUFS"]);
const SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGINT"]);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const OUTPUT_LIMIT = 65536;
const DEVTOOLS_MARKER = Buffer.from("DevTools listening on ws://");

function safeErrorCode(error) { return ERROR_CODES.has(error?.code) ? error.code : "unknown"; }

function observeBrowserProcess(processHandle) {
  let spawnError = null;
  let exited = false;
  let exitCode = null;
  let signal = null;
  const output = { spawned: false, stdoutBytes: 0, stderrBytes: 0, devtoolsAnnounced: false, truncated: false };
  const matched = { stdoutBytes: 0, stderrBytes: 0 };
  const inspect = (key, chunk) => {
    if (!Buffer.isBuffer(chunk) && typeof chunk !== "string") return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const length = Math.min(bytes.length, OUTPUT_LIMIT - output[key]);
    output[key] += length;
    output.truncated ||= length < bytes.length;
    for (let index = 0; index < length && !output.devtoolsAnnounced; index += 1) {
      matched[key] = bytes[index] === DEVTOOLS_MARKER[matched[key]] ? matched[key] + 1 : bytes[index] === DEVTOOLS_MARKER[0] ? 1 : 0;
      if (matched[key] === DEVTOOLS_MARKER.length) output.devtoolsAnnounced = true;
    }
  };
  const onSpawn = () => { output.spawned = true; };
  const onStdout = (chunk) => inspect("stdoutBytes", chunk);
  const onStderr = (chunk) => inspect("stderrBytes", chunk);
  const onError = (error) => { spawnError = safeErrorCode(error); };
  const onExit = (code, exitSignal) => { exited = true; exitCode = code; signal = exitSignal; };
  processHandle.on?.("error", onError);
  processHandle.on?.("exit", onExit);
  processHandle.on?.("spawn", onSpawn);
  processHandle.stdout?.on("data", onStdout);
  processHandle.stderr?.on("data", onStderr);
  return {
    snapshot() {
      const code = exited ? exitCode : processHandle.exitCode;
      const exitSignal = exited ? signal : processHandle.signalCode;
      return {
        reason: spawnError ? "spawn-error" : exited || code != null || exitSignal != null ? "process-exited" : null,
        errorCode: spawnError,
        exitCode: Number.isSafeInteger(code) && Math.abs(code) <= 0xffffffff ? code : null,
        signal: SIGNALS.has(exitSignal) ? exitSignal : null,
        processOutput: { ...output }
      };
    },
    dispose() {
      processHandle.removeListener?.("error", onError);
      processHandle.removeListener?.("exit", onExit);
      processHandle.removeListener?.("spawn", onSpawn);
      processHandle.stdout?.removeListener("data", onStdout);
      processHandle.stderr?.removeListener("data", onStderr);
    }
  };
}

async function waitForBrowserPage(port, timeoutMs, fetchVersion, monitor, { now = Date.now, pause = delay } = {}) {
  const started = now();
  const deadline = started + timeoutMs;
  let probes = 0;
  let endpointError = null;
  const failure = (reason, state) => new Error(`browser startup failed ${JSON.stringify({
    reason, errorCode: state.errorCode, exitCode: state.exitCode, signal: state.signal,
    endpointError, probes: Math.min(probes, 10000), elapsedMs: Math.max(0, Math.min(3600000, now() - started)),
    ...(state.processOutput ? { processOutput: state.processOutput } : {})
  })}`);
  while (now() < deadline) {
    const before = monitor.snapshot();
    if (before.reason) throw failure(before.reason, before);
    let value;
    try {
      probes += 1;
      value = await fetchVersion(`http://127.0.0.1:${port}/json/list`);
    } catch (error) { endpointError = safeErrorCode(error); }
    const after = monitor.snapshot();
    if (after.reason) throw failure(after.reason, after);
    const page = Array.isArray(value) ? value.find((item) => item?.type === "page" && typeof item.webSocketDebuggerUrl === "string" && item.webSocketDebuggerUrl.startsWith("ws://127.0.0.1:")) : null;
    if (page) return page;
    await pause(Math.max(0, Math.min(100, deadline - now())));
  }
  const state = monitor.snapshot();
  throw failure(state.reason || "deadline", state);
}

module.exports = { observeBrowserProcess, waitForBrowserPage };
