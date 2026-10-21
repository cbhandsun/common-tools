'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initializeSceneObjectBatches:init,sceneLocalObjectCapacity:capacity}=require('../packages/slideclone-core/source-scene-object-batches');
const {selectSceneOwnerRevisions:select,applySceneOwnerRevisions:apply}=require('../packages/slideclone-core/source-scene-owner-revision');
function fixture(){
 const owner={id:'card',parentId:'root',kind:'card',box:{x:40,y:40,w:200,h:220}};
 const objects=[{id:'lost',regionId:'card',kind:'icon',box:{x:4,y:4,w:1,h:1}},
  {id:'known-a',regionId:'card',kind:'icon',box:{x:60,y:130,w:20,h:20}},
  {id:'known-b',regionId:'card',kind:'icon',box:{x:60,y:200,w:20,h:20}}];
 const plan=init({version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:400,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:400}},owner],objects,relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:0,icons:3,relations:0}],
  regionPrograms:[{regionId:'root',objects:[],relations:[],labels:[]},{regionId:'card',objects:objects.map(o=>o.id),relations:[],labels:[]}]});
 const target=select(plan)[0],box={x:60,y:60,w:20,h:20};
 const units=[box,objects[1].box,objects[2].box].map(box=>({kind:'icon',confidence:.99,box:{...box}}));
 const rows=[[{index:0,units,relations:[]}],[{index:0,units:structuredClone([units[2],units[0],units[1]]),relations:[]}]];
 return {plan,owner,target,box,rows};
}
test('owner revision replaces an invalid seed through a complete paired census while retaining all identities and obligations',()=>{
 const f=fixture(),before=structuredClone(f.plan);assert.equal(f.target.objectId,'lost');assert.deepEqual(f.target.box,f.owner.box);
 const out=apply(f.plan,[f.target],f.rows);assert.deepEqual(out.evidence.corrected,['lost']);
 assert.deepEqual(out.plan.objects[0].box,f.box);assert.deepEqual(out.plan.objects.slice(1),f.plan.objects.slice(1));
 for(const key of ['sourceHash','regions','relations','observedInventory','regionPrograms','admission'])assert.deepEqual(out.plan[key],f.plan[key]);
 assert.equal(capacity(out.plan),29,'the complete three-member census consumes three existing local slots');assert.deepEqual(f.plan,before);
 assert.deepEqual(apply(f.plan,[],[[],[]]).plan,f.plan);
});
test('ambiguous, unknown, nested, legal and oversized inventories do not acquire relocation authority',()=>{
 for(const mutate of [p=>{delete p.observedInventory;},p=>{p.observedInventory[1].icons=null;},p=>{p.observedInventory[1].icons=2;},
  p=>{p.objects[1].box={x:8,y:8,w:1,h:1};},p=>{p.objects[0].box={x:60,y:60,w:20,h:20};},
  p=>{p.objects[0].parentObjectId='known-a';},p=>{p.regions[1].box={x:0,y:0,w:600,h:600};},
  p=>{p.regions.push({id:'child',parentId:'card',kind:'section',box:{x:80,y:80,w:50,h:50}});},p=>{delete p.objectBatches;}]){
  const p=structuredClone(fixture().plan);mutate(p);assert.deepEqual(select(p),[]);
 }
 assert.deepEqual(select(undefined),[]);
 const f=fixture();for(let i=0;i<10;i++)f.plan=require('../packages/slideclone-core/source-scene-object-batches').recordSceneLocalObjectBatch(f.plan,f.plan,[],['known-a','known-b','lost']);
 assert.deepEqual(select(f.plan),[],'two spare slots cannot reserve a three-member census');
});
test('failed observations retain all old members and spend the full existing review reservation without refund',()=>{
 for(const mutate of [rows=>{rows[0][0].units.pop();},rows=>{rows[1][0].units[1].confidence=.89;},
  rows=>{rows[1][0].units[1].box.x+=20;},rows=>{rows[0][0].units[0].kind='container';},
  rows=>{rows[0][0].units[0].box.x=0;},rows=>{rows[0][0].units[0].box={...rows[0][0].units[1].box};},
  rows=>{rows[0][0].units[0].rejection='source-window';}]){
  const f=fixture(),rows=structuredClone(f.rows);mutate(rows);const out=apply(f.plan,[f.target],rows);
  assert.deepEqual(out.plan.objects,f.plan.objects);assert.equal(out.evidence.corrected.length,0);assert.equal(out.evidence.rejected.length,1);
  assert.equal(capacity(out.plan),29);
 }
});
test('revision targets are bound to the exact source, owner and unchanged plan revision',()=>{
 const f=fixture();for(const change of [{sourceHash:'b'.repeat(64)},{revision:'b'.repeat(64)},{regionId:'root'},
  {box:{x:0,y:0,w:400,h:400}},{objectId:'known-a'},{iconIds:['lost']}])
  assert.throws(()=>apply(f.plan,[{...f.target,...change}],f.rows),TypeError);
 const stale=structuredClone(f.plan);stale.objects[1].box.x++;assert.throws(()=>apply(stale,[f.target],f.rows),TypeError);
 assert.throws(()=>apply(f.plan,[f.target,f.target],f.rows),TypeError);
});
test('hostile, illegal and extreme boundary data fails safely without accessors or provider strings in errors',()=>{
 const f=fixture();let reads=0;const hostile={get index(){reads++;throw new Error('private-content');}};
 for(const targets of [[hostile],new Proxy([f.target],{}),Array(1),Array(33).fill(f.target)])assert.throws(()=>apply(f.plan,targets,f.rows),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 for(const value of [NaN,Infinity,-1,0]){
  const rows=structuredClone(f.rows);rows[0][0].units[0].box.w=value;assert.throws(()=>apply(f.plan,[f.target],rows),TypeError);
 }
 for(const rows of [[f.rows[0]],new Proxy(f.rows,{}),[[{index:0,units:[hostile],relations:[]}],f.rows[1]]])assert.throws(()=>apply(f.plan,[f.target],rows),TypeError);
 const overflow=structuredClone(f.rows);overflow[0][0].units.push({...overflow[0][0].units[0]});assert.throws(()=>apply(f.plan,[f.target],overflow),TypeError);
 const coercion=structuredClone(f.rows);coercion[0][0].units[0].kind={toString(){reads++;return 'icon';}};assert.throws(()=>apply(f.plan,[f.target],coercion),TypeError);
 const p=structuredClone(f.plan);p.objects[0]=new Proxy(p.objects[0],{});assert.throws(()=>select(p),TypeError);assert.equal(reads,0);
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});
