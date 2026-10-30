'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readZipEntries,readZipEntry,rewriteZipEntries}=require('../ooxml-core/pptx-zip');
const {inspectLibreOfficeGradientEvidence}=require('./libreoffice-gradient-evidence');
const {inspectLibreOfficeConnectorEvidence}=require('./libreoffice-connector-evidence');

// LibreOffice may reroute attached connectors while loading, including joints
// outside groups. A static render must use the geometry authored in the file.
// Render authored connector geometry in the disposable copy. Keep every
// native attachment in the delivered package. This workaround alone does not
// establish rendered route fidelity or PowerPoint editing behaviour.
/** @param {string} source @param {string} output */
function stageGroupedTextConnections(source,output){
 if(path.resolve(source)===path.resolve(output))throw new TypeError('Renderer source must remain unchanged');
 const stat=fs.statSync(source);if(!stat.isFile()||stat.size>64*1024*1024)throw new TypeError('Renderer package is oversized');
 const buffer=fs.readFileSync(source),entries=readZipEntries(buffer,{maxArchiveBytes:64*1024*1024,maxEntryBytes:4*1024*1024});
 /** @type {Record<string,string>} */ const replacements={};let connections=0,textConnections=0,shapeConnections=0;
 let gradientStrokes=0,unverifiedGradientSlides=0;
 let nativeConnectors=0,fiveLegPresets=0,unverifiedConnectorSlides=0;
 for(const entry of entries){
  if(!/^ppt\/slides\/slide[1-9]\d{0,4}\.xml$/u.test(entry.name))continue;
  const data=readZipEntry(buffer,entry.name,{maxEntryBytes:4*1024*1024});
  if(!data)throw new TypeError('Renderer slide entry is unavailable');
  const xml=data.toString('utf8');
  const gradientEvidence=inspectLibreOfficeGradientEvidence(xml);
  gradientStrokes+=gradientEvidence.gradientStrokes??0;
  unverifiedGradientSlides+=Number(gradientEvidence.status==='unverified-markup');
  const connectorEvidence=inspectLibreOfficeConnectorEvidence(xml);
  nativeConnectors+=connectorEvidence.nativeConnectors??0;fiveLegPresets+=connectorEvidence.fiveLegPresets??0;
  unverifiedConnectorSlides+=Number(connectorEvidence.status==='unverified-markup');
  const result=preserveAuthoredConnectorGeometry(xml);connections+=result.connections;textConnections+=result.textConnections;shapeConnections+=result.shapeConnections;
  if(result.connections)replacements[entry.name]=result.xml;
 }
 if(connections)rewriteZipEntries(source,output,replacements);else fs.copyFileSync(source,output);
 return {groupedTextBindingsRenderedAsGeometry:textConnections,groupedShapeBindingsRenderedAsGeometry:shapeConnections,
  authoredConnectorBindingsRenderedAsGeometry:connections,sourceBindingsUnchanged:true,
  nativeConnectorRoutingEvidence:{status:unverifiedConnectorSlides?'unverified-markup':nativeConnectors?'requires-office-verification':'not-needed',
   nativeConnectors,fiveLegPresets,unverifiedSlides:unverifiedConnectorSlides,
   geometryRewritten:false,renderedPathsVerified:false,officeEditingVerified:false},
  gradientStrokeEvidence:{status:unverifiedGradientSlides?'unverified-markup':gradientStrokes?'requires-office-verification':'not-needed',
   gradientStrokes,unverifiedSlides:unverifiedGradientSlides,paintRewritten:false,officeFidelityVerified:false}};
}

/** @param {string} xml */
function preserveGroupedTextGeometry(xml){
 const result=preserveConnectorGeometry(xml,'text');return {xml:result.xml,connections:result.connections};
}
/** Render compatibility never changes the deliverable or its attachment IDs.
 * A grouped custom-site body needs the same workaround as grouped text.
 * @param {string} xml */
