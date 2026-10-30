"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fitSourceTextBand, fitObservedSourceTextBand } = require("../packages/slideclone-core/typography/source-text-band-evidence");

function raster(width = 320, height = 200) {
  return { width, height, rgba: new Uint8Array(width * height * 4).fill(255) };
}
function paint(image, x, y, w, h, color) {
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) {
    image.rgba.set([...color, 255], (cy * image.width + cx) * 4);
  }
}
function request(image, box = { x: 18, y: 48, w: 280, h: 50 }) {
  return { image, box, slideSize: { widthPt: image.width, heightPt: image.height } };
}

test("text band requires positive source evidence instead of an empty row", () => {
  assert.equal(fitSourceTextBand(request(raster())), null);
  assert.equal(fitSourceTextBand({}), null);
  assert.equal(fitSourceTextBand(null), null);
});

test("text band fits a genuine full-width fill without inventing a stroke", () => {
  for (const color of [[240, 253, 248], [236, 236, 236], [251, 231, 245]]) {
    const image = raster();
    paint(image, 20, 50, 280, 50, color);
    const fit = fitSourceTextBand(request(image));
    assert.ok(fit);
    assert.equal(fit.strokeSupported, false);
    assert.ok(Math.abs(fit.box.x - 20) <= 3 && Math.abs(fit.box.w - 280) <= 6);
    assert.ok(fit.support >= 0.8);
  }
});
test("a farther unrelated rule cannot replace a closer supported fill boundary", () => {
  const image=raster();paint(image,20,50,280,50,[210,230,245]);
  paint(image,0,110,320,1,[40,40,40]);
  const fit=fitSourceTextBand(request(image));assert.ok(fit);
  assert.ok(Math.abs(fit.box.y+fit.box.h-100)<=3);
  assert.equal(fit.strokeSupported,false);
});

test("text band fits a real enclosing outline on a white page", () => {
  const image = raster();
  paint(image, 20, 50, 280, 2, [40, 90, 120]);
  paint(image, 20, 98, 280, 2, [40, 90, 120]);
  paint(image, 20, 50, 2, 50, [40, 90, 120]);
  paint(image, 298, 50, 2, 50, [40, 90, 120]);
  const fit = fitSourceTextBand(request(image));
  assert.ok(fit);
  assert.equal(fit.strokeSupported, true);
});
test("a closed outline survives different inner and outer fills and nearby pictorial ink", () => {
  const image = raster();
  paint(image, 0, 0, 320, 200, [250, 225, 237]);
  paint(image, 20, 50, 280, 50, [245, 247, 251]);
  paint(image, 20, 50, 280, 1, [180, 180, 185]);
  paint(image, 20, 99, 280, 1, [180, 180, 185]);
  paint(image, 20, 50, 1, 50, [180, 180, 185]);
  paint(image, 299, 50, 1, 50, [180, 180, 185]);
  // These glyph-like units interrupt the far interior probes, but do not
  // touch the independently visible enclosing line.
  for (let x = 35; x < 280; x += 25) paint(image, x, 58, 12, 6, [30, 45, 80]);
  const fit = fitSourceTextBand(request(image));
  assert.ok(fit); assert.equal(fit.strokeSupported, true);
  assert.ok(fit.support >= 0.8);assert.ok(Math.abs(fit.box.x - 20) < 1);
});

test("text band rejects same-row titles inside independent columns", () => {
  for (const color of [[240, 240, 240], [230, 250, 244]]) {
    const image = raster();
    paint(image, 20, 20, 85, 150, color);
    paint(image, 120, 20, 85, 150, color);
    paint(image, 220, 20, 80, 150, color);
    assert.equal(fitSourceTextBand(request(image)), null);
  }
});

