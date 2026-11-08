// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const { admitOcrResult } = require("../ocr/ocr-result-admission");
const { parseSceneReviews, sourceSceneReviewCapacity, sourceSceneReviewContext } = require("./source-scene-review");
const { reconcileSceneLabelLayout } = require("./source-scene-plan");
const {sourceSceneLocalPrompt}=require("./source-scene-local-prompt");
const {materializeReviewedSceneGraphics}=require("./source-scene-reviewed-graphics");
const {partitionMissingSceneText,readMissingSceneObservations,acceptMissingSceneText,bindMissingSceneTextRejections}=require("./source-scene-missing-text");
const {readStructuralObservations,applyStructuralReview}=require("./source-scene-structural-review");
const {readInventoryObservations,applyInventoryReview}=require("./source-scene-inventory-review");
const {selectSourceSceneReviewTargets,selectSourceSceneMissingReviewTargets,sceneLocalRelationCapacity,sceneLocalObjectCapacity}=require('./source-scene-review-targets');
const {selectTopologyReviewTargets,readTopologyObservations,applyTopologyReview,topologyReviewPrompt,sceneEdgeLocalTargets}=require('./source-scene-topology-review');
const {sourceSceneReviewCrop,sourceSceneReviewedGraphicCrop}=require("./source-scene-review-allocation");
const {allocateStagedSceneReview,reviewDeferredSceneRegions,reviewDeferredSceneRelations,reviewSceneOwnerRevisions}=require('./source-scene-deferred-regional-review');
const {selectReviewedRegionalTargets,readRegionalInventoryObservations,applyRegionalInventoryReview,regionalInventoryPrompt,applySceneRegionBoundaryReview,sceneRegionalProgramBindings}=require('./source-scene-regional-review');
const {prepareSceneReviewImages,runPairedSceneReview,reconcileSceneGraphicLabels}=require('./source-scene-local-observations');
const {reviewSceneOcrBatches,applyBatchedSceneReview}=require("./source-scene-ocr-batches");
/** Local review owns candidate allocation, independently bound observations,
 * reconciliation and its evidence. It cannot create a global request, reset
 * call/pixel ledgers, or grant source ownership outside existing admission.
 * @param {{plan:import('./source-scene-plan').ScenePlan|undefined,
 * ocr:ReturnType<typeof admitOcrResult>,image:import('../png').PngImage,
 * dimensions:{widthPx:number,heightPx:number},root:string,directory:string,sourceHash:string,
 * global:ReturnType<typeof import('./source-scene-review').routeSceneReviewCandidates>&{sourceHash:string},globalResponse:unknown,
 * preflight:ReturnType<typeof import('./source-scene-compiler').preflightSourceScene>|undefined,
 * reservation:ReturnType<typeof sourceSceneReviewCapacity>,maxReviewBatches:number,
 * candidates:ReturnType<typeof import('./source-scene-local-prompt').sourceSceneOcrTargets>,globalLabelLayout:import('./source-scene-plan').ScenePlan['regionLabelLayout'],
 * observe:(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>,
 * isCancellationRequested:()=>Promise<boolean>,verifySource:()=>void,rules:string,retainedReview?:unknown,strokeBindings?:unknown}} input */
