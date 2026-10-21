"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {materializeSceneIcon}=require("../packages/slideclone-core/source-scene-icon");
const {readPng}=require("../packages/slideclone-core/png");
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-icon-identity-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 const paint=(x,y,w,h)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)image.rgba.set([30,60,90,255],(py*400+px)*4);};
 return {paint,input:{image,box:{x:30,y:25,w:28,h:25},id:"graphic",regionId:"region",root,
  slideSize:{widthPt:400,heightPt:300},textBoxes:[],budget:{used:0}}};
}
test("an adjacent caption cannot clip a complete icon arm that has no source ink collision",t=>{
 const f=fixture(t);f.paint(30,25,13,25);f.paint(43,46,22,3);f.paint(61,23,3,7);
 f.input.textBoxes=[{text:"Caption",box:{x:60,y:20,w:12,h:15}}];
 const original=Buffer.from(f.input.image.rgba),icon=materializeSceneIcon(f.input);assert.ok(icon);
 assert.ok(icon.box.x+icon.box.w>=65,"the arm must survive beyond the caption rectangle's left edge");
 const crop=readPng(path.join(f.input.root,icon.assetPath));
 const x=64-icon.source.tightenedPixelBox.x,y=47-icon.source.tightenedPixelBox.y;
 assert.ok(crop.rgba[(y*crop.width+x)*4+3]>=32);assert.deepEqual(f.input.image.rgba,original);
 assert.equal(f.input.budget.used,46*43,"the complete original padding window is charged exactly once");
});
test("a fragment cannot stand in for the closest physical component rejected by text ownership",t=>{
 const f=fixture(t);f.paint(30,25,13,20);f.paint(53,47,3,3);
 f.input.textBoxes=[{text:"Text",box:{x:34,y:29,w:5,h:10}}];
 assert.equal(materializeSceneIcon(f.input),null);assert.equal(fs.existsSync(path.join(f.input.root,"assets")),false);
});
test("clipped principal ink, source text contact and scan exhaustion still reject the icon",t=>{
 const f=fixture(t);f.paint(30,25,13,25);f.paint(43,46,33,3);
 assert.equal(materializeSceneIcon(f.input),null);
 const g=fixture(t);g.paint(30,25,13,25);g.input.textBoxes=[{text:"Text",box:{x:41.5,y:25,w:5,h:10}}];
 assert.equal(materializeSceneIcon(g.input),null);
 const h=fixture(t);h.paint(30,25,13,25);h.input.budget.used=4_000_000;
 assert.throws(()=>materializeSceneIcon(h.input),RangeError);assert.equal(h.input.budget.used,4_000_000);
});
