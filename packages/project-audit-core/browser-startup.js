"use strict";

const ERROR_CODES = new Set(["ENOENT", "EACCES", "EPERM", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOBUFS"]);
const SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGINT"]);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function safeErrorCode(error) { return ERROR_CODES.has(error?.code) ? error.code : "unknown"; }

function observeBrowserProcess(processHandle) {
  let spawnError = null;
  let exited = false;
  let exitCode = null;
  let signal = null;
  const onError = (error) => { spawnError = safeErrorCode(error); };
  const onExit = (code, exitSignal) => { exited = true; exitCode = code; signal = exitSignal; };
  processHandle.on?.("error", onError);
  processHandle.on?.("exit", onExit);
  return {
    snapshot() {
      const code = exited ? exitCode : processHandle.exitCode;
      const exitSignal = exited ? signal : processHandle.signalCode;
      return {
        reason: spawnError ? "spawn-error" : exited || code != null || exitSignal != null ? "process-exited" : null,
        errorCode: spawnError,
        exitCode: Number.isSafeInteger(code) && Math.abs(code) <= 0xffffffff ? code : null,
        signal: SIGNALS.has(exitSignal) ? exitSignal : null
      };
    },
    dispose() {
      processHandle.removeListener?.("error", onError);
      processHandle.removeListener?.("exit", onExit);
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
    endpointError, probes: Math.min(probes, 10000), elapsedMs: Math.max(0, Math.min(3600000, now() - started))
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