async function reviewSourceSceneLocal(input){
 let {plan}=input;
 const {ocr,image,dimensions,root,directory,sourceHash,global,globalResponse,preflight,reservation,maxReviewBatches,candidates,globalLabelLayout,observe,isCancellationRequested,verifySource,rules:RULES}=input;
    let targets = global.reviews.filter(item => item.kind !== "text").map(item => item.index);
    const reviewContexts=new Map(targets.map(index=>{
      const line=ocr.lines[index];if(!line)throw new TypeError('Scene crop reference is invalid');
      return [index,sourceSceneReviewContext(line.box,plan)];}));
    const {proposals:proposedMissing,rejected:rejectedMissingProposals}=partitionMissingSceneText(globalResponse,ocr.lines,image);
    if(!plan&&rejectedMissingProposals.length)throw new TypeError("Scene missing text overlaps existing evidence");
    if(plan&&rejectedMissingProposals.length){
      plan.admission={...plan.admission,complete:false,rejections:[...(plan.admission?.rejections||[]),
        ...rejectedMissingProposals.map(item=>({collection:"missingText",index:item.index,reason:item.reason}))]};
      fs.writeFileSync(path.join(directory,"plan.json"),`${JSON.stringify(plan)}\n`,{mode:0o600});
    }
    fs.writeFileSync(path.join(directory,'review-capacity.json'),`${JSON.stringify({sourceHash,mandatoryReviews:reservation.indices.length,requiredReviews:targets.length,missingTargets:proposedMissing.length,limitTargets:32*maxReviewBatches,feasible:targets.length+proposedMissing.length<=32*maxReviewBatches})}\n`,{flag:'wx',mode:0o600});
    sourceSceneReviewCapacity(global.reviews,proposedMissing.length,maxReviewBatches);
    const overflow=await reviewSceneOcrBatches({targets,missingCount:proposedMissing.length,lines:ocr.lines,image,directory,contexts:reviewContexts,rules:RULES,sourceHash,observe,isCancellationRequested,verifySource});
    targets=overflow.targets;
    const reviewCapacity=Math.min(32-targets.length-proposedMissing.length,512-ocr.lines.length-proposedMissing.length);
    const topologyProposals=selectTopologyReviewTargets(plan,reviewCapacity,preflight?.evidence,input.strokeBindings);
    const required=selectSourceSceneReviewTargets(plan,reviewCapacity-topologyProposals.length,preflight?.evidence).structures.filter(p=>!p.compileProbe).length;
    const regionalProposals=selectReviewedRegionalTargets([plan,reviewCapacity-topologyProposals.length-required,preflight?.physicalInventory?.evidence.releasedObjectSlots??0,
      /** @type {Record<string,unknown>|undefined} */(preflight?.evidence)?.observedInventory,preflight?.evidence,required,ocr.lines],input.retainedReview);
    const regionalAddsObjects=regionalProposals.some(p=>p.addObjects===true||!p.programOnly&&!p.boundaryReview&&!p.endpoints?.length);
    const regionalCapacity={objects:plan&&regionalAddsObjects?Math.max(0,sceneLocalObjectCapacity(plan)-required):0,relations:plan?sceneLocalRelationCapacity(plan,topologyProposals.length):0};
    const selected=selectSourceSceneReviewTargets(plan,reviewCapacity-regionalProposals.length-topologyProposals.length,preflight?.evidence);
    // The omitted regions reserve the released object slots before optional
    // pictorial children; both still share the original two observations.
    if(regionalAddsObjects){selected.inventories=[];selected.structures=selected.structures.filter(p=>!p.compileProbe);}
    const discovery=selectSourceSceneMissingReviewTargets(plan,ocr.lines,proposedMissing,selected,reviewCapacity-regionalProposals.length-topologyProposals.length);
    const structuralProposals=discovery.structures,inventoryProposals=selected.inventories;
    let missing=discovery.missing;
    let structures=structuralProposals.map((proposal,i)=>({...proposal,index:ocr.lines.length+missing.length+i}));
    let inventories=inventoryProposals.map((proposal,i)=>({...proposal,index:ocr.lines.length+missing.length+structures.length+i}));
    let topology=topologyProposals.map((proposal,i)=>({...proposal,index:ocr.lines.length+missing.length+structures.length+inventories.length+i}));
    let regionalInventories=regionalProposals.map((proposal,i)=>({...proposal,index:ocr.lines.length+missing.length+structures.length+inventories.length+topology.length+i}));
    const cropLines=[...ocr.lines,...missing,...structures,...inventories,...topology,...regionalInventories];
    const allocation=allocateStagedSceneReview({width:image.width,height:image.height,spentPixels:overflow.pixels+overflow.reservedPixels,targets:[
      ...targets.map(index=>({index,box:ocr.lines[index]?.box,contextBox:reviewContexts.get(index),role:'review',optional:false,textKnown:false})),
      ...missing.map(p=>({index:p.index,box:p.box,role:'missing',optional:!proposedMissing.some(t=>t.index===p.index),textKnown:p.text!==null,
        ...(p.labelCandidate?{labelCandidate:true}:{})})),
      ...inventories.map(p=>({index:p.index,box:p.box,role:'inventory',optional:true,textKnown:false})),
      ...structures.map(p=>({index:p.index,box:p.box,contextBox:p.contextBox,role:p.compileProbe?'probe':'structure',optional:p.compileProbe,textKnown:false})),
      // Rejected proposals have no admitted drawable relation to protect.
      // Defer their repair when the complete view cannot fit; the original
      // admission rejection and reserved relation slot still block completion.
      ...topology.map(p=>({index:p.index,box:p.box,role:'relation',optional:p.admissionIndex!==undefined,textKnown:false})),
      ...regionalInventories.map(p=>({index:p.index,box:p.box,contextBox:p.contextBox,role:'region-inventory',optional:true,textKnown:false}))]},maxReviewBatches-overflow.batches.length);
    const cropIndices=allocation.indices;
    const pendingRegionalInventories=regionalInventories.filter(p=>!cropIndices.includes(p.index));
    const pendingTopology=topology.filter(p=>!cropIndices.includes(p.index));
    missing=missing.filter(p=>cropIndices.includes(p.index));structures=structures.filter(p=>cropIndices.includes(p.index));inventories=inventories.filter(p=>cropIndices.includes(p.index));
    topology=topology.filter(p=>cropIndices.includes(p.index));
    regionalInventories=regionalInventories.filter(p=>cropIndices.includes(p.index));
    fs.writeFileSync(path.join(directory,'allocation.json'),`${JSON.stringify({sourceHash,...allocation})}\n`,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(directory,"missing-proposals.json"),`${JSON.stringify({sourceHash,proposals:missing,rejected:rejectedMissingProposals})}\n`,{flag:"wx",mode:0o600});
    const observations = [],missingObservations=[],structuralObservations=[],inventoryObservations=[],regionalObservations=[],topologyObservations=[]; let pixels = overflow.pixels;
    /** @type {((cancel:()=>Promise<boolean>)=>Promise<{response:unknown,frame:import('./source-scene-missing-text').CropFrame|undefined}>)[]} */const localWork=[];
      for (const paddingRatio of [0, 0.7]) {
        const cropTargets = [];
        for (const index of cropIndices) {
          const line = cropLines[index]; if (!line) throw new TypeError("Scene crop reference is invalid");
          const structural=structures.some(t=>t.index===index)||inventories.some(t=>t.index===index);
          const regional=regionalInventories.some(t=>t.index===index)||topology.some(t=>t.index===index);
          const box=sourceSceneReviewCrop({index,box:line.box,contextBox:regionalInventories.find(t=>t.index===index)?.contextBox??structures.find(t=>t.index===index)?.contextBox??reviewContexts.get(index),
            role:regional?'region-inventory':structural?'structure':'review',optional:false,textKnown:false},paddingRatio,image.width,image.height);
          const {x,y}=box;
          cropTargets.push({index,cropBox:box,
            candidateBox:{x:line.box.x-x,y:line.box.y-y,w:line.box.w,h:line.box.h}});
        }
        const prepared=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:allocation.focusIndices??[],structureFocusIndices:allocation.structureFocusIndices??[],reservedPixels:allocation.reservedPixels+overflow.reservedPixels,pixels,paddingRatio});
        const {images,frame,sheetTargets}=prepared;pixels=prepared.pixels;
        const relationPrompt=topologyReviewPrompt(topology,frame),regionalPrompt=regionalInventoryPrompt(regionalInventories,regionalCapacity,frame);
        // Both views use the same admitted controls. Charge and persist every
        // crop before dispatch; provider completion order cannot change merging.
        localWork.push(async cancel=>({frame,response:images.length?await observe({images,isCancellationRequested:cancel,task:'classify-ocr',
          localTargets:{reviews:targets,missing:missing.map(p=>p.index),...(structures.length?{structures:structures.map(p=>p.index)}:{}),
            ...(inventories.length?{inventories:inventories.map(p=>p.index)}:{}),...(topology.length?{...sceneEdgeLocalTargets(topology),relations:topology.map(p=>p.index),...(topology.some(p=>p.localization)?{relationLocalizationIndices:topology.filter(p=>p.localization).map(p=>p.index)}:{}),...(topology.some(p=>p.pathReview)?{relationPathIndices:topology.filter(p=>p.pathReview).map(p=>p.index)}:{})}:{}),
            ...(regionalInventories.length?{regionInventories:regionalInventories.map(p=>p.index),regionObjectCapacity:regionalCapacity.objects,regionRelationCapacity:regionalCapacity.relations,
              ...sceneRegionalProgramBindings(regionalInventories),
              ...(regionalInventories.some(p=>p.boundaryReview)?{regionBoundaryIndices:regionalInventories.filter(p=>p.boundaryReview).map(p=>p.index)}:{}),
              ...(regionalInventories.some(p=>p.endpoints?.length)?{regionEndpointIds:Object.fromEntries(regionalInventories.map(p=>[String(p.index),(p.endpoints??[]).map(e=>e.id)]))}:{})}:{})},
          prompt:sourceSceneLocalPrompt({rules:RULES,...(plan?.relationObservationUnit?{relationObservationUnit:plan.relationObservationUnit}:{}),targets,missing:missing.map(p=>p.index),focused:allocation.focusIndices??[],focusedStructures:allocation.structureFocusIndices??[],sheetTargets,
            structures,inventories,relationPrompt,regionalPrompt,extraKeys:[...(topology.length?['relationsByIndex']:[]),...(regionalInventories.length?['regionInventoriesByIndex']:[])]})
        }):{reviews:[],recoveredText:[]}}));
      }
      const localResults=await runPairedSceneReview({work:localWork,isCancellationRequested,verifySource});
      for(const {response,frame}of localResults){
        const reviews=parseSceneReviews(response,ocr.lines.length);
        missingObservations.push(readMissingSceneObservations(response,missing,frame));
        structuralObservations.push(readStructuralObservations(response,structures,frame));
        topologyObservations.push(readTopologyObservations(response,topology,frame));
        inventoryObservations.push(readInventoryObservations(response,inventories,frame));
        regionalObservations.push(readRegionalInventoryObservations(response,regionalInventories,frame,regionalCapacity));
        verifySource(); observations.push({ sourceHash, reviews });
      }
      const result = applyBatchedSceneReview({ocr,dimensions,sourceHash,global,batches:[...overflow.batches,{targets,local:observations[0],context:observations[1]}]});
      const structural=plan?applyStructuralReview(plan,structures,structuralObservations):undefined;
      if(structural){plan=structural.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      // A path restriction leaves membership and endpoint bodies unchanged.
      // Admit same-view region programs against their original snapshots first,
      // then apply these source-bound restrictions through normal rebinding.
      // Ordinary reference repairs keep their existing earlier transaction.
      const references=topology.filter(t=>!t.pathReview&&!t.edgeReview),paths=topology.filter(t=>t.pathReview||t.edgeReview);
      let topologyResult=plan?applyTopologyReview(plan,references,topologyObservations.map(rows=>rows.filter(r=>references.some(t=>t.index===r.index)))):undefined;
      if(topologyResult){plan=topologyResult.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      const inventory=plan?applyInventoryReview(plan,inventories,inventoryObservations):undefined;
      if(inventory){plan=inventory.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      const regional=plan?applyRegionalInventoryReview(plan,regionalInventories,regionalObservations):undefined;
      if(regional){plan=regional.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      if(plan&&paths.length){
        const reviewed=applyTopologyReview(plan,paths,topologyObservations.map(rows=>rows.filter(r=>paths.some(t=>t.index===r.index))));
        plan=reviewed.plan;
        topologyResult={plan,evidence:{proposed:(topologyResult?.evidence.proposed??0)+reviewed.evidence.proposed,
          corrected:[...(topologyResult?.evidence.corrected??[]),...reviewed.evidence.corrected],rejected:[...(topologyResult?.evidence.rejected??[]),...reviewed.evidence.rejected]}};
        fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});
      }
      const boundaries=plan?applySceneRegionBoundaryReview(plan,regionalInventories,regionalObservations):undefined;
      if(boundaries)plan=boundaries.plan;
      if(plan?.regionPrograms)plan=reconcileSceneLabelLayout(plan,candidates.map(c=>c.labelRef),ocr.lines.map(line=>line.box));
      const pixelBudget={used:pixels},recovered=acceptMissingSceneText(missing,missingObservations,image,pixelBudget,result.ocr.lines);
      plan=bindMissingSceneTextRejections(plan,recovered.rejected);
      if(plan)fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});
      const finalOcr=admitOcrResult({lines:[...result.ocr.lines,...recovered.lines]},dimensions);
      const regeneration=plan?reconcileSceneGraphicLabels({plan,sourceLabels:finalOcr.lines,added:regional?.evidence.added??[],
        retired:result.evidence.rejectedOcr.map(row=>{
          if(!row.box)throw new TypeError('Scene retired label source is invalid');return {index:row.index,box:row.box};
        })}):undefined;
      if(regeneration){plan=regeneration.plan;
        fs.writeFileSync(path.join(directory,'regeneration.json'),`${JSON.stringify(regeneration.evidence)}\n`,{flag:'wx',mode:0o600});
        fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      if(regeneration)Object.assign(result.evidence,{regionalRegeneration:regeneration.evidence});
      const reviewedGraphics=materializeReviewedSceneGraphics({image,rejectedOcr:result.evidence.rejectedOcr.map(target=>{
        const context=reviewContexts.get(target.index);
        // A model envelope is a seed, not a proven clipping boundary. Reuse
        // the already transmitted second observation; allocation reserves
        // this exact scan. Source isolation still proves the complete unit.
        return {...target,searchBox:context&&target.box?sourceSceneReviewedGraphicCrop({index:target.index,box:target.box,contextBox:context,role:'review',optional:false,textKnown:false},image.width,image.height):undefined};
      }),textBoxes:[...finalOcr.lines],root,budget:pixelBudget,sourceHash});
      const deferredRegional=plan&&pendingRegionalInventories.length&&overflow.batches.length+1<maxReviewBatches
        ?await reviewDeferredSceneRegions({plan,targets:pendingRegionalInventories,image,budget:pixelBudget,directory,rules:RULES,observe,verifySource,isCancellationRequested}):undefined;
      if(deferredRegional){
        plan=reconcileSceneGraphicLabels({plan:deferredRegional.plan,sourceLabels:finalOcr.lines,added:deferredRegional.added,retired:[]}).plan;
        if(plan.regionPrograms)plan=reconcileSceneLabelLayout(plan,candidates.map(c=>c.labelRef),ocr.lines.map(line=>line.box));
        fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});
      }
      const settledPairs=overflow.batches.length+1+(deferredRegional?.evidence.providerCalls??0)/2;
      const deferredRelations=plan&&pendingTopology.length&&settledPairs<maxReviewBatches
        ?await reviewDeferredSceneRelations({plan,targets:pendingTopology,image,budget:pixelBudget,directory,rules:RULES,observe,verifySource,isCancellationRequested}):undefined;
      if(deferredRelations){plan=deferredRelations.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      const settledBeforeRevision=settledPairs+(deferredRelations?.evidence.providerCalls??0)/2;
      const ownerRevision=plan&&settledBeforeRevision<maxReviewBatches
        ?await reviewSceneOwnerRevisions({plan,image,budget:pixelBudget,directory,rules:RULES,observe,verifySource,isCancellationRequested,remainingReviewBatches:maxReviewBatches-settledBeforeRevision}):undefined;
      if(ownerRevision){plan=ownerRevision.plan;fs.writeFileSync(path.join(directory,'plan.json'),`${JSON.stringify(plan)}\n`,{mode:0o600});}
      const laterIndices=[...(deferredRegional?.evidence.allocation.indices??[]),...(deferredRelations?.evidence.allocation.indices??[])],batchCount=settledBeforeRevision+(ownerRevision?.evidence.providerCalls??0)/2;
      const reviewAllocation={retainedTargets:allocation.indices.length+laterIndices.length+overflow.batches.reduce((sum,batch)=>sum+batch.targets.length,0),
        deferred:allocation.deferred.filter(t=>!laterIndices.includes(t.index)),
        ...(deferredRegional||deferredRelations?{firstStageDeferred:allocation.deferred}:{}),...(batchCount>1?{batchCount}:{})};
      const evidence={...result.evidence,...(deferredRegional?{deferredRegionalReview:deferredRegional.evidence}:{}),...(globalLabelLayout?{sourceLabelLayout:{global:globalLabelLayout,final:plan?.regionLabelLayout}}:{}),reviewAllocation,...(structural?{structuralReview:structural.evidence}:{}),...(topologyResult?{topologyReview:topologyResult.evidence}:{}),...(inventory?{inventoryReview:inventory.evidence}:{}),...(regional?{regionalInventoryReview:regional.evidence}:{}),...(boundaries?{regionBoundaryReview:boundaries.evidence}:{}),rejectedMissingProposals,missingTextProposed:missing.length,recoveredMissingText:recovered.lines.map(line=>({box:line.box})),rejectedMissingText:recovered.rejected,
        materializedReviewedGraphics:reviewedGraphics.graphics.map(g=>({index:g.source.sceneReviewOcrIndex,box:g.box})),unresolvedReviewedGraphics:reviewedGraphics.unresolved,
        ...(deferredRelations?{deferredRelationReview:deferredRelations.evidence}:{}),...(ownerRevision?.evidence.requested?{ownerRevisionReview:ownerRevision.evidence}:{})};
      verifySource();
      fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({ ...evidence, cropPixels: pixelBudget.used, global, ...(overflow.batches.length?{ocrBatches:overflow.batches}:{}),observations,missingObservations,structuralObservations,regionalObservations,topologyObservations })}\n`, { flag: "wx", mode: 0o600 });
      return {ocr:finalOcr,evidence,graphics:reviewedGraphics.graphics,...(plan?{plan}:{})};
}
module.exports={reviewSourceSceneLocal};
