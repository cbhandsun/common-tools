"use strict";

function isResidualCropCoveredByText(imageBox, textBoxes = [], threshold = 0.25) {
  if (!validBox(imageBox) || !Array.isArray(textBoxes)) return false;
  const ratioThreshold = finiteRatio(threshold, 0.25);
  const imageArea = Number(imageBox.w) * Number(imageBox.h);
  return textBoxes.some((item) => {
    const textBox = item?.box;
    if (!validBox(textBox)) return false;
    return intersectionArea(imageBox, textBox) / imageArea >= ratioThreshold;
  });
}

function intersectionArea(a, b) {
  if (!validBox(a) || !validBox(b)) return 0;
  const left = Math.max(Number(a.x), Number(b.x));
  const top = Math.max(Number(a.y), Number(b.y));
  const right = Math.min(Number(a.x) + Number(a.w), Number(b.x) + Number(b.w));
  const bottom = Math.min(Number(a.y) + Number(a.h), Number(b.y) + Number(b.h));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function validBox(box) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite)
    && values[0] >= -100000
    && values[1] >= -100000
    && values[2] > 0
    && values[3] > 0
    && values[2] <= 100000
    && values[3] <= 100000;
}

function finiteRatio(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : fallback;
}

module.exports = {
  intersectionArea,
  isResidualCropCoveredByText
};
