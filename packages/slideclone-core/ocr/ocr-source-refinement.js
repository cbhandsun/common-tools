// @ts-check
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {types}=require("node:util");
const {readPng,writePng,cropPng}=require("../png");
const {admitOcrResult}=require("./ocr-result-admission");
const {admitRecheckResult,ocrLineRevision,planOcrLineConsensus}=require("./ocr-line-consensus");
const {createOwnedSourceSnapshot}=require("../owned-source-snapshot");
const {geometryReviewTargets,geometryReviewSheet,applyGeometryConsensus}=require("./ocr-geometry-consensus");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value!==null&&typeof value==="object"&&!Array.isArray(value)&&!types.isProxy(value)
  &&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>"value" in d); }
/** @param {string} directory @param {string} realRoot @param {unknown} cause */
function cleanupDirectory(directory,realRoot,cause) {
  try {
    const resolved=fs.realpathSync(directory),relative=path.relative(realRoot,resolved);
    if(!relative||relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||fs.lstatSync(directory).isSymbolicLink())
      throw new Error("OCR refinement cleanup target is invalid");
    fs.rmSync(directory,{recursive:true,force:true});
  } catch(error) {
    throw new AggregateError(cause===undefined?[error]:[cause,error],"OCR refinement cleanup failed",{cause:error});
  }
}
/** @typedef {{inputFile:string,dimensions:{widthPx:number,heightPx:number},pageIndex:number,isCancellationRequested:()=>Promise<boolean>}} OcrRequest */
/** @param {{recognize:(input:OcrRequest)=>Promise<unknown>,provider:string}} dependencies */
function createSourceOcrRefiner({recognize,provider}) {
  if(typeof recognize!=="function"||typeof provider!=="string"||!/^[A-Za-z0-9_.-]{1,64}$/u.test(provider)) throw new TypeError("OCR refinement dependencies are invalid");
  /** @param {unknown} request */
  return async function refineSourceOcr(request) {
    if(!record(request)||!record(request.dimensions)) throw new TypeError("OCR refinement request is invalid");
    const {root,sourceFile,ocr}=request;
    if(typeof root!=="string"||!path.isAbsolute(root)||typeof sourceFile!=="string"||!path.isAbsolute(sourceFile)||typeof request.isCancellationRequested!=="function")
      throw new TypeError("OCR refinement request is invalid");
    let admitted=admitOcrResult(ocr,request.dimensions);
    const dimensions={widthPx:/** @type {number} */(request.dimensions.widthPx),heightPx:/** @type {number} */(request.dimensions.heightPx)};
    const isCancellationRequested=/** @type {()=>Promise<boolean>} */(request.isCancellationRequested);
    const realRoot=fs.realpathSync(root),info=fs.lstatSync(sourceFile),rootInfo=fs.lstatSync(root);
    const relative=path.relative(realRoot,fs.realpathSync(sourceFile));
    if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!info.isFile()||info.isSymbolicLink()||info.size>60*1024*1024||!relative||relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))
      throw new TypeError("OCR refinement source is invalid");
    const cancelled=async()=>{if(await isCancellationRequested()) throw new Error("editable job was cancelled");};
    const verifySource=createOwnedSourceSnapshot({root,sourceImages:[sourceFile]});
    await cancelled();
    const image=readPng(sourceFile,{maxFileBytes:60*1024*1024,maxPixels:40000000});
    if(image.width!==dimensions.widthPx||image.height!==dimensions.heightPx) throw new TypeError("OCR refinement dimensions changed");
    const sourceHash=crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");
    const evidence=[];let samples=0,calls=0;
    const directory=fs.mkdtempSync(path.join(root,"ocr-recheck-"));
    let failure;
    try {
      const geometryTargets=geometryReviewTargets(image,admitted);
      if(geometryTargets.length){
        const observations=[];
        for(const scale of [1,2]){
          await cancelled();
          const sheet=geometryReviewSheet(image,admitted.lines,geometryTargets,0,scale);
          samples+=sheet.image.width*sheet.image.height;
          if(samples>4000000)throw new RangeError("OCR refinement crop budget exceeded");
          const file=path.join(directory,`geometry-${scale}.png`);writePng(file,sheet.image);
          calls++;
          const result=admitRecheckResult(await recognize({inputFile:file,dimensions:{widthPx:sheet.image.width,heightPx:sheet.image.height},pageIndex:0,isCancellationRequested}),{widthPx:sheet.image.width,heightPx:sheet.image.height});
          await cancelled();verifySource();observations.push({placements:sheet.placements,ocr:result});
        }
        admitted=admitOcrResult(applyGeometryConsensus(admitted,observations,dimensions).ocr,dimensions);
      }
      // Geometry batches share the existing eight recognition calls and four
      // million crop pixels with textual consensus; neither allowance grows.
      const targets=admitted.lines.map((line,lineIndex)=>({line,lineIndex})).filter(({line})=>line.confidence>=0.5&&line.confidence<0.9&&line.text.length>=3&&line.text.length<=128&&!/[\r\n\t]/u.test(line.text))
        .sort((a,b)=>b.line.box.w*b.line.box.h-a.line.box.w*a.line.box.h).slice(0,Math.floor((8-calls)/2));
      for(const {line,lineIndex} of targets) {
        const observations=[];
        for(const padding of [16,24]) {
          await cancelled();
          const x=Math.max(0,Math.floor(line.box.x)-padding),y=Math.max(0,Math.floor(line.box.y)-padding);
          const box={x,y,w:Math.min(image.width,Math.ceil(line.box.x+line.box.w)+padding)-x,h:Math.min(image.height,Math.ceil(line.box.y+line.box.h)+padding)-y};
          if(admitted.lines.some((other,index)=>index!==lineIndex&&box.x<other.box.x+other.box.w&&box.x+box.w>other.box.x&&box.y<other.box.y+other.box.h&&box.y+box.h>other.box.y)) continue;
          samples+=box.w*box.h;if(samples>4000000) throw new RangeError("OCR refinement crop budget exceeded");
          const file=path.join(directory,`${lineIndex}-${padding}.png`);
          writePng(file,cropPng(image,box));
          calls++;
          const result=admitRecheckResult(await recognize({inputFile:file,dimensions:{widthPx:box.w,heightPx:box.h},pageIndex:0,isCancellationRequested}),{widthPx:box.w,heightPx:box.h});
          await cancelled();
          verifySource();
          observations.push({cropBox:box,cropHash:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),provider,ocr:result});
        }
        if(observations.length===2) evidence.push({lineIndex,revision:ocrLineRevision(line),sourceHash,observations});
      }
      verifySource();
      const result=planOcrLineConsensus({ocr:admitted,dimensions,sourceHash,evidence});
      return result.ocr;
    } catch(error) { failure=error;throw error; } finally {
      // This directory is uniquely created by this call, never a caller-selected cleanup target.
      cleanupDirectory(directory,realRoot,failure);
    }
  };
}
module.exports={createSourceOcrRefiner};
