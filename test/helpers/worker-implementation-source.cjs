'use strict';
const fs=require('node:fs'),path=require('node:path');
// Legacy source guards follow the extracted production modules. Expand phase
// calls in the job runner so assertions about execution order still inspect
// their actual call site, while behavior tests exercise the exported handler.
function readWorkerImplementation(){
 const root=path.resolve(__dirname,'../../packages/slideclone-worker-adapter');
 const phases=new Map();
 for(const file of ['worker-text-refinement.js','worker-surface-refinement.js','worker-visual-refinement.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8'),match=/async function (runWorker\w+)\([^\n]+\) \{\n/u.exec(source);
  if(!match)throw Error('Worker phase declaration is missing');
  phases.set(match[1],source.slice(match.index+match[0].length,source.lastIndexOf('\n return {')));
 }
 let runner=fs.readFileSync(path.join(root,'worker-job-runner.js'),'utf8');
 runner=runner.replace(/\(\{[^;]*?= await (runWorker\w+)\([^;]*?;/gu,(call,name)=>{
  if(!phases.has(name))throw Error('Worker phase source is missing');return phases.get(name);
 });
 const supporting=fs.readdirSync(root).filter(f=>f.startsWith('worker-')&&f.endsWith('.js')&&f!=='worker-job-runner.js'&&!f.endsWith('-refinement.js'));
 return supporting.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\n'+runner;
}
module.exports={readWorkerImplementation};
