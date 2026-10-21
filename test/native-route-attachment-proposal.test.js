"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeNativeRouteAttachment:propose}=require('../packages/slideclone-core/native-route-attachment-proposal');
const request=()=>({from:{id:'a',box:{x:10,y:10,w:30,h:40},side:'right'},to:{id:'b',box:{x:100,y:10,w:30,h:40},side:'left'},commands:[[0,43,27],[1,97,28]]});
test('logical gap ports preserve actual route endpoints and independently measured positions',()=>{
 const input=request(),before=structuredClone(input),p=propose(input);assert.deepEqual(input,before);
 assert.equal(p.style.startAnchor.position,.425);assert.equal(p.style.endAnchor.position,.45);
 assert.equal(p.style.startAnchor.dxPt,3);assert.equal(p.style.endAnchor.dxPt,-3);
 assert.equal(p.style.startAnchor.siteOffsetKind,'source-visible-gap');assert.equal(p.sourceProvenanceVerified,false);
 assert.deepEqual(p.box,{x:43,y:27,w:54,h:1});
});
test('inward custom contour sites and reversed routes preserve geometry without gap authority',()=>{
 const input=request();input.commands=[[0,38,27],[1,102,28]];const p=propose(input);
 assert.equal(p.style.startAnchor.dxPt,-2);assert.equal(p.style.endAnchor.dxPt,2);assert.equal(p.style.startAnchor.siteOffsetKind,undefined);
 const reverse={from:input.to,to:input.from,commands:[[0,102,28],[1,38,27]]};assert.deepEqual(propose(reverse).box,{x:102,y:28,w:-64,h:-1});
});
test('all four sides and exact supported elbows compile without reshaping',()=>{
 const r=request();r.from.side='bottom';r.to.side='top';r.commands=[[0,25,52],[1,115,52],[1,115,8]];
 const p=propose(r);assert.equal(p.style.connectorType,'elbow-2');assert.equal(p.style.startAnchor.dyPt,2);assert.equal(p.style.endAnchor.dyPt,-2);
 r.commands=[[0,25,52],[1,70,52],[1,70,8],[1,115,8]];assert.equal(propose(r).style.connectorType,'elbow-3');
});
test('curves, noncanonical bends, distant or tangential sites remain unbound',()=>{
 for(const commands of [[[0,43,27],[2,50,30,80,30,97,28]],[[0,43,27],[1,60,20],[1,97,28]],[[0,43,55],[1,97,28]],[[0,70,27],[1,97,28]],[[0,43,27],[1,43,27]]]){
  assert.equal(propose({...request(),commands}),null);
 }
});
test('invalid, extreme, empty and executable inputs fail safely',()=>{
 const changes=[r=>{r.from.id='token<value>';},r=>{r.to.id='a';},r=>{r.commands=[];},r=>{r.commands=[[0,43,27],[1,NaN,28]];},
  r=>{r.commands=[[0,43,27],[1,97,'28']];},r=>{r.commands=[[0,43,27],[0,97,28]];},r=>{r.from.box.w=0;},r=>{r.from.side='center';},r=>{r.extra='secret';}];
 for(const change of changes){const r=request();change(r);assert.throws(()=>propose(r),/^TypeError: Native route attachment proposal is invalid$/u);}
 for(const input of [null,{},[],{from:null}])assert.throws(()=>propose(input));
 let calls=0;const r=request();Object.defineProperty(r.from,'box',{get(){calls++;return {};}});assert.throws(()=>propose(r));assert.equal(calls,0);
 assert.throws(()=>propose(new Proxy({},{ownKeys(){calls++;return [];}})));assert.equal(calls,0);
 const side=request();side.from.side={toString(){calls++;return 'right';}};assert.throws(()=>propose(side));assert.equal(calls,0);
 const sparse=request();delete sparse.commands[1];sparse.commands[Symbol('unexpected')]=true;assert.throws(()=>propose(sparse));
});
