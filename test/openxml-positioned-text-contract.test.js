"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {runBuilder,invokeBuilder}=require("./helpers/openxml-contract-fixtures");
const {readZipEntry}=require("../packages/ooxml-core/pptx-inventory");
function fixture(){return {version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,sourceImage:"",background:{fill:"#FFFFFF"},
 shapes:[],images:[],tables:[],charts:[],textBoxes:[{id:"positioned-line",role:"title",text:"AAAABBBB",box:{x:10,y:10,w:100,h:20},
 font:{family:"Arial",sizePt:12,weight:"bold",color:"#102030"},wrap:false,style:{wrap:false,fit:"none",textWarp:"textPlain"},
 positionedRuns:[{text:"AAAA",box:{x:12,y:15,w:40,h:10}},{text:"BBBB",box:{x:64,y:15,w:44,h:10}}]}]}]};}
function write(input){const root=fs.mkdtempSync(path.join(os.tmpdir(),"positioned-text-")),ir=path.join(root,"deck.json"),pptx=path.join(root,"deck.pptx");fs.writeFileSync(ir,JSON.stringify(input));return {ir,pptx};}

test("compact positioned font overrides retain native script faces, weight, geometry and inherited paint",()=>{
 const input=fixture(),text=input.pages[0].textBoxes[0];text.font.eastAsianFamily="YouYuan";
 text.positionedRuns[0].fontOverride={family:"Microsoft YaHei",latinFamily:"Microsoft YaHei",eastAsianFamily:"Microsoft YaHei",complexScriptFamily:"Microsoft YaHei",weight:"regular"};
 text.positionedRuns[1].fontOverride={eastAsianFamily:"KaiTi"};
 const files=write(input);runBuilder(["--ir",files.ir,"--out",files.pptx]);const xml=readZipEntry(files.pptx,"ppt/slides/slide1.xml").toString("utf8");
 const group=xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];assert.ok(group);
 const shapes=[...group.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/gu)].map(m=>m[0]);assert.equal(shapes.length,2);
 assert.equal((shapes[0].match(/typeface="Microsoft YaHei"/gu)||[]).length,3);assert.match(shapes[0],/b="0"/u);
 assert.match(shapes[1],/<a:latin typeface="Arial"/u);assert.match(shapes[1],new RegExp(`<a:ea typeface="${process.platform==="win32"?"楷体":"KaiTi"}"`,"u"));
 assert.match(shapes[1],/<a:cs typeface="Arial"/u);assert.match(shapes[1],/b="1"/u);
 assert.match(shapes[0],/x="152400" y="190500"/u);assert.match(shapes[1],/x="812800" y="190500"/u);
 for(const shape of shapes)assert.match(shape,/val="102030"/u);
 assert.doesNotMatch(xml,/<p:pic\b|<a:custGeom\b/u);
 for(const value of [[],false,{SizePt:12},{sizePt:12},{weight:"600"},{family:""},{family:"x".repeat(257)},{Family:"Arial"}]){
  text.positionedRuns[0].fontOverride=value;fs.writeFileSync(files.ir,JSON.stringify(input));assert.notEqual(invokeBuilder(["--ir",files.ir,"--out",files.pptx]).status,0);
 }
});

