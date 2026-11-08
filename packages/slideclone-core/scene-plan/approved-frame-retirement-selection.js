// @ts-check
'use strict';
const {record,list,identifier,hash}=require('./approved-frame-application-input');
/** A trusted host may narrow the original deletion list when composing an
 * independently evolved native scene with existing reviewed asset patches.
 * No shape is considered already removed or source-equivalent by this choice.
 * The default still requires every original retirement's exact fingerprint.
 * Snapshot the selection before asynchronous work; serialized job options
 * cannot install the host application or add an unreviewed deletion target.
 * @param {unknown} original @param {unknown} selection
 * @returns {{id:string,fingerprint:string}[]} */
function selectApprovedFrameRetirements(original,selection){
 const approved=list(original,4).map(value=>{const row=record(value);
  if(Object.keys(row).length!==2)throw new TypeError('approved-frame-retirement-selection-invalid');
  return {id:identifier(row.id),fingerprint:hash(row.fingerprint)};
 });
 if(new Set(approved.map(row=>row.id)).size!==approved.length)throw new TypeError('approved-frame-retirement-selection-invalid');
 if(selection===undefined)return approved;
 const ids=list(selection,4).map(identifier),allowed=new Set(approved.map(row=>row.id));
 if(new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))throw new TypeError('approved-frame-retirement-selection-invalid');
 return approved.filter(row=>ids.includes(row.id));
}
module.exports={selectApprovedFrameRetirements};
