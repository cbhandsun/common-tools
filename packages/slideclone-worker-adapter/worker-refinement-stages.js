"use strict";
const {runWorkerTextRefinement}=require('./worker-text-refinement');
const {runWorkerSurfaceRefinement}=require('./worker-surface-refinement');
const {runWorkerVisualRefinement}=require('./worker-visual-refinement');
module.exports={runWorkerTextRefinement,runWorkerSurfaceRefinement,runWorkerVisualRefinement};
