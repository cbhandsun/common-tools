"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {writePng}=require("../packages/slideclone-core/png");
const {parseSourceScenePlan}=require("../packages/slideclone-core/scene-plan/source-scene-plan");
const {compileSourceScene}=require("../packages/slideclone-core/scene-plan/source-scene-compiler");
const {proposeSceneTableHeaders}=require("../packages/slideclone-core/scene-plan/source-scene-table-headers");
function fixture(t,kind="section"){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-region-background-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},sourceFile=path.join(root,"source.png");
 const paint=(box,color)=>{for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([...color,255],(y*400+x)*4);};
 const region={id:"body",parentId:"root",kind,box:{x:40,y:40,w:300,h:160}};
 const bind=()=>{writePng(sourceFile,image);return parseSourceScenePlan({coordinateSpace:"source-pixels",regions:[
  {id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:400,h:300}},region],objects:[],relations:[]},
  {sourceHash:crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"),widthPx:400,heightPx:300});};
 return {root,sourceFile,image,paint,region,bind,slideSize:{widthPt:400,heightPt:300},page:{shapes:[],images:[],textBoxes:[]}};
}
test("a section label cannot suppress independently proven native table header backgrounds",t=>{
 const f=fixture(t);f.paint({x:60,y:50,w:120,h:40},[150,210,245]);f.paint({x:200,y:50,w:120,h:40},[245,200,225]);
 f.page.textBoxes=[60,110,150].flatMap(y=>[{id:"left-"+y,text:"Left",box:{x:80,y,w:80,h:20}},
  {id:"right-"+y,text:"Right",box:{x:220,y,w:80,h:20}}]);
 const before=JSON.stringify(f.page),plan=f.bind(),result=compileSourceScene({...f,plan});
 assert.equal(result.evidence.tableHeaderBackgrounds,2);
 assert.deepEqual(result.page.shapes.map(s=>s.style.fill).sort(),["#96D2F5","#F5C8E1"]);
 assert.deepEqual(result.page.textBoxes.map(s=>s.text),f.page.textBoxes.map(s=>s.text));
 assert.equal(result.page.source.sourceScene.regionTree[1].kind,"section");assert.equal(JSON.stringify(f.page),before);
 assert.ok(result.page.shapes.every(s=>s.source.editable===true&&s.source.sceneRegionId==="region-body"));
 assert.ok(result.evidence.sourceScanPixels<=4000000);assert.ok(result.evidence.glyphOwnedPixels<=100000);
});
test("a section at the physical source edge retains a proven full width surface and editable text",t=>{
 const f=fixture(t);f.region.box={x:0,y:260,w:400,h:40};f.paint(f.region.box,[43,75,111]);
 f.page.textBoxes=[{id:"label",text:"Visible footer",box:{x:70,y:270,w:120,h:15}}];
 const result=compileSourceScene({...f,plan:f.bind()});
 assert.equal(result.evidence.semanticRegionBackgrounds,1);
 const shape=result.page.shapes.find(s=>s.source?.sceneRegionId==="region-body"&&s.style.fill==="#2B4B6F");
 assert.ok(shape);assert.deepEqual(shape.box,f.region.box);assert.equal(shape.source.editable,true);
 assert.equal(result.page.textBoxes[0].text,"Visible footer");assert.equal(result.page.images.length,0);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
});
test("blank semantic groups and a whole page label grant no paint ownership or completion failure",t=>{
 const f=fixture(t),result=compileSourceScene({...f,plan:f.bind()});
 assert.equal(result.page.shapes.length,0);assert.equal(result.evidence.semanticRegionBackgrounds,0);
 assert.deepEqual(result.evidence.unresolved,[]);
 f.paint({x:0,y:0,w:400,h:300},[43,75,111]);f.region.parentId=null;
 const root=compileSourceScene({...f,plan:f.bind()});assert.equal(root.page.shapes.length,0);
});
test("source recovered semantic paint stays beneath existing native child shapes",t=>{
 const f=fixture(t);f.paint(f.region.box,[150,210,245]);const box={x:100,y:100,w:30,h:30};f.paint(box,[180,40,50]);
 const child={id:"existing-child",type:"rect",box,style:{fill:"#B42832",stroke:"none",strokeWidthPt:0},source:{editable:true}};
 f.page.shapes=[child];const result=compileSourceScene({...f,plan:f.bind()});
 assert.equal(result.evidence.semanticRegionBackgrounds,1);assert.equal(result.page.shapes[0].style.fill,"#96D2F5");
 assert.deepEqual(result.page.shapes.at(-1),child);assert.deepEqual(f.page.shapes,[child]);
});
test("generic section table proposals require the unchanged complete two body row layout",()=>{
 const input={regions:[{id:"section",kind:"section",box:{x:40,y:40,w:300,h:160}}],widthPx:400,heightPx:300,
  slideSize:{widthPt:400,heightPt:300},capacity:64,textBoxes:[60,110,150].flatMap(y=>[
   {text:"Left",box:{x:80,y,w:80,h:20}},{text:"Right",box:{x:220,y,w:80,h:20}}])};
 assert.equal(proposeSceneTableHeaders(input).length,2);
 assert.equal(proposeSceneTableHeaders({...input,capacity:1}).length,1);
 for(const textBoxes of [[],input.textBoxes.slice(0,2),input.textBoxes.slice(0,4),
  [...input.textBoxes.slice(0,4),input.textBoxes[4]],input.textBoxes.map(t=>({...t,box:{...t.box,x:80}}))]){
  assert.deepEqual(proposeSceneTableHeaders({...input,textBoxes}),[]);
 }
 assert.deepEqual(proposeSceneTableHeaders({...input,capacity:0}),[]);
 const pageRoot={id:"root",kind:"section",box:{x:0,y:0,w:400,h:300}};
 assert.deepEqual(proposeSceneTableHeaders({...input,regions:[pageRoot]}),[]);
 assert.ok(proposeSceneTableHeaders({...input,regions:[pageRoot,...input.regions]}).every(p=>p.regionId==="section"));
});
