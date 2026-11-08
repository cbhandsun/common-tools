"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

// Model a synchronous Windows taskkill followed by the child's queued I/O
// notification. Advancing the clock does not dispatch timers during taskkill.
function rendererProcessHarness({ killMs = 0, treeStatus = 0, closeOnKill = true } = {}) {
  let now = 0, nextId = 0, treeCalls = 0, parentCalls = 0, unrefCalls = 0;
  const destroyedStreams = [];
  const timers = new Map(), io = [];
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.unref = () => { unrefCalls++; };
  for (const stream of ["stdout", "stderr"]) child[stream].destroy = () => { destroyedStreams.push(stream); };
  child.kill = () => { parentCalls++; if (closeOnKill) io.push(() => child.emit("close", null, "SIGKILL")); return true; };
  const schedule = (callback, delay, interval = false) => {
    const id = ++nextId;
    timers.set(id, { callback, due: now + delay, delay, interval });
    return id;
  };
  const filename = path.resolve(__dirname, "../../packages/slideclone-core/renderer-process.js");
  const moduleObject = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module: moduleObject, Buffer,
    process: { platform: "win32", env: {} },
    require: name => {
      if (name !== "child_process") throw new Error("Unexpected renderer dependency");
      return {
        spawn: () => child,
        spawnSync: () => {
          treeCalls++; now += killMs;
          if (treeStatus === 0 && closeOnKill) io.push(() => child.emit("close", null, "SIGKILL"));
          return { status: treeStatus };
        }
      };
    },
    setTimeout: (callback, delay) => schedule(callback, delay),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
  }, { filename });
  const dispatchTimers = () => {
    const due = [...timers.entries()].filter(([, timer]) => timer.due <= now).sort((a, b) => a[1].due - b[1].due);
    for (const [id, timer] of due) {
      if (!timers.has(id)) continue;
      if (timer.interval) timer.due = now + timer.delay; else timers.delete(id);
      timer.callback();
    }
  };
  return {
    run: moduleObject.exports.run, child,
    tick: ms => { now += ms; dispatchTimers(); },
    dispatchTimers,
    dispatchIo: () => { for (const callback of io.splice(0)) callback(); },
    stats: () => ({ now, treeCalls, parentCalls, unrefCalls, destroyedStreams: [...destroyedStreams], pendingTimers: timers.size })
  };
}

async function flushMicrotasks() {
  for (let step = 0; step < 8; step++) await Promise.resolve();
}

module.exports = { rendererProcessHarness, flushMicrotasks };
