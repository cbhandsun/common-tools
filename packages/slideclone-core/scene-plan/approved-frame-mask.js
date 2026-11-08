'use strict';
const { required } = require("./approved-frame-bounds");
const { types } = require('node:util');
const crypto = require('node:crypto');
const { readApprovedFrameBytes } = require('./approved-frame-bytes');
const MAX_PIXELS = 40_000_000, MAX_WORK = 4_000_000, MAX_BAND = 100_000;
const APPROVAL = 'user-20261023-approx-frame';
/** @param {Uint8Array} bytes */
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw new TypeError('invalid-record');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError('invalid-record');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype')
    || Object.values(descriptors).some(item => !('value' in item))) throw new TypeError('invalid-record');
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {number} cap @returns {unknown[]} */
function array(value, cap) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError('invalid-array');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (value.length > cap || Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length
    || Object.values(descriptors).some(item => !('value' in item))
    || Object.keys(value).some((key, index) => key !== String(index))) throw new TypeError('invalid-array');
  return value;
}
/** @param {unknown} value @param {number} min @param {number} max */
function number(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new TypeError('invalid-number');
  return value;
}
/** @param {unknown} value */
function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('invalid-hash'); return value; }
/** @param {unknown} value */
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(value)) throw new TypeError('invalid-id'); return value; }
/** @param {unknown} value */
function image(value) {
  const input = record(value), width = number(input.width, 1, 32768), height = number(input.height, 1, 32768);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > MAX_PIXELS) throw new RangeError('image-boundary');
  const rgba = readApprovedFrameBytes(input.rgba);
  if (rgba.length !== width * height * 4) throw new RangeError('rgba-length');
  return { width, height, rgba };
}
/** @param {unknown} value */
function point(value) { const item = record(value); return { x: number(item.x, -32768, 65536), y: number(item.y, -32768, 65536) }; }
/** @param {{x:number,y:number}} p @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function segmentDistance(p, a, b) {
  const dx = b.x-a.x, dy = b.y-a.y, denominator = dx*dx+dy*dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/denominator)) : 0;
  return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
}
/** @param {unknown} value */
function protection(value) {
  const input = record(value), kind = input.kind;
  if (kind !== 'polyline' && kind !== 'polygon') throw new TypeError('invalid-protection-kind');
  const points = array(input.points, 2048).map(point);
  if (points.length < (kind === 'polygon' ? 3 : 2)) throw new TypeError('invalid-protection-points');
  const width = number(input.widthPx, 0, 64), margin = number(input.marginPx, 0, 2);
  const radius = width/2+margin;
  return { id: id(input.id), kind, points, radius,
    box: { x: Math.min(...points.map(p=>p.x))-radius, y: Math.min(...points.map(p=>p.y))-radius,
      r: Math.max(...points.map(p=>p.x))+radius, b: Math.max(...points.map(p=>p.y))+radius } };
}
/** @param {unknown} value @param {{width:number,height:number}} source @param {string} sourceHash */
function frame(value, source, sourceHash) {
  const input = record(value), inputSource = record(input.source), geometry = record(input.geometry), box = record(geometry.boxPx);
  if(input.status!=='fitted'||record(input.approximation).approvalId!==APPROVAL)throw new TypeError('unapproved-fit');
  if (hash(inputSource.sha256) !== sourceHash || inputSource.width !== source.width || inputSource.height !== source.height) throw new TypeError('source-binding');
  const x=number(box.x,0,source.width-1), y=number(box.y,0,source.height-1), w=number(box.w,4,source.width), h=number(box.h,4,source.height);
  if(x+w>=source.width||y+h>=source.height)throw new RangeError('frame-bounds');
  const radius=number(geometry.radiusPx,1,Math.min(24,w/2,h/2)), stroke=number(geometry.strokeWidthPx,.25,6);
  const hex=geometry.strokeColor;
  if(typeof hex!=='string'||!/^#[A-Fa-f0-9]{6}$/.test(hex))throw new TypeError('invalid-color');
  const color=[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
  if(Math.min(...color)<170||Math.max(...color)-Math.min(...color)>60)throw new TypeError('unsupported-frame-color');
  const frameId=id(input.id);if(!['region-n4','region-n6','region-n8'].includes(frameId))throw new TypeError('unapproved-region');
  return {id:frameId,x,y,w,h,radius,stroke,color,halfBand:stroke/2+2};
}
/** @param {{x:number,y:number,w:number,h:number,radius:number}} f @param {number} x @param {number} y */
function signedDistance(f,x,y){
  const qx=Math.abs(x-f.x-f.w/2)-(f.w/2-f.radius),qy=Math.abs(y-f.y-f.h/2)-(f.h/2-f.radius);
  return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-f.radius;
}
/** @param {{x:number,y:number,w:number,h:number,radius:number}} f @param {number} x @param {number} y */
function normal(f,x,y){
  const dx=x-f.x-f.w/2,dy=y-f.y-f.h/2,qx=Math.abs(dx)-(f.w/2-f.radius),qy=Math.abs(dy)-(f.h/2-f.radius);
  if(qx>0&&qy>0){const length=Math.hypot(qx,qy);return{x:Math.sign(dx)*qx/length,y:Math.sign(dy)*qy/length};}
  return qx>qy?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
}
/** @param {number[]} color @param {number[]} target @param {number[][]} backgrounds */
function paleFrameColor(color,target,backgrounds){
  if(Math.min(...color)<170||Math.max(...color)-Math.min(...color)>60||Math.max(...color.map((v,c)=>Math.abs(v-required(target, c))))>40)return false;
  // Reject background itself and use the closest local witness conservatively.
  const sorted=backgrounds.map(background=>({background,distance:Math.max(...color.map((v,c)=>Math.abs(v-required(background, c))))})).sort((a,b)=>a.distance-b.distance);
  if(!sorted.length||required(sorted, 0).distance<3)return false;
  const background=required(sorted, 0).background,axis=target.map((v,c)=>v-required(background, c)),length=axis.reduce((sum,v)=>sum+v*v,0);
  if(length<16)return false;
  const t=color.reduce((sum,v,c)=>sum+(v-required(background, c))*required(axis, c),0)/length;
  return t>=.08&&t<=2.5&&Math.max(...color.map((v,c)=>Math.abs(v-required(background, c)-t*required(axis, c))))<=8;
}
/** @param {unknown} input */
function buildApprovedFrameMask(input){
  const data=record(input);
  if(data.approvalId!==APPROVAL)throw new TypeError('approval-required');
  const source=image(data.source),sourceHash=hash(data.sourceSha256),fitHash=hash(data.fitSha256);
  const frames=array(data.frames,3).map(value=>frame(value,source,sourceHash)),protections=array(data.protections,512).map(protection);
  if(new Set(frames.map(f=>f.id)).size!==frames.length)throw new TypeError('duplicate-frame');
  const mask=new Uint8Array(source.width*source.height),conflictMask=new Uint8Array(mask.length);
  let work=0,bandCells=0;
  const charge=()=>{if(++work>MAX_WORK)throw new RangeError('work-boundary');};
  const reports=[];
  for(const f of frames){
    const report={id:f.id,halfBandPx:f.halfBand,bandCells:0,colorCandidates:0,protectedCells:0,selectedCells:0,protectionHits:Object.create(null),outsideWitnesses:0};
    const top=Math.max(0,Math.floor(f.y-f.halfBand)),bottom=Math.min(source.height-1,Math.ceil(f.y+f.h+f.halfBand));
    const left=Math.max(0,Math.floor(f.x-f.halfBand)),right=Math.min(source.width-1,Math.ceil(f.x+f.w+f.halfBand));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      charge();
      if(Math.abs(signedDistance(f,x,y))>f.halfBand)continue;
      if(++bandCells>MAX_BAND)throw new RangeError('band-boundary');report.bandCells++;
      const index=y*source.width+x,offset=index*4;
      if(required(source.rgba, offset+3)===0)continue;
      const color=[required(source.rgba, offset),required(source.rgba, offset+1),required(source.rgba, offset+2)],n=normal(f,x,y),backgrounds=[];
      for(const direction of [-1,1])for(const extra of [3,4]){
        const bx=Math.round(x+n.x*(f.halfBand+extra)*direction),by=Math.round(y+n.y*(f.halfBand+extra)*direction);
        if(bx<0||by<0||bx>=source.width||by>=source.height){report.outsideWitnesses++;continue;}
        const at=(by*source.width+bx)*4;if(required(source.rgba, at+3)>=240)backgrounds.push([required(source.rgba, at),required(source.rgba, at+1),required(source.rgba, at+2)]);
      }
      if(!paleFrameColor(color,f.color,backgrounds))continue;report.colorCandidates++;
      const hit=[];
      for(const p of protections){
        if(x<p.box.x||x>p.box.r||y<p.box.y||y>p.box.b)continue;
        let inside=false;
        for(let j=0;j<p.points.length-(p.kind==='polygon'?0:1);j++){
          charge();const a=required(p.points, j),b=required(p.points, (j+1)%p.points.length);
          if(segmentDistance({x,y},a,b)<=p.radius){inside=true;break;}
          if(p.kind==='polygon'&&((a.y>y)!==(b.y>y))&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
        }
        if(inside)hit.push(p.id);
      }
      if(hit.length){conflictMask[index]=1;report.protectedCells++;for(const key of hit)report.protectionHits[key]=(report.protectionHits[key]||0)+1;}
      else{mask[index]=1;report.selectedCells++;}
    }
    reports.push(report);
  }
  return {version:1,approvalId:APPROVAL,strictAccepted:false,sourceSha256:sourceHash,sourceRgbaSha256:digest(source.rgba),fitSha256:fitHash,width:source.width,height:source.height,
    mask,conflictMask,maskSha256:digest(mask),conflictMaskSha256:digest(conflictMask),work,bandCells,reports,
    policy:{halfBand:'strokeWidthPx/2+2',paleMin:170,maxChroma:60,maxPaletteDelta:40,minLocalContrast:3,maxProjectionResidual:8,protection:'actual-path-or-polygon-plus-bounded-margin',maxWork:MAX_WORK,maxBandCells:MAX_BAND},
    limitations:['approved-approximation-only','weak-or-protected-source-paint-may-remain','background-transparent-risk-within-selected-mask','old-perimeter-and-Office-noGhost-unverified']};
}
/** @param {unknown} input */
function applyRegisteredMask(input){
  const data=record(input),asset=image(data.asset),source=record(data.source),registration=record(data.registration);
  const width=number(source.width,1,32768),height=number(source.height,1,32768);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width*height>MAX_PIXELS)throw new RangeError('source-boundary');
  const mask=readApprovedFrameBytes(source.mask);
  if(mask.length!==width*height||digest(mask)!==hash(source.maskSha256))throw new TypeError('mask-binding');
  for(let i=0;i<width*height;i++)if(required(mask, i)!==0&&required(mask, i)!==1)throw new TypeError('invalid-mask-cell');
  const sourceImage=image({width,height,rgba:source.rgba});
  if(digest(sourceImage.rgba)!==hash(source.rgbaSha256))throw new TypeError('source-rgba-binding');
  const x=number(registration.x,-.02,width),y=number(registration.y,-.02,height),w=number(registration.w,1,32768),h=number(registration.h,1,32768);
  if(Math.max(Math.abs(x-Math.round(x)),Math.abs(y-Math.round(y)),Math.abs(w-asset.width),Math.abs(h-asset.height))>.02)throw new RangeError('registration-mismatch');
  const originX=Math.round(x),originY=Math.round(y);
  if(originX<0||originY<0||originX+asset.width>width||originY+asset.height>height)throw new RangeError('registration-bounds');
  const rgba=Buffer.alloc(asset.width*asset.height*4);for(let i=0;i<rgba.length;i++)rgba[i]=required(asset.rgba, i);
  let changed=0,maskCells=0,alreadyTransparent=0;const sourceConflicts=[];
  for(let yy=0;yy<asset.height;yy++)for(let xx=0;xx<asset.width;xx++){
    const cell=(originY+yy)*width+originX+xx,at=(yy*asset.width+xx)*4;
    if(!required(mask, cell))continue;maskCells++;
    if(required(rgba, at+3)===0){alreadyTransparent++;continue;}
    if([0,1,2,3].some(c=>required(rgba, at+c)!==required(sourceImage.rgba, cell*4+c))){sourceConflicts.push(cell);continue;}
    rgba[at]=255;rgba[at+1]=255;rgba[at+2]=255;rgba[at+3]=0;changed++;
  }
  return{width:asset.width,height:asset.height,rgba,changed,maskCells,alreadyTransparent,sourceConflicts,inputRgbaSha256:digest(asset.rgba),outputRgbaSha256:digest(rgba),maskSha256:source.maskSha256,
    preservedOutsideMask:true,preservedAlreadyTransparentRGBA:true};
}
module.exports={buildApprovedFrameMask,applyRegisteredMask,signedDistance,paleFrameColor,digest};
