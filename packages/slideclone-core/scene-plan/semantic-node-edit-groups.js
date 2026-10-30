// @ts-check
'use strict';
const {snapshot}=require('./approved-frame-application-input');
const {record,list}=require('./source-scene-group-containment');
const {validateOutputEditGroups}=require('./output-edit-groups');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{id:string,box:Box,type?:string,source?:Record<string,unknown>,style?:Record<string,unknown>}} Item */
/** @typedef {Record<string,unknown>&{shapes:Item[],images:Item[],textBoxes:Item[]}} Page */
const invalid=()=>new TypeError('Semantic node edit grouping is invalid');
/** Region boundaries have region identity, not object inventory identity.
 * Restrict this output-only fallback to the compiler's exact boundary IDs;
 * a missing object ID or a decorative paint fragment is not a new node.
 * @param {Item} item @param {string} region @param {boolean} [paint] */
const regionBoundary=(item,region,paint=false)=>{
 if(item.source?.sceneInventoryId!==undefined||item.source?.sceneRegionId!==region
  ||typeof item.source.detector!=='string'||!['source-scene-container','source-scene-outline'].includes(item.source.detector))return false;
 if(item.id===`scene-container-${region}`||item.id===`scene-outline-${region}`)return true;
 const prefix=`scene-outline-${region}-paint-`;
 return paint&&item.id.startsWith(prefix)&&/^\d{1,3}$/u.test(item.id.slice(prefix.length));
};
/** Output grouping is deliberately separate from measured source grouping.
 * It keeps one node's body, outline, contained labels and pictorial children
 * together when source-faithful paint ordering prevented an atomic card.
 * This may change overlap order. It grants no pixel erasure or source proof,
 * does not rewrite strict failures, and needs actual Office verification.
 * Connectors and their existing child anchors remain outside node groups.
 * @param {unknown} input */
