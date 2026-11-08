// @ts-check
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {types}=require('node:util');
const MAX_NODES=100000,MAX_DEPTH=32,MAX_STRING=32000,MAX_CHARACTERS=2000000,MAX_FILE_BYTES=12*1024*1024;
/** Bounded tagged canonical data, including undefined and property presence.
 * Accessors, proxies, sparse arrays, symbols, cycles and hidden properties
 * fail before iteration; hashing never executes provider code.
 * @param {unknown} input */
function inventoryRevisionSnapshot(input){
 let remaining=MAX_NODES,characters=0;const active=new Set();
 /** @param {string} value */
 const reserveText=value=>{
  characters+=value.length;
  if(value.length>MAX_STRING||characters>MAX_CHARACTERS)throw new TypeError('Scene inventory revision snapshot exceeds capacity');
 };
 /** @param {unknown} value @param {number} depth @returns {unknown} */
 const visit=(value,depth)=>{
  if(--remaining<0||depth>MAX_DEPTH)throw new TypeError('Scene inventory revision snapshot exceeds capacity');
  if(value===undefined)return ['undefined'];
  if(value===null)return ['null'];
  if(typeof value==='boolean')return ['boolean',value];
  if(typeof value==='string'){
   reserveText(value);return ['string',value];
  }
  if(typeof value==='number'&&Number.isFinite(value))return ['number',Object.is(value,-0)?'-0':value];
  if(value===null||typeof value!=='object'||types.isProxy(value)||active.has(value))
   throw new TypeError('Scene inventory revision snapshot is invalid');
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(array?prototype!==Array.prototype:prototype!==null&&prototype!==Object.prototype)
   throw new TypeError('Scene inventory revision snapshot is invalid');
  // Array length must be bounded BEFORE enumerating keys or element descriptors.
  // Only a real array owns the special nonenumerable length property.
  const lengthDescriptor=array?Object.getOwnPropertyDescriptor(value,'length'):undefined;
  const length=lengthDescriptor&&'value' in lengthDescriptor?/** @type {unknown} */(lengthDescriptor.value):undefined;
  if(array&&(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>remaining))
   throw new TypeError('Scene inventory revision snapshot exceeds capacity');
  const keys=Reflect.ownKeys(value);
  if(array&&keys.length!==/** @type {number} */(length)+1)throw new TypeError('Scene inventory revision snapshot is invalid');
  if(!array&&keys.length>remaining)throw new TypeError('Scene inventory revision snapshot exceeds capacity');
  /** @type {Map<string,unknown>} */const children=new Map();
  for(const key of keys){
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   if(typeof key!=='string'||!descriptor||!('value' in descriptor)||(!descriptor.enumerable&&!(array&&key==='length')))
    throw new TypeError('Scene inventory revision snapshot is invalid');
   if(array&&key==='length')continue;
   if(!array)reserveText(key);
   children.set(key,/** @type {unknown} */(descriptor.value));
  }
  if(array&&(children.size!==length||keys.length!==/** @type {number} */(length)+1))throw new TypeError('Scene inventory revision snapshot is invalid');
  active.add(value);
  /** @type {unknown[]} */const entries=[];
  if(array)for(let index=0;index</** @type {number} */(length);index++){
   const key=String(index);if(!children.has(key))throw new TypeError('Scene inventory revision snapshot is invalid');
   entries.push(visit(children.get(key),depth+1));
  }
  else for(const key of [...children.keys()].sort())entries.push([key,visit(children.get(key),depth+1)]);
  const result=[array?'array':'record',entries];
  active.delete(value);return result;
 };
 const serialized=JSON.stringify(visit(input,0));
 if(serialized.length>4000000)throw new TypeError('Scene inventory revision snapshot exceeds capacity');
 return crypto.createHash('sha256').update(serialized).digest('hex');
}
/** @template T @param {T} value @returns {T} */
function immutableInventoryRevisionCopy(value){
 inventoryRevisionSnapshot(value);const result=structuredClone(value);
 /** @param {unknown} row */const freeze=row=>{
  if(row!==null&&typeof row==='object'){for(const child of Object.values(row))freeze(child);Object.freeze(row);}
 };
 freeze(result);return result;
}
/** Read and hash/decode the same bounded ordinary file bytes. No underlying
 * paths, provider content or OS errors leave the review boundary.
 * @param {unknown} file @param {unknown} [maximum] */
function inventoryRevisionFileBytes(file,maximum=12*1024*1024){
 if(typeof file!=='string'||!file.length||file.length>32767||file.includes('\0')
  ||typeof maximum!=='number'||!Number.isSafeInteger(maximum)||maximum<1||maximum>MAX_FILE_BYTES)
  throw new TypeError('Scene inventory revision file is unavailable');
 /** @type {number|undefined} */let fd;
 /** @type {Buffer|undefined} */let result;
 try{
  const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||!Number.isSafeInteger(before.size)||before.size<1||before.size>maximum)throw Error();
  fd=fs.openSync(file,'r');const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.size!==before.size||opened.ino!==before.ino||opened.dev!==before.dev)throw Error();
  const bytes=Buffer.alloc(opened.size);let at=0;
  while(at<bytes.length){const count=fs.readSync(fd,bytes,at,bytes.length-at,at);if(!count)throw Error();at+=count;}
  const after=fs.fstatSync(fd);if(after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw Error();
  const retained=fs.lstatSync(file);
  if(!retained.isFile()||retained.isSymbolicLink()||retained.ino!==opened.ino||retained.dev!==opened.dev
   ||retained.size!==after.size||retained.mtimeMs!==after.mtimeMs||retained.ctimeMs!==after.ctimeMs)throw Error();
  result=bytes;
 }catch{result=undefined;}
 finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{result=undefined;}}
 if(result===undefined)throw new TypeError('Scene inventory revision file is unavailable');
 return result;
}
module.exports={inventoryRevisionSnapshot,immutableInventoryRevisionCopy,inventoryRevisionFileBytes};
