"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSceneFillWindow:measure}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
function fixture(){
 const image={width:140,height:100,rgba:Buffer.alloc(140*100*4,255)},hint={x:20,y:20,w:100,h:60};
 const paint=(box)=>{for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([120,160,220,255],(y*140+x)*4);};
 return {input:{image,hint,fill:[120,160,220],color:'#78A0DC',budget:{used:0},marginX:8,marginY:8},paint};
}
test('disconnected observed paint retains its open gap as native parts without inventing a single attachment body',()=>{
 const f=fixture();f.paint({x:20,y:20,w:45,h:60});f.paint({x:75,y:20,w:45,h:60});
 const before=Buffer.from(f.input.image.rgba),result=measure(f.input);
 assert.ok(result.fit?.parts?.length);assert.equal(result.fit.segments,undefined);
 assert.deepEqual(result.fit.box,f.input.hint);assert.equal(result.fit.support,.9);
 assert.equal(result.fit.parts[0].segments.filter(s=>s.type==='moveTo').length,2);
 const loops=[];for(const segment of result.fit.parts[0].segments){if(segment.type==='moveTo')loops.push([]);loops.at(-1).push(...segment.points);}
 assert.ok(loops.every(loop=>loop.every(p=>p.x<=.45)||loop.every(p=>p.x>=.55)),'no path can span the unobserved central gap');
 assert.ok(result.fit.parts.length<=32&&result.fit.parts.every(p=>p.segments.length<=120));
 assert.equal(f.input.budget.used,116*76);assert.deepEqual(f.input.image.rgba,before);
});
test('compiler emits disconnected paint without aliasing it or attaching a relation to the union box',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=fixture();f.paint({x:20,y:20,w:45,h:60});f.paint({x:75,y:20,w:45,h:60});f.paint({x:125,y:20,w:12,h:40});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'disconnected-scene-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.input.image);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:140,h:100}}],
  objects:[{id:'paint',kind:'container',regionId:'root',box:f.input.hint},{id:'target',kind:'container',regionId:'root',box:{x:125,y:20,w:12,h:40}}],
  relations:[{id:'edge',regionId:'root',fromId:'paint',toId:'target',direction:'forward'}]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:140,heightPx:100});
 const page={shapes:[],images:[],textBoxes:[]};
 const result=compileSourceScene({page,plan,sourceFile,root,slideSize:{widthPt:140,heightPt:100}});
 const parts=result.page.shapes.filter(s=>s.source?.nativeComponentGroupId==='scene-container-object-paint');assert.ok(parts.length);
 assert.ok(parts.every(s=>s.type==='freeform'&&s.source.editable===true));
 assert.ok(result.evidence.unresolved.some(x=>x.id==='object-paint'&&x.reason==='compound-background-node'));
 assert.ok(result.evidence.unresolved.some(x=>x.id==='relation-edge'&&x.detailCode==='missing-native-node'));
 assert.equal(result.evidence.resolvedRelations,0);assert.equal(result.evidence.containerAliases,0);
 assert.deepEqual(page,{shapes:[],images:[],textBoxes:[]});
});
test('a previously admitted single component keeps the original path and frame',()=>{
 const f=fixture();f.paint(f.input.hint);const fit=measure(f.input).fit;
 assert.ok(fit);assert.equal(fit.parts,undefined);assert.equal(fit.segments,undefined);assert.deepEqual(fit.box,f.input.hint);
});
test('fragment representation preserves density, bounded observation and ambiguity rejections',()=>{
 const sparse=fixture();sparse.paint({x:20,y:20,w:20,h:60});sparse.paint({x:100,y:20,w:20,h:60});assert.equal(measure(sparse.input).fit,null);
 const clipped=fixture();clipped.paint({x:12,y:20,w:53,h:60});clipped.paint({x:75,y:20,w:53,h:60});assert.equal(measure(clipped.input).fit,null);
 const many=fixture();for(let x=20;x<120;x+=3)many.paint({x,y:20,w:2,h:60});assert.equal(measure(many.input).fit,null);
 const ambiguous=fixture();ambiguous.paint({x:20,y:14,w:100,h:34});ambiguous.paint({x:20,y:52,w:100,h:34});
 ambiguous.input.marginY=16;assert.equal(measure(ambiguous.input).fit,null);
 assert.equal(measure(fixture().input).fit,null);
});
test('disconnected paint keeps original input and total source budget boundaries',()=>{
 const f=fixture();f.paint({x:20,y:20,w:45,h:60});f.paint({x:75,y:20,w:45,h:60});
 f.input.budget.used=4000000;assert.throws(()=>measure(f.input),RangeError);assert.equal(f.input.budget.used,4000000);
 let calls=0;const hostile={get hint(){calls++;throw Error('private-source');}};
 assert.throws(()=>measure(hostile),TypeError);assert.throws(()=>measure(new Proxy(f.input,{})),TypeError);assert.equal(calls,0);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-disconnected-fill.test.js','unit'),true);
});
