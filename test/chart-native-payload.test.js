"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  chartFallbackSignature,
  promoteNativeChartPayload,
  validateNativeChartPayload
} = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-payload");

function chart() {
  return {
    id: "sales",
    type: "column",
    box: { x: 10, y: 20, w: 400, h: 240 },
    categories: ["Q1", "Q2"],
    series: [{ name: "Revenue", values: [12.5, 19] }],
    style: { textColor: "#111111", barFill: "#2F80ED" }
  };
}

test("native chart payload binds verified data, type, and style to a deterministic hash", () => {
  const value = chart();
  value.nativePayload = promoteNativeChartPayload(value);
  assert.equal(validateNativeChartPayload(value).ok, true);
  assert.match(value.nativePayload.fallbackSha256, /^[a-f0-9]{64}$/);
  assert.equal(value.nativePayload.fallbackSignature, chartFallbackSignature(value));
});

test("native chart payload ignores geometry-only edits but rejects stale data and style", () => {
  const value = chart();
  value.nativePayload = promoteNativeChartPayload(value);
  value.box.x = 55;
  assert.equal(validateNativeChartPayload(value).ok, true);
  value.series[0].values[0] = 99;
  assert.match(validateNativeChartPayload(value).errors.join("\n"), /stale/);
  value.series[0].values[0] = 12.5;
  value.style.barFill = "#FF0000";
  assert.match(validateNativeChartPayload(value).errors.join("\n"), /stale/);
});

test("native chart payload rejects hash tampering, unsafe sheets, unsupported types, and nonfinite data", () => {
  const tampered = chart();
  tampered.nativePayload = { ...promoteNativeChartPayload(tampered), fallbackSha256: "0".repeat(64) };
  assert.match(validateNativeChartPayload(tampered).errors.join("\n"), /hash is invalid/);
  const unsafeSheet = chart();
  unsafeSheet.nativePayload = { ...promoteNativeChartPayload(unsafeSheet), workbook: { sheetName: "../../[bad]" } };
  assert.match(validateNativeChartPayload(unsafeSheet).errors.join("\n"), /sheetName is invalid/);
  const unsupported = { ...chart(), type: "radar" };
  assert.throws(() => promoteNativeChartPayload(unsupported), /not supported/);
  const nonfinite = chart();
  nonfinite.series[0].values[0] = Number.POSITIVE_INFINITY;
  assert.throws(() => promoteNativeChartPayload(nonfinite), /non-finite|finite numbers|unsupported/);
  const oversized = chart();
  oversized.categories = Array.from({ length: 10001 }, (_, index) => String(index));
  assert.throws(() => promoteNativeChartPayload(oversized), /10000 item limit/);
  const invalidSeries = chart();
  invalidSeries.series.push({ name: "broken", values: [1, Number.NaN] });
  assert.throws(() => promoteNativeChartPayload(invalidSeries), /finite numbers/);
});
