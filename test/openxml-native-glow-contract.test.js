'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runBuilder,invokeBuilder,createMinimalDeckIr}=require('./helpers/openxml-contract-fixtures');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-glow-contract-'));
 assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck=createMinimalDeckIr(''),style={closed:false,fill:'none',stroke:'#1486DD',strokeWidthPt:3,
  freeformPath:'[[0,0,0],[1,0.5,0],[2,0.8,0,1,0.2,1,0.5],[1,1,1]]',
  strokeGradient:{type:'linear',angleDeg:90,stops:[{position:0,color:'#208A57'},{position:1,color:'#1486DD'}]},endArrow:'triangle'};
 deck.pages[0].shapes=[{id:'whole-route',type:'freeform',box:{x:40,y:30,w:150,h:200},style}];
 const ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');
 const save=()=>fs.writeFileSync(ir,JSON.stringify(deck));
 const build=()=>{save();runBuilder(['--ir',ir,'--out',out]);return readZipEntryText(out,'ppt/slides/slide1.xml');};
 return {deck,style,ir,out,save,build};
}
test('native glow remains on one whole path and preserves its geometry, gradient, arrows and default XML',t=>{
 const {style,build}=fixture(t),bare=build();style.glow={radiusPt:2,alpha:.7,color:'#abDfF4'};
 const xml=build();assert.match(xml,/<a:glow rad="25400"><a:srgbClr val="ABDFF4"><a:alpha val="70000"\s*\/><\/a:srgbClr><\/a:glow>/u);
 assert.equal((xml.match(/name="whole-route"/gu)||[]).length,1);assert.doesNotMatch(xml,/<p:pic\b/u);
 assert.equal(xml.replace(/<a:effectLst\b[^>]*>[\s\S]*?<\/a:effectLst>/u,''),bare);
 delete style.glow;assert.equal(build(),bare);style.glow=null;assert.equal(build(),bare);
});
test('native glow and native shadow use valid effect ordering, including numeric boundaries',t=>{
 const {style,build}=fixture(t);style.glow={radiusPt:40,alpha:1,color:'#00FFFF'};style.shadow={color:'#000000',blurPt:2,distancePt:1};
 assert.match(build(),/<a:effectLst\b[^>]*><a:glow rad="508000">[\s\S]*?<\/a:glow><a:outerShdw\b/u);
 style.glow={radiusPt:0,alpha:0,color:'#000000'};assert.match(build(),/<a:glow rad="0">[\s\S]*?<a:alpha val="0"/u);
});
test('native glow rejects malformed, unsafe and extreme direct writer inputs with bounded diagnostics',t=>{
 const f=fixture(t),valid={radiusPt:2,alpha:.7,color:'#ABDFF4'};
 const cases=[[],true,2,'private-glow-token',{}, {...valid,radiusPt:-1},{...valid,radiusPt:40.01},{...valid,radiusPt:null},
  {...valid,alpha:-.1},{...valid,alpha:1.1},{...valid,color:'#12345g'},{...valid,color:'private-glow-token'},
  {...valid,radiusPt:'private-glow-token'},{...valid,unknown:'private-glow-token'}];
 const check=()=>{const r=invokeBuilder(['--ir',f.ir,'--out',f.out]);assert.equal(r.error,undefined);assert.notEqual(r.status,0);
  assert.match(r.stderr+r.stdout,/Native glow/u);assert.doesNotMatch(r.stderr+r.stdout,/private-glow-token/u);assert.ok((r.stderr+r.stdout).length<32768);};
 for(const value of cases){f.style.glow=value;f.save();check();}
 f.style.glow=valid;f.save();const text=fs.readFileSync(f.ir,'utf8');
 for(const altered of [text.replace('"glow":{','"Glow":{'),text.replace('"glow":{','"glow":null,"glow":{'),
  text.replace('"radiusPt":2','"radiusPt":2,"radiusPt":2'),text.replace('"radiusPt":2','"RadiusPt":2'),
  text.replace('"radiusPt":2','"radiusPt":1e9999')]){fs.writeFileSync(f.ir,altered);check();}
});
test('native glow is packaged and discovered by unified contract CI',()=>{
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeGlow.cs'));
 for(const suite of ['contract','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/openxml-native-glow-contract.test.js'));
});
