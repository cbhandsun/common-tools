"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const test = require("node:test");
const fs = require("node:fs");
const { runProcess } = require("../../packages/slideclone-core/team-ocr-profile");
const { run: runRenderer } = require("../../packages/slideclone-core/renderer-process");

assert.equal(process.platform, "linux", "Run this Linux signal gate in Linux CI or a Linux container");

for (const termination of ["timeout", "cancelled"]) {
test(`renderer ${termination} kills an uncooperative launcher and its descendant`, { timeout: 10000 }, async () => {
  let ids;
  const startedAt = Date.now();
  const leaf = "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)";
  const program = [
    "process.on('SIGTERM',()=>{});",
    `const leaf=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','ignore','ignore','ipc']});`,
    "leaf.once('message',()=>process.stdout.write(JSON.stringify([process.pid,leaf.pid])));",
    "setInterval(()=>{},1000);"
  ].join("\n");
  try {
    await assert.rejects(runRenderer(process.execPath, ["-e", program], { timeout: termination === "timeout" ? 1500 : 5000, isCancellationRequested: () => termination === "cancelled" && Date.now() - startedAt >= 1000 }), (error) => {
      ids = JSON.parse(error.stdout);
      assert.equal(error.signal, "SIGKILL");
      assert.equal(error.message, termination === "timeout" ? "renderer process timed out" : "editable job was cancelled");
      return true;
    });
    assert.equal(ids.length, 2);
    const active = (pid) => {
      try { return !/^\d+ \(.*\) [ZX] /.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8")); }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    };
    for (let i = 0; i < 50 && ids.some(active); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(ids.some(active), false, "neither renderer process can continue executing");
  } finally {
    if (ids?.[0]) {
      try { process.kill(-ids[0], "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
});

}

for (const parentIgnoresTerm of [false, true]) {
  test(`OCR cancellation stops descendants when parent ignores TERM: ${parentIgnoresTerm}`, { timeout: 15000 }, async () => {
    let child;
    let descendant;
    let output = "";
    const leaf = "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)";
    const program = [
      parentIgnoresTerm ? "process.on('SIGTERM',()=>{});" : "",
      `const leaf=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','ignore','ignore','ipc']});`,
      "leaf.once('message',()=>process.stdout.write(String(leaf.pid)+'\\n'));",
      "setInterval(()=>{},1000);"
    ].join("\n");
    try {
      await assert.rejects(runProcess({
        executable: process.execPath, args: ["-e", program], timeoutMs: 10000,
        isCancellationRequested: () => Boolean(descendant),
        spawn: (executable, args, options) => {
          assert.equal(options.detached, true);
          child = spawn(executable, args, options);
          child.stdout.on("data", (chunk) => {
            output += chunk.toString();
            if (/^\d+\n$/.test(output)) descendant = Number(output.trim());
          });
          return child;
        }
      }), (error) => error.message === "raw image OCR was cancelled");
      assert.ok(descendant > 0, "descendant installed its handler before cancellation");
      // Orphan zombies await the container init reaper; they cannot execute work.
      const running = () => {
        try { return !/^\d+ \(.*\) [ZX] /.test(fs.readFileSync(`/proc/${descendant}/stat`, "utf8")); }
        catch (error) { if (error.code === "ENOENT") return false; throw error; }
      };
      for (let i = 0; i < 50 && running(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(running(), false, "descendant cannot outlive cancelled OCR work");
      assert.throws(() => process.kill(child.pid, 0), (error) => error.code === "ESRCH");
    } finally {
      if (child?.pid) {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  });
}

for (const scenario of ["timeout", "cancelled", "output-limit"]) {
  test(`real Linux OCR child ignoring SIGTERM is forcibly closed after ${scenario}`, { timeout: 15000 }, async () => {
    let child;
    let ready = false;
    let closed = false;
    let exitSignal;
    const signals = [];
    const program = [
      "process.on('SIGTERM', () => {});",
      "process.stdout.write('ready\\n');",
      "setInterval(() => {}, 1000);",
      scenario === "output-limit" ? "setTimeout(() => process.stdout.write(Buffer.alloc(1024 * 1024)), 100);" : ""
    ].join("\n");
    try {
      await assert.rejects(() => runProcess({
        executable: process.execPath,
        args: ["-e", program],
        timeoutMs: scenario === "timeout" ? 3000 : 10000,
        isCancellationRequested: () => scenario === "cancelled" && ready,
        spawn: (executable, args, options) => {
          child = spawn(executable, args, options);
          child.stdout.on("data", (chunk) => { if (chunk.toString("utf8").includes("ready")) ready = true; });
          child.once("close", (_code, signal) => { closed = true; exitSignal = signal; });
          const kill = child.kill.bind(child);
          child.kill = (signal) => { signals.push(signal); return kill(signal); };
          return child;
        }
      }), (error) => {
        const expected = scenario === "timeout" ? "raw image OCR timed out"
          : scenario === "cancelled" ? "raw image OCR was cancelled" : "raw image OCR output exceeds limits";
        assert.equal(error.message, expected);
        return true;
      });
      assert.equal(ready, true, "child installed its SIGTERM handler before stop");
      assert.deepEqual(signals, [], "Linux termination targets the dedicated process group");
      assert.equal(closed, true, "runner must wait for confirmed closure");
      assert.equal(exitSignal, "SIGKILL");
      assert.throws(() => process.kill(child.pid, 0), (error) => error.code === "ESRCH", "child was reaped");
    } finally {
      if (child && !closed) {
        const closure = new Promise((resolve) => child.once("close", resolve));
        child.kill("SIGKILL");
        await closure;
      }
    }
  });
}