test('source-bound regional typography reaches native positioned text in the generated PPTX',t=>{
 const {prepareRegionProgramLabels}=require('../packages/slideclone-core/scene-plan/source-scene-region-program');
 const {sourceLabelIdentity}=require('../packages/slideclone-core/scene-plan/source-label-identity');
 const input=fixture(),page=input.pages[0],text=page.textBoxes[0];
 const dimensions={widthPx:960,heightPx:540},ref=sourceLabelIdentity(text.box,dimensions);
 text.source={editable:true,evidenceBox:{...text.box},ocrLabelBox:{...text.box},ocrLabelRef:ref};
 text.positionedRuns[0].fontOverride={family:'Calibri',weight:'bold'};
 const plan={version:1,sourceHash:'a'.repeat(64),...dimensions,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:960,h:540}}],objects:[],relations:[],
  regionPrograms:[{regionId:'region-root',objects:[],relations:[],labels:[{refs:[ref],family:'Arial Black',weight:'regular',sizePt:18}]}]};
 input.pages[0]=prepareRegionProgramLabels(page,plan,input.slideSize).page;
 const files=write(input);t.after(()=>fs.rmSync(path.dirname(files.ir),{recursive:true,force:true}));
 runBuilder(['--ir',files.ir,'--out',files.pptx]);
 const xml=readZipEntry(files.pptx,'ppt/slides/slide1.xml').toString('utf8');
 const group=xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];assert.ok(group);
 const children=[...group.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/gu)].map(match=>match[0]);
 assert.equal(children.length,2);
 for(const child of children){
  assert.equal((child.match(/typeface="Arial Black"/gu)||[]).length,3);
  assert.match(child,/sz="1800"/u);assert.match(child,/b="0"/u);assert.match(child,/val="102030"/u);
 }
 assert.match(children[0],/x="152400" y="190500"/u);assert.match(children[1],/x="812800" y="190500"/u);
 assert.doesNotMatch(xml,/<p:pic\b|<a:custGeom\b/u);
});

test('source-measured panel groups retain editable positioned children and identical native coordinates',()=>{
 const input=fixture(),page=input.pages[0],parent=page.textBoxes[0],box={x:1,y:1,w:180,h:100};
 parent.source={editable:true,evidenceBox:{...parent.box}};
 page.shapes=[{id:'scene-container-panel',type:'rect',box,style:{fill:'#CDEFFF',stroke:'none'},source:{editable:true}}];
 const image={width:960,height:540,rgba:Buffer.alloc(960*540*4,255)},
 token=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence').createMeasuredScenePortFrame(image,{box,fill:'#CDEFFF'});
 const grouped=require('../packages/slideclone-core/scene-plan/source-scene-physical-groups').bindSourceScenePhysicalGroups({image,slideSize:input.slideSize,
  shapes:page.shapes,images:page.images,textBoxes:page.textBoxes,physicalNodes:[{proposalId:'panel',node:{box,portFrame:token}}]});
 assert.equal(grouped.evidence.physicallyGroupedText,1);
 const flat=write(input);page.shapes=grouped.shapes;page.textBoxes=grouped.textBoxes;const composed=write(input);
 runBuilder(['--ir',flat.ir,'--out',flat.pptx]);runBuilder(['--ir',composed.ir,'--out',composed.pptx]);
 const before=readZipEntry(flat.pptx,'ppt/slides/slide1.xml').toString('utf8'),after=readZipEntry(composed.pptx,'ppt/slides/slide1.xml').toString('utf8');
 assert.match(after,/name="scene-unit-panel"/u);assert.equal((after.match(/<p:grpSp>/gu)||[]).length,2);
 const nativeShapes=xml=>[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/gu)].map(m=>m[0]
  .replace(/(<p:cNvPr\b[^>]*\bid=")\d+/u,'$1ID'));
 assert.deepEqual(nativeShapes(after),nativeShapes(before));
 assert.doesNotMatch(after,/<p:pic\b|<p:ph\b/u);assert.equal((after.match(/<a:t>/gu)||[]).length,2);
 assert.match(after,/<a:t>AAAA<\/a:t>/u);assert.match(after,/<a:t>BBBB<\/a:t>/u);
});

test("omitting zero native text margins preserves the complete OpenXML slide for positioned and ordinary text",()=>{
 const input=fixture(),parent=input.pages[0].textBoxes[0];
 Object.assign(parent.style,{marginLeftPt:0,marginRightPt:0,marginTopPt:0,marginBottomPt:0});
 input.pages[0].textBoxes.push({id:"ordinary",text:"native text",box:{x:200,y:30,w:150,h:30},font:{family:"Arial",sizePt:14},
  style:{marginLeftPt:0,marginRightPt:2,marginTopPt:0,marginBottomPt:4},source:{ocrProvider:"fixture"}});
 const compacted=structuredClone(input);require("../packages/slideclone-core/typography/native-text-inset-defaults").compactNativeTextInsetDefaults(compacted);
 const before=write(input),after=write(compacted);runBuilder(["--ir",before.ir,"--out",before.pptx]);runBuilder(["--ir",after.ir,"--out",after.pptx]);
 const xmlBefore=readZipEntry(before.pptx,"ppt/slides/slide1.xml").toString("utf8"),xmlAfter=readZipEntry(after.pptx,"ppt/slides/slide1.xml").toString("utf8");
 assert.equal(xmlAfter,xmlBefore);assert.match(xmlAfter,/rIns="25400"/u);assert.match(xmlAfter,/bIns="50800"/u);
 assert.equal(Object.keys(compacted.pages[0].textBoxes[0].style).filter(k=>k.startsWith("margin")).length,0);
});
test("compact positioned text builds one native group with editable shared-style children and exact geometry",()=>{
 const files=write(fixture());runBuilder(["--ir",files.ir,"--out",files.pptx]);
 const xml=readZipEntry(files.pptx,"ppt/slides/slide1.xml").toString("utf8");
 const group=xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];assert.ok(group);
 assert.equal((group.match(/<p:sp>/gu)||[]).length,2);assert.equal((group.match(/<a:t>/gu)||[]).length,2);
 assert.match(group,/<a:t>AAAA<\/a:t>/u);assert.match(group,/<a:t>BBBB<\/a:t>/u);assert.doesNotMatch(xml,/AAAABBBB/u);
 assert.doesNotMatch(group,/<p:ph\b|<p:pic\b/u);assert.equal((group.match(/prst="textPlain"/gu)||[]).length,2);
 assert.match(group,/x="152400" y="190500"/u);assert.match(group,/cx="508000" cy="127000"/u);
 assert.equal((group.match(/val="102030"/gu)||[]).length,2);assert.equal((group.match(/b="1"/gu)||[]).length,2);
});
test("builder rejects incoherent or unsafe positioned runs independently of JavaScript admission",()=>{
 for(const change of [t=>t.positionedRuns=[],t=>t.text="PRIVATE",t=>t.positionedRuns[1].box.x=40,t=>t.positionedRuns[0].box.w=0,
  t=>t.wrap=true,t=>t.style.fit="shrink",t=>t.runs=[],t=>t.rotation=181,t=>t.rotation=-181,t=>t.rotation=1e100,t=>t.rotation="PRIVATE"]){
  const input=fixture();change(input.pages[0].textBoxes[0]);const files=write(input),result=invokeBuilder(["--ir",files.ir,"--out",files.pptx]);
  assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/PRIVATE/);
 }
});

