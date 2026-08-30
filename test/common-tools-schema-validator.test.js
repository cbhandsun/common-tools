"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { compileSchema } = require("../packages/mcp-server/schema-validator");

test("schema validator enforces boolean and const output boundaries", () => {
  const validate = compileSchema({ type: "object", required: ["ok", "kind", "untrustedContent"], properties: { ok: { type: "boolean" }, kind: { type: "string", const: "note" }, untrustedContent: { const: true } }, additionalProperties: false });
  assert.equal(validate({ ok: true, kind: "note", untrustedContent: true }), true);
  assert.equal(validate({ ok: "true", kind: "note", untrustedContent: true }), false);
  assert.equal(validate({ ok: true, kind: "job", untrustedContent: true }), false);
  assert.equal(validate({ ok: true, kind: "note", untrustedContent: false }), false);
  assert.equal(compileSchema({ const: true })(true), true);
  assert.equal(compileSchema({ const: true })(false), false);
});
