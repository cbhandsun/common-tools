// @ts-check
"use strict";
const {selectStructuralReviewTargets}=require('./source-scene-structural-review');
const {selectInventoryReviewTargets}=require('./source-scene-inventory-review');
const {sceneInventoryCapacity,sceneInventoryCapacityError}=require('./source-scene-capacity');
const {sceneRelationSlotsUsed,sceneLocalRelationCapacity}=require('./source-scene-relation-batches');
const {discoverMissingSceneText}=require('./source-scene-missing-text');
const {sceneLocalObjectCapacity}=require('./source-scene-object-batches');
/** The scene is already admitted at the planner boundary. Explicit owner and
 * kind contradictions and failed declared multi-face constructions keep their
 * mandatory slots. Missing pictorial children
 * share the remaining original target/object capacity before optional compile
 * probes, which cannot monopolize both local observations. Each physical
 * parent has one review role; unselected failures remain final compiler gates.
 * @param {import('./source-scene-plan').ScenePlan|undefined} plan
 * @param {number} capacity @param {unknown} [compileEvidence] */
function selectSourceSceneReviewTargets(plan,capacity,compileEvidence){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError('Scene review capacity is invalid');
 const candidates=selectStructuralReviewTargets(plan,capacity,compileEvidence);
 const mandatory=candidates.filter(target=>!target.compileProbe);
 const objectCapacity=plan?.objectBatches?Math.min(capacity,sceneLocalObjectCapacity(plan)):capacity;
 const inventories=selectInventoryReviewTargets(plan,Math.max(0,objectCapacity-mandatory.length),mandatory.map(target=>target.objectId));
 const parents=new Set(inventories.map(target=>target.objectId));
 const probes=candidates.filter(target=>target.compileProbe&&!parents.has(target.objectId))
  .slice(0,Math.max(0,objectCapacity-mandatory.length-inventories.length));
 return {structures:[...mandatory,...probes],inventories};
}
/** Uncovered source units need an observation before optional compile probes
 * consume the original target slots. Keep mandatory corrections and inventory
 * reservations; this only proposes glyph discovery, never text or ownership.
 * @param {import('./source-scene-plan').ScenePlan|undefined} plan
 * @param {readonly import('../ocr/ocr-result-admission').OcrLine[]} lines
 * @param {import('./source-scene-missing-text').Proposal[]} proposed
 * @param {ReturnType<typeof selectSourceSceneReviewTargets>} selected
 * @param {number} capacity Remaining slots after OCR, explicit missing,
 * topology and regional inventory reservations. */
function selectSourceSceneMissingReviewTargets(plan,lines,proposed,selected,capacity){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError('Scene review capacity is invalid');
 const mandatory=selected.structures.filter(p=>!p.compileProbe);
 const spare=capacity-mandatory.length-selected.inventories.length;
 if(spare<0)throw new RangeError('Scene review reservations exceed capacity');
 const discovered=discoverMissingSceneText(plan?.objects??[],lines,proposed,spare);
 const probes=selected.structures.filter(p=>p.compileProbe).slice(0,spare-discovered.length);
 return {missing:[...proposed,...discovered],structures:[...mandatory,...probes]};
}
module.exports={selectSourceSceneReviewTargets,selectSourceSceneMissingReviewTargets,sceneInventoryCapacity,sceneInventoryCapacityError,sceneRelationSlotsUsed,sceneLocalRelationCapacity,sceneLocalObjectCapacity};
