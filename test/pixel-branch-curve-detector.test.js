"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  measureBranchCurves,
  measureBranchCurvesFromAnchors
} = require("../skills/pd-hifi-slideclone/scripts/lib/pixel-branch-curve-detector");

test("pixel branch detector measures three blue curved routes", () => {
  const image = blankImage(960, 540);
  const starts = [{ x: 236, y: 244 }, { x: 236, y: 290 }, { x: 236, y: 334 }];
  const ends = [{ x: 456, y: 151.5 }, { x: 456, y: 275.5 }, { x: 456, y: 398.5 }];
  drawBezier(image, starts[0], { x: 320, y: 244 }, { x: 330, y: 151.5 }, ends[0], 12);
  drawBezier(image, starts[1], { x: 320, y: 290 }, { x: 370, y: 275.5 }, ends[1], 12);
  drawBezier(image, starts[2], { x: 320, y: 334 }, { x: 335, y: 398.5 }, ends[2], 12);

  const result = measureBranchCurves(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    startPoints: starts,
    endPoints: ends
  });

  assert.equal(result.ok, true);
  assert.equal(result.measuredRoutes, 3);
  assert.ok(result.confidence > 0.65);
  assert.ok(result.curves.every((curve) => curve.coverage >= 0.9));
  assert.ok(result.curves.every((curve) => curve.points.length >= 10));
});

test("pixel branch detector uses a supplied seed curve to stay on a crossed route", () => {
  const image = blankImage(960, 540);
  const start = { x: 180, y: 250 };
  const end = { x: 460, y: 250 };
  // The two lines cross; only the seeded arch belongs to the route of interest.
  drawBezier(image, start, { x: 250, y: 250 }, { x: 365, y: 40 }, end, 8);
  drawBezier(image, { x: 180, y: 180 }, { x: 270, y: 180 }, { x: 370, y: 350 }, { x: 460, y: 320 }, 8);

  const result = measureBranchCurves(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    startPoints: [start],
    endPoints: [end],
    seedCurves: [[start, { x: 310, y: 100 }, end]],
    searchRadiusPt: 34
  });

  assert.equal(result.ok, true);
  assert.ok(Math.min(...result.curves[0].points.map((point) => point.y)) < 170);
});

test("pixel branch detector fails closed for blank or interrupted evidence", () => {
  const blank = blankImage(960, 540);
  const options = {
    slideSize: { widthPt: 960, heightPt: 540 },
    startPoints: [{ x: 236, y: 244 }],
    endPoints: [{ x: 456, y: 151.5 }]
  };
  assert.equal(measureBranchCurves(blank, options).ok, false);

  drawBezier(blank, options.startPoints[0], { x: 270, y: 244 }, { x: 280, y: 220 }, { x: 300, y: 210 }, 10);
  const interrupted = measureBranchCurves(blank, options);
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.reason, "incomplete-route-evidence");
});

