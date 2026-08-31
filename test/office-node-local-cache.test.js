"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { dependencyCacheKey, prepareNodeDependencies, workspaceLinksMatch } = require("../scripts/lib/office-node-dependencies");
const { inventory, localCacheContext, restoreLocalCache, saveLocalCache } = require("../scripts/lib/office-node-local-cache");

const identity = { node: "v22.18.0", npm: "10.9.3", platform: "win32", arch: "x64" };

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "office-node-local-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "checkout");
  const toolCache = path.join(temporary, "tools");
  fs.mkdirSync(toolCache);
  fs.mkdirSync(path.join(root, "packages", "demo"), { recursive: true });
  const manifest = { name: "local-cache-fixture", version: "1.0.0", private: true, workspaces: ["packages/*"] };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: manifest.name, version: "1.0.0", lockfileVersion: 3, packages: { "": manifest, "packages/demo": { name: "demo", version: "1.0.0" }, "node_modules/demo": { link: true, resolved: "packages/demo" } } }));
  fs.writeFileSync(path.join(root, "packages", "demo", "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }));
  fs.writeFileSync(path.join(root, "packages", "demo", "index.js"), "source must stay outside the cache");
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.symlinkSync(path.join(root, "packages", "demo"), path.join(root, "node_modules", "demo"), "junction");
  const environment = { RUNNER_TOOL_CACHE: toolCache, GITHUB_REPOSITORY: "example/tools", GITHUB_REF: "refs/heads/main" };
  const key = dependencyCacheKey(root, identity);
  const context = localCacheContext(root, key, environment);
  const clean = () => fs.rmSync(path.join(root, "node_modules"), { recursive: true });
  return { root, toolCache, context, key, environment, clean, temporary };
}

test("local Node cache restores dependencies without stale workspace source or npm install", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "node_modules", "fixture-data.txt"), "dependency");
  assert.equal(restoreLocalCache(f.context), false);
  saveLocalCache(f.context);
  assert.equal(fs.existsSync(path.join(f.context.entry, "payload", "node_modules", "demo")), false);
  f.clean();
  assert.equal(restoreLocalCache(f.context), true);
  assert.equal(fs.readFileSync(path.join(f.root, "node_modules", "fixture-data.txt"), "utf8"), "dependency");
  assert.equal(workspaceLinksMatch(f.root), false);
  const calls = [];
  const report = prepareNodeDependencies(f.root, "true", (_command, args) => { calls.push(args[1]); return { status: 0 }; });
  assert.equal(report.installed, false);
  assert.deepEqual(calls, ["ls"]);
  assert.equal(workspaceLinksMatch(f.root), true);
  assert.equal(fs.readFileSync(path.join(f.root, "packages", "demo", "index.js"), "utf8"), "source must stay outside the cache");
});

test("local cache restores workspace-local dependencies and passes a real offline npm health check", (t) => {
  const f = fixture(t);
  const nested = path.join(f.root, "packages", "demo", "node_modules");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, ".fixture"), "nested marker");
  saveLocalCache(f.context);
  f.clean();
  fs.rmSync(nested, { recursive: true });
  assert.equal(restoreLocalCache(f.context), true);
  assert.equal(fs.readFileSync(path.join(nested, ".fixture"), "utf8"), "nested marker");
  assert.equal(prepareNodeDependencies(f.root, "true").installed, false);
});

test("local cache is isolated by exact dependency key, repository and branch trust scope", (t) => {
  const f = fixture(t);
  saveLocalCache(f.context);
  for (const environment of [{ ...f.environment, GITHUB_REF: "refs/pull/7/merge" }, { ...f.environment, GITHUB_REPOSITORY: "other/tools" }]) {
    const context = localCacheContext(f.root, f.key, environment);
    assert.notEqual(context.entry, f.context.entry);
    assert.equal(restoreLocalCache(context), false);
  }
  const changed = localCacheContext(f.root, `office-node-v1-${"a".repeat(64)}`, f.environment);
  assert.equal(restoreLocalCache(changed), false);
  assert.doesNotMatch(JSON.stringify(JSON.parse(fs.readFileSync(path.join(f.context.entry, "entry.json"), "utf8"))), /example\/tools|refs\/heads|checkout/u);
});

