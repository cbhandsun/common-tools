"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { compileSchema } = require("../packages/mcp-server/schema-validator");

test("schema validator enforces boolean and const output boundaries", () => {
  const validate = compileSchema({ type: "object", required: ["ok", "kind"], properties: { ok: { type: "boolean" }, kind: { type: "string", const: "note" } }, additionalProperties: false });
  assert.equal(validate({ ok: true, kind: "note" }), true);
  assert.equal(validate({ ok: "true", kind: "note" }), false);
  assert.equal(validate({ ok: true, kind: "job" }), false);
});
