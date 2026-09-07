"use strict";
const {createPageOutputFinalizer}=require("../../packages/slideclone-core/page-output-finalizer");
const names=[
  "sanitizeNativeShapes",
  "dropResidualsCoveredByNativeTableText",
  "dropTableMatrixResidualObjectifiedCrops",
  "dropMostlyBlankCoveredResidualCrops",
  "dropPluginTemplateCoveredStructuralUnderlays",
  "dropPluginTemplateCoveredSmallResidualCrops",
  "dropWmsObjectifiedValuePanelResidualCrops",
  "dropWmsObjectifiedTopRouteUnderlay",
  "suppressRedundantTableGridScaffoldCoveredByVisualAtoms",
  "suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels",
  "applyPrototypeValidationScreenshotPolicy",
  "materializePrototypeValidationResidualCrops",
  "dropPrototypeValidationResidualCropsWhenNativeCoverage",
  "dropDemandUnderstandingResidualCropsWhenNativeCoverage",
  "dropEntropyChallengeCropsWhenNativeCoverage",
  "dropDecorativeCoverDuplicateForegroundCrops",
  "finalizePrdSegmentedFlowComponents",
  "normalizeCjkText"
];
function fixture(){
 const inputs={embeddedExpertScreenshotActive:false,embeddedExpertScreenshot:{shapes:[],textBoxes:[]},slideSize:{width:1280,height:720},options:{irDir:"fixture"},allowEntropyNativeApproximation:false,autoObjectifyEntropyIsland:false,image:{},assetOsFragmentedAssetChainActive:false,assetOsFragmentedAssetChain:{textBoxes:[]}};
 const calls=[];
 const operations=Object.fromEntries(names.map(n=>[n,(...args)=>{calls.push({name:n,args});return args[0];}]));
 operations.normalizeCjkText=value=>String(value||"").toLowerCase();
 const page={shapes:[],textBoxes:[],images:[],source:{kept:true}};
 return {inputs,operations,page,calls,run:()=>createPageOutputFinalizer(operations)(page,inputs)};
}
module.exports={fixture};
