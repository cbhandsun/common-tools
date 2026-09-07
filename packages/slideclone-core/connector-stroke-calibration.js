"use strict";

const DEFAULT_MINIMUM_PT = 0.5;
const DEFAULT_MAXIMUM_PT = 8;
const DEFAULT_QUANTUM_PT = 0.25;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be a positive finite number`);
  return number;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function quantize(value, quantum) {
  return Math.round(value / quantum) * quantum;
}

function rejectIsolatedOutliers(values) {
  if (values.length < 4) return values;
  const center = median(values);
  const deviation = median(values.map((value) => Math.abs(value - center)));
  const tolerance = Math.max(0.5, deviation * 3);
  const retained = values.filter((value) => Math.abs(value - center) <= tolerance);
  return retained.length >= Math.ceil(values.length / 2) ? retained : values;
}

function calibrateConnectorStrokeWidth(input) {
  if (!isRecord(input)) throw new TypeError("connector stroke calibration input must be an object");
  const sourceImageWidthPx = finitePositive(input.sourceImageWidthPx, "source image width");
  const slideWidthPt = finitePositive(input.slideWidthPt, "slide width");
  const minimumPt = input.minimumPt === undefined ? DEFAULT_MINIMUM_PT : finitePositive(input.minimumPt, "minimum stroke width");
  const maximumPt = input.maximumPt === undefined ? DEFAULT_MAXIMUM_PT : finitePositive(input.maximumPt, "maximum stroke width");
  const quantumPt = input.quantumPt === undefined ? DEFAULT_QUANTUM_PT : finitePositive(input.quantumPt, "stroke width quantum");
  if (minimumPt > maximumPt) throw new RangeError("minimum stroke width cannot exceed maximum stroke width");

  const validSamples = (Array.isArray(input.sampledWidthsPx) ? input.sampledWidthsPx : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value <= sourceImageWidthPx * 0.1);
  const samples = rejectIsolatedOutliers(validSamples);
  const fallbackPt = input.fallbackPt === undefined ? undefined : finitePositive(input.fallbackPt, "fallback stroke width");
  if (samples.length === 0 && fallbackPt === undefined) throw new TypeError("connector stroke calibration requires a valid sample or fallback width");

  const pixelsPerPoint = sourceImageWidthPx / slideWidthPt;
  const observedStrokeWidthPx = samples.length > 0 ? median(samples) : null;
  const rawStrokeWidthPt = observedStrokeWidthPx === null ? fallbackPt : observedStrokeWidthPx / pixelsPerPoint;
  const strokeWidthPt = Math.max(minimumPt, Math.min(maximumPt, quantize(rawStrokeWidthPt, quantumPt)));
  return Object.freeze({
    strokeWidthPt,
    observedStrokeWidthPx,
    pixelsPerPoint,
    sampleCount: samples.length,
    usedFallback: samples.length === 0,
    quantumPt
  });
}

module.exports = { calibrateConnectorStrokeWidth };
