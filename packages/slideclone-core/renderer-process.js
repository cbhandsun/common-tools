"use strict";
// @ts-check

const { spawn, spawnSync } = require("child_process");

/** @param {import("child_process").ChildProcess} child @param {string} [platform] @param {typeof spawnSync} [runTaskkill] */
function terminateProcessTree(child, platform = process.platform, runTaskkill = spawnSync) {
  if (!child.pid) return;
  if (platform === "linux") { process.kill(-child.pid, "SIGKILL"); return; }
  if (platform === "win32") {
    const result = runTaskkill("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    if (result.error || (result.status !== 0 && result.status !== 128)) throw result.error || Object.assign(new Error("Windows renderer process tree could not be terminated"), { code: "TASKKILL_FAILED" });
    return;
  }
  child.kill("SIGKILL");
}

/** @param {unknown} command @param {unknown} args @param {string} platform */
function commandPlan(command, args, platform = process.platform) {
  if (typeof command !== "string" || !command || command.length > 32768 || command.includes("\0")
    || !Array.isArray(args) || args.length > 256 || args.some((value) => typeof value !== "string" || value.length > 32768 || value.includes("\0"))) {
    throw new TypeError("renderer command is invalid");
  }
  /** @type {string[]} */
  const values = [command, ...args];
  if (platform !== "win32" || !/\.(?:cmd|bat)$/i.test(command)) return { command, args: values.slice(1), windowsVerbatimArguments: false };
  // cmd expands these characters even when some appear inside quotes.
  // Batch wrappers accept only this bounded literal subset; native executables
  // continue to receive their original argument array without a shell.
  if (values.some((value) => /["&<>|^%!\r\n]/.test(value))) throw new TypeError("renderer batch arguments are invalid");
  return { command: "cmd.exe", args: ["/d", "/s", "/c", `"${values.map((value) => `"${value}"`).join(" ")}"`], windowsVerbatimArguments: true };
}

/** @param {unknown} command @param {unknown} args
 * @param {{ cwd?: string, maxBuffer?: number, timeout?: number, env?: NodeJS.ProcessEnv, isCancellationRequested?: () => boolean | Promise<boolean> }} options
 * @returns {Promise<{stdout: string, stderr: string}>} */
function run(command, args, options = {}) {
  const plan = commandPlan(command, args);
  const maxBuffer = options.maxBuffer ?? 20 * 1024 * 1024;
  const timeoutMs = options.timeout ?? 0;
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) throw new TypeError("renderer process limits are invalid");
  return new Promise((resolve, reject) => {
    /** @type {import("child_process").ChildProcessByStdio<null, import("stream").Readable, import("stream").Readable>} */
    let child;
    try {
      child = spawn(plan.command, plan.args, {
        cwd: options.cwd, windowsHide: true, detached: process.platform === "linux",
        windowsVerbatimArguments: plan.windowsVerbatimArguments,
        stdio: ["ignore", "pipe", "pipe"],
        env: options.env ? { ...process.env, ...options.env } : process.env
      });
    } catch {
      reject(Object.assign(new Error("renderer process could not start"), { stdout: "", stderr: "" }));
      return;
    }
    /** @type {Buffer[]} */
    const stdout = [];
    /** @type {Buffer[]} */
    const stderr = [];
    let outBytes = 0;
    let errBytes = 0;
    let reason = "";
    let settled = false;
    let terminationFailed = false;
    /** @type {NodeJS.Timeout | undefined} */
    let deadline;
    const kill = () => {
      try {
        terminateProcessTree(child);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) terminationFailed = true;
      }
    };
    /** @param {Error | null} error */
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearInterval(cancellationTimer);
      const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      stdout.length = 0; stderr.length = 0;
      if (error) reject(Object.assign(error, result)); else resolve(result);
    };
    /** @param {string} message */
    const stop = (message) => {
      if (settled || reason) return;
      reason = message;
      deadline = setTimeout(() => finish(new Error("renderer process termination was not confirmed")), 1000);
      kill();
    };
    const timer = timeoutMs ? setTimeout(() => stop("renderer process timed out"), timeoutMs) : undefined;
    let cancellationPending = false;
    const checkCancellation = () => {
      if (settled || reason || cancellationPending) return;
      cancellationPending = true;
      Promise.resolve().then(() => options.isCancellationRequested?.())
        .then((cancelled) => { if (cancelled) stop("editable job was cancelled"); })
        .catch(() => stop("editable job was cancelled"))
        .finally(() => { cancellationPending = false; });
    };
    const cancellationTimer = options.isCancellationRequested ? setInterval(checkCancellation, 250) : undefined;
    if (cancellationTimer) checkCancellation();
    child.stdout.on("data", (chunk) => {
      if (reason || settled) return;
      outBytes += chunk.length;
      if (outBytes > maxBuffer) stop("renderer stdout exceeds limits"); else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (reason || settled) return;
      errBytes += chunk.length;
      if (errBytes > maxBuffer) stop("renderer stderr exceeds limits"); else stderr.push(chunk);
    });
    child.once("error", () => { kill(); finish(new Error("renderer process could not start")); });
    child.once("close", (code, signal) => {
      if (settled) return;
      if (reason || code !== 0) {
        kill();
        finish(Object.assign(new Error(terminationFailed ? "renderer process termination was not confirmed" : reason || "renderer process failed"), { code, signal }));
      } else finish(null);
    });
  });

}

module.exports = { run, commandPlan, _private: { terminateProcessTree } };
