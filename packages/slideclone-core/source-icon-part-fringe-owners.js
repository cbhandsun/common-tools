// @ts-check
'use strict';
/** Native contour rasterization can miss an ORIGINAL isolated edge cell. The
 * existing 2px source contact bound may nominate its nearest real member only
 * when unique. Read the immutable original ownership map: no propagation,
 * no source-cell creation and no ownership of transparent holes or padding.
 * The caller still clips each member to its unchanged native envelope.
 * @param {{owners:Int8Array,rgba:Uint8Array,width:number,height:number,work:{checks:number}}} input */
function sourceIconPartFringeOwners({owners,rgba,width,height,work}){
 const result=owners.slice();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(++work.checks>4000000)return null;const n=y*width+x;
  if((owners[n]??-1)>=0||(rgba[n*4+3]??0)<64)continue;
  let nearest=Infinity,owner=-1,ambiguous=false;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   if(++work.checks>4000000)return null;const distance=dx*dx+dy*dy;
   if(distance>4||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
   const at=(y+dy)*width+x+dx,id=owners[at]??-1;
   if(id<0||(rgba[at*4+3]??0)<64||distance>nearest)continue;
   if(distance<nearest){nearest=distance;owner=id;ambiguous=false;}else if(id!==owner)ambiguous=true;
  }
  if(owner>=0&&!ambiguous)result[n]=owner;
 }
 return result;
}
module.exports={sourceIconPartFringeOwners};
