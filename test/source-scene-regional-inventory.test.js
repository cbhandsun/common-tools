'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectRegionalInventoryTargets:select,readRegionalInventoryObservations:read,applyRegionalInventoryReview:apply,regionalInventoryPrompt:prompt}=require('../packages/slideclone-core/source-scene-regional-inventory');
const {parseLocalTargets,localResponseFormat,decodeLocalResponse}=require('../packages/slideclone-core/source-scene-local-response');
const {recordSceneLocalRelationBatch:recordBatch}=require('../packages/slideclone-core/source-scene-relation-batches');
function exhaustLocal(plan){return recordBatch(plan,plan,[],plan.relations.map(r=>r.id));}
function fixture(){
 const box={x:10,y:10,w:80,h:80},target={index:5,regionId:'card',box};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},{id:'card',parentId:'root',kind:'card',box}],objects:[],relations:[],
  admission:{complete:false,rejections:[{collection:'object',index:4,reason:'object-contract'}]}};
 const frame={width:100,height:100,sourceTargets:[{index:5,cropBox:{x:0,y:0,w:100,h:100},candidateBox:box}],sheetTargets:[{index:5,cropBox:{x:0,y:0,w:100,h:100},candidateBox:box}]};
 const response={regionInventories:[{index:5,units:[{kind:'container',confidence:.99,box_2d:[200,200,400,400]},
  {kind:'container',confidence:.99,box_2d:[200,600,400,800]}],relations:[{from:0,to:1,direction:'forward'}]}]};
 return {plan,target,frame,response,capacity:{objects:2,relations:1}};
}
function existingFixture(){
 const f=fixture();f.plan.objects=[{id:'left',kind:'container',regionId:'card',box:{x:20,y:20,w:20,h:20}},
  {id:'right',kind:'container',regionId:'card',box:{x:60,y:20,w:20,h:20}}];
 f.target.endpoints=f.plan.objects.map(o=>({id:o.id,box:{...o.box}}));
 f.response={regionInventories:[{index:5,units:[],relations:[{from:'left',to:'right',direction:'forward'}]}]};
 f.capacity={objects:0,relations:1};return f;
}

test('regional deduplication keeps an undirected connector distinct from a directed arrow',()=>{
 for(const existingDirection of ['forward','backward','both','unknown','undirected']){
  const f=existingFixture(),direction=existingDirection==='undirected'?'forward':'undirected';
  f.plan.relations=[{id:'kept',regionId:'card',fromId:'left',toId:'right',direction:existingDirection}];
  f.response.regionInventories[0].relations[0].direction=direction;
  const rows=read(f.response,[f.target],f.frame,f.capacity),before=structuredClone(f.plan);
  const out=apply(f.plan,[f.target],[rows,structuredClone(rows)]);
  assert.equal(out.plan.relations.length,2,existingDirection+' versus '+direction);
  assert.equal(out.plan.relations[1].direction,direction);
  assert.deepEqual(f.plan,before);
 }
});

test('an undirected connector remains one identity when its endpoint order is reversed',()=>{
 const f=existingFixture();
 f.plan.relations=[{id:'kept',regionId:'card',fromId:'right',toId:'left',direction:'undirected'}];
 f.response.regionInventories[0].relations[0].direction='undirected';
 const rows=read(f.response,[f.target],f.frame,f.capacity),out=apply(f.plan,[f.target],[rows,structuredClone(rows)]);
 assert.deepEqual(out.plan.relations,f.plan.relations);
 assert.equal(out.evidence.rejectedRelations[0].reason,'existing-relation');
 const {sceneLocalRelationCapacity:remaining}=require('../packages/slideclone-core/source-scene-relation-batches');
 assert.equal(remaining(out.plan),23,'a rejected duplicate still consumes its proposal slot');
});

