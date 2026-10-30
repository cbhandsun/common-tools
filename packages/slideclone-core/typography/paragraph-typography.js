// @ts-check
"use strict";
const {parseTypographyDeck,record,identity}=require("./typography-contract");
const {paragraphSourceFrame,paragraphStyleScope}=require("./paragraph-source-frame");
/** @typedef {import('./typography-contract').Text} Text */
/** @typedef {import('./typography-contract').Box} Box */
/** @param {number[]} values */
function median(values) { const a=values.slice().sort((x,y)=>x-y); return a[Math.floor(a.length/2)]??12; }
/** @param {Box[]} boxes @returns {Box} */
function union(boxes) {const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};}
/** @param {Text} t */
function owner(t) { return typeof t.source?.nativeComponentGroupId==="string"&&t.source.nativeComponentGroupId!==t.id?t.source.nativeComponentGroupId
  :paragraphStyleScope(t); }
/** Style scope spans sibling nodes; paragraph scope must still respect each physical owner.
 * @param {Text} t */
function styleScope(t){return paragraphStyleScope(t);}
/** Resolve a family once per region, independently of size, weight or role bands.
 * Frequency wins; bounded character coverage breaks ties without letting one
 * unusually long OCR fragment dictate every sibling's font.
 * @param {Text[]} texts */
function regionalFamilies(texts){
 /** @type {Map<string,Map<string,{count:number,coverage:number}>>} */const votes=new Map();
 for(const t of texts){const scope=styleScope(t),families=votes.get(scope)??new Map(),vote=families.get(t.font.family)??{count:0,coverage:0};
  vote.count++;vote.coverage+=Math.min(64,[...t.text.trim()].length);families.set(t.font.family,vote);votes.set(scope,families);}
 return new Map([...votes].map(([scope,families])=>[scope,[...families].sort((a,b)=>b[1].count-a[1].count||b[1].coverage-a[1].coverage||a[0].localeCompare(b[0]))[0]?.[0]??"Microsoft YaHei"]));
}
/** @param {Text} t @param {number} base @param {Box} frame */
function role(t,base,frame) {
  const declared=t.source?.typographyRole??t.style?.typographyRole??(t.role==="body"?undefined:t.role);
  if (typeof declared==="string" && ["title","heading","sectionHeading","body","caption","label","list","footnote"].includes(declared)) return declared;
  if (/^\s*(?:[•●▪◦]\s*|[-*]\s+|\d{1,3}[.)、]\s+)/u.test(t.text)) return "list";
  if (t.source?.nativeComponentGroupId&&t.source.nativeComponentGroupId!==t.id) return "label";
  return frame.h>=base*1.5?"heading":frame.h<base*.72?"caption":"body";
}
/** Paragraph membership is conservative: no rotated, table, painted-outline, cross-node or ambiguous rows.
 * The source observations are retained separately; these proposals create no glyph/erase authority.
 * @param {unknown} input @param {{family?:string,merge?:boolean}} options */
