"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureOutlinedSceneContainer,sceneOutlineWindow}=require("../packages/slideclone-core/scene-plan/source-scene-outline");
function roundedFixture(){
 const image={width:220,height:180,rgba:Buffer.alloc(220*180*4,255)},hint={x:40,y:40,w:120,h:90};
 const contains=(x,y,inset)=>{const l=40+inset,t=40+inset,r=160-inset,b=130-inset,rad=22-inset;
  if(x<l||x>=r||y<t||y>=b)return false;
  const cx=Math.max(l+rad,Math.min(r-rad,x+.5)),cy=Math.max(t+rad,Math.min(b-rad,y+.5));
  return (x+.5-cx)**2+(y+.5-cy)**2<=rad**2;
 };
 for(let y=40;y<130;y++)for(let x=40;x<160;x++)if(contains(x,y,0)&&!contains(x,y,3))image.rgba.set([30,70,90,255],(y*220+x)*4);
 for(let y=60;y<110;y++)for(let x=65;x<135;x++)image.rgba.set(x%20<10?[100,150,220,255]:[220,150,100,255],(y*220+x)*4);
 return {image,hint,contains};
}
test("small rounded rings observe their inward corners within the existing dense-window and total limits",()=>{
 const {image,hint}=roundedFixture(),budget={used:0},window=sceneOutlineWindow(image,hint);
 const result=measureOutlinedSceneContainer(image,hint,[],budget);
 assert.ok(result,"a fully visible inward corner must not be rejected as an unobserved source boundary");
 assert.equal(result.fill,"none");assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);
 assert.equal(window.area,(window.x1-window.x0)*(window.y1-window.y0));assert.equal(budget.used,window.area);
 assert.ok(budget.used<=262144);assert.ok(result.sourcePixels.every(n=>image.rgba[n*4]===30));
});
test("dense observation preserves open, text-owned, clipped and filled-surface rejection",()=>{
 for(const mode of ['open','owned','clipped','solid']){
  const {image,hint}=roundedFixture();let masks=[];
  if(mode==='open')for(let y=37;y<46;y++)for(let x=98;x<106;x++)image.rgba.set([255,255,255,255],(y*220+x)*4);
  if(mode==='owned')masks=[{x:40,y:70,w:3,h:12}];
  if(mode==='clipped')Object.assign(hint,{x:60,y:55,w:80,h:60});
  if(mode==='solid')for(let y=40;y<130;y++)for(let x=40;x<160;x++)image.rgba.set([180,220,240,255],(y*220+x)*4);
  assert.equal(measureOutlinedSceneContainer(image,hint,masks,{used:0}),null,mode);
 }
 const f=roundedFixture();assert.throws(()=>measureOutlinedSceneContainer(f.image,f.hint,[],{used:3999999}),/budget/);
});
test("large contours retain narrow observation and the unchanged per-window ceiling",()=>{
 const window=sceneOutlineWindow({width:800,height:800},{x:80,y:80,w:600,h:600});
 assert.equal(window.area,656*656-544*544);assert.ok(window.area<=262144);
});
test("locally proven colored backgrounds separate a complete ring from mixed interior content without granting fill",()=>{
 const {image,hint,contains}=roundedFixture();
 for(let y=40;y<130;y++)for(let x=40;x<160;x++)if(contains(x,y,3))image.rgba.set([210,235,245,255],(y*220+x)*4);
 for(let y=55;y<95;y++)for(let x=95;x<145;x++)if(contains(x,y,3))image.rgba.set(x%10<5?[100,150,220,255]:[220,150,100,255],(y*220+x)*4);
 const budget={used:0},result=measureOutlinedSceneContainer(image,hint,[],budget);
 assert.ok(result,"mixed content must not merge a proven local background into the ring");
 assert.equal(result.fill,"none");assert.ok(result.sourcePixels.every(n=>image.rgba[n*4]===30));
 assert.ok(budget.used<=4000000);
});
test("outline color follows observed stroke cores rather than averaging source antialias fringes",()=>{
 const {image,hint}=roundedFixture();
 for(let y=40;y<130;y++)for(let x=40;x<160;x++){
  const i=(y*220+x)*4;
  if(image.rgba[i]===30&&(x+y)%4===0)image.rgba.set([150,170,180,255],i);
 }
 const result=measureOutlinedSceneContainer(image,hint,[],{used:0});assert.ok(result);
 assert.equal(result.color,"#1e465a");
});