function preserveGroupedShapeGeometry(xml){return preserveConnectorGeometry(xml,'grouped');}
/** Freeze only the disposable static rendering copy. The source package keeps
 * every original endpoint and remains independently editable in PowerPoint.
 * @param {string} xml */
function preserveAuthoredConnectorGeometry(xml){return preserveConnectorGeometry(xml,'authored');}
/** @param {string} xml @param {'text'|'grouped'|'authored'} mode */
function preserveConnectorGeometry(xml,mode){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>4*1024*1024||/<!DOCTYPE|<!ENTITY/iu.test(xml))throw new TypeError('Renderer slide XML is invalid');
 if(/<!/u.test(xml))return {xml,connections:0,textConnections:0,shapeConnections:0};
 if(!/xmlns:p="http:\/\/schemas.openxmlformats.org\/presentationml\/2006\/main"/u.test(xml)
  ||!/xmlns:a="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/main"/u.test(xml))return {xml,connections:0,textConnections:0,shapeConnections:0};
 /** @type {Set<string>} */ const grouped=new Set(),textIds=new Set(),ids=new Set();let groupDepth=0,count=0;
 /** @type {{start:number,depth:number,id:string|null}|null} */let shape=null;
 for(const m of xml.matchAll(/<\/?p:(?:grpSp|sp)\b[^>]*>|<p:cNvPr\b[^>]*>/gu)){
  if(++count>100000)throw new TypeError('Renderer drawing budget exceeded');
  const token=m[0];
  if(/^<p:grpSp(?:\s[^>]*)?>$/u.test(token)){if(++groupDepth>32)throw new TypeError('Renderer group depth exceeded');}
  else if(token==='</p:grpSp>'){if(--groupDepth<0)throw new TypeError('Renderer group nesting is invalid');}
  else if(/^<p:sp(?:\s[^>]*)?>$/u.test(token)){if(shape)throw new TypeError('Renderer shape nesting is invalid');shape={start:m.index,depth:groupDepth,id:null};}
  else if(token==='</p:sp>'){
   if(!shape)throw new TypeError('Renderer shape nesting is invalid');
   const body=xml.slice(shape.start,m.index);
   const text=body.includes('<p:txBody>');
   if(shape.depth>0&&shape.id&&body.includes('<a:custGeom')&&body.includes('<a:cxnLst>')){
    grouped.add(shape.id);if(text)textIds.add(shape.id);
   }
   shape=null;
  }else if(token.startsWith('<p:cNvPr')){
   const id=token.match(/\bid="([1-9]\d{0,9})"/u)?.[1];
   if(id){if(ids.has(id))throw new TypeError('Renderer drawing identity is ambiguous');ids.add(id);if(shape)shape.id=id;}
  }else throw new TypeError('Renderer drawing markup is unsupported');
 }
 if(shape||groupDepth!==0)throw new TypeError('Renderer drawing nesting is invalid');
 let connections=0,textConnections=0,shapeConnections=0;
 const result=xml.replace(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/gu,connector=>{
  if(!/<a:xfrm\b[^>]*>[\s\S]*?<a:off x="-?\d+" y="-?\d+"\s*\/>[\s\S]*?<a:ext cx="\d+" cy="\d+"\s*\/>/u.test(connector))return connector;
  return connector.replace(/<a:(?:stCxn|endCxn)\b[^>]*\/>/gu,tag=>{
   const id=tag.match(/\bid="([1-9]\d{0,9})"/u)?.[1];
   if(!id||mode!=='authored'&&(!grouped.has(id)||mode==='text'&&!textIds.has(id)))return tag;
   connections++;if(textIds.has(id))textConnections++;else if(grouped.has(id))shapeConnections++;return '';
  });
 });
 return {xml:result,connections,textConnections,shapeConnections};
}
module.exports={stageGroupedTextConnections,preserveGroupedTextGeometry,preserveGroupedShapeGeometry,preserveAuthoredConnectorGeometry};
