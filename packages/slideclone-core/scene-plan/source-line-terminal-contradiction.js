// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
/** Reject only an unbound flat straight primitive whose complete terminal
 * cross-section contradicts its solid paint. A supported middle cannot supply
 * its missing end. Two independently observed, uniform lateral flanks must
 * agree first; uncertain/transparent evidence grants no contradiction.
 * This rejection filter grants no source ownership or erasure permission.
 * @param {{image:unknown,shape:unknown,sx:number,sy:number,remainingPixels:number}} input */
function inspectSourceLineTerminals(input){
 if(!record(input)||![input.sx,input.sy].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||!Number.isSafeInteger(input.remainingPixels)||input.remainingPixels<0||input.remainingPixels>4000000)
  throw new TypeError('Source line terminal controls are invalid');
 const image=sourceRaster(input.image),{shape,sx,sy}=input;
 const result={contradicted:false,scannedPixels:0,budgetExceeded:false};
 if(!record(shape)||shape.type!=='line'||shape.rotation||!record(shape.box)||!record(shape.style))return result;
 const b=shape.box,style=shape.style,source=shape.source;
 if(source!==undefined&&(!record(source)||source.fromAtomId||source.toAtomId||source.visualConnectorId||source.semanticNativeStructure===true))return result;
 if(['x','y','w','h'].some(k=>typeof b[k]!=='number'||!Number.isFinite(b[k]))
  ||!(b.w===0&&b.h!==0||b.h===0&&b.w!==0)
  ||typeof style.stroke!=='string'||!/^#[0-9a-f]{6}$/iu.test(style.stroke)
  ||typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0)return result;
 if(style.lineCap!==undefined&&style.lineCap!=='flat'||style.connectorType!==undefined&&style.connectorType!=='straight'
  ||style.startArrow!==undefined||style.endArrow!==undefined||style.connectorFrame!==undefined
  ||['rotationDeg','rotation','rotate','flipH','flipV','strokeGradient','gradient','shadow'].some(k=>style[k]!==undefined)
  ||style.opacity!==undefined&&style.opacity!==1)return result;
 const horizontal=b.h===0,axis=horizontal?sx:sy,cross=horizontal?sy:sx;
 const start=Number(horizontal?b.x:b.y)*axis,end=start+Number(horizontal?b.w:b.h)*axis;
 const lo=Math.min(start,end),hi=Math.max(start,end),center=Number(horizontal?b.y:b.x)*cross;
 const half=style.strokeWidthPt*Math.max(sx,sy)/2,low=Math.floor(center-half),high=Math.ceil(center+half);
 if(![lo,hi,center,half].every(Number.isFinite)||lo<0||hi>(horizontal?image.width:image.height)
  ||low<0||high>(horizontal?image.height:image.width))return result;
 // One source-pixel strip at each actual finite endpoint. No search inward
 // for a more convenient cross-section and no endpoint extension is allowed.
 const sections=[[lo,Math.min((lo+hi)/2,lo+1)],[Math.max((lo+hi)/2,hi-1),hi]];
 const first=Math.max(0,low-2),last=Math.min(horizontal?image.height:image.width,high+2);
 const cost=sections.reduce((sum,[a,z])=>sum+(Math.ceil(Number(z))-Math.floor(Number(a)))*(last-first),0);
 if(cost>input.remainingPixels)return {...result,budgetExceeded:true};
 const stroke=style.stroke;
 const color=[1,3,5].map(i=>Number.parseInt(stroke.slice(i,i+2),16));
 for(const [a,z] of sections){
  /** @type {number[][][]} */const flanks=[[],[]];
  /** @type {number[][]} */const core=[];
  let opaque=true;
  for(let along=Math.floor(Number(a));along<Math.ceil(Number(z));along++){
   if(along+.5<Number(a)||along+.5>Number(z))continue;
   for(let c=first;c<last;c++){
    const x=horizontal?along:c,y=horizontal?c:along,at=(y*image.width+x)*4;
    result.scannedPixels++;
    if((image.rgba[at+3]??0)<128){opaque=false;continue;}
    const rgb=[0,1,2].map(ch=>image.rgba[at+ch]??0);
    if(c<low)flanks[0]?.push(rgb);else if(c>=high)flanks[1]?.push(rgb);
    else if(Math.abs(c+.5-center)<=half)core.push(rgb);
   }
  }
  if(!opaque||!core.length||flanks.some(f=>!f.length))continue;
  const colors=flanks.flat();
  // Retain the existing 18-channel source-color bound. Both complete flanks
  // must agree, rather than accepting a convenient single-side backdrop.
  if([0,1,2].some(ch=>Math.max(...colors.map(p=>p[ch]??0))-Math.min(...colors.map(p=>p[ch]??0))>18))continue;
  const background=[0,1,2].map(ch=>colors.map(p=>p[ch]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
  if(core.every(p=>{
   const paintError=p.reduce((sum,v,ch)=>sum+Math.abs(v-(color[ch]??0)),0);
   const backgroundError=p.reduce((sum,v,ch)=>sum+Math.abs(v-(background[ch]??0)),0);
   return Math.max(...p.map((v,ch)=>Math.abs(v-(color[ch]??0))))>18&&paintError>backgroundError;
  }))result.contradicted=true;
 }
 return result;
}
module.exports={inspectSourceLineTerminals};
