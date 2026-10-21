"use strict";

// Geometry tests supply OCR directly. Give those declared lines source ink so
// production erasure can verify it; connector/arc evidence is still separate.
function paintOcrFixtureInk(image,lines) {
  for(const {box} of lines){
    const top=Math.ceil(box.y+box.h*.3),bottom=Math.floor(box.y+box.h*.7);
    for(let left=Math.ceil(box.x+6);left<box.x+box.w-6;left+=12){
      for(let y=top;y<bottom;y++)for(let x=left;x<left+3;x++){
        image.rgba.set([17,17,17,255],(y*image.width+x)*4);
      }
    }
  }
  return image;
}
module.exports={paintOcrFixtureInk};
