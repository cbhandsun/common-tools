// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validateDeckIrEnvelope}=require('../slideclone-core/deck-ir-tree');
const {rebindIntactSourceWordLayouts}=require('../slideclone-core/typography/source-word-layout-registry');
/** Copy bounded nested assets, then publish a page namespace atomically.
 * Compiler-owned directories are ordinary assets, never permission to follow
 * links or escape the page root. A failed copy publishes no partial namespace.
 * @param {unknown} input @param {string} pageRoot @param {string} root @param {number} pageNumber */
function namespaceRawPageAssets(input,pageRoot,root,pageNumber){
 const {pages}=validateDeckIrEnvelope(input);
 if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>50
  ||![pageRoot,root].every(p=>typeof p==='string'&&path.isAbsolute(p)&&!p.includes('\0')))throw new TypeError('raw asset namespace controls are invalid');
 const sourceAssets=path.join(fs.realpathSync(pageRoot),'assets'),rootAssets=path.join(fs.realpathSync(root),'assets');
 if(fs.lstatSync(sourceAssets).isSymbolicLink()||!fs.statSync(sourceAssets).isDirectory())throw new TypeError('raw asset namespace source is invalid');
 fs.mkdirSync(rootAssets,{recursive:true});
 if(fs.lstatSync(rootAssets).isSymbolicLink()||!fs.statSync(rootAssets).isDirectory())throw new TypeError('raw asset namespace destination is invalid');
 const namespace=`page-${String(pageNumber).padStart(3,'0')}`,destination=path.join(rootAssets,namespace);
 if(fs.existsSync(destination))throw new TypeError('raw asset namespace already exists');
 /** @type {{relative:string,size:number}[]} */const files=[];
 let entries=0,bytes=0;
 /** @param {string} directory @param {number} depth */
 function scan(directory,depth){
  if(depth>16)throw new RangeError('raw asset namespace depth exceeded');
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   if(++entries>10000)throw new RangeError('raw asset namespace entry limit exceeded');
   const file=path.join(directory,entry.name),relative=path.relative(sourceAssets,file),info=fs.lstatSync(file);
   if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative)||info.isSymbolicLink())throw new TypeError('raw asset namespace link is invalid');
   if(info.isDirectory())scan(file,depth+1);
   else if(info.isFile()){
    bytes+=info.size;if(!Number.isSafeInteger(info.size)||info.size<0||bytes>128*1024*1024)throw new RangeError('raw asset namespace byte limit exceeded');
    files.push({relative,size:info.size});
   }else throw new TypeError('raw asset namespace member is invalid');
  }
 }
 scan(sourceAssets,0);
 const replacements=new Map(files.map(row=>['assets/'+row.relative.split(path.sep).join('/'),'assets/'+namespace+'/'+row.relative.split(path.sep).join('/')]));
 /** @param {unknown} value @returns {unknown} */
 function rewrite(value){
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)]));
  return typeof value==='string'&&replacements.has(value)?replacements.get(value):value;
 }
 const rewritten=/** @type {{pages:unknown[]}} */(rewrite(input));
 const staging=fs.mkdtempSync(path.join(rootAssets,'.namespace-'));
 try{
  for(const row of files){
   const source=path.join(sourceAssets,row.relative),target=path.join(staging,row.relative),info=fs.lstatSync(source);
   let parent=sourceAssets;
   for(const part of row.relative.split(path.sep).slice(0,-1)){
    parent=path.join(parent,part);const directory=fs.lstatSync(parent);
    if(directory.isSymbolicLink()||!directory.isDirectory())throw new TypeError('raw asset namespace source changed');
   }
   if(!info.isFile()||info.isSymbolicLink()||info.size!==row.size)throw new TypeError('raw asset namespace source changed');
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  }
  fs.renameSync(staging,destination);
 }catch(error){
  // staging is created by mkdtemp under this exact verified directory.
  if(path.dirname(staging)!==rootAssets||!path.basename(staging).startsWith('.namespace-'))throw error;
  fs.rmSync(staging,{recursive:true,force:true});throw error;
 }
 for(let i=0;i<pages.length;i++)rebindIntactSourceWordLayouts(
  /** @type {{textBoxes?:Record<string,unknown>[]}} */(pages[i]),
  /** @type {{textBoxes?:Record<string,unknown>[]}} */(rewritten.pages[i]),replacements);
 return rewritten;
}
module.exports={namespaceRawPageAssets};
