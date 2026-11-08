'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { runBuilder } = require('./helpers/openxml-contract-fixtures');
const { readZipEntry } = require('../packages/ooxml-core/pptx-inventory');

function renderXml(t, shapes) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'native-axis-extent-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith('native-axis-extent-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const ir = path.join(root, 'deck.json'), out = path.join(root, 'deck.pptx');
  fs.writeFileSync(ir, JSON.stringify({ version: '1.0', slideSize: { widthPt: 400, heightPt: 400 },
    pages: [{ pageIndex: 0, textBoxes: [], images: [], tables: [], charts: [], shapes }] }));
  runBuilder(['--ir', ir, '--out', out]);
  return readZipEntry(out, 'ppt/slides/slide1.xml').toString('utf8');
}
const line = (id, box, style = {}) => ({ id, type: 'line', box,
  style: { fill: 'none', stroke: '#C1422B', strokeWidthPt: 2, lineCap: 'round', ...style } });
function connector(xml, id) {
  const body = [...xml.matchAll(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu)].find(m => m[0].includes('name="' + id + '"'))?.[0];
  assert.ok(body, id);
  return body;
}
function extent(xml, id) {
  const body = connector(xml, id), values = /<a:ext cx="(\d+)" cy="(\d+)"/u.exec(body);
  assert.ok(values, id);
  return { cx: Number(values[1]), cy: Number(values[2]) };
}

test('straight horizontal and vertical connectors preserve exact zero axes in both directions', { timeout: 60000 }, t => {
  const xml = renderXml(t, [
    line('horizontal', { x: 20, y: 30, w: 120, h: 0 }), line('vertical', { x: 180, y: 30, w: 0, h: 120 }),
    line('reverse-horizontal', { x: 140, y: 190, w: -120, h: 0 }), line('reverse-vertical', { x: 210, y: 180, w: 0, h: -120 })
  ]);
  for (const id of ['horizontal', 'reverse-horizontal']) assert.deepEqual(extent(xml, id), { cx: 1524000, cy: 0 }, id);
  for (const id of ['vertical', 'reverse-vertical']) assert.deepEqual(extent(xml, id), { cx: 0, cy: 1524000 }, id);
  assert.match(connector(xml, 'reverse-horizontal'), /flipH="1"/u);
  assert.match(connector(xml, 'reverse-vertical'), /flipV="1"/u);
});

test('explicit straight frames preserve zero axes and quarter-turn transforms', { timeout: 60000 }, t => {
  const xml = renderXml(t, [line('frame', { x: 20, y: 30, w: 120, h: 10 }, {
    connectorFrame: { x: 20, y: 30, w: 120, h: 0, rotationDeg: 90, flipH: true, flipV: false }
  })]);
  assert.deepEqual(extent(xml, 'frame'), { cx: 1524000, cy: 0 });
  assert.match(connector(xml, 'frame'), /rot="5400000"/u);
  assert.match(connector(xml, 'frame'), /flipH="1"/u);
});

test('curves, elbows, collapsed points and positive tiny axes retain their existing dimensions', { timeout: 60000 }, t => {
  const xml = renderXml(t, [
    line('elbow', { x: 20, y: 30, w: 120, h: 0 }, { connectorType: 'elbow-3', connectorAdjustments: [50000] }),
    line('curve', { x: 180, y: 30, w: 0, h: 120 }, { connectorType: 'curved-3', connectorAdjustments: [50000] }),
    line('point', { x: 280, y: 30, w: 0, h: 0 }), line('tiny', { x: 20, y: 190, w: 120, h: .05 }),
    line('diagonal', { x: 180, y: 190, w: 80, h: 100 })
  ]);
  assert.deepEqual(extent(xml, 'elbow'), { cx: 1524000, cy: 1270 });
  assert.deepEqual(extent(xml, 'curve'), { cx: 1270, cy: 1524000 });
  assert.deepEqual(extent(xml, 'point'), { cx: 1270, cy: 1270 });
  assert.deepEqual(extent(xml, 'tiny'), { cx: 1524000, cy: 1270 });
  assert.deepEqual(extent(xml, 'diagonal'), { cx: 1016000, cy: 1270000 });
});

test('resolved physical anchors, arrow, cap and gradient remain attached to the exact axis', { timeout: 60000 }, t => {
  const xml = renderXml(t, [
    { id: 'from', type: 'rect', box: { x: 0, y: 20, w: 20, h: 40 }, style: { fill: '#FFFFFF', stroke: 'none' } },
    { id: 'to', type: 'rect', box: { x: 200, y: 20, w: 20, h: 40 }, style: { fill: '#FFFFFF', stroke: 'none' } },
    line('anchored', { x: 10, y: 10, w: 180, h: 10 }, {
      startAnchor: { elementId: 'from', side: 'right', position: .5 }, endAnchor: { elementId: 'to', side: 'left', position: .5 },
      endArrow: 'triangle', strokeGradient: { type: 'linear', angleDeg: 0, stops: [{ position: 0, color: '#C1422B' }, { position: 1, color: '#00A080' }] }
    })
  ]);
  const body = connector(xml, 'anchored');
  assert.deepEqual(extent(xml, 'anchored'), { cx: 2286000, cy: 0 });
  assert.match(body, /<a:stCxn id="2"/u); assert.match(body, /<a:endCxn id="3"/u);
  assert.match(body, /<a:tailEnd type="triangle"/u); assert.match(body, /cap="rnd"/u);
  assert.match(body, /<a:gradFill/u); assert.match(body, /C1422B/u); assert.match(body, /00A080/u);
});

test('the axis regression and native helper participate in unified CI and the runtime package', () => {
  const { includesSuite } = require('../scripts/test-suites');
  for (const suite of ['contract', 'all']) assert.equal(includesSuite(__filename, suite), true);
  const { IMAGE_EDITABLE_RELEASE_FILES } = require('../scripts/verify-runtime-package');
  assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeConnectorExtents.cs'));
});
