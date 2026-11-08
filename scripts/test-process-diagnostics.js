// @ts-check
"use strict";
const { types } = require("node:util");
const { createStderrSummary } = require('./test-process-stderr');

/** Read data only; diagnostics must never execute provider getters or proxies.
 * @param {unknown} value @param {string} key @returns {unknown} */
function own(value, key) {
  if (value === null || typeof value !== "object" || types.isProxy(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

const SIGNALS = new Set(["SIGABRT", "SIGALRM", "SIGBUS", "SIGFPE", "SIGHUP", "SIGILL", "SIGINT",
  "SIGKILL", "SIGPIPE", "SIGQUIT", "SIGSEGV", "SIGTERM", "SIGTRAP", "SIGUSR1", "SIGUSR2"]);

/** Only bounded process metadata is added; never serialize Error/message/stack.
 * Node's compact reporters can otherwise reduce a child crash to 'test failed'.
 * @param {unknown} event @returns {string|null} */
function formatProcessFailure(event) {
  if (own(event, "type") !== "test:fail") return null;
  const data = own(event, "data"), error = own(own(data, "details"), "error");
  const exit = own(error, "exitCode"), rawSignal = own(error, "signal");
  const exitCode = typeof exit === "number" && Number.isInteger(exit) && exit >= 0 && exit <= 0xFFFFFFFF ? exit : null;
  const signal = typeof rawSignal === "string" && SIGNALS.has(rawSignal) ? rawSignal : null;
  if (exitCode === null && signal === null) return null;
  const rawFile = own(data, "file"), name = typeof rawFile === "string" ? rawFile.replaceAll("\\", "/").split("/").at(-1) : undefined;
  const file = typeof name === "string" && /^[A-Za-z0-9_.-]{1,180}$/u.test(name) ? name : "unknown-test-file";
  return "# test-process-failure " + JSON.stringify({ file, exitCode, signal }) + "\n";
}

/** Supplement the selected built-in reporter without changing test outcomes.
 * @param {AsyncIterable<unknown>} source */
async function* processDiagnostics(source) {
  const stderr = createStderrSummary();
  for await (const event of source) {
    stderr.observe(event);
    const line = formatProcessFailure(event);
    if (line !== null) {
      yield line;
      const summary = stderr.take(event);
      if (summary !== null) {
        const file = JSON.parse(line.slice('# test-process-failure '.length)).file;
        yield '# test-process-stderr ' + JSON.stringify({ file, ...summary }) + '\n';
      }
    } else if (own(event, 'type') === 'test:pass' || own(event, 'type') === 'test:fail') stderr.take(event);
  }
}

module.exports = { processDiagnostics, formatProcessFailure };