test('regional geometry survives keyed transport, source mapping and two-view consensus without hidden object slots',()=>{
 const f=fixture(),geometry={kind:'cylinder',capRatio:.2,radiusRatio:null,seams:[],corners:null};
 f.response.regionInventories[0].units[0].nativeGeometry=geometry;
 const rows=read(f.response,[f.target],f.frame,f.capacity),out=apply(f.plan,[f.target],[rows,structuredClone(rows)]);
 assert.equal(out.plan.objects.length,2);assert.equal(out.plan.objects[0].nativeGeometry.kind,'cylinder');
 const different=structuredClone(rows);different[0].units[0].nativeGeometry.capRatio=.3;
 const refused=apply(f.plan,[f.target],[rows,different]);assert.equal(refused.plan.objects.length,1);
 assert.ok(refused.evidence.rejected.some(r=>r.reason==='native-geometry-consensus'));
 const targets={reviews:[],missing:[],regionInventories:[5],regionObjectCapacity:2,regionRelationCapacity:1};
 const wire={reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{5:{units:f.response.regionInventories[0].units,relations:f.response.regionInventories[0].relations}}};
 assert.deepEqual(decodeLocalResponse(wire,targets).regionInventories,f.response.regionInventories);
 assert.ok(localResponseFormat(targets).json_schema.schema.properties.regionInventoriesByIndex.properties[5].properties.units.items.properties.nativeGeometry);
});

test('rejected and context-only regional relation proposals consume the same local batch as accepted additions',()=>{
 const {sceneLocalRelationCapacity:remaining,sceneRelationBatches:batches,sceneInventoryRelationBatches:exportBatches,
  sceneInventoryRelationBatchesValid:valid}=require('../packages/slideclone-core/source-scene-relation-batches');
 const f=existingFixture(),rows=read(f.response,[f.target],f.frame,f.capacity),conflict=structuredClone(rows);
 conflict[0].relations[0].direction='both';
 const before=structuredClone(f.plan),rejected=apply(f.plan,[f.target],[rows,conflict]);
 assert.equal(rejected.plan.relations.length,0);assert.equal(remaining(rejected.plan),23);
 assert.equal(batches(rejected.plan)[1].rejected,1);assert.deepEqual(f.plan,before);
 const accepted=apply(rejected.plan,[f.target],[rows,rows]);assert.equal(accepted.plan.relations.length,1);
 assert.equal(remaining(accepted.plan),22);assert.equal(batches(accepted.plan)[1].rejected,1);
 const exported=exportBatches(accepted.plan);assert.equal(valid(exported,accepted.plan.relations.map(r=>r.id)),true);
 assert.equal(exported[1].rejected,1);
 const empty=structuredClone(rows);empty[0].relations=[];
 const contextOnly=apply(f.plan,[f.target],[empty,rows]);assert.equal(remaining(contextOnly.plan),23);
 assert.equal(contextOnly.plan.relations.length,0);assert.equal(batches(contextOnly.plan)[1].rejected,1);
});

test('24 failed local proposals exhaust capacity and an overfull rejected batch fails before any plan mutation',()=>{
 const {sceneLocalRelationCapacity:remaining}=require('../packages/slideclone-core/source-scene-relation-batches');
 const f=existingFixture(),rows=read(f.response,[f.target],f.frame,f.capacity);
 rows[0].relations=Array.from({length:24},()=>({...rows[0].relations[0]}));
 const conflict=structuredClone(rows);conflict[0].relations.forEach(r=>r.direction='both');
 const before=structuredClone(f.plan),out=apply(f.plan,[f.target],[rows,conflict]);
 assert.equal(out.plan.relations.length,0);assert.equal(remaining(out.plan),0);assert.deepEqual(f.plan,before);
 const one=read(f.response,[f.target],f.frame,f.capacity);
 assert.throws(()=>apply(out.plan,[f.target],[one,one]),RangeError);
 const invalid=structuredClone(rows);invalid[0].relations.push({...invalid[0].relations[0]});
 assert.throws(()=>apply(f.plan,[f.target],[invalid,invalid]),TypeError);
 assert.deepEqual(f.plan,before);
});