function proposeParagraphTypography(input,options={}) {
  if (!record(options) || options.merge!==undefined&&typeof options.merge!=="boolean") throw new TypeError("Invalid paragraph options");
  const deck=parseTypographyDeck(input),family=options.family===undefined?null:identity(options.family);
  if (family && /[;{}<>"'\\]/u.test(family)) throw new TypeError("Invalid paragraph family");
  const report={paragraphs:0,mergedLines:0,sharedStyles:0,provisionalRoles:0,sourceTexts:0,outputTexts:0};
  for (const page of deck.pages) {
    const texts=page.textBoxes;report.sourceTexts+=texts.length;
    const frames=new Map(texts.map(t=>[t,paragraphSourceFrame(t,deck.slideSize)]));
    /** @param {Text} t */const frame=t=>{const result=frames.get(t);if(!result)throw new TypeError("Missing paragraph frame");return result.box;};
    const sharedFamilies=regionalFamilies(texts);
    const bases=new Map([...new Set(texts.map(styleScope))].map(id=>[id,median(texts.filter(t=>styleScope(t)===id).map(t=>frame(t).h))]));
    /** @type {Map<string,Text[]>} */ const styles=new Map();
    for (const t of texts) {
      const kind=role(t,bases.get(styleScope(t))??12,frame(t));
      const roleEvidence=t.source?.typographyRoleEvidence??(typeof t.source?.typographyRole==='string'?'declared':
        t.style?.typographyRoleEvidence??(typeof t.style?.typographyRole==='string'||typeof t.role==='string'&&t.role!=='body'?'declared':'geometry'));
      if (roleEvidence==='geometry') report.provisionalRoles++;
      const key=JSON.stringify([styleScope(t),kind,Boolean(t.style?.textOutlineWidthPt)]);
      const bands=[...styles.entries()].filter(([k])=>k.startsWith(key+":"));
      const band=bands.find(([,items])=>Math.abs(frame(t).h-median(items.map(a=>frame(a).h)))<=median(items.map(a=>frame(a).h))*.2);
      const id=band?.[0]??`${key}:${bands.length}`;const items=styles.get(id)??[];items.push(t);styles.set(id,items);
      t.style={...t.style,typographyRole:kind,typographyRoleEvidence:roleEvidence};
    }
    let styleIndex=0; /** @type {Map<string,Text>} */ const replacements=new Map(); const removed=new Set();
    for (const items of styles.values()) {
      const representative=items[0];if(!representative)throw new TypeError("Empty paragraph style group");
      const sizePt=Math.round(median(items.map(t=>t.font.sizePt))*4)/4;
      const sharedFamily=family??sharedFamilies.get(styleScope(representative))??"Microsoft YaHei";
      const weight=items.filter(t=>t.font.weight==="bold").length>items.length/2?"bold":"regular";
      const styleId=`paragraph-style-${++styleIndex}`;report.sharedStyles++;
      for (const t of items) {t.font={...t.font,family:sharedFamily,latinFamily:sharedFamily,eastAsianFamily:sharedFamily,complexScriptFamily:sharedFamily,sizePt,weight,lineHeightMultiple:1.15};t.style={...t.style,typographyStyleId:styleId};}
      const sorted=items.slice().sort((a,b)=>frame(a).y-frame(b).y||frame(a).x-frame(b).x);
      /** @type {Text[][]} */ const paragraphs=[];
      for (const t of sorted) {
        const group=paragraphs.at(-1),previous=group?.at(-1),h=previous?Math.min(frame(previous).h,frame(t).h):0;
        const compatible=options.merge!==false && previous && owner(t)===owner(previous) && frames.get(t)?.evidenced===frames.get(previous)?.evidenced && !(t.rotation||previous.rotation) && !t.style?.textOutlineWidthPt
          && !previous.style?.textOutlineWidthPt && !t.source?.tableCell && !previous.source?.tableCell
          && t.text.trim() && previous.text.trim() && !t.source?.typographyParagraph && !previous.source?.typographyParagraph
          && !t.text.includes("\n") && !previous.text.includes("\n") && group && group.length<32
          && Math.abs(frame(previous).x-frame(t).x)<=h*.3 && frame(t).y>=frame(previous).y+frame(previous).h-.1
          && frame(t).y-frame(previous).y-frame(previous).h<=h*.65;
        // A third column/row crossing the proposed paragraph makes membership ambiguous.
        const region=previous?union([frame(previous),frame(t)]):frame(t);
        const outputRegion=previous?union([previous.box,t.box]):t.box;
        /** @param {Box} a @param {Box} b */const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
        const crossed=compatible&&texts.some(other=>other!==t&&!group?.includes(other)
          &&(intersects(frame(other),region)||intersects(other.box,outputRegion)));
        if (compatible&&!crossed) group.push(t);else paragraphs.push([t]);
      }
      for (const members of paragraphs) {
        const first=members[0];if(!first)continue;
        /** @type {Text} */const result={...first,box:union(members.map(t=>t.box)),text:members.map(t=>t.text).join("\n"),wrap:true,
          style:{...first.style,wrap:true,fit:"none",textLayout:"paragraph",marginLeftPt:0,marginRightPt:0,marginTopPt:0,marginBottomPt:0},
          source:{...first.source,typographyParagraph:true,typographyMembers:members.length===1&&Array.isArray(first.source?.typographyMembers)
            ?first.source.typographyMembers:members.map(t=>({id:t.id,text:t.text,box:{...t.box},source:t.source??{}}))}};
        if(result.style)delete result.style.textWarp;
        /** @type {Record<string,unknown>[]} */const runs=[];
        for(const [i,t] of members.entries()) {
          if(i)runs.push({text:"\n"});
          const originals=Array.isArray(t.runs)?t.runs:Array.isArray(t.positionedRuns)?t.positionedRuns:null;
          if(originals)for(const r of originals){if(!record(r))throw new TypeError("Invalid paragraph run");
            const rf=record(r.font)?r.font:record(r.fontOverride)?r.fontOverride:{};
            runs.push({text:r.text,font:{...t.font,...rf,family:sharedFamily,latinFamily:sharedFamily,eastAsianFamily:sharedFamily,complexScriptFamily:sharedFamily,sizePt}});
          }else runs.push({text:t.text,font:t.font});
        }
        result.runs=runs;delete result.positionedRuns;
        replacements.set(first.id,result);for(const t of members.slice(1))removed.add(t.id);
        report.paragraphs++;report.mergedLines+=members.length-1;
      }
    }
    page.textBoxes=texts.filter(t=>!removed.has(t.id)).map(t=>replacements.get(t.id)??t);report.outputTexts+=page.textBoxes.length;
  }
  assertTypographyContent(input,deck);return {deck,report};
}
/** Exact source-fragment inventory and paragraph sequence; no OCR normalization or silent deletion.
 * @param {unknown} before @param {unknown} after */
function assertTypographyContent(before,after) {
  const a=parseTypographyDeck(before),b=parseTypographyDeck(after);
  if(a.pages.length!==b.pages.length)throw new TypeError("Typography page content changed");
  for(const [index,page] of a.pages.entries()){
    const result=b.pages[index];if(!result)throw new TypeError("Typography page content changed");
    /** @type {Map<string,unknown>} */const expected=new Map();const seen=new Set();
    for(const t of page.textBoxes){const members=Array.isArray(t.source?.typographyMembers)?t.source.typographyMembers:[{id:t.id,text:t.text}];
      if(members.map(m=>record(m)?m.text:null).join("\n")!==t.text)throw new TypeError("Typography baseline sequence changed");
      for(const m of members){if(!record(m)||typeof m.id!=="string"||expected.has(m.id))throw new TypeError("Typography baseline lineage ambiguous");expected.set(m.id,m.text);}}
    for(const t of result.textBoxes){
      const members=t.source?.typographyMembers;
      const entries=Array.isArray(members)?members:[{id:t.id,text:t.text}];
      if(entries.map(m=>record(m)?m.text:null).join("\n")!==t.text)throw new TypeError("Typography paragraph sequence changed");
      for(const m of entries){if(!record(m)||typeof m.id!=="string"||seen.has(m.id)||expected.get(m.id)!==m.text)
        throw new TypeError("Typography source content changed");seen.add(m.id);}
    }
    if(seen.size!==expected.size)throw new TypeError("Typography source content missing");
  }
  return true;
}
module.exports={proposeParagraphTypography,assertTypographyContent};