function groupSemanticNodes(input){
 try{snapshot(input);}catch{throw invalid();}
 if(!record(input)||!record(input.page)||!record(input.work))throw invalid();
 const ledger=input.work;
 if(typeof ledger.checks!=='number'||!Number.isSafeInteger(ledger.checks)||ledger.checks<0||ledger.checks>4000000
  ||!Object.getOwnPropertyDescriptor(ledger,'checks')?.writable)throw invalid();
 const work=/** @type {Record<string,unknown>&{checks:number}} */(ledger);
 const page=/** @type {Page} */(input.page);
 const previousGroups=validateOutputEditGroups(page),previousMembers=new Set(previousGroups.flatMap(group=>group.members));
 if(![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000))throw invalid();
 const all=[...page.shapes,...page.images,...page.textBoxes],texts=new Set(page.textBoxes),pictures=new Set(page.images);
 if(all.length>10000||all.some(item=>!record(item)||typeof item.id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(item.id)
  ||!record(item.box)||![item.box.x,item.box.y,item.box.w,item.box.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
  ||item.type!=='line'&&(item.box.w<0||item.box.h<0)||item.source!==undefined&&!record(item.source)||item.style!==undefined&&!record(item.style)))throw invalid();
 const byId=new Map(all.map(item=>[item.id,item]));if(byId.size!==all.length)throw invalid();
 /** @param {number} count */const charge=count=>{
  if(work.checks+count>4000000){work.checks=4000001;throw new TypeError('Semantic node edit grouping exceeded geometry budget');}
  work.checks+=count;
 };
 charge(all.length);
 /** @type {Map<string,{id:string,region:string,box:Box,scope:'object'|'region'}>} */const nodes=new Map();
 for(const line of page.shapes){
  const source=line.source;
  const direct=source?.semanticNativeStructure===true&&source.role==='relationship'
   &&typeof source.sceneRelationId==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(source.sceneRelationId)
   &&(source.sourceAttachmentKind==='visible-gap-logical'||source.sourceAttachmentKind==='source-body-contact');
  if(line.type!=='line'||source?.nativeConnectorRoute!==true&&!direct)continue;
  for(const field of ['startAnchor','endAnchor']){
   charge(1);const anchor=line.style?.[field];if(!record(anchor)||typeof anchor.elementId!=='string')throw invalid();
   const target=byId.get(anchor.elementId),source=target?.source;
   if(!target||!source||source.semanticNativeStructure!==true||source.nativeRebuild!==true
    ||typeof source.detector!=='string'||!['source-scene-container','source-scene-outline'].includes(source.detector))continue;
   const region=source.sceneRegionId,scope=source.sceneInventoryId===undefined?'region':'object';
   if(scope==='region'&&(typeof region!=='string'||!regionBoundary(target,region)))throw invalid();
   const id=scope==='region'?region:source.sceneInventoryId;
   if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,96}$/u.test(id)||typeof region!=='string'||!/^[-A-Za-z0-9_]{1,96}$/u.test(region)
    ||target.box.w<=0||target.box.h<=0)throw invalid();
   const previous=nodes.get(id);
   if(previous&&(previous.region!==region||previous.scope!==scope||['x','y','w','h'].some(key=>previous.box[/** @type {keyof Box} */(key)]!==target.box[/** @type {keyof Box} */(key)])))throw invalid();
   nodes.set(id,{id,region,box:target.box,scope});
  }
 }
 if(nodes.size>96)throw invalid();
 /** @param {Box} outer @param {Box} inner */const contains=(outer,inner)=>(inner.w!==0||inner.h!==0)
  &&Math.min(inner.x,inner.x+inner.w)>=outer.x&&Math.min(inner.y,inner.y+inner.h)>=outer.y
  &&Math.max(inner.x,inner.x+inner.w)<=outer.x+outer.w&&Math.max(inner.y,inner.y+inner.h)<=outer.y+outer.h;
 /** @param {Item} item */const existingGroup=item=>item.source?.nativeComponentGroupId??item.style?.nativeComponentGroupId;
 /** @type {Map<Item,string>} */const assignments=new Map();
 /** @type {{id:string,members:string[]}[]} */const groups=[];
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 for(const node of nodes.values()){
  const owned=page.shapes.filter(item=>{charge(1);return (node.scope==='region'?regionBoundary(item,node.region,true):item.source?.sceneInventoryId===node.id)
   &&item.source?.sceneRegionId===node.region&&item.source?.sceneRelationId===undefined;});
  if(!owned.length||owned.some(item=>existingGroup(item)!==undefined||previousMembers.has(item.id)
   ||item.style?.startAnchor!==undefined||item.style?.endAnchor!==undefined||item.source?.nativeConnectorRoute===true))continue;
  const ownedSet=new Set(owned);
  /** @type {Item[]} */const members=[...owned];
  for(const item of all){
   charge(1);if(ownedSet.has(item)||previousMembers.has(item.id)||existingGroup(item)!==undefined||item.source?.sceneRelationId!==undefined
    ||item.style?.startAnchor!==undefined||item.style?.endAnchor!==undefined||!contains(node.box,item.box))continue;
   const source=item.source;
   const semanticChild=(texts.has(item)||pictures.has(item))&&source?.sceneRegionId===node.region
    &&(texts.has(item)?source.editable===true:source.protectedMinimumUnit===true&&source.cropEvidenceRequired===true);
   const localNative=!texts.has(item)&&!pictures.has(item)&&source?.nativeRebuild===true
    &&typeof source.detector==='string'&&source.detector.startsWith('visual-atom-')&&source.sceneInventoryId===undefined;
   if(!semanticChild&&!localNative)continue;
   const owners=[...nodes.values()].filter(other=>{charge(1);return contains(other.box,item.box);});
   if(owners.length===1&&owners[0]===node)members.push(item);
  }
  if(members.length>128){rejected.push({id:node.id,reason:'member-capacity'});continue;}
  if(!members.some(item=>texts.has(item)||pictures.has(item)))continue;
  if(members.some(item=>assignments.has(item))){rejected.push({id:node.id,reason:'ambiguous-membership'});continue;}
  const id='semantic-node-'+node.id;
  if(all.some(item=>existingGroup(item)===id)||previousGroups.some(group=>group.id===id))throw invalid();
  for(const item of members)assignments.set(item,id);
  groups.push({id,members:members.map(item=>item.id)});
 }
 const output=groups.length?{...page,outputEditGroups:[...previousGroups,...groups]}:page;
 validateOutputEditGroups(output);
 return {page:output,
  report:{status:rejected.length?'partial':groups.length?'applied':'unchanged',groups,rejected,geometryChecks:work.checks,
   sourceOwnership:false,sourcePixelsChanged:0,strictSourceEquivalent:false,paintOrderEquivalent:false,
   editingBehaviorVerified:false,wholeProductAcceptance:false}};
}
module.exports={groupSemanticNodes};