test('observed ancestor gaps can review physical region endpoints without duplicating the nodes or census',()=>{
 const f=fixture();f.plan.regions=[f.plan.regions[0],
  {id:'left-region',parentId:'root',kind:'card',box:{x:10,y:10,w:30,h:50}},
  {id:'right-region',parentId:'root',kind:'container',box:{x:60,y:10,w:30,h:50}}];
 f.plan.objects=[{id:'pictorial',regionId:'left-region',kind:'icon',box:{x:15,y:20,w:10,h:10}}];
 f.plan.observedInventory=[{regionId:'root',containers:0,icons:0,relations:1},
  {regionId:'left-region',containers:0,icons:1,relations:0},{regionId:'right-region',containers:0,icons:0,relations:0}];
 const before=JSON.stringify(f.plan),chosen=select(f.plan,32,0);assert.equal(chosen.length,1);assert.equal(chosen[0].regionId,'root');
 assert.deepEqual(chosen[0].endpoints.map(e=>e.id),['pictorial','left-region','right-region']);assert.equal(chosen[0].addObjects,false);
 const target={...chosen[0],index:5},response={regionInventories:[{index:5,units:[],relations:[{from:'left-region',to:'right-region',direction:'both'}]}]};
 const rows=read(response,[target],f.frame,{objects:0,relations:1}),out=apply(f.plan,[target],[rows,rows]);
 assert.equal(out.plan.relations.length,1);assert.equal(out.plan.relations[0].regionId,'root');assert.equal(out.plan.relations[0].fromId,'left-region');
 assert.deepEqual(out.plan.objects,f.plan.objects);assert.deepEqual(out.plan.observedInventory,f.plan.observedInventory);assert.equal(JSON.stringify(f.plan),before);
 const changed=structuredClone(f.plan);changed.regions[1].kind='diagram';assert.equal(apply(changed,[target],[rows,rows]).plan.relations.length,0);
 const moved=structuredClone(f.plan);moved.regions[1].box.x++;assert.equal(apply(moved,[target],[rows,rows]).plan.relations.length,0);
 chosen[0].endpoints[0].box.x=90;assert.equal(select(f.plan,32,0)[0].endpoints[0].box.x,15,'immutable nomination');
});

test('diagram gaps use qualified descendant nodes and invalidate changed source ownership',()=>{
 const f=existingFixture();f.plan.regions[1].kind='diagram';f.plan.observedInventory=[
  {regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:2,icons:0,relations:1}];
 const selected=select(f.plan,1,0);assert.equal(selected.length,1);assert.equal(selected[0].regionId,'card');
 const target={...selected[0],index:5},rows=read(f.response,[target],f.frame,f.capacity);
 assert.equal(apply(f.plan,[target],[rows,rows]).plan.relations.length,1);
 const other=structuredClone(f.plan);other.objects[0].regionId='root';assert.equal(apply(other,[target],[rows,rows]).plan.relations.length,0);
 const unknown=structuredClone(f.plan);unknown.regions[1].kind='unknown';assert.deepEqual(select(unknown,1,0),[]);
});

test('observed zero relations suppress participation guesses in decorative cards while unknown census stays unresolved',()=>{
 const f=existingFixture();f.plan.observedInventory=[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:2,icons:0,relations:0}];
 assert.deepEqual(select(f.plan,32,0),[]);f.plan.observedInventory[1].relations=null;
 assert.equal(select(f.plan,32,0).length,1);assert.equal(f.plan.observedInventory[1].relations,null);
});

