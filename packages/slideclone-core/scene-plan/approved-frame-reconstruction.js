"use strict";

// Explicit host API for the approved n4/n6/n8 approximation policy, with an
// optional separately approved n10 card-backdrop option, plus an independent
// exact transparent-pixel backdrop manifest and atomic host composition. The host
// authenticates approval and asset bindings before use. This API grants no
// strict source measurement, erasure capability, or whole-page acceptance.
const { fitApproximateFrame } = require("./approved-frame-fit");
const { createApprovedApproxFrameDrawSession } = require("./approved-frame-draw");
const { buildApproximateBackgroundPlan, applyApproximateBackgroundPlan } = require("./approved-frame-approximation");
const { applyApprovedFrameErasureReplay } = require("./approved-frame-erasure-replay");
const { createApprovedFrameAssetApplication } = require("./approved-frame-application");
const { createApprovedBackdropPixelApplication } = require("./approved-backdrop-pixel-application");
const { createApprovedBackdropPixelReplay } = require("./approved-backdrop-pixel-replay");
const { createApprovedOpaqueBackdropApplication } = require("./approved-opaque-backdrop-application");
const { composeApprovedAssetApplications } = require("./approved-frame-application-lifecycle");

module.exports = { fitApproximateFrame, createApprovedApproxFrameDrawSession, buildApproximateBackgroundPlan, applyApproximateBackgroundPlan, applyApprovedFrameErasureReplay, createApprovedFrameAssetApplication, createApprovedBackdropPixelApplication, createApprovedBackdropPixelReplay, createApprovedOpaqueBackdropApplication, composeApprovedAssetApplications };
