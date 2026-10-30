'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {sceneProgramTasks}=require('../packages/slideclone-core/scene-plan/source-scene-program-tasks');
const {applyRegionalInventoryReview}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {readSceneProgram}=require('../packages/slideclone-core/scene-plan/source-scene-program-contract');
const {applySceneGeneratedPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-program-generation');

function fixture(){
 const plan=admitSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'owner',parentId:null,kind:'diagram',box:{x:0,y:0,w:100,h:80}}],inventory:[['owner',2,0,1]],objects:[],relations:[],programs:[]},{sourceHash:'a'.repeat(64),widthPx:100,heightPx:80,labelRefs:[]});
 const task=sceneProgramTasks(plan,[{box:{x:12,y:12,w:10,h:6}}])[0],binding={objects:[],relations:[],labels:[0],allowNewMembers:true};
 const a={kind:'container',confidence:.99,box:{x:10,y:10,w:20,h:20}},b={kind:'container',confidence:.99,box:{x:60,y:10,w:20,h:20}};
 const program=(objects)=>readSceneProgram({objects,relations:[0],labels:[{refs:[0],family:null,weight:null,sizePt:null,role:null}]},binding,2,1);
 return {plan,target:{index:4,regionId:task.regionId,box:plan.regions[0].box,programTask:task,programOnly:false,addObjects:true},observations:[
  [{index:4,units:[a,b],relations:[{from:0,to:1,direction:'forward'}],program:program([0,1])}],
  [{index:4,units:[b,a],relations:[{from:1,to:0,direction:'forward'}],program:program([1,0])}]]};
}

test('same-pair new objects and relations map both independent orderings into one complete program',()=>{
 const {plan,target,observations}=fixture(),out=applyRegionalInventoryReview(plan,[target],observations);
 assert.equal(out.plan.objects.length,2);assert.equal(out.plan.relations.length,1);assert.equal(out.plan.regionPrograms.length,1);
 assert.deepEqual(out.plan.regionPrograms[0].objects,out.plan.objects.map(o=>o.id));assert.deepEqual(out.plan.regionPrograms[0].relations,[out.plan.relations[0].id]);
 assert.equal(out.plan.regionPrograms[0].labels[0].refs.length,1);assert.equal(out.evidence.programGeneration.admitted,1);assert.equal(out.plan.resolvedRegionPrograms,undefined);
 assert.deepEqual(out.plan.admission,plan.admission);
});

test('omitting a newly agreed dependency cannot manufacture a complete program',()=>{
 const {plan,target,observations}=fixture();for(const rows of observations)rows[0].program.objects=[0];
 const out=applyRegionalInventoryReview(plan,[target],observations);assert.equal(out.plan.regionPrograms.length,0);assert.equal(out.plan.objects.length,2);
 assert.equal(out.evidence.programGeneration.admitted,0);assert.ok(out.evidence.programGeneration.rejected.length);
});

test('changed source owner or preexisting dependency snapshots do not receive generated programs',()=>{
 for(const mutate of [p=>p.sourceHash='b'.repeat(64),p=>p.regions[0].box.w=99,p=>p.objects.push({id:'object-new',regionId:p.regions[0].id,kind:'container',box:{x:85,y:40,w:10,h:10}})]){
  const {plan,target,observations}=fixture();mutate(plan);
  if(plan.regions[0].box.w===99)target.box={...plan.regions[0].box};
  const out=applySceneGeneratedPrograms({previous:plan,next:plan,targets:[target],observations,matches:new Map()});assert.equal(out.plan.regionPrograms.length,0);assert.equal(out.evidence.rejected[0].reason,'program-task-changed');
 }
});

test('null or ambiguous source observations preserve the missing program obligation',()=>{
 for(const mode of ['null','owner']){
  const {plan,target,observations}=fixture();if(mode==='null')observations[1][0].program=null;else target.programTask.labelsComplete=false;
  const out=applyRegionalInventoryReview(plan,[target],observations);assert.equal(out.plan.regionPrograms.length,0);assert.equal(out.evidence.programGeneration.admitted,0);
 }
});
