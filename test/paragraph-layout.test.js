"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {layoutParagraph}=require("../packages/slideclone-core/typography/paragraph-layout");
const input=text=>({text,font:{family:"Arial",sizePt:10,lineHeightMultiple:1.2},box:{x:10,y:20,w:50,h:100}});
const measure=(s,f)=>({width:[...s].length*(f.weight==="bold"?12:10),height:10});
test("whole-line shaping preserves Unicode graphemes, whitespace and empty lines",()=>{
 for(const text of ["hello world","中文文字布局","ΩЖ👨‍👩‍👧‍👦漢字","a\n\nb\n","","longwordwithnospaces"]){const r=layoutParagraph(input(text),measure);
  assert.equal(r.lines.map(l=>l.text).join(""),text.replaceAll("\n",""));assert.ok(r.lines.every(l=>l.x===10&&l.h===12));}
 const emoji=layoutParagraph(input("👨‍👩‍👧‍👦"),measure);assert.equal(emoji.lines.length,1);assert.equal(emoji.overflow,true);
});
test("rich color/weight runs, measured advances and alignment survive wrapping",()=>{
 const v=input("AAAA BBBB");v.runs=[{text:"AAAA ",font:v.font},{text:"BBBB",font:{...v.font,weight:"bold",color:"#FF0000"}}];
 const r=layoutParagraph(v,measure);assert.deepEqual(r.lines.map(l=>l.text),["AAAA ","BBBB"]);assert.equal(r.lines[1].w,48);
 assert.equal(r.lines[1].fragments[0].font.color,"#FF0000");v.font.align="right";assert.equal(layoutParagraph(v,measure).lines[1].x,12);
});
test("overflow and invalid measurements/content/leading have explicit outcomes",()=>{
 const v=input("a\nb");v.box.h=10;assert.equal(layoutParagraph(v,measure).overflow,true);
 for(const bad of [null,{...input("x"),font:{sizePt:NaN}},{...input("x"),text:"\u0000"},{...input("x"),text:"x".repeat(16001)},
 {...input("x"),runs:[{text:"wrong",font:{sizePt:10}}]}])assert.throws(()=>layoutParagraph(bad,measure));
 assert.throws(()=>layoutParagraph(input("x"),()=>({width:NaN,height:10})));
});

test("layout boundaries reject getters, proxies, cycles and sparse runs before measuring",()=>{
 let accesses=0,measurements=0;const guarded=()=>{measurements++;return {width:1,height:1};};
 const accessor=input("x");Object.defineProperty(accessor.font,"sizePt",{get(){accesses++;return 10;}});
 const proxy=new Proxy(input("x"),{get(){accesses++;throw new Error("secret");}});
 const cycle=input("x");cycle.loop=cycle;
 const sparse=input("x");sparse.runs=new Array(2);
 for(const bad of [accessor,proxy,cycle,sparse])assert.throws(()=>layoutParagraph(bad,guarded));
 assert.equal(accesses,0);assert.equal(measurements,0);
 assert.throws(()=>layoutParagraph(input("x"),()=>({get width(){accesses++;return 1;},height:1})));
 assert.equal(accesses,0);
});