test("positioned text rotates its native parent group exactly once and preserves editable children",()=>{
 for(const rotation of [-180,-9.38914756133124,0,1.1013080431620998,180]){
  const input=fixture(),parent=input.pages[0].textBoxes[0];parent.rotation=rotation;
  const files=write(input);runBuilder(["--ir",files.ir,"--out",files.pptx]);
  const xml=readZipEntry(files.pptx,"ppt/slides/slide1.xml").toString("utf8");
  const group=xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];assert.ok(group);
  const transform=group.match(/<p:grpSpPr>[\s\S]*?<a:xfrm\b([^>]*)>/u)?.[1];assert.notEqual(transform,undefined);
  if(rotation===0)assert.doesNotMatch(transform,/rot=/u);else assert.match(transform,new RegExp(`rot="${Math.round(rotation*60000)}"`,"u"));
  const children=[...group.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/gu)].map(m=>m[0]);assert.equal(children.length,2);
  for(const child of children)assert.doesNotMatch(child,/<a:xfrm[^>]*rot="(?!0")/u);
  assert.match(children[0],/x="152400" y="190500"/u);assert.match(children[1],/x="812800" y="190500"/u);
  assert.match(children[0],/<a:t>AAAA<\/a:t>/u);assert.match(children[1],/<a:t>BBBB<\/a:t>/u);
  assert.doesNotMatch(group,/<p:pic\b|<a:custGeom\b/u);
 }
});