test('overlapping ancestor reviews and large endpoint inventories defer instead of broadening the local reference budget',()=>{
 const f=existingFixture();f.plan.observedInventory=[{regionId:'root',containers:0,icons:0,relations:2},{regionId:'card',containers:2,icons:0,relations:1}];
 const selected=select(f.plan,32,0);assert.equal(selected.length,1);assert.equal(selected[0].regionId,'root');
 const map=Object.fromEntries(selected.map((t,i)=>[String(i),t.endpoints.map(e=>e.id)]));
 assert.doesNotThrow(()=>parseLocalTargets({reviews:[],missing:[],regionInventories:[0],regionObjectCapacity:0,regionRelationCapacity:24,regionEndpointIds:map}));
 const full=structuredClone(f.plan);full.objects=Array.from({length:64},(_,i)=>({...f.plan.objects[0],id:'node-'+i,regionId:'card'}));
 full.regions.push(...Array.from({length:22},(_,i)=>({id:'region-'+i,parentId:'root',kind:'container',box:{x:1,y:1,w:2,h:2}})));
 full.observedInventory[0].relations=24;full.observedInventory[1].relations=0;
 assert.deepEqual(select(full,32,0),[],'an 87-reference root cannot exceed the unchanged 64 references');
 const filled=structuredClone(f.plan);filled.relations=Array.from({length:24},(_,i)=>({id:'edge-'+i,regionId:'card',fromId:'left',toId:'right',direction:'forward'}));
 assert.deepEqual(select(exhaustLocal(filled),32,0),[]);assert.deepEqual(select(f.plan,0,0),[]);
});

test('populated regions with omitted topology are reviewed without alias release or new object slots',()=>{
 const f=existingFixture();f.plan.objects.push(...Array.from({length:62},(_,i)=>({id:'other-'+i,kind:'icon',regionId:'root',box:{x:1,y:1,w:2,h:2}})));
 const selected=select(f.plan,1,0);assert.equal(selected.length,1);assert.equal(selected[0].regionId,'card');
 assert.deepEqual(selected[0].endpoints,f.target.endpoints);assert.deepEqual(select(f.plan,0,0),[]);
 const linked={...f.plan,relations:[{id:'known',regionId:'card',fromId:'left',toId:'right',direction:'forward'}]};
 assert.deepEqual(select(linked,1,0),[]);
 const full={...f.plan,relations:Array.from({length:24},(_,i)=>({id:'known-'+i,regionId:'root',fromId:'other-0',toId:'other-1',direction:'forward'}))};
 assert.equal(select(full,1,0).length,1,'global capacity does not consume the paired local proposal capacity');
 assert.deepEqual(select(exhaustLocal(full),1,0),[]);
});

test('two observations add a relation between immutable existing nodes without duplicating either node',()=>{
 const f=existingFixture(),before=JSON.stringify(f.plan),rows=read(f.response,[f.target],f.frame,f.capacity);
 const out=apply(f.plan,[f.target],[rows,rows]);assert.deepEqual(out.plan.objects,f.plan.objects);
 assert.equal(out.plan.relations.length,1);assert.equal(out.plan.relations[0].fromId,'left');assert.equal(out.plan.relations[0].toId,'right');
 assert.equal(JSON.stringify(f.plan),before);assert.deepEqual(out.plan.admission,f.plan.admission);
 const conflict=structuredClone(rows);conflict[0].relations[0].direction='both';assert.equal(apply(f.plan,[f.target],[rows,conflict]).plan.relations.length,0);
 const changed=structuredClone(f.plan);changed.objects[0].box.x+=1;assert.equal(apply(changed,[f.target],[rows,rows]).plan.relations.length,0);
 const elsewhere=structuredClone(f.plan);elsewhere.objects[0].regionId='root';assert.equal(apply(elsewhere,[f.target],[rows,rows]).plan.relations.length,0);
});

