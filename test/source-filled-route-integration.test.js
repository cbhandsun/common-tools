'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneRoute,isMeasuredSourceRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture(){
 const width=260,height=220,image={width,height,rgba:Buffer.alloc(width*height*4,255)},budget={used:0};
 const put=(x,y,rgb=[25,75,210])=>image.rgba.set([...rgb,255],(y*width+x)*4);
 const from={id:'a',box:{x:20,y:130,w:40,h:40}},to={id:'b',box:{x:180,y:20,w:40,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[215,230,245]);
 const path=[];for(let x=60;x<=130;x++)path.push({x,y:150});
 for(let i=1;i<=140;i++){const angle=Math.PI/2*(1-i/140);path.push({x:Math.round(130+70*Math.cos(angle)),y:Math.round(80+70*Math.sin(angle))});}
 for(let y=79;y>=60;y--)path.push({x:200,y});
 for(const p of path)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const x=p.x+dx,y=p.y+dy;if(![from,to].some(n=>x>=n.box.x&&x<n.box.x+n.box.w&&y>=n.box.y&&y<n.box.y+n.box.h))put(x,y);
 }
 for(let y=60;y<=80;y++)for(let x=200-Math.floor((y-60)/2);x<=200+Math.floor((y-60)/2);x++)put(x,y);
 const cache=createSceneMeasurementCache(image,[],budget);assert.ok(cache.fill(from.box));assert.ok(cache.fill(to.box));
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,from,to,direction:'forward',budget,textMasks:[],shaftBox:{x:59,y:59,w:154,h:96},put};
}
function request(f,fit){return {fit,relation:{id:'curve',regionId:'region',fromId:'a',toId:'b',direction:'forward'},
 fromId:'a',toId:'b',widthPx:f.image.width,heightPx:f.image.height,slideSize:{widthPt:260,heightPt:220}};}
test('a complete broad curved source prefers native connector geometry and actual external attachments',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);
 assert.equal(result.fit.filledBody,undefined);assert.ok(result.fit.support>=.9);assert.deepEqual(f.image.rgba,before);
 const parts=compileSourceSceneRoute(request(f,result.fit)),bodies=parts.filter(p=>p.type==='freeform'),lines=parts.filter(p=>p.type==='line');
 assert.equal(bodies.length,0);assert.ok(lines.length>=2);assert.ok(parts.length<=32);
 assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 assert.ok(parts.every(p=>p.source.sourceRouteParts===parts.length));
 assert.ok(lines.every(p=>p.style.stroke!=='none'&&p.style.strokeWidthPt>0));
 assert.equal(lines.filter(p=>p.style.endArrow).length,1);assert.equal(lines.at(-1).style.endArrow,'triangle');
 for(const line of lines)for(const key of ['startAnchor','endAnchor'])assert.ok(['a','b',...parts.map(p=>p.id)].includes(line.style[key].elementId));
 assert.throws(()=>compileSourceSceneRoute(request(f,structuredClone(result.fit))),/proof/);
 assert.throws(()=>{result.fit.points[0].x=0;},TypeError);
 assert.throws(()=>{result.fit.points.push({x:0,y:0});},TypeError);
 assert.equal(isMeasuredSourceRoute(structuredClone(result.fit),request(f,result.fit)),false);
});
test('filled route integration preserves direction, ownership, opaque width and complete branch rejection',()=>{
 for(const mode of ['direction','text','branch','broken','width']){
  const f=fixture();
  if(mode==='direction')f.direction='backward';
  if(mode==='text')f.textMasks=[{x:90,y:144,w:10,h:12}];
  if(mode==='branch')for(let y=150;y<=175;y++)for(let x=99;x<=101;x++)f.put(x,y);
  if(mode==='branch')f.shaftBox={x:59,y:59,w:154,h:120};
  if(mode==='broken')for(let x=95;x<=100;x++)for(let y=148;y<=152;y++)f.put(x,y,[255,255,255]);
  if(mode==='width')for(let x=60;x<=130;x++)for(let y=147;y<=153;y++)f.put(x,y);
  assert.equal(measureSourceSceneRoute(f).fit,null,mode);
 }
});

test('source-measured native route passes semantic editability while fixed body substitutions fail',()=>{
 const f=fixture(),result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);
 const parts=compileSourceSceneRoute(request(f,result.fit));
 const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 const audit=auditSemanticEditability({slideSize:{widthPt:260,heightPt:220},pages:[{shapes:parts,images:[]}]});
 assert.equal(audit.passed,true);assert.equal(audit.metrics.fixedRelationshipPaintCount,0);
 const fixed={id:'fixed-body',type:'freeform',box:{x:60,y:60,w:140,h:90},source:{...parts[0].source,routeControl:false,editable:true}};
 const substituted=auditSemanticEditability({slideSize:{widthPt:260,heightPt:220},pages:[{shapes:[...parts,fixed],images:[]}]});
 assert.equal(substituted.passed,false);assert.equal(substituted.metrics.fixedRelationshipPaintCount,1);
});

test('all corner modes retain a complete measured footprint instead of regularizing away its source paint',()=>{
 const f=require('./helpers/source-filled-fringe.cjs').sourceFilledFringeFixture(),before=Buffer.from(f.image.rgba);
 const result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);const fit=result.fit;
 assert.ok(fit.filledBody);assert.equal(fit.widthPx,3);
 const {orthogonalSourceRoute,nativeElbowConnector}=require('../packages/slideclone-core/routing/source-route-native-elbow');
 const route=orthogonalSourceRoute(fit.points,{widthPx:fit.widthPx});assert.ok(route);assert.ok(nativeElbowConnector(route));
 const {compileFilledSourceRoute}=require('../packages/slideclone-core/routing/source-filled-route-compiler');
 const input={...request(f,fit),slideSize:{widthPt:240,heightPt:180}},expected=compileFilledSourceRoute(input);
 assert.equal(expected.filter(s=>s.type==='freeform').length,2);assert.equal(expected.filter(s=>s.type==='line').length,2);
 for(const connectorCornerMode of ['auto','rounded-freeform','reroutable-elbow']){
  const parts=compileSourceSceneRoute({...input,connectorCornerMode});assert.deepEqual(parts,expected,connectorCornerMode);
  assert.ok(parts.every(s=>!s.style.endArrow&&!s.style.startArrow));
  assert.ok(parts.filter(s=>s.type==='freeform').every(s=>s.style.stroke==='none'&&s.style.fill!=='none'));
  assert.equal(parts.find(s=>s.type==='line').style.startAnchor.elementId,'a');
  assert.equal(parts.at(-1).style.endAnchor.elementId,'b');
  assert.throws(()=>compileSourceSceneRoute({...input,connectorCornerMode,fit:structuredClone(fit)}),/proof/);
 }
 assert.ok(Object.isFrozen(fit.filledBody));assert.ok(fit.filledBody.parts.every(Object.isFrozen));
 assert.throws(()=>{fit.filledBody.parts[0].box.x=0;},TypeError);
 assert.throws(()=>compileSourceSceneRoute({...input,fromId:'other'}),/proof/);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 const audit=auditSemanticEditability({slideSize:input.slideSize,pages:[{shapes:expected,images:[]}]});
 assert.equal(audit.passed,false);assert.equal(audit.metrics.fixedRelationshipPaintCount,2);
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});
