"use strict";

// Compatibility entry for crop materializers; core owns the coordinate contract.
const { buildMinimumUnitCropEvidence } = require("../../../../packages/slideclone-core/graphic-crop-policy");
module.exports = { buildMinimumUnitCropEvidence };
