'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneProgramTasks,sceneProgramTaskRevision,sceneRegionalProgramBindings}=require('../packages/slideclone-core/scene-plan/source-scene-program-tasks');
const {admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {selectRegionalInventoryTargets}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');

function fixture(){
 const labels=[{box:{x:10,y:10,w:20,h:8}},{box:{x:110,y:10,w:20,h:8}}];
 const plan=admitSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'left',parentId:null,kind:'diagram',box:{x:0,y:0,w:100,h:80}},{id:'right',parentId:null,kind:'diagram',box:{x:100,y:0,w:100,h:80}}],objects:[],relations:[],programs:[]},{sourceHash:'a'.repeat(64),widthPx:200,heightPx:80,labelRefs:[]});
 return {plan,labels};
}

test('no retained template and no inventory gap still create bounded program tasks',()=>{
 const {plan,labels}=fixture(),tasks=sceneProgramTasks(plan,labels);assert.equal(tasks.length,2);assert.deepEqual(tasks.map(t=>t.labels.map(l=>l.index)),[[0],[1]]);
 const targets=selectRegionalInventoryTargets(plan,32,0,undefined,undefined,0,labels);assert.equal(targets.length,2);assert.ok(targets.every(t=>t.programOnly));
 const bindings=sceneRegionalProgramBindings(targets.map((t,index)=>({...t,index}))).regionProgramBindings;
 assert.equal(bindings[0].allowNewMembers,false);assert.deepEqual(bindings[1].labels,[1]);
 assert.deepEqual(selectRegionalInventoryTargets(plan,0,0,undefined,undefined,0,labels),[]);
});

test('existing programs are not regenerated and legacy no-program scenes retain their contract',()=>{
 const {plan,labels}=fixture();plan.regionPrograms.push({regionId:plan.regions[0].id,objects:[],relations:[],labels:[]});
 assert.equal(sceneProgramTasks(plan,labels).length,1);delete plan.regionPrograms;assert.deepEqual(sceneProgramTasks(plan,labels),[]);
 assert.deepEqual(sceneProgramTasks(undefined,labels),[]);
});

test('source dimensions owner geometry and dependencies participate in the immutable revision',()=>{
 const {plan}=fixture(),owner=plan.regions[0].id,revision=sceneProgramTaskRevision(plan,owner);
 for(const mutate of [p=>p.sourceHash='b'.repeat(64),p=>p.widthPx=201,p=>p.regions[0].box.w=99,p=>p.objects.push({id:'object-new',regionId:owner,kind:'container',box:{x:1,y:1,w:4,h:4}})]){
  const changed=structuredClone(plan);mutate(changed);assert.notEqual(sceneProgramTaskRevision(changed,owner),revision);
 }
});

test('overlapping unrelated owners cannot authorize an empty-label program',()=>{
 const {plan,labels}=fixture();plan.regions[1].box={...plan.regions[0].box};const tasks=sceneProgramTasks(plan,labels.slice(0,1));
 assert.ok(tasks.every(t=>!t.labelsComplete));assert.ok(tasks.every(t=>t.labels.length===0));
});

test('task inputs reject accessors proxies sparse labels cycles and extreme source frames',()=>{
 const {plan,labels}=fixture();let called=0;
 for(const mutate of [p=>p.regions=new Array(1),p=>p.widthPx=Infinity,p=>p.regions[0].parentId=p.regions[0].id,p=>p.objects=new Proxy([],{}),p=>Object.defineProperty(p.regions[0],'box',{get(){called++;return {};},enumerable:true})]){
  const bad=structuredClone(plan);mutate(bad);assert.throws(()=>sceneProgramTasks(bad,labels),TypeError);
 }
 const cyclic=structuredClone(plan);cyclic.self=cyclic;assert.throws(()=>sceneProgramTasks(cyclic,labels),TypeError);
 assert.throws(()=>sceneProgramTasks(plan,new Array(2)),TypeError);assert.throws(()=>sceneProgramTasks(plan,[...labels,labels[0]]),/ambiguous/);assert.equal(called,0);
});