test('existing references cannot invent identities, escape their crop, duplicate edges or spend extra capacity',()=>{
 const f=existingFixture();
 for(const link of [{from:'absent',to:'right',direction:'forward'},{from:'left',to:'left',direction:'forward'},{from:0,to:'right',direction:'forward'}]){
  const response=structuredClone(f.response);response.regionInventories[0].relations=[link];assert.throws(()=>read(response,[f.target],f.frame,f.capacity),TypeError);
 }
 const rows=read(f.response,[f.target],f.frame,f.capacity);
 const previous={...f.plan,relations:[{id:'kept',regionId:'card',fromId:'right',toId:'left',direction:'backward'}]};
 assert.deepEqual(apply(previous,[f.target],[rows,rows]).plan.relations,previous.relations);
 const full={...f.plan,relations:Array.from({length:24},(_,i)=>({id:'kept-'+i,regionId:'root',fromId:'a',toId:'b',direction:'forward'}))};
 assert.equal(apply(full,[f.target],[rows,rows]).plan.relations.length,25);
 assert.throws(()=>apply(exhaustLocal(full),[f.target],[rows,rows]),RangeError);
});

test('existing endpoint transport binds string references to exact regions at zero new-object capacity',()=>{
 const targets={reviews:[],missing:[],regionInventories:[5],regionObjectCapacity:0,regionRelationCapacity:1,regionEndpointIds:{5:['left','right']}};
 assert.deepEqual(parseLocalTargets(targets),targets);
 const schema=localResponseFormat(targets).json_schema.schema.properties.regionInventoriesByIndex.properties['5'];
 assert.equal(schema.properties.units.maxItems,0);assert.deepEqual(schema.properties.relations.items.properties.from.anyOf[1].enum,['left','right']);
 let calls=0;const getter={get 5(){calls++;throw Error('private-secret');}};
 for(const map of [{6:['left','right']},{5:['left','left']},{5:['bad id','right']},{5:new Array(2)},new Proxy(targets.regionEndpointIds,{}),getter]){
  assert.throws(()=>parseLocalTargets({...targets,regionEndpointIds:map}),e=>e instanceof TypeError&&!e.message.includes('private-secret'));
 }
 assert.throws(()=>parseLocalTargets({...targets,regionObjectCapacity:63}),TypeError);
 assert.equal(calls,0);
});

