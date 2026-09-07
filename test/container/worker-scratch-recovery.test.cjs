"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const fs = require("node:fs");
const path = require("node:path");

const image = "node@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46";
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, "isolated scratch container command failed");
  return result.stdout.trim();
}

async function readiness(id, count) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const records = docker(["logs", id]).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (records.length >= count) return records[count - 1];
    await delay(100);
  }
  throw new Error("isolated scratch container readiness timed out");
}

test("container restart discards interrupted Worker scratch and starts a fresh process tree", { timeout: 90000 }, async () => {
  const grandchild = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const child = `const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const p=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});p.once('spawn',()=>process.stdout.write(JSON.stringify({child:process.pid,grandchild:p.pid})+String.fromCharCode(10)));setInterval(()=>{},1000);`;
  const program = `const fs=require('node:fs'),{spawn}=require('node:child_process');const previous=fs.existsSync('/tmp/worker-leftover');fs.writeFileSync('/tmp/worker-leftover','fixture');const p=spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:['ignore','pipe','ignore']});p.stdout.once('data',data=>process.stdout.write(JSON.stringify({worker:process.pid,previous,...JSON.parse(data.toString().trim())})+String.fromCharCode(10)));setInterval(()=>{},1000);`;
  const id = docker(["run", "--detach", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "1", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", "--user", "10001:10001", image, "node", "-e", program]);
  assert.match(id, /^[a-f0-9]{64}$/);
  try {
    const first = await readiness(id, 1);
    assert.equal(first.worker, 1);
    assert.equal(first.previous, false);
    assert.ok(first.child > 1 && first.grandchild > first.child);
    const firstPid = Number(docker(["inspect", "--format", "{{.State.Pid}}", id]));
    assert.ok(firstPid > 0);
    const firstProcesses = docker(["top", id, "-eo", "pid"]).split(/\r?\n/).slice(1).map((value) => Number(value.trim()));
    assert.ok(firstProcesses.length >= 3);
    docker(["kill", "--signal", "KILL", id]);
    const stopped = JSON.parse(docker(["inspect", "--format", "{{json .State}}", id]));
    assert.equal(stopped.Running, false);
    assert.equal(stopped.Pid, 0);
    assert.equal(stopped.ExitCode, 137);
    docker(["start", id]);
    const second = await readiness(id, 2);
    assert.equal(second.worker, 1);
    assert.equal(second.previous, false, "the old tmpfs marker must not survive restart");
    const secondProcesses = docker(["top", id, "-eo", "pid"]).split(/\r?\n/).slice(1).map((value) => Number(value.trim()));
    assert.ok(secondProcesses.length >= 3);
    assert.ok(secondProcesses.every((pid) => !firstProcesses.includes(pid)), "restart uses a new container process tree");
  } finally { docker(["rm", "--force", id]); }
});

test("production image Worker keeps the tmpfs and direct process prerequisites", () => {
  const compose = fs.readFileSync(path.join(__dirname, "../../deploy/compose.team-api.yaml"), "utf8");
  const block = compose.split("\n  image-to-editable-worker:")[1].split(/\n  [a-z]/)[0];
  assert.match(block, /command: \["node", "packages\/remote-mcp-server\/bin\/common-tools-team-image-worker.js"\]/);
  assert.match(block, /tmpfs: \["\/tmp:rw,noexec,nosuid,size=256m"\]/);
  assert.match(block, /restart: unless-stopped/);
  assert.match(block, /read_only: true/);
});
