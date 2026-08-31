"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const { observeBrowserProcess, waitForBrowserPage } = require("../packages/project-audit-core/browser-startup");
const { discoverTestFiles } = require("../scripts/test-sharded");

function fixture() {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const monitor = observeBrowserProcess(child);
  let time = 0;
  return { child, monitor, clock: { now: () => time, pause: async (milliseconds) => { time += milliseconds; } } };
}

function diagnosis(error) {
  assert.match(error.message, /^browser startup failed /);
  assert.doesNotMatch(error.message, /PRIVATE|token|cookie|https?:\/\//);
  return JSON.parse(error.message.slice("browser startup failed ".length));
}

test("browser startup accepts a ready page and preserves bounded readiness polling", async () => {
  const { monitor, clock } = fixture();
  const page = { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:1234/devtools/page/test" };
  let probes = 0;
  const result = await waitForBrowserPage(1234, 1000, async (url) => {
    assert.equal(url, "http://127.0.0.1:1234/json/list");
    probes += 1;
    if (probes === 1) throw Object.assign(new Error("PRIVATE"), { code: "ECONNREFUSED" });
    return probes === 2 ? [] : [page];
  }, monitor, clock);
  assert.equal(result, page);
  assert.equal(probes, 3);
  assert.equal(clock.now(), 200);
});

test("browser startup bounds empty, malformed and unsafe endpoint responses without logging them", async () => {
  for (const response of [null, {}, [], [null], [{ type: "worker", webSocketDebuggerUrl: "ws://127.0.0.1:1234/" }], [{ type: "page", webSocketDebuggerUrl: "https://PRIVATE" }]]) {
    const { monitor, clock } = fixture();
    await assert.rejects(waitForBrowserPage(1234, 250, async () => response, monitor, clock), (error) => {
      assert.deepEqual(diagnosis(error), { reason: "deadline", errorCode: null, exitCode: null, signal: null, endpointError: null, probes: 3, elapsedMs: 250 });
      return true;
    });
  }
});

test("browser startup keeps only allowlisted endpoint errors", async () => {
  for (const code of ["ECONNREFUSED", "ETIMEDOUT", "PRIVATE_TOKEN"]) {
    const { monitor, clock } = fixture();
    await assert.rejects(waitForBrowserPage(1234, 100, async () => { throw Object.assign(new Error("PRIVATE_COOKIE"), { code }); }, monitor, clock), (error) => {
      assert.equal(diagnosis(error).endpointError, code === "PRIVATE_TOKEN" ? "unknown" : code);
      return true;
    });
  }
});

test("browser startup observes asynchronous spawn errors and removes owned listeners", async () => {
  const { child, monitor, clock } = fixture();
  const unrelated = () => {};
  child.on("error", unrelated);
  await assert.rejects(waitForBrowserPage(1234, 1000, async () => {
    child.emit("error", Object.assign(new Error("PRIVATE_EXECUTABLE"), { code: "ENOENT" }));
    return [];
  }, monitor, clock), (error) => {
    assert.deepEqual(diagnosis(error), { reason: "spawn-error", errorCode: "ENOENT", exitCode: null, signal: null, endpointError: null, probes: 1, elapsedMs: 0 });
    return true;
  });
  monitor.dispose();
  monitor.dispose();
  assert.deepEqual(child.listeners("error"), [unrelated]);
  assert.equal(child.listenerCount("exit"), 0);
});

test("browser startup rejects exit even if the endpoint returned a page and sanitizes extreme state", async () => {
  for (const [code, signal, expectedCode, expectedSignal] of [[0, null, 0, null], [23, "SIGTERM", 23, "SIGTERM"], [Infinity, "PRIVATE_SIGNAL", null, null], [2 ** 40, null, null, null]]) {
    const { child, monitor, clock } = fixture();
    await assert.rejects(waitForBrowserPage(1234, 1000, async () => {
      child.emit("exit", code, signal);
      return [{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:1234/" }];
    }, monitor, clock), (error) => {
      const result = diagnosis(error);
      assert.equal(result.reason, "process-exited");
      assert.equal(result.exitCode, expectedCode);
      assert.equal(result.signal, expectedSignal);
      assert.equal(result.elapsedMs, 0);
      return true;
    });
  }
});

test("browser startup regressions are discovered by common-tools and unit CI", () => {
  for (const suite of ["common-tools", "unit"]) {
    assert.ok(discoverTestFiles(path.resolve(__dirname, ".."), suite).some(({ file }) => path.basename(file) === path.basename(__filename)));
  }
});
