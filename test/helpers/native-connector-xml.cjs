'use strict';
const assert=require('node:assert/strict');
const {nativeElbowVertices}=require('../../packages/slideclone-core/routing/source-route-native-elbow');

// Reads deterministic XML from our writer for contract assertions. This is
// deliberately not an XML admission API for untrusted presentations.
function attributes(tag){
 assert.equal(typeof tag,'string');
 return Object.fromEntries([...tag.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/gu)].map(m=>[m[1],m[2]]));
}
function readNativeConnectorDrawings(xml){
 const names=new Map([...xml.matchAll(/<p:cNvPr\b[^>]*>/gu)].map(m=>{const a=attributes(m[0]);return [a.id,a.name];}));
 return [...xml.matchAll(/<p:cxnSp\b[^>]*>[\s\S]*?<\/p:cxnSp>/gu)].map(match=>{
  const row=match[0],tag=name=>{const value=row.match(new RegExp('<'+name+'\\b[^>]*>','u'));assert.ok(value,'Missing writer tag: '+name);return attributes(value[0]);};
  const name=tag('p:cNvPr').name,transform=tag('a:xfrm'),offset=tag('a:off'),extent=tag('a:ext'),preset=tag('a:prstGeom').prst,line=tag('a:ln');
  assert.match(preset,/^(?:line|bentConnector[3-5])$/u);
  const connectorFrame={x:Number(offset.x)/12700,y:Number(offset.y)/12700,w:Number(extent.cx)/12700,h:Number(extent.cy)/12700,
   rotationDeg:Number(transform.rot??0)/60000,flipH:transform.flipH==='1',flipV:transform.flipV==='1'};
  const style={fill:'none',stroke:'#123456',strokeWidthPt:Number(line.w)/12700,lineCap:line.cap==='rnd'?'round':line.cap,connectorFrame,
   ...(preset==='line'?{}:{connectorType:'elbow-'+preset.replace('bentConnector','')}),
   connectorAdjustments:[...row.matchAll(/<a:gd\b[^>]*>/gu)].map(m=>Number(attributes(m[0]).fmla.replace('val ','')))};
  const points=nativeElbowVertices(style),a=points[0],b=points.at(-1);
  assert.ok(a&&b);
  const start=tag('a:stCxn'),end=tag('a:endCxn');assert.ok(names.has(start.id)&&names.has(end.id));
  return {name,start:names.get(start.id),end:names.get(end.id),row,
   part:{id:name,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style}};
 });
}
module.exports={readNativeConnectorDrawings};