test("pixel branch detector infers route endpoints from source and target anchor boxes", () => {
  const image = blankImage(960, 540);
  const starts = [{ x: 236, y: 244 }, { x: 236, y: 290 }, { x: 236, y: 334 }];
  const ends = [{ x: 456, y: 151.5 }, { x: 456, y: 275.5 }, { x: 456, y: 398.5 }];
  drawBezier(image, starts[0], { x: 320, y: 244 }, { x: 330, y: 151.5 }, ends[0], 12);
  drawBezier(image, starts[1], { x: 320, y: 290 }, { x: 370, y: 275.5 }, ends[1], 12);
  drawBezier(image, starts[2], { x: 320, y: 334 }, { x: 335, y: 398.5 }, ends[2], 12);

  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 96, y: 216, w: 148, h: 148 },
    targetBoxes: [
      { x: 448, y: 100, w: 482, h: 103 },
      { x: 448, y: 224, w: 482, h: 103 },
      { x: 448, y: 347, w: 482, h: 103 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.direction, "right");
  assert.equal(result.routeColorMode, "auto-blue-family");
  assert.match(result.routeColor, /^#[0-9a-f]{6}$/);
  assert.equal(result.measuredRoutes, 3);
  assert.equal(result.inferredStartPoints.length, 3);
  assert.ok(result.inferredStartPoints[0].x < result.sampledStartIntersections[0].x);
  assert.ok(result.inferredEndPoints[0].x > result.sampledEndIntersections[0].x);
  assert.ok(Math.abs(result.inferredStartPoints[1].y - 290) < 8);
  assert.ok(Math.abs(result.inferredEndPoints[2].y - 398.5) < 8);
});

test("pixel branch detector learns orange connector color from the route corridor", () => {
  const image = blankImage(960, 540);
  const color = { r: 238, g: 112, b: 42, a: 255 };
  const starts = [{ x: 236, y: 245 }, { x: 236, y: 330 }];
  const ends = [{ x: 456, y: 170 }, { x: 456, y: 370 }];
  drawBezier(image, starts[0], { x: 315, y: 245 }, { x: 350, y: 170 }, ends[0], 12, color);
  drawBezier(image, starts[1], { x: 315, y: 330 }, { x: 350, y: 370 }, ends[1], 12, color);

  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 96, y: 216, w: 148, h: 148 },
    targetBoxes: [
      { x: 448, y: 120, w: 482, h: 100 },
      { x: 448, y: 320, w: 482, h: 100 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.routeColorMode, "auto-corridor-cluster");
  assert.match(result.routeColor, /^#e[e-f][6-8][0-9a-f][2-3][0-9a-f]$/);
  assert.ok(result.routeColorConfidence >= 0.12);
  assert.ok(result.curves.every((curve) => curve.coverage >= 0.9));
});

test("pixel branch detector can disable automatic color inference and fail closed on non-blue routes", () => {
  const image = blankImage(960, 540);
  drawBezier(
    image,
    { x: 236, y: 270 }, { x: 315, y: 270 }, { x: 360, y: 200 }, { x: 456, y: 200 },
    12, { r: 40, g: 175, b: 95, a: 255 }
  );
  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 96, y: 216, w: 148, h: 148 },
    targetBoxes: [{ x: 448, y: 150, w: 482, h: 100 }],
    autoRouteColor: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "anchor-intersection-evidence-missing");
});

test("pixel branch detector measures a mirrored right-to-left branch layout", () => {
  const image = blankImage(960, 540);
  const color = { r: 40, g: 175, b: 95, a: 255 };
  const starts = [{ x: 724, y: 244 }, { x: 724, y: 334 }];
  const ends = [{ x: 504, y: 170 }, { x: 504, y: 370 }];
  drawBezier(image, starts[0], { x: 650, y: 244 }, { x: 590, y: 170 }, ends[0], 12, color);
  drawBezier(image, starts[1], { x: 650, y: 334 }, { x: 590, y: 370 }, ends[1], 12, color);

  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 716, y: 216, w: 148, h: 148 },
    targetBoxes: [
      { x: 30, y: 120, w: 482, h: 100 },
      { x: 30, y: 320, w: 482, h: 100 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.direction, "left");
  assert.equal(result.routeColorMode, "auto-corridor-cluster");
  assert.equal(result.measuredRoutes, 2);
  assert.ok(result.inferredStartPoints[0].x > result.sampledStartIntersections[0].x);
  assert.ok(result.inferredEndPoints[0].x < result.sampledEndIntersections[0].x);
});

