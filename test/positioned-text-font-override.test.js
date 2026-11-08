"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateDeckPageStructures}=require("../packages/slideclone-core/deck-ir-structure");
const {parsePositionedTextFontOverride:parse,validateScriptFontFamily}=require("../packages/slideclone-core/typography/positioned-text-font-override");
function fixture(){return [{pageIndex:0,shapes:[],images:[],tables:[],charts:[],textBoxes:[{id:"mixed",text:"AB",box:{x:0,y:0,w:100,h:30},
 font:{family:"Arial",sizePt:12,weight:"bold"},wrap:false,style:{wrap:false,fit:"none",textWarp:"textPlain"},
 positionedRuns:[{text:"A",box:{x:0,y:0,w:30,h:30},fontOverride:{family:"Microsoft YaHei",weight:"regular"}},
 {text:"B",box:{x:40,y:0,w:30,h:30},fontOverride:{eastAsianFamily:"KaiTi"}}]}]}];}
test("positioned text admits compact per-run font overrides without changing measured geometry or sequence",()=>{
 const pages=fixture(),before=structuredClone(pages);assert.doesNotThrow(()=>validateDeckPageStructures(pages));assert.deepEqual(pages,before);
 pages[0].textBoxes[0].font.eastAsianFamily="KaiTi";assert.doesNotThrow(()=>validateDeckPageStructures(pages));
});

test("font overlays reject unknown, malformed, excessive and hostile values without reading accessors",()=>{
 for(const value of [undefined,null])assert.equal(parse(value),null);
 assert.deepEqual(parse({}),{});assert.deepEqual(parse({eastAsianFamily:'family"&<face>',weight:"regular"}),{eastAsianFamily:'family"&<face>',weight:"regular"});
 let calls=0;const getter={get family(){calls++;throw Error("private-token");}},proxy=new Proxy({family:"Arial"},{get(){calls++;throw Error("private-token");}});
 for(const value of [[],1,"font",false,new Date(),getter,proxy,{sizePt:12},{Family:"Arial"},{family:null},{family:""},{family:" "},
  {family:"x".repeat(257)},{eastAsianFamily:"bad\nfont"},{family:"bad\0font"},{weight:"600"},{weight:"BOLD"},{weight:false}])assert.throws(()=>parse(value),/font/u);
 assert.equal(calls,0);assert.equal(validateScriptFontFamily("x".repeat(256)),undefined);
 for(const value of [true,[],"", " ","x".repeat(257),"family\u007f"] )assert.throws(()=>validateScriptFontFamily(value),/script font/u);
});

test("formatting overlays never allow source, text, size, opacity or measured geometry overrides",()=>{
 for(const patch of [{text:"C"},{box:{x:0,y:0,w:30,h:30}},{color:"#010203"},{source:{}},{opacity:.5},{sizePt:12}]){
  const pages=fixture();pages[0].textBoxes[0].positionedRuns[0].fontOverride=patch;
  assert.throws(()=>validateDeckPageStructures(pages),/font override/u);
 }
 for(const key of ["LatinFamily","EastAsianFamily","ComplexScriptFamily"]){
  const pages=fixture();pages[0].textBoxes[0].font[key]="Arial";assert.throws(()=>validateDeckPageStructures(pages),/casing/u);
 }
});
