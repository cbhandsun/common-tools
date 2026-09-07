"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { promoteNativeChartPayload, validateDeckNativeChartPayloads } = require("../packages/slideclone-core/chart-native-payload");

function chart() {
  return {
    id: "sales",
    type: "column",
    box: { x: 10, y: 20, w: 400, h: 240 },
    categories: ["Q1", "Q2"],
    series: [{ name: "Revenue", values: [12.5, 19] }],
    style: { barFill: "#2F80ED" }
  };
}

function page(charts) {
  return { pageIndex: 0, charts };
}

test("native chart admission accepts verified payloads without mutation", () => {
  const value = chart();
  value.nativePayload = promoteNativeChartPayload(value);
  const pages = [page([value])];
  const before = structuredClone(pages);
  assert.doesNotThrow(() => validateDeckNativeChartPayloads(pages));
  assert.deepEqual(pages, before);
});

test("native chart admission preserves vector fallback for absent and null payloads", () => {
  assert.doesNotThrow(() => validateDeckNativeChartPayloads([]));
  assert.doesNotThrow(() => validateDeckNativeChartPayloads([page(undefined), page([]), page([chart(), { ...chart(), nativePayload: null }])]));
});

test("native chart admission rejects supplied malformed or stale payloads without input disclosure", () => {
  for (const nativePayload of [{}, 1, "payload", [], false]) {
    assert.throws(() => validateDeckNativeChartPayloads([page([{ ...chart(), nativePayload }])]), error => error.message === "editable deck native chart payload is invalid");
  }

  const stale = chart();
  stale.nativePayload = promoteNativeChartPayload(stale);
  stale.series[0].values[0] = 99;
  assert.throws(() => validateDeckNativeChartPayloads([page([stale])]), /editable deck native chart payload is invalid/);

  const forbiddenStyle = chart();
  forbiddenStyle.nativePayload = promoteNativeChartPayload(forbiddenStyle);
  forbiddenStyle.style = JSON.parse('{"__proto__":{"private":"private-chart-content"}}');
  assert.throws(() => validateDeckNativeChartPayloads([page([forbiddenStyle])]), error => error.message === "editable deck native chart payload is invalid" && !error.message.includes("private-chart-content"));

  for (const style of [[], "style"]) {
    const invalidStyle = chart();
    invalidStyle.nativePayload = promoteNativeChartPayload(invalidStyle);
    invalidStyle.style = style;
    assert.throws(() => validateDeckNativeChartPayloads([page([invalidStyle])]), /editable deck native chart payload is invalid/);
  }

  const unsupported = chart();
  unsupported.type = "radar";
  unsupported.nativePayload = promoteNativeChartPayload(chart());
  assert.throws(() => validateDeckNativeChartPayloads([page([unsupported])]), /editable deck native chart payload is invalid/);
});

test("native chart admission rejects invalid page structures with a fixed error", () => {
  assert.doesNotThrow(() => validateDeckNativeChartPayloads(Array.from({length:50}, () => ({}))));
  for (const pages of [null, {}, [null], [page({})], [page([null])], Array.from({length:51}, () => ({})), [page(Array(30001).fill(null))]]) {
    assert.throws(() => validateDeckNativeChartPayloads(pages), error => error.message === "editable deck native chart payload is invalid");
  }
});