test("local cache rejects empty, relative, overlapping and malformed location inputs", (t) => {
  const f = fixture(t);
  for (const cache of [undefined, "", "relative", path.parse(f.root).root, f.root, f.temporary, `${f.toolCache}\n`, path.join(f.root, "inside")]) {
    assert.throws(() => localCacheContext(f.root, f.key, { ...f.environment, RUNNER_TOOL_CACHE: cache }));
  }
  for (const key of ["", "../escape", "office-node-v1-invalid", `office-node-v1-${"a".repeat(65)}`]) assert.throws(() => localCacheContext(f.root, key, f.environment), /key/u);
  for (const ref of [undefined, "", "main", "refs/heads/a\nsecret", `refs/heads/${"a".repeat(241)}`]) assert.throws(() => localCacheContext(f.root, f.key, { ...f.environment, GITHUB_REF: ref }), /scope/u);
  for (const repository of [undefined, "", "owner", "owner/repo/extra", "secret\nvalue"]) assert.throws(() => localCacheContext(f.root, f.key, { ...f.environment, GITHUB_REPOSITORY: repository }), /scope/u);
});

test("local cache treats malformed, incomplete or mismatched markers as misses without checkout writes", (t) => {
  const f = fixture(t);
  saveLocalCache(f.context);
  const marker = path.join(f.context.entry, "entry.json");
  const valid = JSON.parse(fs.readFileSync(marker, "utf8"));
  f.clean();
  for (const text of ["{", "null", "x".repeat(16385), JSON.stringify({ ...valid, key: "wrong" }), JSON.stringify({ ...valid, scope: "wrong" }), JSON.stringify({ ...valid, roots: ["../escape"] }), JSON.stringify({ ...valid, roots: ["node_modules", "node_modules"] }), JSON.stringify({ ...valid, roots: [] })]) {
    fs.writeFileSync(marker, text);
    assert.equal(restoreLocalCache(f.context), false);
    assert.equal(fs.existsSync(path.join(f.root, "node_modules")), false);
  }
  fs.writeFileSync(marker, JSON.stringify(valid));
  fs.rmSync(path.join(f.context.entry, "payload"), { recursive: true });
  assert.equal(restoreLocalCache(f.context), false);
});

test("local cache refuses linked source, cache and destination boundaries without touching outside data", (t) => {
  const f = fixture(t);
  const outside = path.join(f.temporary, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "keep.txt"), "protected");
  const unsafe = path.join(f.root, "node_modules", "unsafe");
  fs.symlinkSync(outside, unsafe, "junction");
  assert.throws(() => saveLocalCache(f.context), /unsafe entry/u);
  fs.unlinkSync(unsafe);
  saveLocalCache(f.context);
  assert.throws(() => restoreLocalCache(f.context), /clean dependency targets/u);
  f.clean();
  const cachedLink = path.join(f.context.entry, "payload", "node_modules", "unsafe");
  fs.symlinkSync(outside, cachedLink, "junction");
  assert.throws(() => restoreLocalCache(f.context), /unsafe entry/u);
  assert.equal(fs.existsSync(path.join(f.root, "node_modules")), false);
  fs.unlinkSync(cachedLink);
  fs.symlinkSync(outside, path.join(f.root, "node_modules"), "junction");
  assert.throws(() => restoreLocalCache(f.context), /clean dependency targets/u);
  fs.unlinkSync(path.join(f.root, "node_modules"));
  const linkedCache = path.join(f.temporary, "linked-tools");
  fs.symlinkSync(f.toolCache, linkedCache, "junction");
  assert.throws(() => localCacheContext(f.root, f.key, { ...f.environment, RUNNER_TOOL_CACHE: linkedCache }), /boundary/u);
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "protected");
});

