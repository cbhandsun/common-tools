// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** Input hints are untrusted OCR data, never source text/paint authority.
 * Keep original indices and confidence policy. Independent image reviews still
 * decide classification; the existing private OCR identity decides binding.
 * @param {unknown} value @returns {Map<number,string>} */
function boundedSceneOcrHints(value){
 if(!list(value)||value.length>512||value.some(line=>!record(line)||typeof line.text!=='string'||line.text.length>16000
  ||typeof line.confidence!=='number'||!Number.isFinite(line.confidence)||line.confidence<0||line.confidence>1))
  throw new TypeError('Scene OCR hint input is invalid');
 const hints=new Map();let remaining=4096;
 for(const [index,line]of value.entries()){
  if(!record(line)||typeof line.text!=='string'||typeof line.confidence!=='number')throw new TypeError('Scene OCR hint input is invalid');
  if(line.confidence<.9||!remaining)continue;
  const parts=[];
  for(const point of line.text){
   if(parts.length===Math.min(128,remaining))break;
   const code=point.codePointAt(0)??0;
   parts.push(code<32||code===127?' ':point);
  }
  const text=parts.join('').trim();if(!text)continue;
  remaining-=parts.length;hints.set(index,text);
 }
 return hints;
}
module.exports={boundedSceneOcrHints};
