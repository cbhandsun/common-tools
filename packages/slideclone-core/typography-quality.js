// @ts-check
"use strict";
const {parseTypographyDeck,record}=require("./typography-contract");
/** Model audit complements actual render comparison; it never certifies source completeness or UI roundtrip.
 * @param {unknown} input */
function auditTypographyLayout(input){
 const deck=parseTypographyDeck(input);let layout=0,style=0,paragraphs=0,estimatedLeadingWarnings=0,frameOverlapWarnings=0;
 /** @type {{page:number,id:string,code:string}[]} */const findings=[];
 for(const [index,page] of deck.pages.entries()){
  /** @type {Map<string,string>} */const styles=new Map();
  for(const t of page.textBoxes){
   if(t.style?.textLayout!=="paragraph"){
    if(Array.isArray(t.positionedRuns)&&t.positionedRuns.length>1||t.style?.textWarp==="textPlain"){
      layout++;findings.push({page:index,id:t.id,code:"fragmented-or-deformed-text"});
    }continue;
   }paragraphs++;
   const signature=JSON.stringify([t.font.family,t.font.latinFamily??t.font.family,t.font.eastAsianFamily??t.font.family,t.font.complexScriptFamily??t.font.family,t.font.sizePt,t.font.weight,t.font.lineHeightMultiple]);
   const id=t.style.typographyStyleId;
   if(typeof id!=="string"||styles.has(id)&&styles.get(id)!==signature){style++;findings.push({page:index,id:t.id,code:"inconsistent-style"});}
   if(typeof id==="string")styles.set(id,signature);
   if(t.positionedRuns!==undefined||t.style.textWarp!==undefined||t.wrap!==true){layout++;findings.push({page:index,id:t.id,code:"deformed-paragraph"});}
   const minimumLines=t.text.split("\n").length;
   // Nominal line boxes are not glyph ink bounds. This is a proposal warning;
   // the target-renderer text/containment audit decides actual clipping.
   if(minimumLines*t.font.sizePt*Number(t.font.lineHeightMultiple??1.15)>t.box.h*1.25){estimatedLeadingWarnings++;findings.push({page:index,id:t.id,code:"estimated-leading-exceeds-frame"});}
   for(const other of page.textBoxes){if(other===t)continue;
    const overlap=Math.max(0,Math.min(t.box.x+t.box.w,other.box.x+other.box.w)-Math.max(t.box.x,other.box.x))
     *Math.max(0,Math.min(t.box.y+t.box.h,other.box.y+other.box.h)-Math.max(t.box.y,other.box.y));
    if(overlap>Math.min(t.box.w*t.box.h,other.box.w*other.box.h)*.1){frameOverlapWarnings++;findings.push({page:index,id:t.id,code:"text-frame-overlap-warning"});break;}
   }
   if(t.source?.typographyMembers!==undefined&&(!Array.isArray(t.source.typographyMembers)||t.source.typographyMembers.some(m=>!record(m))))
    throw new TypeError("Invalid paragraph lineage");
  }
 }
 return {passed:layout===0&&style===0,paragraphs,layout,style,estimatedLeadingWarnings,frameOverlapWarnings,findings};
}
module.exports={auditTypographyLayout};