test("local cache repairs a bounded damaged snapshot only after successful dependency preparation", (t) => {
  const f = fixture(t);
  saveLocalCache(f.context);
  fs.writeFileSync(path.join(f.context.entry, "entry.json"), "invalid marker");
  saveLocalCache(f.context);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.context.entry, "entry.json"), "utf8")).key, f.key);
  assert.deepEqual(fs.readdirSync(f.context.managed), [path.basename(f.context.entry)]);
  fs.unlinkSync(path.join(f.root, "node_modules", "demo"));
  assert.throws(() => saveLocalCache(f.context), /source dependencies/u);
  assert.equal(fs.existsSync(path.join(f.context.entry, "entry.json")), true);
});

test("local cache inventory rejects hardlinks, oversized files and excessive nesting", (t) => {
  const f = fixture(t);
  const probe = path.join(f.temporary, "probe");
  fs.mkdirSync(probe);
  const target = path.join(probe, "file");
  fs.writeFileSync(target, "data");
  fs.linkSync(target, path.join(probe, "linked"));
  assert.throws(() => inventory(probe), /unsafe entry/u);
  fs.unlinkSync(path.join(probe, "linked"));
  fs.truncateSync(target, 1024 * 1024 * 1024 + 1);
  assert.throws(() => inventory(probe), /size exceeds/u);
  fs.unlinkSync(target);
  fs.mkdirSync(path.join(probe, ...Array(49).fill("d")), { recursive: true });
  assert.throws(() => inventory(probe), /inventory exceeds/u);
});

test("local cache does not publish partial snapshots or hide copy failures", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "node_modules", "fixture"), "dependency");
  saveLocalCache(f.context);
  const marker = fs.readFileSync(path.join(f.context.entry, "entry.json"), "utf8");
  const copyMock = t.mock.method(fs, "copyFileSync", () => { throw new Error("simulated-copy-failure"); });
  assert.throws(() => saveLocalCache(f.context), /simulated-copy-failure/u);
  assert.equal(fs.readFileSync(path.join(f.context.entry, "entry.json"), "utf8"), marker);
  assert.deepEqual(fs.readdirSync(f.context.managed), [path.basename(f.context.entry)]);
  copyMock.mock.restore();
});

test("local cache rejects a linked marker and unsafe replacement without following or deleting it", (t) => {
  const f = fixture(t);
  saveLocalCache(f.context);
  const marker = path.join(f.context.entry, "entry.json");
  const outside = path.join(f.temporary, "private.json");
  fs.writeFileSync(outside, "not cache data");
  fs.unlinkSync(marker);
  fs.linkSync(outside, marker);
  assert.throws(() => restoreLocalCache(f.context), /marker is unsafe/u);
  assert.throws(() => saveLocalCache(f.context), /unsafe entry/u);
  assert.equal(fs.readFileSync(outside, "utf8"), "not cache data");
});

test("Office workflow tries local cache first and never omits post-restore validation", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ppt-office-regression.yml"), "utf8");
  assert.match(workflow, /id: node-dependencies\r?\n        if: steps.node-dependency-key.outputs.local_hit != 'true'/u);
  assert.match(workflow, /OFFICE_NODE_CACHE_KEY: \$\{\{ steps.node-dependency-key.outputs.key \}\}/u);
  assert.match(workflow, /OFFICE_NODE_LOCAL_CACHE_HIT: \$\{\{ steps.node-dependency-key.outputs.local_hit \}\}/u);
  const prepare = workflow.slice(workflow.indexOf("      - name: Validate or install locked Node"), workflow.indexOf("      - name: Save validated Node"));
  assert.doesNotMatch(prepare, /\bif:/u);
  assert.match(prepare, /local_hit == 'true' && 'true' \|\| steps.node-dependencies.outputs.cache-hit/u);
  assert.match(prepare, /run: node scripts\/office-node-dependencies.js prepare/u);
});

test("local cache CLI fails before preparation on invalid context without revealing inputs", () => {
  const sensitive = "sensitive-local-cache-value";
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "office-node-dependencies.js"), "prepare"], {
    encoding: "utf8", windowsHide: true, timeout: 10000,
    env: { ...process.env, RUNNER_TOOL_CACHE: sensitive, OFFICE_NODE_LOCAL_CACHE_HIT: "false", OFFICE_NODE_CACHE_HIT: "false" }
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "Office Node dependency preparation failed; installation or validation did not complete");
  assert.equal(result.stderr.includes(sensitive), false);
});