test('asymmetric pale strokes recover only after the original fitter fails and still require two darker flanks',()=>{
  const image=raster();paint(image,0,0,320,200,[249,252,255]);
  paint(image,20,50,280,50,[245,248,255]);
  for(const [x,y,w,h]of [[20,50,280,1],[20,99,280,1],[20,50,1,50],[299,50,1,50]])
    paint(image,x,y,w,h,[228,231,238]);
  const query=request(image,{x:20,y:50,w:279,h:49});
  assert.equal(fitSourceTextBand(query),null);
  const fit=fitObservedSourceTextBand(query);assert.ok(fit);assert.equal(fit.strokeSupported,true);
  // A fill step is independently observable but cannot acquire stroke proof.
  paint(image,20,50,280,50,[230,233,239]);
  const step=fitObservedSourceTextBand(query);assert.ok(step);assert.equal(step.strokeSupported,false);
  // Neither a one-sided darkening nor a weak isolated shadow is a dark line.
  paint(image,0,0,320,200,[249,252,255]);paint(image,20,50,280,50,[240,243,246]);
  const weak=fitObservedSourceTextBand(query);assert.ok(!weak||!weak.strokeSupported);
});

test("text band rejects unrelated partial top and bottom borders", () => {
  const image = raster();
  paint(image, 20, 50, 70, 2, [0, 0, 0]);
  paint(image, 220, 98, 70, 2, [0, 0, 0]);
  assert.equal(fitSourceTextBand(request(image)), null);
});

test("text band does not mistake aligned text-like strokes for fill boundaries", () => {
  const image = raster();
  for (let x = 20; x < 300; x += 7) {
    paint(image, x, 50, 5, 5, [0, 0, 0]);
    paint(image, x, 98, 5, 5, [0, 0, 0]);
  }
  assert.equal(fitSourceTextBand(request(image)), null);
});

test("text band respects proportional geometry at a different resolution", () => {
  const image = raster(640, 400);
  paint(image, 40, 100, 560, 100, [240, 253, 248]);
  const fit = fitSourceTextBand({ ...request(image), box: { x: 18, y: 48, w: 280, h: 50 },
    slideSize: { widthPt: 320, heightPt: 200 } });
  assert.ok(fit);
  assert.ok(fit.box.x < 23 && fit.box.y < 53);
});

test("text band fails closed on unsafe, non-finite and incomplete inputs", () => {
  const image = raster();
  for (const invalid of [
    { ...image, rgba: image.rgba.subarray(4) }, { ...image, width: 20000 },
    { ...image, width: "320" }, { ...image, height: Infinity },
    { ...image, rgba: new Uint8Array(image.rgba.length) }
  ]) assert.equal(fitSourceTextBand(request(invalid)), null);
  for (const invalid of [
    { x: -1, y: 0, w: 20, h: 20 }, { x: 0, y: 0, w: Infinity, h: 20 },
    { x: 0, y: 0, w: 0, h: 20 }, { x: 300, y: 0, w: 100, h: 20 },
    { x: "20", y: 0, w: 100, h: 20 }
  ]) assert.equal(fitSourceTextBand(request(image, invalid)), null);
  assert.equal(fitSourceTextBand({ ...request(image), slideSize: { widthPt: 0, heightPt: 200 } }), null);
  let accessed = false;
  const unsafe = { get box() { accessed = true; throw new Error("not data"); } };
  assert.equal(fitSourceTextBand(unsafe), null);
  assert.equal(fitSourceTextBand(new Proxy({}, { get() { throw new Error("not data"); } })), null);
  assert.equal(accessed, false);
  assert.equal(fitSourceTextBand({ ...request(image), slideSize: { widthPt: Number.MIN_VALUE, heightPt: 200 } }), null);
});

test('a complete border near the source edge uses measured local flanks without unavailable far pixels',()=>{
 const image=raster();paint(image,20,50,295,50,[245,248,255]);
 paint(image,20,50,295,1,[40,90,120]);paint(image,20,99,295,1,[40,90,120]);
 paint(image,20,50,1,50,[40,90,120]);paint(image,314,50,1,50,[40,90,120]);
 const fit=fitSourceTextBand(request(image,{x:20,y:50,w:294,h:49}));
 assert.ok(fit);assert.ok(fit.support>=.8);assert.ok(Math.abs(fit.box.x+fit.box.w-314)<=2);
 for(let y=50;y<100;y++)image.rgba.set([255,255,255,255],(y*image.width+314)*4);
 assert.equal(fitSourceTextBand(request(image,{x:20,y:50,w:294,h:49})),null);
});
