"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  rankedOptionsForRole
} = require("../skills/pd-hifi-slideclone/scripts/lib/font-fast-rank");

test("rankedOptionsForRole returns ranked options when available", () => {
  const fallback = [
    { family: "SimHei", weight: "bold", sizeAdjustPt: 0 },
    { family: "Arial", weight: "bold", sizeAdjustPt: 1 }
  ];
  const rankResult = {
    data: {
      rankings: {
        title: [
          { option: { family: "Arial", weight: "bold", sizeAdjustPt: 1 }, score: 0.1 }
        ]
      }
    }
  };

  assert.deepEqual(rankedOptionsForRole(rankResult, "title", fallback), [
    { family: "Arial", weight: "bold", sizeAdjustPt: 1 }
  ]);
});

test("rankedOptionsForRole falls back when rank data is missing", () => {
  const fallback = [{ family: "SimHei", weight: "bold", sizeAdjustPt: 0 }];

  assert.equal(rankedOptionsForRole({ data: { rankings: {} } }, "title", fallback), fallback);
  assert.equal(rankedOptionsForRole(null, "title", fallback), fallback);
});
