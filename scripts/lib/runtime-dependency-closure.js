// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {types}=require('node:util');
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** The aggregate repeats a workspace range or pins its declared baseline.
 * This checks that explicit packaging policy; npm resolves versions.
 * It deliberately does not implement a second semver solver.
 * @param {unknown} value @returns {value is string} */
const range=value=>typeof value==='string'&&/^[~^]?(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/u.test(value);
/** @param {string} file @returns {Record<string,unknown>} */
function manifest(file){
 try{
  const details=fs.lstatSync(file);
  if(!details.isFile()||details.isSymbolicLink()||details.size<2||details.size>262144)throw Error();
  const value=/** @type {unknown} */(JSON.parse(fs.readFileSync(file,'utf8')));
  if(!record(value))throw Error();return value;
 }catch{throw new Error('Runtime dependency manifest is invalid');}
}
/** @param {Record<string,unknown>} value @returns {Map<string,string>} */
function dependencies(value){
 const entries=value.dependencies;if(entries===undefined)return new Map();
 if(!record(entries)||Object.keys(entries).length>128)throw new Error('Runtime production dependencies are invalid');
 const result=new Map();
 for(const [name,version]of Object.entries(entries)){
  if(name.length>128||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)||!range(version))
   throw new Error('Runtime production dependency contract is invalid');
  result.set(name,version);
 }
 return result;
}
/** @param {string} parent @param {string} child */
function inside(parent,child){const relative=path.relative(parent,child);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
/** @param {unknown} value @returns {value is string[]} */
function folders(value){
 return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=128
  &&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value'in p)
  &&value.every(name=>typeof name==='string'&&/^[a-z][a-z0-9-]{0,63}$/u.test(name))&&new Set(value).size===value.length;
}
/** @param {unknown} value @returns {value is string} */
const absolute=value=>typeof value==='string'&&value.length>0&&value.length<=32767&&!value.includes('\0')&&path.isAbsolute(value);
/** Check the actual bundled workspace manifests, not development hoisting.
 * Optional installed resolution must stay in this installation's node_modules;
 * NODE_PATH, global modules and workspace symlinks cannot grant readiness.
 * Errors contain only fixed classifications, never manifest contents or paths.
 * @param {string} packageRoot @param {readonly string[]} packageFolders
 * @param {string} [installedNodeModulesRoot] */
function verifyRuntimeDependencyClosure(packageRoot,packageFolders,installedNodeModulesRoot){
 if(!absolute(packageRoot)||!folders(packageFolders)||installedNodeModulesRoot!==undefined&&!absolute(installedNodeModulesRoot))
  throw new TypeError('Runtime dependency inputs are invalid');
 const root=fs.realpathSync(packageRoot),declared=dependencies(manifest(path.join(root,'package.json')));
 const workspaces=new Map();
 for(const folder of packageFolders){
  const directory=fs.realpathSync(path.join(root,'packages',folder));
  if(!inside(path.join(root,'packages'),directory))throw new Error('Runtime dependency workspace escapes the package');
  const value=manifest(path.join(directory,'package.json'));
  if(value.name!=='@common-tools/'+folder||typeof value.version!=='string'||!range(value.version)||/^[~^]/u.test(value.version))
   throw new Error('Runtime dependency workspace identity is invalid');
  workspaces.set(value.name,{version:value.version,dependencies:dependencies(value)});
 }
 const required=new Map();
 for(const workspace of workspaces.values())for(const [name,version]of workspace.dependencies){
  if(name.startsWith('@common-tools/')){
   if(workspaces.get(name)?.version!==version)throw new Error('Runtime embedded workspace dependency is invalid');
  }else{
   if(required.has(name)&&required.get(name)!==version)throw new Error('Runtime workspace dependency ranges conflict');
   required.set(name,version);
   const aggregate=declared.get(name),baseline=version.replace(/^[~^]/u,'');
   if(aggregate!==version&&aggregate!==baseline)throw new Error('Runtime aggregate production dependency is missing or mismatched');
  }
 }
 if([...declared.keys()].some(name=>name.startsWith('@common-tools/')))throw new Error('Runtime aggregate cannot fetch embedded private workspaces');
 if(installedNodeModulesRoot!==undefined){
  const modulesRoot=fs.realpathSync(installedNodeModulesRoot),resolve=createRequire(path.join(root,'package.json')).resolve;
  if(!inside(modulesRoot,root))throw new Error('Runtime dependency installation root is invalid');
  for(const name of new Set([...required.keys(),...declared.keys()])){
   let target;
   try{target=fs.realpathSync(resolve(name));}catch{throw new Error('Runtime installed production dependency is unavailable');}
   if(!inside(modulesRoot,target))throw new Error('Runtime installed production dependency escapes the installation');
  }
 }
 return Object.freeze({externalDependencies:Object.freeze([...required.keys()].sort()),workspaceCount:workspaces.size});
}
module.exports={verifyRuntimeDependencyClosure};
