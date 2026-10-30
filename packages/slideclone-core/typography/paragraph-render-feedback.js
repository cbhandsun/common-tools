// @ts-check
"use strict";
const {parseTypographyDeck,jsonSnapshot,record,list,numeric,box}=require('./typography-contract');
/** A shared style is fitted to source line heights using actual target-renderer line measurements.
 * This proposes ordinary point sizes. It never changes source frames, content or graphics.
 * @param {unknown} input @param {unknown} rawEvidence */
function fitParagraphRenderFeedback(input,rawEvidence){
 const deck=parseTypographyDeck(input),evidence=jsonSnapshot(rawEvidence);
 if(!record(evidence))throw new TypeError('Invalid paragraph renderer feedback');
 const rows=list(evidence.measurements,10000),seen=new Set();
 /** @type {Map<string,{pageIndex:number,textIndex:number,size:number}[]>} */const groups=new Map();
 for(const raw of rows){if(!record(raw))throw new TypeError('Invalid paragraph renderer measurement');
  const pageIndex=numeric(raw.pageIndex,0,49),textIndex=numeric(raw.textIndex,0,9999),height=numeric(raw.height,.001,100000);
  if(!Number.isInteger(pageIndex)||!Number.isInteger(textIndex))throw new TypeError('Invalid paragraph renderer index');
  const key=`${pageIndex}:${textIndex}`;if(seen.has(key))throw new TypeError('Duplicate paragraph renderer measurement');seen.add(key);
  const text=deck.pages[pageIndex]?.textBoxes[textIndex];if(!text||text.style?.textLayout!=='paragraph'||typeof text.style.typographyStyleId!=='string')throw new TypeError('Unbound paragraph renderer measurement');
  const members=Array.isArray(text.source?.typographyMembers)?text.source.typographyMembers:[text];
  // Legacy output frames may already have been warped/reframed. They cannot substitute for source ink evidence.
  if(members.some(m=>!record(m)||!record(m.source)||m.source.evidenceBox===undefined))continue;
  const heights=members.map(m=>{if(!record(m))throw new TypeError('Invalid paragraph source member');
   if(!record(m.source))throw new TypeError('Invalid paragraph source evidence');return box(m.source.evidenceBox).h;}).sort((a,b)=>a-b);
  const target=heights[Math.floor(heights.length/2)];if(target===undefined)throw new TypeError('Empty paragraph source members');
  // Extreme differences indicate wrong attribution; leave them for a broader reconstruction.
  const ratio=target/height;if(ratio<.5||ratio>2)continue;
  const size=Math.round(text.font.sizePt*ratio*4)/4;if(size<1||size>400)continue;
  const groupKey=JSON.stringify([pageIndex,text.style.typographyStyleId]),group=groups.get(groupKey)??[];
  group.push({pageIndex,textIndex,size});groups.set(groupKey,group);
 }
 let changed=0;
 for(const group of groups.values()){
  const sizes=group.map(r=>r.size).sort((a,b)=>a-b),size=sizes[Math.floor(sizes.length/2)];if(size===undefined)continue;
  const representative=group[0];if(!representative)continue;
  const page=deck.pages[representative.pageIndex],style=page?.textBoxes[representative.textIndex]?.style?.typographyStyleId;if(!page)continue;
  for(const text of page.textBoxes){if(text.style?.typographyStyleId!==style)continue;
   if(text.font.sizePt!==size){changed++;text.font={...text.font,sizePt:size};
    if(Array.isArray(text.runs))text.runs=text.runs.map(r=>{if(!record(r))throw new TypeError('Invalid paragraph run');return {...r,font:{...text.font,...(record(r.font)?r.font:{}),sizePt:size}};});}
  }
 }
 return {deck,report:{changed}};
}
module.exports={fitParagraphRenderFeedback};
