"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {parseRegionTextProposals:parse}=require('../packages/slideclone-core/region-text-proposal');
const context=()=>({regionId:'card',bounds:{x:0,y:0,w:200,h:100},owners:[{id:'badge',box:{x:5,y:5,w:40,h:40}}],existing:[]});
const proposal=()=>({regionId:'card',additions:[{id:'missed-label',ownerId:'badge',text:'7',box:{x:10,y:10,w:20,h:25},font:{family:'Arial',sizePt:24,color:'#FFFFFF',bold:true}}]});
test('missing OCR text becomes native text bound to a real owner without source authority',()=>{
 const raw=proposal(),before=structuredClone(raw),rows=parse(raw,context());assert.deepEqual(raw,before);
 assert.equal(rows[0].text,'7');assert.equal(rows[0].source.nativeComponentGroupId,'badge');assert.equal(rows[0].source.sourceProvenanceVerified,false);
 assert.equal(rows[0].font.sizePt,24);assert.deepEqual(parse({regionId:'card',additions:[]},context()),[]);
});
test('same text may recur, but an overlapping OCR label or proposal cannot duplicate it',()=>{
 const c=context();c.existing=[{text:'7',box:{x:60,y:5,w:20,h:20}}];assert.equal(parse(proposal(),c).length,1);
 c.existing[0].box.x=10;assert.throws(()=>parse(proposal(),c),/proposal is invalid/u);
 const raw=proposal();raw.additions.push({...raw.additions[0],id:'second'});assert.throws(()=>parse(raw,context()));
});
test('invalid regions, owners, bounds, fonts and extreme payloads fail atomically',()=>{
 const changes=[r=>{r.regionId='other';},r=>{r.additions[0].ownerId='unknown';},r=>{r.additions[0].box.x=50;},r=>{r.additions[0].box.w=0;},
  r=>{r.additions[0].box.h=Infinity;},r=>{r.additions[0].font.sizePt='24';},r=>{r.additions[0].font.sizePt=401;},r=>{r.additions[0].font.color='url(secret)';},
  r=>{r.additions[0].text='';},r=>{r.additions[0].text='x'.repeat(513);},r=>{r.additions[0].font.bold=1;},r=>{r.extra=true;},r=>{r.additions=Array(33).fill(r.additions[0]);}];
 for(const change of changes){const raw=proposal();change(raw);assert.throws(()=>parse(raw,context()),/^TypeError: Region text proposal is invalid$/u);}
 for(const raw of [null,[],{},'content'])assert.throws(()=>parse(raw,context()));
});
test('unsafe input cannot execute accessors, inject XML controls or echo content into errors',()=>{
 let calls=0;const raw=proposal();Object.defineProperty(raw.additions[0],'text',{get(){calls++;return 'secret';}});
 assert.throws(()=>parse(raw,context()));assert.equal(calls,0);
 const proxy=new Proxy({},{ownKeys(){calls++;return [];}});assert.throws(()=>parse(proxy,context()));assert.equal(calls,0);
 for(const text of ['secret\u0000','secret\ud800','secret\u202e','secret\uffff']){const p=proposal();p.additions[0].text=text;assert.throws(()=>parse(p,context()),e=>!e.message.includes('secret'));}
 const array=proposal();Object.defineProperty(array.additions,'0',{get(){calls++;return {};}});assert.throws(()=>parse(array,context()));assert.equal(calls,0);
 const sparse=proposal();sparse.additions=Array(1);sparse.additions[Symbol('unexpected')]=true;assert.throws(()=>parse(sparse,context()));
});
test('unicode and extreme supported typography stay text; duplicate owners and IDs are rejected',()=>{
 const raw=proposal();raw.additions[0].text='  e\u0301 & <文字>  ';raw.additions[0].font.sizePt=400;
 assert.equal(parse(raw,context())[0].text,'é & <文字>');
 const c=context();c.owners.push(c.owners[0]);assert.throws(()=>parse(proposal(),c));
 const p=proposal();p.additions.push(structuredClone(p.additions[0]));assert.throws(()=>parse(p,context()));
});
