'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { orthogonalSourceRoute, orthogonalSourceTree, nativeElbowConnector, nativeElbowVertices } = require('../packages/slideclone-core/source-route-native-elbow');

/** Rounded corner of radius r between two axis legs, sampled like a traced centerline. */
function roundedL(r) {
  const pts = [{ x: 10, y: 10 }, { x: 10, y: 60 - r }];
  for (let k = 1; k < 6; k++) { const t = (Math.PI / 2) * k / 6; pts.push({ x: 10 + r - r * Math.cos(t), y: 60 - r + r * Math.sin(t) }); }
  pts.push({ x: 10 + r, y: 60 }, { x: 120, y: 60 });
  return pts;
}

test('a traced rounded L becomes one two-leg orthogonal route through its fixed ends', () => {
  const route = orthogonalSourceRoute(roundedL(14), { widthPx: 3 });
  assert.deepEqual(route, [{ x: 10, y: 10 }, { x: 10, y: 60 }, { x: 120, y: 60 }]);
});

test('diagonal or branching ink is not forced into an elbow', () => {
  assert.equal(orthogonalSourceRoute([{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 60 }], { widthPx: 3 }), null);
  // A real diagonal detour of 25 px cannot hide inside a corner allowance.
  assert.equal(orthogonalSourceRoute([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 25, y: 75 }, { x: 50, y: 50 }, { x: 100, y: 50 }], { widthPx: 3 }), null);
  assert.equal(orthogonalSourceRoute([{ x: 0, y: 0 }], { widthPx: 3 }), null);
});

test('more legs than Office bent presets support stay segmented', () => {
  const zigzag = [];
  for (let i = 0; i < 4; i++) zigzag.push({ x: i * 40, y: 0 }, { x: i * 40 + 20, y: 0 }, { x: i * 40 + 20, y: 30 }, { x: i * 40 + 40, y: 30 });
  assert.equal(orthogonalSourceRoute(zigzag, { widthPx: 2 }), null);
});

test('every quarter-turn and flip solves to a bent preset whose Office path reproduces the route', () => {
  const shapes = [
    [{ x: 10, y: 10 }, { x: 10, y: 40 }, { x: 90, y: 40 }],
    [{ x: 90, y: 10 }, { x: 90, y: 40 }, { x: 10, y: 40 }],
    [{ x: 10, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 5 }],
    [{ x: 10, y: 10 }, { x: 10, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 80 }],
    [{ x: 70, y: 80 }, { x: 70, y: 30 }, { x: 10, y: 30 }, { x: 10, y: 10 }],
    [{ x: 5, y: 5 }, { x: 40, y: 5 }, { x: 40, y: 50 }, { x: 90, y: 50 }],
    [{ x: 5, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 90 }],
    [{ x: 5, y: 5 }, { x: 5, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 60 }, { x: 80, y: 60 }, { x: 80, y: 90 }]
  ];
  for (const route of shapes) {
    const connector = nativeElbowConnector(route);
    assert.ok(connector, JSON.stringify(route));
    const drawn = nativeElbowVertices(connector);
    const unique = drawn.filter((p, i) => i === 0 || Math.hypot(p.x - drawn[i - 1].x, p.y - drawn[i - 1].y) > 1e-6);
    assert.equal(unique.length, route.length, JSON.stringify({ route, drawn }));
    for (const [i, p] of route.entries()) assert.ok(Math.hypot(p.x - unique[i].x, p.y - unique[i].y) < 0.01, JSON.stringify({ route, drawn }));
    assert.ok([0, 90, 180, 270].includes(connector.connectorFrame.rotationDeg));
  }
});

test('a straight route needs no preset and keeps its exact chord', () => {
  const connector = nativeElbowConnector([{ x: 20, y: 50 }, { x: 5, y: 50 }]);
  assert.equal(connector.connectorType, undefined);
  assert.deepEqual(connector.connectorFrame, { x: 5, y: 50, w: 15, h: 0, rotationDeg: 0, flipH: true, flipV: false });
});

test('a skeleton junction inside a T fillet moves onto both strokes; terminals never move', () => {
  // Trunk at y=50 from x=0..100, branch down at x=50; the skeleton put the joint 9 px low.
  const joints = new Map([[0, { x: 0, y: 50 }], [1, { x: 100, y: 50 }], [2, { x: 50, y: 120 }], [9, { x: 50, y: 59 }]]);
  const edges = [
    { from: 0, to: 9, widthPx: 3, points: [{ x: 0, y: 50 }, { x: 40, y: 50 }, { x: 47, y: 53 }, { x: 50, y: 59 }] },
    { from: 9, to: 1, widthPx: 3, points: [{ x: 50, y: 59 }, { x: 53, y: 53 }, { x: 60, y: 50 }, { x: 100, y: 50 }] },
    { from: 9, to: 2, widthPx: 3, points: [{ x: 50, y: 59 }, { x: 50, y: 120 }] }
  ];
  const tree = orthogonalSourceTree({ joints, fixed: new Set([0, 1, 2]), edges });
  assert.deepEqual(tree.joints.get(9), { x: 50, y: 50 });
  for (const id of [0, 1, 2]) assert.deepEqual(tree.joints.get(id), joints.get(id));
  assert.deepEqual(tree.routes, [
    [{ x: 0, y: 50 }, { x: 50, y: 50 }],
    [{ x: 50, y: 50 }, { x: 100, y: 50 }],
    [{ x: 50, y: 50 }, { x: 50, y: 120 }]
  ]);
});

test('a junction far from the stroke intersection is not relocated', () => {
  const joints = new Map([[0, { x: 0, y: 50 }], [1, { x: 50, y: 140 }], [9, { x: 50, y: 90 }]]);
  const edges = [
    { from: 0, to: 9, widthPx: 3, points: [{ x: 0, y: 50 }, { x: 10, y: 50 }, { x: 50, y: 90 }] },
    { from: 9, to: 1, widthPx: 3, points: [{ x: 50, y: 90 }, { x: 50, y: 140 }] }
  ];
  const tree = orthogonalSourceTree({ joints, fixed: new Set([0, 1]), edges });
  assert.deepEqual(tree.joints.get(9), { x: 50, y: 90 });
  assert.equal(tree.routes[0], null);
});
