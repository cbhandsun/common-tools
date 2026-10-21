"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {parseLocalTargets,localResponseFormat,decodeLocalResponse}=require('../packages/slideclone-core/source-scene-local-response');
const targets={reviews:[2,7],missing:[12]},response={reviewsByIndex:{2:'text',7:'uncertain'},recoveredByIndex:{12:{text:null,confidence:0,box_2d:null,color:null}}};
test('relation endpoint transport uses the existing shared slots with exact keys and no geometry authority',()=>{
 const t={...targets,relations:[13]},r={...response,relationsByIndex:{13:{fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}}};
 assert.deepEqual(localResponseFormat(t).json_schema.schema.properties.relationsByIndex.required,['13']);
 assert.deepEqual(decodeLocalResponse(r,t).relations,[{index:13,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}]);
 for(const bad of [{...t,relations:[12]},{reviews:Array.from({length:32},(_,i)=>i),missing:[],relations:[32]},
  {reviews:[],missing:[],relations:Array.from({length:25},(_,i)=>i)},{...t,relations:new Array(1)}])assert.throws(()=>parseLocalTargets(bad),TypeError);
 for(const mutate of [v=>delete v.relationsByIndex,v=>v.relationsByIndex={},v=>v.relationsByIndex[14]=v.relationsByIndex[13],v=>v.relationsByIndex[13].extra=true]){
  const v=structuredClone(r);mutate(v);assert.throws(()=>decodeLocalResponse(v,t),TypeError);
 }
});
test('inventory transport shares all local slots and binds exact keyed child proposals',()=>{
 const t={...targets,structures:[13],inventories:[14]},r={...response,structuresByIndex:{13:{kind:'unknown',confidence:0,regionId:null,box_2d:null}},inventoriesByIndex:{14:{kind:'icon',confidence:.99,regionId:'region-root',box_2d:[10,10,30,30]}}};
 assert.deepEqual(localResponseFormat(t).json_schema.schema.properties.inventoriesByIndex.required,['14']);
 assert.deepEqual(localResponseFormat(t).json_schema.schema.properties.inventoriesByIndex.properties[14].properties.kind.enum,['icon','unknown']);
 assert.deepEqual(decodeLocalResponse(r,t).inventories,[{index:14,kind:'icon',confidence:.99,regionId:'region-root',box_2d:[10,10,30,30]}]);
 for(const bad of [{...t,inventories:[13]},{reviews:Array.from({length:32},(_,i)=>i),missing:[],inventories:[32]},{...t,inventories:new Array(1)}])assert.throws(()=>parseLocalTargets(bad),TypeError);
 for(const mutate of [v=>delete v.inventoriesByIndex,v=>v.inventoriesByIndex={},v=>v.inventoriesByIndex[15]=v.inventoriesByIndex[14],v=>v.inventoriesByIndex[14].extra=true]){const v=structuredClone(r);mutate(v);assert.throws(()=>decodeLocalResponse(v,t),TypeError);}
});

test('structural observations share the same 32 slots and exact keyed transport',()=>{
 const t={...targets,structures:[13]},r={...response,structuresByIndex:{13:{kind:'container',confidence:.99,regionId:'region-root',box_2d:null}}};
 const schema=localResponseFormat(t).json_schema.schema;assert.deepEqual(schema.properties.structuresByIndex.required,['13']);
 assert.deepEqual(decodeLocalResponse(r,t).structures,[{index:13,kind:'container',confidence:.99,regionId:'region-root',box_2d:null}]);
 for(const bad of [{...t,structures:[12]},{reviews:Array.from({length:32},(_,i)=>i),missing:[],structures:[32]},
  {...t,structures:new Array(1)},{...t,structures:[13,13]}])assert.throws(()=>parseLocalTargets(bad),TypeError);
 for(const bad of [{...response},{...r,structuresByIndex:{}},{...r,structuresByIndex:{...r.structuresByIndex,14:r.structuresByIndex[13]}},
  {...r,structuresByIndex:{13:{...r.structuresByIndex[13],extra:true}}}])assert.throws(()=>decodeLocalResponse(bad,t),TypeError);
});
test('exact local schema binds every target without granting glyph ownership',()=>{
 const schema=localResponseFormat(targets).json_schema.schema;
 assert.deepEqual(schema.properties.reviewsByIndex.required,['2','7']);assert.equal(schema.properties.reviewsByIndex.additionalProperties,false);
 assert.deepEqual(schema.properties.recoveredByIndex.required,['12']);
 assert.deepEqual(decodeLocalResponse(response,targets),{reviews:[{index:2,kind:'text'},{index:7,kind:'uncertain'}],recoveredText:[{index:12,text:null,confidence:0}]});
 assert.deepEqual(decodeLocalResponse({reviewsByIndex:{},recoveredByIndex:{}},{reviews:[],missing:[]}),{reviews:[],recoveredText:[]});
});
test('local target parser rejects duplicates, sparse, overlaps, extreme, proxies and accessors before reading input',()=>{
 for(const bad of [null,{}, {reviews:[2,2],missing:[]},{reviews:[2],missing:[2]},{reviews:new Array(1),missing:[]},{reviews:[544],missing:[]},{reviews:[NaN],missing:[]},{reviews:Array.from({length:32},(_,i)=>i),missing:[32]},new Proxy(targets,{})])assert.throws(()=>parseLocalTargets(bad),/Scene local/);
 let called=0;assert.throws(()=>parseLocalTargets({get reviews(){called++;return [];},missing:[]}),/Scene local/);assert.equal(called,0);
});
test('keyed local responses reject missing, unsolicited, malformed and hostile observations without partial acceptance',()=>{
 for(const mutate of [r=>delete r.reviewsByIndex[2],r=>r.reviewsByIndex[8]='text',r=>r.reviewsByIndex[2]='delete',r=>delete r.recoveredByIndex[12],r=>r.recoveredByIndex[12].extra=true,r=>r.recoveredByIndex[12]=null,r=>r.extra=true]){
  const r=structuredClone(response);mutate(r);assert.throws(()=>decodeLocalResponse(r,targets),/Scene local/);
 }
 let called=0;const hostile={reviewsByIndex:response.reviewsByIndex,get recoveredByIndex(){called++;return {};}};
 assert.throws(()=>decodeLocalResponse(hostile,targets),/Scene local/);assert.equal(called,0);
});