test("pixel branch detector measures a vertical top-to-bottom branch layout", () => {
  const image = blankImage(960, 540);
  const color = { r: 218, g: 61, b: 72, a: 255 };
  const starts = [{ x: 430, y: 172 }, { x: 530, y: 172 }];
  const ends = [{ x: 270, y: 338 }, { x: 690, y: 338 }];
  drawBezier(image, starts[0], { x: 430, y: 235 }, { x: 270, y: 270 }, ends[0], 12, color);
  drawBezier(image, starts[1], { x: 530, y: 235 }, { x: 690, y: 270 }, ends[1], 12, color);

  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 400, y: 70, w: 160, h: 110 },
    targetBoxes: [
      { x: 150, y: 330, w: 240, h: 100 },
      { x: 570, y: 330, w: 240, h: 100 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.direction, "down");
  assert.equal(result.routeColorMode, "auto-corridor-cluster");
  assert.equal(result.measuredRoutes, 2);
  assert.ok(result.inferredStartPoints[0].y < result.sampledStartIntersections[0].y);
  assert.ok(result.inferredEndPoints[0].y > result.sampledEndIntersections[0].y);
  assert.ok(result.curves.every((curve) => curve.coverage >= 0.9));
});

test("pixel branch detector measures a gray bottom-to-top branch layout", () => {
  const image = blankImage(960, 540);
  const color = { r: 88, g: 96, b: 105, a: 255 };
  const starts = [{ x: 430, y: 368 }, { x: 530, y: 368 }];
  const ends = [{ x: 270, y: 192 }, { x: 690, y: 192 }];
  drawBezier(image, starts[0], { x: 430, y: 300 }, { x: 270, y: 250 }, ends[0], 12, color);
  drawBezier(image, starts[1], { x: 530, y: 300 }, { x: 690, y: 250 }, ends[1], 12, color);

  const result = measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 400, y: 360, w: 160, h: 110 },
    targetBoxes: [
      { x: 150, y: 100, w: 240, h: 100 },
      { x: 570, y: 100, w: 240, h: 100 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.direction, "up");
  assert.equal(result.routeColorMode, "auto-corridor-cluster");
  assert.equal(result.measuredRoutes, 2);
  assert.ok(result.inferredStartPoints[0].y > result.sampledStartIntersections[0].y);
  assert.ok(result.inferredEndPoints[0].y < result.sampledEndIntersections[0].y);
  assert.ok(result.curves.every((curve) => curve.coverage >= 0.9));
});

test("pixel branch detector rejects malformed and extreme boundary inputs", () => {
  const image = blankImage(20, 20);
  assert.equal(measureBranchCurves(null, {}).reason, "invalid-image");
  assert.equal(measureBranchCurves(image, { slideSize: { widthPt: 0, heightPt: 540 } }).reason, "invalid-slide-size");
  assert.equal(measureBranchCurves(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    startPoints: [{ x: -1, y: 0 }],
    endPoints: [{ x: 10, y: 10 }]
  }).reason, "invalid-endpoints");
  assert.equal(measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 0, y: 0, w: -1, h: 10 },
    targetBoxes: []
  }).reason, "invalid-anchor-boxes");
  assert.equal(measureBranchCurvesFromAnchors(image, {
    slideSize: { widthPt: 960, heightPt: 540 },
    sourceBox: { x: 400, y: 200, w: 100, h: 100 },
    targetBoxes: [
      { x: 100, y: 200, w: 100, h: 100 },
      { x: 700, y: 200, w: 100, h: 100 }
    ]
  }).reason, "ambiguous-anchor-layout");
});

function blankImage(width, height) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  return { width, height, rgba };
}

function drawBezier(image, start, control1, control2, end, width, color = { r: 5, g: 120, b: 220, a: 255 }) {
  for (let index = 0; index <= 400; index += 1) {
    const t = index / 400;
    const x = cubic(start.x, control1.x, control2.x, end.x, t);
    const y = cubic(start.y, control1.y, control2.y, end.y, t);
    drawDisk(image, x, y, width / 2, color);
  }
}

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function drawDisk(image, centerX, centerY, radius, color) {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(image.width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(image.height - 1, Math.ceil(centerY + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) continue;
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = color.r;
      image.rgba[offset + 1] = color.g;
      image.rgba[offset + 2] = color.b;
      image.rgba[offset + 3] = color.a;
    }
  }
}
