"use strict";

function validBox(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [value.x, value.y, value.w, value.h].every(Number.isFinite)
    && [value.x + value.w, value.y + value.h].every(Number.isFinite)
    && value.w > 0 && value.h > 0;
}

// A crop owns only intersecting atoms. Keep uncertain evidence and the complete
// parent diagramUnderstanding; neither may be discarded to fit an admission budget.
function scopeResidualCropAtoms(layer, cropBox) {
  if (!layer || typeof layer !== "object" || !Array.isArray(layer.visualAtoms) || !validBox(cropBox)) return layer;
  return { ...layer, visualAtoms: layer.visualAtoms.filter(atom => {
    const box = atom?.box;
    if (!validBox(box)) return true;
    return box.x <= cropBox.x + cropBox.w && box.x + box.w >= cropBox.x
      && box.y <= cropBox.y + cropBox.h && box.y + box.h >= cropBox.y;
  }) };
}

module.exports = { scopeResidualCropAtoms };
