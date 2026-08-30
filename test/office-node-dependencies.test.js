"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { dependencyCacheKey, parseCacheHit, prepareNodeDependencies, workspaceLinksMatch } = require("../scripts/lib/office-node-dependencies");

const identity = Object.freeze({ node: "v22.18.0", npm: "10.9.3", platform: "win32", arch: "x64" });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "office-node-deps-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "packages", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  fs.writeFileSync(path.join(root, "packages", "demo", "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }));
  return root;
}

test("Office Node cache binds lock, all workspace manifests, checkout and runtime identity", (t) => {
  const root = fixture(t); const key = dependencyCacheKey(root, identity);
  assert.match(key, /^office-node-v1-[a-f0-9]{64}$/u);
  assert.equal(dependencyCacheKey(root, { ...identity }), key);
  for (const field of Object.keys(identity)) assert.notEqual(dependencyCacheKey(root, { ...identity, [field]: "different" }), key);
  assert.notEqual(dependencyCacheKey(fixture(t), identity), key);
  for (const relative of ["package.json", "package-lock.json", "packages/demo/package.json"]) {
    const file = path.join(root, relative); const original = fs.readFileSync(file);
    fs.appendFileSync(file, "\n"); assert.notEqual(dependencyCacheKey(root, identity), key); fs.writeFileSync(file, original);
  }
  fs.writeFileSync(path.join(root, ".npmrc"), "registry=https://registry.npmjs.org\n");
  assert.notEqual(dependencyCacheKey(root, identity), key);
  assert.doesNotMatch(dependencyCacheKey(root, identity), /registry/u);
});

test("Office Node cache rejects empty, unsafe and oversized identity or manifest boundaries", (t) => {
  const root = fixture(t);
  for (const value of [null, "", "relative", path.parse(root).root, `${root}\n`]) assert.throws(() => dependencyCacheKey(value, identity));
  for (const value of [null, {}, { ...identity, npm: "bad\nkey=injected" }, { ...identity, arch: "x".repeat(129) }]) assert.throws(() => dependencyCacheKey(root, value), /identity/u);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["../escape"] }));
  assert.throws(() => dependencyCacheKey(root, identity), /workspace layout/u);
  fs.writeFileSync(path.join(root, "package.json"), Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.throws(() => dependencyCacheKey(root, identity), /manifest/u);
  for (const value of [true, null, "TRUE", "false\ntrue", [], {}]) assert.throws(() => parseCacheHit(value), /cache hit/u);
  assert.equal(parseCacheHit("true"), true);
  for (const value of [undefined, "false", ""]) assert.equal(parseCacheHit(value), false);
});

test("Office Node exact healthy cache skips installation; miss and damaged cache reinstall once", (t) => {
  const root = fixture(t);
  for (const [hit, statuses, expected, commands] of [
    ["true", [0], { reused: true, installed: false, reason: "validated-cache-hit" }, ["ls"]],
    ["false", [0, 0], { reused: false, installed: true, reason: "cache-miss" }, ["ci", "ls"]],
    ["true", [1, 0, 0], { reused: false, installed: true, reason: "cache-validation-failed" }, ["ls", "ci", "ls"]]
  ]) {
    const calls = [];
    const report = prepareNodeDependencies(root, hit, (command, args, options) => {
      assert.equal(command, process.execPath); assert.equal(options.shell, false); assert.equal(options.stdio, "ignore");
      assert.equal(options.cwd, root); assert.ok(options.timeout <= 300_000); assert.ok(args.includes("--include=dev"));
      if (args[1] === "ci") assert.ok(args.includes("--ignore-scripts"));
      calls.push(args[1]); return { status: statuses[calls.length - 1] };
    });
    assert.deepEqual(report, expected); assert.deepEqual(calls, commands);
  }
});

test("Office Node install errors, timeouts and post-install failures cannot become green", (t) => {
  const root = fixture(t);
  for (const result of [undefined, { status: 1 }, { status: null, error: new Error("secret-value") }, { status: 0, error: new Error("secret-value") }]) {
    assert.throws(() => prepareNodeDependencies(root, "false", () => result), /installation failed/u);
  }
  let calls = 0;
  assert.throws(() => prepareNodeDependencies(root, "false", () => ({ status: calls++ === 0 ? 0 : 1 })), /validation failed/u);
  assert.throws(() => prepareNodeDependencies(root, "false", () => { throw new Error("token=secret-value"); }), /^Error: Office Node dependency command could not start$/u);
  assert.throws(() => prepareNodeDependencies(root, "true", null), /adapter/u);
});

test("Office Node cache requires live workspace links rather than stale copied workspace sources", (t) => {
  const root = fixture(t); const link = path.join(root, "node_modules", "demo");
  const writeLock = (resolved) => fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ packages: { "node_modules/demo": { link: true, resolved } } }));
  writeLock("packages/demo");
  assert.equal(workspaceLinksMatch(root), false);
  fs.mkdirSync(link, { recursive: true });
  assert.equal(workspaceLinksMatch(root), false);
  fs.rmdirSync(link); fs.symlinkSync(path.join(root, "packages", "demo"), link, "junction");
  assert.equal(workspaceLinksMatch(root), true);
  writeLock("../escape"); assert.throws(() => workspaceLinksMatch(root), /link is invalid/u);
});

test("Office Node CLI fails safely for invalid commands without exposing arguments", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "office-node-dependencies.js"), "secret-value"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /secret-value/u);
});

test("Office Node workflow restores exact caches only and retains validation and Office gates", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ppt-office-regression.yml"), "utf8");
  const nodeSteps = workflow.slice(workflow.indexOf("      - name: Identify locked Node"), workflow.indexOf("      - name: Prepare cached Python"));
  assert.match(nodeSteps, /office-node-dependencies\.js key/u);
  assert.match(nodeSteps, /office-node-dependencies\.js prepare/u);
  assert.match(nodeSteps, /OFFICE_NODE_CACHE_HIT:/u);
  assert.equal([...nodeSteps.matchAll(/packages\/\*\/node_modules/gu)].length, 2);
  assert.doesNotMatch(nodeSteps, /restore-keys:|continue-on-error:|always\(\)/u);
  assert.match(nodeSteps, /if: steps\.node-dependencies\.outputs\.cache-hit != 'true'/u);
  assert.match(workflow, /npm run audit:dotnet/u);
  assert.match(workflow, /npm run build:dotnet:locked/u);
  assert.match(workflow, /scripts\/run-office-ppt-regression\.js/u);
});
