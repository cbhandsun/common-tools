'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hasSourceArrowTerminal}=require('../packages/slideclone-core/ocr/ocr-source-arrow-evidence');
const {inspectSourceGraphicEvidence}=require('../packages/slideclone-core/ocr/ocr-source-graphic-evidence');
const {boundedOcrSourceDeck}=require('../packages/slideclone-core/ocr/ocr-source-deck');
function fixture(options={}){
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4,255)},box={x:20,y:20,w:20,h:30};
 const color=options.color??[28,55,83],background=options.background??[255,255,255];
 for(let i=0;i<80*80;i++)image.rgba.set([...background,255],i*4);
 const put=(x,y,c=color)=>image.rgba.set([...c,255],(y*80+x)*4);
 for(let y=21;y<=27;y++)for(let x=30-(y-21);x<=30+(y-21);x++)put(x,y);
 for(let y=28;y<=43;y++)for(let x=29;x<=31;x++)if(!options.broken||y!==35)put(x,y);
 for(let y=43;y<=45;y++)for(let x=29;x<80;x++)put(x,y);
 if(options.shortTail)for(let y=43;y<=45;y++)for(let x=40;x<80;x++)put(x,y,background);
 if(options.branch)for(let y=43;y<=45;y++)for(let x=0;x<29;x++)put(x,y);
 if(options.detached)for(let y=40;y<=42;y++)for(let x=29;x<=31;x++)put(x,y,background);
 if(options.counter){
  for(let y=0;y<80;y++)for(let x=0;x<80;x++)put(x,y,background);
  for(const top of [23,33])for(let y=top;y<top+8;y++)for(let x=26;x<35;x++)if(x<28||x>=33||y<top+2||y>=top+6)put(x,y);
 }
 if(options.truncated)box.y=25;
 return {image,box};
}
function rotate({image,box}){
 const rgba=Buffer.alloc(image.rgba.length);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)rgba.set(image.rgba.subarray((y*image.width+x)*4,(y*image.width+x)*4+4),(x*image.height+image.height-1-y)*4);
 return {image:{width:image.height,height:image.width,rgba},box:{x:image.height-box.y-box.h,y:box.x,w:box.h,h:box.w}};
}
test('ordinary-size bent arrows are independent of rotation and palette',()=>{
 for(const options of [{},{color:[120,25,45],background:[240,220,210]},{color:[220,235,250],background:[25,35,45]}]){
  let f=fixture(options);for(let turn=0;turn<4;turn++){assert.equal(hasSourceArrowTerminal(f),true,JSON.stringify({options,turn}));f=rotate(f);}
 }
});
test('broken, branched, detached, clipped and counter-like geometry cannot veto OCR',()=>{
 for(const option of ['shortTail','branch','broken','detached','counter','truncated']){
  let f=fixture({[option]:true});for(let turn=0;turn<4;turn++){assert.equal(hasSourceArrowTerminal(f),false,option+' '+turn);f=rotate(f);}
 }
 assert.equal(hasSourceArrowTerminal(fixture({color:[240,240,240]})),false);
});
test('empty, invalid, extreme, transparent and hostile controls fail closed without executing getters',()=>{
 const f=fixture();let calls=0;const hostile=Object.defineProperty({},'box',{get(){calls++;throw Error('private-data');}});
 const imageHostile=Object.defineProperty({},'rgba',{get(){calls++;throw Error('private-data');}});
 for(const value of [null,[],{},hostile,new Proxy(f,{}),{...f,box:new Proxy(f.box,{})},{...f,image:imageHostile},
  {...f,box:{...f.box,w:Infinity}},{...f,box:{...f.box,x:-1}},{...f,box:{...f.box,w:0}},
  {...f,box:{...f.box,w:1000}},{...f,image:{...f.image,rgba:new Uint8Array(2)}},
  {...f,image:{width:513,height:513,rgba:Buffer.alloc(513*513*4)}}])assert.equal(hasSourceArrowTerminal(value),false);
 assert.equal(hasSourceArrowTerminal(fixture({color:[255,255,255]})),false);
 const transparent=fixture();transparent.image.rgba[3+((25*80)+30)*4]=0;assert.equal(hasSourceArrowTerminal(transparent),false);
 assert.equal(calls,0);
});
function request(f=fixture(),text='X'){
 const line={text,confidence:.63,box:f.box};
 const lines=Array.from({length:4},(_,i)=>({text:'Reference '+i,confidence:.99,box:{x:1,y:1,w:12,h:3}}));
 return {image:f.image,line,lines:[...lines,line],referenceHeight:30};
}
test('real graphic admission uses geometry rather than recognized characters and charges failed scans',()=>{
 for(const text of ['X','7','字']){
  const input=request(fixture(),text),before=Buffer.from(input.image.rgba),result=inspectSourceGraphicEvidence(input);
  assert(result.evidence);assert(result.evidence.reasons.includes('connected-source-overflow'));
  assert(result.scannedPixels>0&&result.scannedPixels<=262144);assert.equal(result.evidence.scannedPixels,result.scannedPixels);
  assert.deepEqual(input.image.rgba,before);
 }
 const rejected=inspectSourceGraphicEvidence(request(fixture({branch:true})));
 assert.equal(rejected.evidence,null);assert(rejected.scannedPixels>0);
});
test('confidence, real text rows and unchanged scan cap retain their vetoes',()=>{
 const f=request();assert.deepEqual(inspectSourceGraphicEvidence({...f,maxScanPixels:1}),{evidence:null,scannedPixels:0});
 assert.equal(inspectSourceGraphicEvidence({...f,line:{...f.line,confidence:.9}}).evidence,null);
 const neighbor={text:'real text',confidence:.99,box:{x:41,y:26,w:20,h:15}};
 assert.deepEqual(inspectSourceGraphicEvidence({...f,lines:[...f.lines,neighbor]}),{evidence:null,scannedPixels:0});
 for(const text of ['ordinary word','.',':'])assert.equal(inspectSourceGraphicEvidence(request(fixture(),text)).evidence,null);
});
test('bounded source-deck assembly excludes only the proven arrow from native text',()=>{
 const f=fixture(),refs=Array.from({length:4},(_,i)=>({text:'Reference '+i,confidence:.99,box:{x:1,y:1,w:12,h:30}}));
 const build=(image,preserveUncertainGlyphs=true)=>boundedOcrSourceDeck({metadata:{dimensions:{widthPx:80,heightPx:80}},
  sourceImage:'assets/source.png',sourceRaster:image,preserveUncertainGlyphs,ocr:{lines:[...refs,{text:'X',confidence:.63,box:f.box}]}});
 const deck=build(f.image);
 assert.equal(deck.meta.ocrAdmission.rasterFallbackGlyphs,1);assert.equal(deck.pages[0].textBoxes.length,4);
 assert.equal(build(f.image,false).pages[0].textBoxes.length,5);
 assert.equal(build(fixture({counter:true}).image).pages[0].textBoxes.length,5);
});
