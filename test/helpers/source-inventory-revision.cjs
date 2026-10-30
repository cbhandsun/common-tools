'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {writePng}=require('../../packages/slideclone-core/png');
const {initializeSceneObjectBatches}=require('../../packages/slideclone-core/scene-plan/source-scene-object-batches');

function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-revision-')),sourceFile=path.join(root,'source.png');
 if(t)t.after(()=>{
  if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('inventory-revision-'))throw Error('Unexpected test directory');
  fs.rmSync(root,{recursive:true,force:true});
 });
 writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(100*100*4,255)});
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const regionId='region-owner',relations=[
  {id:'relation-n201',regionId,fromId:'region-left',toId:'region-right',direction:'forward',shaftBox:{x:30,y:10,w:40,h:10}},
  {id:'relation-regional-0-0',regionId,fromId:'region-right',toId:'region-left',direction:'forward',shaftBox:{x:30,y:30,w:40,h:10}}
 ];
 if(options.extraRelation)relations.splice(1,0,{id:'relation-n202',regionId,fromId:'region-left',toId:'region-right',direction:'forward',shaftBox:{x:30,y:40,w:40,h:5}});
 const originalRelations=relations.filter(row=>row.id.startsWith('relation-n')).map(row=>row.id);
 const oldProgram={regionId,objects:[],relations:['relation-n200',...originalRelations],labels:[]};
 const plan=initializeSceneObjectBatches({version:1,sourceHash,widthPx:100,heightPx:100,relationObservationUnit:'logical-relations-v1',
  regions:[{id:regionId,parentId:null,kind:'diagram',box:{x:0,y:0,w:100,h:100}},
   {id:'region-left',parentId:regionId,kind:'card',box:{x:0,y:0,w:30,h:50}},
   {id:'region-right',parentId:regionId,kind:'card',box:{x:70,y:0,w:30,h:50}}],objects:[],relations,
  observedInventory:[{regionId,containers:0,icons:0,relations:relations.length+1},
   {regionId:'region-left',containers:0,icons:0,relations:0},{regionId:'region-right',containers:0,icons:0,relations:0}],
  regionPrograms:[{regionId,objects:[],relations:relations.map(r=>r.id),labels:[]},
   {regionId:'region-left',objects:[],relations:[],labels:[]},{regionId:'region-right',objects:[],relations:[],labels:[]}],
  pendingRegionPrograms:[],resolvedRegionPrograms:[{index:0,program:oldProgram,sourceHash,widthPx:100,heightPx:100}],
  admission:{complete:false,rejections:[{collection:'relation',index:0,reason:'relation-contract',detailCode:'tuple'},
   {collection:'program',index:0,reason:'program-contract',detailCode:'program-member'},
   {collection:'missingText',index:7,reason:'glyph-source-unit'}]},
  relationBatches:[{id:'global',members:originalRelations,rejected:1},
   {id:'local-consensus',members:['relation-regional-0-0'],reviewed:['relation-n201']}]});
 return {plan,sourceFile,root,relations};
}
module.exports={fixture};
