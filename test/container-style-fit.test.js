"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyContainerStyleOption,
  collectContainerStylePlan,
  describeContainerOption,
  normalizeContainerKind
} = require("../skills/pd-hifi-slideclone/scripts/lib/container-style-fit");

test("normalizeContainerKind infers banner, card, and strong-card containers", () => {
  assert.equal(normalizeContainerKind({ id: "banner" }), "banner");
  assert.equal(normalizeContainerKind({ id: "ui-card" }), "card");
  assert.equal(normalizeContainerKind({ id: "portal-button" }), "strong-card");
  assert.equal(normalizeContainerKind({ id: "misc-box" }), "container");
});

test("collectContainerStylePlan extracts rounded containers with candidate ranges", () => {
  const plan = collectContainerStylePlan(sampleIr(), {
    kindCandidates: {
      banner: { radiusRatio: [0.03, 0.04], shadowAlpha: [0.1, 0.13], shadowBlurPt: [3, 4], shadowDistancePt: [1], shadowAngleDeg: [45] }
    }
  });
  assert.equal(plan.length, 2);
  const banner = plan.find((entry) => entry.elementId === "banner");
  assert.deepEqual(banner.radiusRatio, [0.03, 0.04]);
  assert.deepEqual(banner.shadowAlpha, [0.1, 0.13]);
});

test("applyContainerStyleOption only changes the targeted container", () => {
  const ir = sampleIr();
  const target = collectContainerStylePlan(ir, { kindCandidates: {} }).find((entry) => entry.elementId === "banner");
  const result = applyContainerStyleOption(ir, target, {
    radiusRatio: 0.04,
    alpha: 0.15,
    blurPt: 4.4,
    distancePt: 1.2,
    angleDeg: 45,
    color: "#000000"
  });
  const banner = result.ir.pages[0].shapes.find((shape) => shape.id === "banner");
  const card = result.ir.pages[0].shapes.find((shape) => shape.id === "ui-card");
  assert.equal(result.changed, true);
  assert.equal(banner.style.radiusRatio, 0.04);
  assert.equal(banner.style.shadow.alpha, 0.15);
  assert.equal(card.style.radiusRatio, 0.06);
  assert.equal(ir.pages[0].shapes[0].style.radiusRatio, 0.035);
});

test("describeContainerOption renders a stable label", () => {
  const label = describeContainerOption({ elementId: "banner" }, {
    radiusRatio: 0.04,
    alpha: 0.15,
    blurPt: 4.4,
    distancePt: 1.2,
    angleDeg: 45
  });
  assert.match(label, /banner: radius=0.04/);
  assert.match(label, /alpha=0.15/);
});

function sampleIr() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      shapes: [
        {
          id: "banner",
          type: "rounded-rect",
          box: { x: 0, y: 0, w: 100, h: 20 },
          style: {
            radiusRatio: 0.035,
            shadow: { color: "#000000", alpha: 0.13, blurPt: 3.8, distancePt: 1.0, angleDeg: 45 }
          }
        },
        {
          id: "ui-card",
          type: "rounded-rect",
          box: { x: 0, y: 30, w: 100, h: 40 },
          style: {
            radiusRatio: 0.06,
            shadow: { color: "#000000", alpha: 0.16, blurPt: 4.2, distancePt: 1.3, angleDeg: 45 }
          }
        }
      ]
    }]
  };
}
