"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _private } = require("../skills/pd-hifi-slideclone/scripts/lib/component-candidate-planner");

test("component query cache is content addressed by query and provider endpoint", () => {
  const left = _private.componentQueryIdentity({ provider: "islide", kind: "diagram", keywords: "流程", size: 3 }, { islideBaseUrl: "https://one.invalid" });
  const same = _private.componentQueryIdentity({ provider: "islide", kind: "diagram", keywords: "流程", size: 3 }, { islideBaseUrl: "https://one.invalid" });
  const changed = _private.componentQueryIdentity({ provider: "islide", kind: "diagram", keywords: "流程", size: 3 }, { islideBaseUrl: "https://two.invalid" });
  assert.equal(left.key, same.key);
  assert.notEqual(left.key, changed.key);
  assert.match(left.key, /^[a-f0-9]{64}$/);
});

test("component query cache roundtrips bounded normalized provider results", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-query-cache-"));
  const identity = _private.componentQueryIdentity({ provider: "officeplus", kind: "component", keywords: "闭环", size: 3 }, {});
  const result = { total: 1, documents: [{ id: "one", title: "闭环组件" }] };
  _private.writeComponentQueryCache(root, identity, result);
  assert.deepEqual(_private.readComponentQueryCache(root, identity), result);

  const cacheFile = path.join(root, `${identity.key}.json`);
  fs.writeFileSync(cacheFile, "{broken", "utf8");
  assert.equal(_private.readComponentQueryCache(root, identity), null);
});

test("component query concurrency rejects empty, excessive, and non-integer input", () => {
  assert.equal(_private.normalizeQueryConcurrency(undefined), 3);
  assert.equal(_private.normalizeQueryConcurrency(1), 1);
  assert.equal(_private.normalizeQueryConcurrency(8), 8);
  assert.throws(() => _private.normalizeQueryConcurrency(0), /integer from 1 to 8/);
  assert.throws(() => _private.normalizeQueryConcurrency(9), /integer from 1 to 8/);
  assert.throws(() => _private.normalizeQueryConcurrency(1.5), /integer from 1 to 8/);
});
