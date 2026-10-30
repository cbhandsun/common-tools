'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractSceneStrokeGraph:extract}=require('../packages/slideclone-core/scene-plan/source-scene-stroke-graph');
const sourceHash='b'.repeat(64);
function canvas(width,height){
 const rgba=new Uint8Array(width*height*4).fill(255);
 const dot=(cx,cy,r)=>{for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)
  if(x>=0&&y>=0&&x<width&&y<height&&(x-cx)**2+(y-cy)**2<=r*r){const o=(y*width+x)*4;rgba[o]=20;rgba[o+1]=20;rgba[o+2]=20;}};
 const line=(x0,y0,x1,y1,r=1.5)=>{const n=Math.ceil(Math.hypot(x1-x0,y1-y0)*2);for(let i=0;i<=n;i++)dot(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n,r);};
 return {image:{width,height,rgba},line};
}
const run=(c,textBoxes=[])=>extract({image:c.image,sourceHash,textBoxes});

test('a straight stroke becomes one edge between two free ends without arrowheads',()=>{
 const c=canvas(160,60);c.line(20,30,140,30);const g=run(c);
 assert.equal(g.edges.length,1);assert.deepEqual(g.nodes.map(n=>n.kind),['end','end']);
 assert.ok(Math.abs(g.edges[0].lengthPx-120)<=8,String(g.edges[0].lengthPx));assert.equal(g.arrowheads.length,0);
 assert.equal(g.evidence.sourceAuthorized,false);
});

test('an open arrowhead yields a tip and direction from its folded-back barbs, including compact low-res barbs',()=>{
 for(const [dir,shaft,barbs,r]of [
  [[1,0],[20,50,120,50],[[120,50,104,40],[120,50,104,60]]],
  [[0,1],[60,10,60,110],[[60,110,50,94],[60,110,70,94]]],
  [[1,0],[20,50,90,50],[[90,50,82,43],[90,50,82,57]],1]
 ]){
  const c=canvas(160,130);c.line(...shaft,r);for(const b of barbs)c.line(...b,r);const g=run(c);
  assert.equal(g.arrowheads.length,1,JSON.stringify(g.arrowheads));const [a]=g.arrowheads;
  assert.ok(Math.hypot(a.tip[0]-shaft[2],a.tip[1]-shaft[3])<=5,JSON.stringify(a.tip));
  assert.ok(a.direction[0]*dir[0]+a.direction[1]*dir[1]>.95,JSON.stringify(a.direction));
 }
});

test('perpendicular junctions and closed outlines are not arrowheads',()=>{
 const t=canvas(160,120);t.line(20,30,140,30);t.line(80,30,80,110);const g=run(t);
 assert.equal(g.nodes.filter(n=>n.kind==='junction').length,1);assert.equal(g.edges.length,3);assert.equal(g.arrowheads.length,0);
 const r=canvas(120,100);r.line(20,20,100,20);r.line(100,20,100,80);r.line(100,80,20,80);r.line(20,80,20,20);const loop=run(r);
 assert.equal(loop.arrowheads.length,0);assert.ok(loop.edges.length>=1);assert.ok(loop.edges.every(e=>e.from===e.to));
 assert.ok(loop.edges.reduce((s,e)=>s+e.lengthPx,0)>250);
 // A forward fork (branches spreading away from the shaft) is not an arrowhead.
 const f=canvas(160,100);f.line(20,50,100,50);f.line(100,50,116,40);f.line(100,50,116,60);
 assert.equal(run(f).arrowheads.length,0);
});

test('OCR boxes erase enclosed glyphs while preserving continuous strokes crossing OCR whitespace corners',()=>{
 const c=canvas(160,80);c.line(20,30,140,30);
 assert.equal(run(c,[{x:10,y:20,w:140,h:20}]).edges.length,0);
 const d=canvas(160,100);
 d.line(20,20,120,80); // diagonal connector crossing corner of OCR box
 d.line(75,30,95,30); // enclosed glyph stroke inside OCR box
 const g=run(d,[{x:60,y:20,w:45,h:35}]);
 assert.equal(g.edges.length,1);
 assert.ok(g.edges[0].lengthPx>=100,String(g.edges[0].lengthPx));
 assert.deepEqual(run(c),run(c));
});

test('invalid sources, raster accessors and text boxes fail closed',()=>{
 const c=canvas(20,20);
 assert.throws(()=>extract({image:c.image,sourceHash:'x',textBoxes:[]}),/source/);
 assert.throws(()=>extract({image:{...c.image,rgba:new Proxy(c.image.rgba,{})},sourceHash,textBoxes:[]}),/raster/);
 assert.throws(()=>extract({image:{...c.image,rgba:Array.from(c.image.rgba)},sourceHash,textBoxes:[]}),/raster/);
 assert.throws(()=>extract({image:{...c.image,width:21},sourceHash,textBoxes:[]}),/raster/);
 assert.throws(()=>extract({image:{width:3000,height:3000,rgba:new Uint8Array(4)},sourceHash,textBoxes:[]}),/raster/);
 for(const textBoxes of [null,[{x:0,y:0,w:21,h:1}],[{x:0,y:0,w:1.5,h:1}],Array.from({length:513},()=>({x:0,y:0,w:1,h:1}))])
  assert.throws(()=>extract({image:c.image,sourceHash,textBoxes}),/text boxes/);
});
