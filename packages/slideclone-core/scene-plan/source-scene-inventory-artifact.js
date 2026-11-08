// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {record}=require('./source-scene-group-containment');
/** Keep the complete immutable audit beside the rendering IR, rather than
 * duplicate its detailed unit and batch ledgers on both deck and page roots.
 * Every drawable, unit ID, census verdict and original source failure survives.
 * The IR's existing 30K-node limit remains unchanged; this asset is evidence,
 * never another source of shapes, permissions or completion authority.
 * @param {string} root
 * @param {NonNullable<ReturnType<typeof import('./source-scene-observed-inventory').buildSceneInventoryEvidence>>} inventory */
function writeSceneInventoryArtifact(root,inventory){
 if(typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0')||!record(inventory)
  ||typeof inventory.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(inventory.sourceHash))throw new TypeError('Scene inventory artifact binding is invalid');
 const base=fs.lstatSync(root);if(!base.isDirectory()||base.isSymbolicLink())throw new TypeError('Scene inventory artifact root is invalid');
 const bytes=Buffer.from(JSON.stringify(inventory));if(bytes.length>1024*1024)throw new RangeError('Scene inventory artifact exceeds capacity');
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const assets=path.join(root,'assets');fs.mkdirSync(assets,{recursive:true});
 const folder=fs.lstatSync(assets);if(!folder.isDirectory()||folder.isSymbolicLink())throw new TypeError('Scene inventory artifact folder is invalid');
 const assetPath=`assets/source-scene-inventory-${sha256}.json`,file=path.join(root,...assetPath.split('/'));
 if(fs.existsSync(file)){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==bytes.length||!fs.readFileSync(file).equals(bytes))throw new TypeError('Scene inventory artifact identity is invalid');
 }else fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
 return {version:inventory.version,sourceHash:inventory.sourceHash,basis:inventory.basis,scope:inventory.scope,
  regionsCount:inventory.regions.length,unitsCount:inventory.units.length,assetPath,sha256};
}
module.exports={writeSceneInventoryArtifact};
