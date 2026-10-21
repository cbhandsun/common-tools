"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitPanelFromConnectedColorRegion } = require("../packages/slideclone-core/line-text-native-analysis");
const { createLineTextNativeComponentObjects } = require("../packages/slideclone-core/line-text-native-components");

function raster(width = 320, height = 200) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}
function paint(image, box, fill) {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const offset = (y * image.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) image.rgba[offset + channel] = fill[channel];
  }
}

test("connected color panels separate pastel fill from nearby light background", () => {
  for (const fill of [[220, 235, 250], [250, 220, 235], [235, 250, 220], [15, 150, 130]]) {
    const image = raster(), expected = { x: 70, y: 60, w: 110, h: 30 };
    paint(image, expected, fill);
    paint(image, { x: 100, y: 70, w: 18, h: 8 }, [30, 30, 30]);
    const before = Buffer.from(image.rgba);
    assert.deepEqual(fitPanelFromConnectedColorRegion(image, { x: 100, y: 65, w: 45, h: 20 },
      { widthPt: 320, heightPt: 200 }, { r: fill[0], g: fill[1], b: fill[2], a: 255 }), expected);
    assert.deepEqual(image.rgba, before);
  }
});

test("connected panel evidence rejects a component truncated by its search window", () => {
  const image = raster();
  paint(image, { x: 0, y: 50, w: 250, h: 90 }, [30, 150, 180]);
  assert.equal(fitPanelFromConnectedColorRegion(image, { x: 50, y: 80, w: 25, h: 15 },
    { widthPt: 320, heightPt: 200 }, { r: 30, g: 150, b: 180, a: 255 }), null);
});

test("source backed text cannot create a guessed small panel inside an incomplete owner", () => {
  const image = raster(960, 540), box = { x: 80, y: 130, w: 60, h: 14 };
  paint(image, { x: 0, y: 50, w: 600, h: 250 }, [220, 235, 250]);
  const result = createLineTextNativeComponentObjects({ image, slideSize: { widthPt: 960, heightPt: 540 },
    lines: [{ type: "line", box: { x: 700, y: 20, w: 220, h: 0 } }, { type: "line", box: { x: 700, y: 44, w: 220, h: 0 } }],
    textBoxes: [{ id: "label", text: "Source label", box, source: { evidenceBox: box }, font: { sizePt: 10 } }]
  });
  assert.equal(result.shapes.filter(item => item.source.detector === "line-text-native-color-panel").length, 0);
  assert.equal(result.textBoxes.filter(item => item.source.detector === "line-text-native-color-panel-text").length, 0);
});

test("empty or low contrast panel pixels do not authorize a connected owner", () => {
  const image = raster(), seed = { x: 100, y: 65, w: 45, h: 20 }, size = { widthPt: 320, heightPt: 200 };
  assert.equal(fitPanelFromConnectedColorRegion(image, seed, size, { r: 20, g: 130, b: 180, a: 255 }), null);
  paint(image, { x: 70, y: 60, w: 110, h: 30 }, [248, 251, 252]);
  assert.equal(fitPanelFromConnectedColorRegion(image, seed, size, { r: 248, g: 251, b: 252, a: 255 }), null);
});
test("source OCR row alignment cannot invent cards without source perimeters",()=>{
 const image=raster(960,540),textBoxes=[120,270,420].map((x,i)=>{
  const box={x,y:150,w:70,h:12};return {id:`row-${i}`,text:`Label ${i}`,box,source:{evidenceBox:box}};
 });
 const result=createLineTextNativeComponentObjects({image,slideSize:{widthPt:960,heightPt:540},textBoxes,
  lines:[{type:"line",box:{x:20,y:20,w:220,h:0}},{type:"line",box:{x:20,y:44,w:220,h:0}}]});
 assert.equal(result.shapes.filter(s=>s.source.detector==="line-text-native-card-row").length,0);
});
test("source OCR cards retain measured bounds instead of inter-label lane widths",()=>{
 const image=raster(960,540),textBoxes=[120,270,420].map((x,i)=>{
  const box={x,y:150,w:70,h:12};paint(image,{x:x-20,y:140,w:110,h:32},[226,236,249]);
  return {id:`row-${i}`,text:`Label ${i}`,box,source:{evidenceBox:box}};
 });
 const result=createLineTextNativeComponentObjects({image,slideSize:{widthPt:960,heightPt:540},textBoxes,
  lines:[{type:"line",box:{x:20,y:20,w:220,h:0}},{type:"line",box:{x:20,y:44,w:220,h:0}}]});
 const cards=result.shapes.filter(s=>["line-text-native-card-row","line-text-native-color-panel"].includes(s.source.detector));
 assert.equal(cards.length,3);
 for(const card of cards){assert.ok(Math.abs(card.box.w-110)<=2);assert.ok(Math.abs(card.box.h-32)<=2);}
});

