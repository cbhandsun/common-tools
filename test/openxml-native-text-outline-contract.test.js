"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {validateDeckPageStructures}=require("../packages/slideclone-core/deck-ir-structure");
const {createMinimalDeckIr,runBuilder,invokeBuilder}=require("./helpers/openxml-contract-fixtures");
const {readZipEntry}=require("../packages/ooxml-core/pptx-inventory");
const {parseNativeTextOutline}=require("../packages/slideclone-core/native-text-outline");
function outlined(){const deck=createMinimalDeckIr("Editable"),text=deck.pages[0].textBoxes[0];text.style={textWarp:"textPlain",textOutlineColor:"#050201",textOutlineWidthPt:6.285};return deck;}

test("outline paint parsing handles empty and hostile inputs without reading accessors",()=>{
 for(const value of [undefined,null,{},Object.create(null)])assert.equal(parseNativeTextOutline(value),null);
 const style=outlined().pages[0].textBoxes[0].style;
 assert.deepEqual(parseNativeTextOutline({...style,textOutlineColor:"#abcDEF"}),{color:"#ABCDEF",widthPt:6.285});
 let calls=0;const accessor={get textOutlineColor(){calls++;throw Error("private-token");}};
 const proxy=new Proxy(style,{get(){calls++;throw Error("private-token");},ownKeys(){calls++;throw Error("private-token");}});
 for(const value of [[],false,1,"paint",new Date(),accessor,proxy])assert.throws(()=>parseNativeTextOutline(value),/text outline/u);
 assert.equal(calls,0);
});

test("text outline admission rejects incomplete, noncanonical and out-of-range paint",()=>{
 assert.doesNotThrow(()=>validateDeckPageStructures(outlined().pages));
 for(const patch of [{textOutlineColor:undefined},{textOutlineWidthPt:undefined},{textOutlineColor:null},{textOutlineColor:"050201"},
  {textOutlineColor:"#fff"},{textOutlineColor:"#050201FF"},{textOutlineColor:"url(private-token)"},{textOutlineWidthPt:"6"},
  {textOutlineWidthPt:0},{textOutlineWidthPt:-1},{textOutlineWidthPt:NaN},{textOutlineWidthPt:Infinity},{textOutlineWidthPt:12.001},
  {TextOutlineColor:"#050201"},{TextOutlineWidthPt:6},{textWarp:undefined}]){
  const deck=outlined();Object.assign(deck.pages[0].textBoxes[0].style,patch);
  assert.throws(()=>validateDeckPageStructures(deck.pages),/text outline|casing/u);
 }
 for(const width of [0.001,12]){const deck=outlined();deck.pages[0].textBoxes[0].style.textOutlineWidthPt=width;assert.doesNotThrow(()=>validateDeckPageStructures(deck.pages));}
});

test("native outline builder keeps editable text, foreground fill and ordinary text defaults",{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-text-outline-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck=outlined(),text=deck.pages[0].textBoxes[0];text.font.color="#FE2E4D";
 const ir=path.join(root,"deck.json"),out=path.join(root,"deck.pptx");fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(["--ir",ir,"--out",out]);
 let xml=readZipEntry(out,"ppt/slides/slide1.xml").toString("utf8");
 assert.match(xml,/<a:rPr\b[^>]*><a:ln\b[^>]*\bw="79820"[^>]*>[\s\S]*?<a:srgbClr val="050201"/u);
 assert.match(xml,/<a:ln\b[^>]*\bcap="rnd"/u);assert.match(xml,/<a:round\s*\/>/u);
 assert.match(xml,/<a:t>Editable<\/a:t>/u);assert.match(xml,/<a:srgbClr val="FE2E4D"/u);
 assert.doesNotMatch(xml,/<p:pic\b|<a:custGeom\b/u);
 text.font.opacity=.5;fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(["--ir",ir,"--out",out]);
 const translucent=readZipEntry(out,"ppt/slides/slide1.xml").toString("utf8");
 assert.match(translucent,/<a:ln\b[^>]*>[\s\S]*?<a:srgbClr val="050201"><a:alpha val="50000"\s*\/>/u);
 delete text.style.textOutlineColor;delete text.style.textOutlineWidthPt;
 fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(["--ir",ir,"--out",out]);xml=readZipEntry(out,"ppt/slides/slide1.xml").toString("utf8");
 assert.doesNotMatch(xml,/<a:rPr\b[^>]*><a:ln\b/u);
});

test("direct native builder rejects unsafe outline values instead of silently losing paint",{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-text-outline-invalid-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const patch of [{textOutlineColor:null},{textOutlineWidthPt:null},{textOutlineColor:"#FFF"},{textOutlineWidthPt:"6"},
  {textOutlineWidthPt:0},{textOutlineWidthPt:12.001},{TextOutlineColor:"#050201"},{textWarp:"textWave1"}]){
  const deck=outlined();Object.assign(deck.pages[0].textBoxes[0].style,patch);
  const ir=path.join(root,"deck.json"),out=path.join(root,"deck.pptx");fs.writeFileSync(ir,JSON.stringify(deck));
  assert.notEqual(invokeBuilder(["--ir",ir,"--out",out]).status,0);
 }
 const deck=outlined(),ir=path.join(root,"deck.json"),out=path.join(root,"deck.pptx");
 for(const key of ["textOutlineColor","textOutlineWidthPt"]){
  const missing=structuredClone(deck);delete missing.pages[0].textBoxes[0].style[key];fs.writeFileSync(ir,JSON.stringify(missing));
  assert.notEqual(invokeBuilder(["--ir",ir,"--out",out]).status,0);
 }
 fs.writeFileSync(ir,JSON.stringify(deck).replace('"textOutlineColor":"#050201"','"textOutlineColor":"#050201","textOutlineColor":"#050201"'));
 assert.notEqual(invokeBuilder(["--ir",ir,"--out",out]).status,0);
 for(const width of [.001,12]){deck.pages[0].textBoxes[0].style.textOutlineWidthPt=width;fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(["--ir",ir,"--out",out]);}
});
