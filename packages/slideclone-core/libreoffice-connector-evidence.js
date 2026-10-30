// @ts-check
'use strict';
const {inspectLibreOfficeGradientEvidence}=require('./libreoffice-gradient-evidence');

/** XML establishes authored connector inventory, never actual rendered routing.
 * LibreOffice can simplify a valid five-leg preset even without endpoint tags.
 * Keep this diagnostic separate from pixel quality and Office editing proof.
 * @param {unknown} input
 * @returns {{status:'not-needed'|'requires-office-verification'|'unverified-markup',nativeConnectors:number|null,fiveLegPresets:number|null}} */
function inspectLibreOfficeConnectorEvidence(input){
 // Reuse the bounded lexical namespace/nesting validation. It supports the
 // local namespace declarations emitted by the actual native writer.
 const validated=inspectLibreOfficeGradientEvidence(input);
 if(validated.status==='unverified-markup')return {status:'unverified-markup',nativeConnectors:null,fiveLegPresets:null};
 const xml=/** @type {string} */(input).replace(/<!--[\s\S]*?-->/gu,'');
 let nativeConnectors=0,fiveLegPresets=0,inConnector=false;
 for(const match of xml.matchAll(/<(?:[^<>"']|"[^"<>]*"|'[^'<>]*')+>/gu)){
  const tag=match[0],name=tag.match(/^<\/?([A-Za-z_][\w.:-]*)(?=\s|\/?>)/u)?.[1];
  if(name==='p:cxnSp'){
   if(tag.startsWith('</'))inConnector=false;
   else{
    if(inConnector)return {status:'unverified-markup',nativeConnectors:null,fiveLegPresets:null};
    nativeConnectors++;inConnector=!/\/\s*>$/u.test(tag);
   }
  }else if(name==='a:prstGeom'&&inConnector&&!tag.startsWith('</')){
   // Consume each whole attribute so an unrelated quoted value cannot pose
   // as the preset attribute. The lexical validator already rejects duplicates.
   for(const attribute of tag.matchAll(/\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])(.*?)\2/gu))
    if(attribute[1]==='prst')fiveLegPresets+=Number(/^(?:bent|curved)Connector5$/u.test(attribute[3]??''));
  }
 }
 return {status:nativeConnectors?'requires-office-verification':'not-needed',nativeConnectors,fiveLegPresets};
}

module.exports={inspectLibreOfficeConnectorEvidence};