test('existing and new endpoints share the same relation and object ceilings with strict directional observations',()=>{
 const f=existingFixture();f.capacity.objects=1;
 f.response.regionInventories[0].units=[{kind:'container',confidence:.99,box_2d:[500,300,650,450]}];
 f.response.regionInventories[0].relations=[{from:'left',to:0,direction:'forward'}];
 const rows=read(f.response,[f.target],f.frame,f.capacity),out=apply(f.plan,[f.target],[rows,rows]);
 assert.equal(out.plan.objects.length,3);assert.equal(out.plan.relations.length,1);
 assert.equal(out.plan.relations[0].toId,out.plan.objects[2].id);
 const malformed=structuredClone(f.response);delete malformed.regionInventories[0].relations[0].direction;
 assert.throws(()=>read(malformed,[f.target],f.frame,f.capacity),TypeError);
 const instruction=prompt([f.target],f.capacity,f.frame);
 assert.match(instruction,/\{from,to,direction,shaftBox_2d\}/);assert.match(instruction,/direction is REQUIRED/);
 assert.match(instruction,/"existingEndpoints":\[\{"id":"left","box_2d":\[200,200,400,400\]/);
 assert.throws(()=>prompt([f.target],f.capacity,undefined),TypeError);
 const empty=read({regionInventories:[{index:5,units:[],relations:[]}]},[f.target],f.frame,f.capacity);
 assert.deepEqual(apply(f.plan,[f.target],[empty,empty]).plan,f.plan);
});
test('two independent complete inventories jointly propose nodes and topology under the original shared ceilings',()=>{
 const f=fixture(),before=JSON.stringify(f.plan),a=read(f.response,[f.target],f.frame,f.capacity),b=read(f.response,[f.target],f.frame,f.capacity);
 const out=apply(f.plan,[f.target],[a,b]);assert.equal(out.plan.objects.length,2);assert.equal(out.plan.relations.length,1);
 assert.deepEqual(out.plan.objects[0].box,{x:20,y:20,w:20,h:20});assert.equal(out.plan.objects[0].regionId,'card');
 assert.equal(out.plan.relations[0].fromId,out.plan.objects[0].id);assert.equal(out.plan.relations[0].toId,out.plan.objects[1].id);
 assert.deepEqual(out.plan.admission,f.plan.admission);assert.equal(JSON.stringify(f.plan),before);
 const conflict=structuredClone(b);conflict[0].relations[0].direction='both';assert.equal(apply(f.plan,[f.target],[a,conflict]).plan.relations.length,0);
});
test('independent geometry, confidence, crop ownership and existing physical identities cannot be bypassed',()=>{
 const f=fixture(),a=read(f.response,[f.target],f.frame,f.capacity);
 for(const change of [b=>b[0].units[0].confidence=.89,b=>b[0].units[0].box.x+=10,b=>b[0].units[0].rejection='region-window']){
  const b=structuredClone(a);change(b);const out=apply(f.plan,[f.target],[a,b]);assert.equal(out.plan.objects.length,1);assert.equal(out.plan.relations.length,0);
 }
 const outside=structuredClone(f.response);outside.regionInventories[0].units[0].box_2d=[0,0,400,400];
 const b=read(outside,[f.target],f.frame,f.capacity);assert.equal(b[0].units[0].rejection,'region-window');
 const existing={...f.plan,objects:[{id:'kept',kind:'container',regionId:'card',box:{...a[0].units[0].box}}]};
 assert.equal(apply(existing,[f.target],[a,a]).plan.objects.length,2);
});
test('coverage discovery ranks complete missing physical regions after source-proven aliases free slots',()=>{
 const f=fixture();f.plan.objects=Array.from({length:62},(_,i)=>({id:'kept-'+i,kind:'icon',regionId:'root',box:{x:1,y:1,w:2,h:2}}));
 f.plan.regions.push({id:'note',parentId:'root',kind:'card',box:{x:1,y:1,w:5,h:5}});
 assert.deepEqual(select(f.plan,2,2).map(t=>t.regionId),['card','note']);assert.deepEqual(select(f.plan,2,0),[]);
 f.plan.regions.push({id:'other-note',parentId:'root',kind:'card',box:{x:2,y:2,w:3,h:3}});
 assert.equal(select(f.plan,32,2).length,2);
 assert.deepEqual(select(f.plan,0,2),[]);assert.deepEqual(select(undefined,32,0),[]);
 f.plan.objects.push({id:'actual-node',kind:'container',regionId:'card',box:{x:20,y:20,w:20,h:20}});
 assert.deepEqual(select(f.plan,2,1).map(t=>t.regionId),['note']);
 for(const capacity of [-1,33,NaN,1.5])assert.throws(()=>select(f.plan,capacity,1),RangeError);
});
test('empty and incomplete observations cannot invent units or erase any failed evidence',()=>{
 const f=fixture(),empty={regionInventories:[{index:5,units:[],relations:[]}]},rows=read(empty,[f.target],f.frame,f.capacity);
 assert.deepEqual(apply(f.plan,[f.target],[rows,rows]).plan,f.plan);
 assert.deepEqual(read({},[],undefined,{objects:0,relations:0}),[]);
 assert.throws(()=>read({},[f.target],f.frame,f.capacity),TypeError);
 assert.throws(()=>apply(f.plan,[f.target],[rows]),TypeError);
 assert.throws(()=>apply(f.plan,[{...f.target,regionId:'other'}],[rows,rows]),TypeError);
});
test('cross-region capacity totals and existing or new pictorial endpoint references remain bounded',()=>{
 const f=fixture(),overflow=structuredClone(f.response);overflow.regionInventories.push({...overflow.regionInventories[0],index:6});
 const target={...f.target,index:6},frame={...f.frame,sourceTargets:[...f.frame.sourceTargets,{...f.frame.sourceTargets[0],index:6}],sheetTargets:[...f.frame.sheetTargets,{...f.frame.sheetTargets[0],index:6}]};
 assert.throws(()=>read(overflow,[f.target,target],frame,f.capacity),TypeError);
 for(const link of [{from:2,to:0,direction:'forward'},{from:0,to:0,direction:'forward'},{from:0,to:1,direction:'invented'}]){
  const input=structuredClone(f.response);input.regionInventories[0].relations=[link];assert.throws(()=>read(input,[f.target],f.frame,f.capacity),TypeError);
 }
 const icon=structuredClone(f.response);icon.regionInventories[0].units[0].kind='icon';
 const pictorialRows=read(icon,[f.target],f.frame,f.capacity),pictorial=apply(f.plan,[f.target],[pictorialRows,structuredClone(pictorialRows)]);
 assert.equal(pictorial.plan.objects.length,2);assert.equal(pictorial.plan.objects[0].kind,'icon');assert.equal(pictorial.plan.relations.length,1);
 const unknown=structuredClone(icon);unknown.regionInventories[0].units[0].kind='unknown';assert.throws(()=>read(unknown,[f.target],f.frame,f.capacity),TypeError);
 const full={...f.plan,objects:Array.from({length:64},(_,i)=>({id:'kept-'+i,kind:'icon',regionId:'root',box:{x:1,y:1,w:2,h:2}}))};
 const rows=read(f.response,[f.target],f.frame,f.capacity);assert.throws(()=>apply(full,[f.target],[rows,rows]),RangeError);
});
test('provider getters, proxies, sparse collections and coercible kinds fail without execution or leakage',()=>{
 const f=fixture();let calls=0;const hostile={get regionInventories(){calls++;throw Error('private-secret');}};
 const kind={toString(){calls++;throw Error('private-secret');}};
 const wrongKind=structuredClone(f.response);wrongKind.regionInventories[0].units[0].kind=kind;
 for(const input of [hostile,new Proxy(f.response,{}),{regionInventories:new Array(1)},wrongKind])
  assert.throws(()=>read(input,[f.target],f.frame,f.capacity),e=>e instanceof TypeError&&!e.message.includes('private-secret'));
 const badCapacity={get objects(){calls++;throw Error('private-secret');},relations:1};assert.throws(()=>read(f.response,[f.target],f.frame,badCapacity),TypeError);
 assert.equal(calls,0);
});
test('keyed regional transport enforces exact target bindings and the same 32-target budget',()=>{
 const targets={reviews:[],missing:[],regionInventories:[5],regionObjectCapacity:2,regionRelationCapacity:1},f=fixture();
 assert.deepEqual(parseLocalTargets(targets),targets);
 const schema=localResponseFormat(targets).json_schema.schema.properties.regionInventoriesByIndex;
 assert.deepEqual(schema.required,['5']);assert.equal(schema.properties['5'].properties.units.maxItems,2);
 const value={reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{5:{units:f.response.regionInventories[0].units,relations:f.response.regionInventories[0].relations}}};
 assert.deepEqual(decodeLocalResponse(value,targets).regionInventories,f.response.regionInventories);
 assert.throws(()=>decodeLocalResponse({...value,regionInventoriesByIndex:{6:value.regionInventoriesByIndex[5]}},targets),TypeError);
 for(const input of [{reviews:[],missing:[],regionObjectCapacity:2}, {...targets,regionObjectCapacity:65},{...targets,regionRelationCapacity:25},
  {...targets,reviews:[5]},{...targets,reviews:Array.from({length:32},(_,i)=>i+10)},{...targets,regionObjectCapacity:0}])assert.throws(()=>parseLocalTargets(input),TypeError);
});
