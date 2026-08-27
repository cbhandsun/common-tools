"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveImageExpressionFamily } = require("../skills/pd-hifi-slideclone/scripts/lib/expression-family-normalizer");

test("preserves explicit expression families", () => {
  assert.equal(resolveImageExpressionFamily({ source: { expressionFamily: "relationship-diagram", expressionForm: "icon-or-illustration" } }), "relationship-diagram");
});

test("normalizes stable image forms when the family is missing", () => {
  assert.equal(resolveImageExpressionFamily({ source: { expressionForm: "icon-or-illustration", expressionSubtype: "gem-node" } }), "pictorial-asset");
  assert.equal(resolveImageExpressionFamily({ source: { expressionForm: "screenshot-or-document", expressionSubtype: "portal screenshot" } }), "annotated-screenshot");
  assert.equal(resolveImageExpressionFamily({ source: { expressionForm: "table-or-matrix" } }), "layout-grid");
  assert.equal(resolveImageExpressionFamily({ source: { expressionForm: "linear-process-diagram" } }), "structured-process");
});

test("fails closed for unproven generic complex diagrams", () => {
  assert.equal(resolveImageExpressionFamily({ source: { expressionForm: "complex-diagram", expressionSubtype: "dense-complex-diagram" } }), "unknown");
  assert.equal(resolveImageExpressionFamily({ source: {} }), "unknown");
});
