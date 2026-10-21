"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {preserveSourceWordFonts:preserve}=require("../packages/slideclone-core/source-word-font-identity");
const box={x:1,y:2,w:3,h:4};
const run=(text,fontOverride)=>({text,box:{...box},...(fontOverride?{fontOverride}:{})});
test("font spans preserve exact Unicode, spaces and formatting without changing measured boxes",()=>{
 const previous=[run('A 🌍',{family:'KaiTi',weight:'bold'})],measured=[run('A '),run('🌍')];
 const before=structuredClone({previous,measured});
 const next=preserve(measured,previous,'A 🌍');
 assert.deepEqual(next,measured.map(r=>({...r,fontOverride:{family:'KaiTi',weight:'bold'}})));
 assert.deepEqual({previous,measured},before);assert.notEqual(next[0].box,measured[0].box);
 next[0].fontOverride.family='Arial';assert.equal(previous[0].fontOverride.family,'KaiTi');
});
test("equivalent font fields merge independent of key order, conflicting or stale spans remain unchanged",()=>{
 const previous=[run('A',{family:'Arial',weight:'bold'}),run('B',{weight:'bold',family:'Arial'})];
 assert.equal(preserve([run('AB')],previous,'AB')[0].fontOverride.family,'Arial');
 previous[1].fontOverride.family='KaiTi';assert.equal(preserve([run('AB')],previous,'AB'),null);
 assert.equal(preserve([run('AB')],previous,'AC'),null);
 assert.equal(preserve([run('AC')],previous,'AB'),null);
});
test("absent and empty overrides retain parent defaults, and the existing 512-character bound is exact",()=>{
 assert.deepEqual(preserve([run('AB')],undefined,'AB'),[run('AB')]);
 assert.deepEqual(preserve([run('AB')],[run('A',{}),run('B')],'AB'),[run('AB')]);
 const text='A'.repeat(512);assert.equal(preserve([run(text)],[run(text)],text)[0].text,text);
 assert.throws(()=>preserve([run(text)],[run(text+'A')],text),/font span/);
 assert.throws(()=>preserve([run(text)],[run(text),run('A')],text),/font sequence/);
 for(const old of [null,[],Array(513).fill(run('A')),new Array(1),{},1])assert.throws(()=>preserve([run('A')],old,'A'),/font sequence/);
});
test("malformed and hostile font spans fail without reading accessors, proxies or disallowed overlays",()=>{
 let reads=0;const getter={get text(){reads++;throw Error('private-input');}},proxy=new Proxy(run('A'),{get(){reads++;throw Error('private-input');}});
 const arrayGetter=[run('A')];Object.defineProperty(arrayGetter,'0',{get(){reads++;throw Error('private-input');}});
 const arrayProxy=new Proxy([run('A')],{get(){reads++;throw Error('private-input');}});
 for(const old of [[getter],[proxy],arrayGetter,arrayProxy,[run('')],[run('A\n')],[run('A',{color:'#111111'})]])
  assert.throws(()=>preserve([run('A')],old,'A'),error=>error instanceof TypeError&&!/private-input/.test(error.message));
 assert.equal(reads,0);
});
