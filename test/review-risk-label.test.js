"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeReviewRiskLabel} = require("../packages/slideclone-core/review-risk-reconstruction");
test("review labels strip paired punctuation while preserving label content", () => {
  assert.equal(normalizeReviewRiskLabel(" ( [ 【 Approved Asset 】 ] ) ：；， "), "approvedasset");
  assert.equal(normalizeReviewRiskLabel("‘Risk’\n“ProblemPool”"), "riskproblempool");
  assert.equal(normalizeReviewRiskLabel("（PRD）"), "prd");
  assert.equal(normalizeReviewRiskLabel(""), "");
  assert.equal(normalizeReviewRiskLabel("风险/问题-池"), "风险/问题-池");
});
