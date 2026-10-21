'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMeasuredScenePortFrame,measuredScenePortBodyMask,measuredSceneContourPort}=require('../packages/slideclone-core/source-scene-port-evidence');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/source-scene-route-compiler');
function fixture(){
 const image={width:150,height:150,rgba:Buffer.alloc(150*150*4,255)},budget={used:0},nodes=[];
 const put=(x,y,rgb)=>image.rgba.set([...rgb,255],(y*150+x)*4);
 for(const [id,c,fill] of [['a',40,[220,150,180]],['b',90,[245,210,165]]]){
  const box={x:c-20,y:c-20,w:40,h:40},perimeterPixels=[];
  for(let y=c-21;y<=c+21;y++)for(let x=c-21;x<=c+21;x++){
   const r=Math.hypot(x+.5-c,y+.5-c);if(r<=20){put(x,y,r>=18?[30,60,90]:fill);if(r>=18)perimeterPixels.push(y*150+x);}
  }
  const segments=Array.from({length:32},(_,i)=>({type:i?'lnTo':'moveTo',points:[{x:.5+.5*Math.cos(i*Math.PI/16),y:.5+.5*Math.sin(i*Math.PI/16)}]}));
  segments.push({type:'close',points:[]});
  const color='#'+fill.map(v=>v.toString(16).padStart(2,'0')).join('');
  nodes.push({id,box,portFrame:createMeasuredScenePortFrame(image,{box,fill:color,segments,perimeterPixels})});
 }
 for(let x=54;x<=76;x++)for(let d=-1;d<=1;d++)put(x,x+d,[30,60,90]);
 return {image,from:nodes[0],to:nodes[1],direction:'undirected',textMasks:[],budget,put};
}
test('a continuous diagonal between curved source bodies is measured outside their actual contours',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measureSourceSceneRoute(f);
 assert.ok(result.fit,result.reason);assert.ok(result.fit.points.length>=2);
 assert.ok(result.fit.startOffset||result.fit.endOffset,'actual source ports need offsets from rectangular sides');
 const r={id:'diagonal',regionId:'root',fromId:'a',toId:'b',direction:'undirected'};
 const parts=compileSourceSceneRoute({fit:result.fit,relation:r,fromId:'a',toId:'b',widthPx:150,heightPx:150,slideSize:{widthPt:150,heightPt:150}});
 const lines=parts.filter(p=>p.type==='line');assert.ok(lines.length);assert.ok(lines.every(p=>!p.style.startArrow&&!p.style.endArrow));
 assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 assert.equal(lines[0].source.sourcePhysicalAttachment,true);assert.deepEqual(f.image.rgba,before);
 assert.ok(f.budget.used<=4000000);
});
test('private contour ownership preserves empty envelope corners and rejects copied or hostile controls',()=>{
 const f=fixture(),window={x:15,y:15,w:50,h:50},work={checks:0};
 const mask=measuredScenePortBodyMask(f.image,f.from.portFrame,f.from.box,window,work);assert.ok(mask);
 assert.equal(mask[(21-15)*50+21-15],0);assert.equal(mask[(40-15)*50+40-15],1);
 assert.equal(mask[(40-15)*50+59-15],1);assert.ok(work.checks>0);
 for(const token of [null,{},structuredClone(f.from.portFrame),new Proxy(f.from.portFrame,{})])
  assert.equal(measuredScenePortBodyMask(f.image,token,f.from.box,window,{checks:0}),null);
 assert.equal(measuredScenePortBodyMask({...f.image,rgba:Buffer.from(f.image.rgba)},f.from.portFrame,f.from.box,window,{checks:0}),null);
 for(const bad of [{...window,w:0},{...window,w:150},{...window,x:NaN},{...window,x:.5},new Proxy(window,{})])
  assert.equal(measuredScenePortBodyMask(f.image,f.from.portFrame,f.from.box,bad,{checks:0}),null);
 let reads=0;const hostile={get checks(){reads++;throw Error('private');}};
 assert.equal(measuredScenePortBodyMask(f.image,f.from.portFrame,f.from.box,window,hostile),null);
 assert.equal(measuredSceneContourPort(f.image,f.from.portFrame,f.from.box,40,'right',hostile),null);assert.equal(reads,0);
 assert.equal(measuredScenePortBodyMask(f.image,f.from.portFrame,f.from.box,window,{checks:4000000}),null);
 assert.equal(measuredSceneContourPort(f.image,f.from.portFrame,f.from.box,40,'right',{checks:4000000}),null);
});
test('curved-body routing retains text ownership, continuity, actual port and budget gates',()=>{
 for(const mode of ['text','break','blank','forged','budget']){
  const f=fixture();
  if(mode==='text')f.textMasks=[{x:62,y:62,w:5,h:5}];
  if(mode==='break')for(let x=63;x<=65;x++)for(let y=59;y<=69;y++)f.put(x,y,[255,255,255]);
  if(mode==='blank')f.image.rgba.fill(255);
  if(mode==='forged')f.from.portFrame={};
  if(mode==='budget')f.budget.used=4000000;
  assert.equal(measureSourceSceneRoute(f).fit,null,mode);
 }
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});
test('terminal preservation keeps separate components and distant contacts without drawing new pixels',()=>{
 const {sourceRouteTerminalMask,thinSourceRoute}=require('../packages/slideclone-core/source-route-centerline');
 const width=30,height=20,mask=new Uint8Array(width*height);
 for(const y of [4,14])for(let x=3;x<=24;x++)for(let d=-1;d<=1;d++)mask[(y+d)*width+x]=1;
 const before=mask.slice(),work={checks:0};
 const from=i=>i%width===3?{index:i,point:{x:3,y:Math.floor(i/width)},distance:Math.abs(Math.floor(i/width)%10-4)}:null;
 const to=i=>i%width===24?{index:i,point:{x:24,y:Math.floor(i/width)},distance:Math.abs(Math.floor(i/width)%10-4)}:null;
 const terminals=sourceRouteTerminalMask(mask,width,height,from,to,work);assert.ok(terminals);
 assert.equal(terminals.reduce((sum,n)=>sum+n,0),4);assert.deepEqual(mask,before);
 for(let i=0;i<mask.length;i++)if(terminals[i])assert.equal(mask[i],1);
 const skeleton=thinSourceRoute(mask,width,height,work,terminals);assert.ok(skeleton);
 for(let i=0;i<mask.length;i++)if(terminals[i])assert.equal(skeleton[i],1);
 // A connected branch has two physically distinct source contacts at one
 // node. Preserve both; downstream complete-path coverage must inspect it.
 for(let y=4;y<=14;y++)mask[y*width+10]=1;
 const branched=sourceRouteTerminalMask(mask,width,height,from,to,{checks:0});assert.equal(branched.reduce((sum,n)=>sum+n,0),4);
 assert.equal(sourceRouteTerminalMask(mask,width,height,from,to,{checks:4000000}),null);
 const empty=new Uint8Array(width*height);assert.equal(sourceRouteTerminalMask(empty,width,height,from,to,{checks:0}).some(Boolean),false);
});
test('the original pair cap counts connected source hypotheses and still rejects actual excess',()=>{
 const {sourceRouteConnectedPairs}=require('../packages/slideclone-core/source-route-centerline');
 const width=30,height=40,mask=new Uint8Array(width*height);
 for(let y=1;y<height;y+=3)for(let x=1;x<=20;x++)mask[y*width+x]=1;
 const starts=Array.from({length:13},(_,i)=>({index:(1+i*3)*width+1,id:'a'+i}));
 const ends=Array.from({length:13},(_,i)=>({index:(1+i*3)*width+20,id:'b'+i}));
 const before=mask.slice(),pairs=sourceRouteConnectedPairs(mask,width,height,starts,ends,{checks:0});
 assert.equal(pairs.length,13);assert.ok(pairs.every(([a,b])=>a.id.slice(1)===b.id.slice(1)));assert.deepEqual(mask,before);
 assert.deepEqual(sourceRouteConnectedPairs(mask,width,height,[],[],{checks:0}),[]);
 assert.equal(sourceRouteConnectedPairs(mask,width,height,Array(6).fill(starts[0]),Array(6).fill(ends[0]),{checks:0}),null);
 assert.equal(sourceRouteConnectedPairs(mask,width,height,starts,ends,{checks:4000000}),null);
 const detached=mask.slice();detached[1*width+10]=0;
 assert.equal(sourceRouteConnectedPairs(detached,width,height,[starts[0]],[ends[0]],{checks:0}).length,0);
});
