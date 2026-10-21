'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runBuilder, invokeBuilder } = require('./helpers/openxml-contract-fixtures');
const { readZipEntry } = require('../packages/ooxml-core/pptx-inventory');

function fixture(style) {
  return {
    version: '1.0', slideSize: { widthPt: 320, heightPt: 280 },
    pages: [{
      pageIndex: 0, background: { fill: '#FFFFFF' },
      textBoxes: [], images: [], tables: [], charts: [],
      shapes: [{
        id: 'connector', type: 'line', box: { x: 60, y: 50, w: 190, h: 170 },
        style: { stroke: '#1769D5', strokeWidthPt: 3, endArrow: 'triangle', ...style }
      }]
    }]
  };
}

test('unverified custom connector geometry fails explicitly instead of degrading to a straight line', { timeout: 120000 }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-path-unsupported-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cases = [
    { connectorType: 'custom-path' },
    { connectorType: 'CUSTOM-PATH' },
    { connectorType: 'custom-path', connectorPath: '[[0,0,0],[1,1,1]]' },
    ...[null, [], '', 'private-native-path', { privateValue: 'private-native-path' },
      '[[0,0,0],[2,0.1,0.3,0.4,0.7,1,1]]', 'x'.repeat(65536)]
      .map(connectorPath => ({ connectorType: 'curved-4', connectorPath }))
  ];
  for (const [index, style] of cases.entries()) {
    const ir = path.join(dir, index + '.json');
    fs.writeFileSync(ir, JSON.stringify(fixture(style)));
    const result = invokeBuilder(['--ir', ir, '--out', path.join(dir, index + '.pptx')]);
    assert.equal(result.error, undefined, 'builder must execute for case ' + index);
    assert.notEqual(result.status, null, 'builder must terminate for case ' + index);
    assert.notEqual(result.status, 0, 'unsupported path must not produce successful output');
    const output = result.stderr + result.stdout;
    assert.match(output, /Native custom connector paths require verified Office support\./u);
    assert.doesNotMatch(output, /private-native-path|privateValue|\[\[0,0,0\]/u);
    assert.ok(output.length < 32768, 'rejected path payload must not be logged');
  }
});

test('supported native connectors still emit presets and arrowheads after custom paths are disabled', { timeout: 120000 }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-path-presets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [index, style, preset] of [
    [0, {}, 'line'],
    [1, { connectorType: 'curved-4', connectorAdjustments: [-51200, 1800] }, 'curvedConnector4']
  ]) {
    const ir = path.join(dir, index + '.json');
    const out = path.join(dir, index + '.pptx');
    fs.writeFileSync(ir, JSON.stringify(fixture(style)));
    runBuilder(['--ir', ir, '--out', out]);
    const xml = readZipEntry(out, 'ppt/slides/slide1.xml').toString('utf8');
    assert.match(xml, new RegExp('<a:prstGeom prst="' + preset + '"', 'u'));
    assert.match(xml, /<a:tailEnd type="triangle"/u);
    assert.doesNotMatch(xml, /<a:custGeom|<p:pic>/u);
  }
  const { includesSuite } = require('../scripts/test-suites');
  assert.ok(includesSuite(__filename, 'contract'));
  assert.ok(includesSuite(__filename, 'all'));
});

