// @ts-check
'use strict';
const {record,list,snapshot,fingerprint}=require('./approved-frame-application-input');
/** A host may supply the retained representations of the SAME approved text
 * objects. Their complete fingerprints must already exist in the old review.
 * No new approval, replacement fingerprint, member or scope can enter here.
 * Snapshot once, before asynchronous work; public metadata never installs it.
 * @param {unknown} input @param {{members:{id:string,fingerprint:string}[]}|null} policy
 * @returns {ReadonlyMap<string,Record<string,unknown>>} */
function parseApprovedCardTextAncestors(input,policy){
 const result=new Map();if(input===undefined)return result;
 if(!policy)throw new TypeError('approved-card-text-ancestors-invalid');
 const entries=list(input,7),serialized=snapshot(entries);if(Buffer.byteLength(serialized,'utf8')>262144)throw new TypeError('approved-card-text-ancestors-invalid');
 for(const raw of /** @type {unknown[]} */(JSON.parse(serialized))){const item=record(raw),approved=policy.members.find(row=>row.id===item.id);
  if(!approved||result.has(approved.id)||typeof item.text!=='string'||item.text.length>512||fingerprint(item)!==approved.fingerprint)
   throw new TypeError('approved-card-text-ancestors-invalid');
  result.set(approved.id,item);
 }
 return result;
}
module.exports={parseApprovedCardTextAncestors};
