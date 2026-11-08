// @ts-check
"use strict";
/** Native image-generation families accept image input, but do not accept the
 * text-reasoning budget used by the structural and OCR review tasks.
 * @param {unknown} model @param {unknown} task
 * @returns {{reasoning_effort?:"low"}} */
function sceneModelRequestOptions(model,task){
 if(typeof model!=="string"||! /^[A-Za-z0-9/_.:-]{1,128}$/u.test(model)
  ||task!==undefined&&task!=="structure"&&task!=="classify-ocr")
  throw new TypeError("Scene model request options are invalid");
 const imageGeneration=/(?:^|\/)gpt-image-/u.test(model)
  ||/(?:^|\/)gemini-[A-Za-z0-9_.-]*-image(?:$|[:.-])/u.test(model);
 return task!==undefined&&!imageGeneration?{reasoning_effort:"low"}:{};
}
module.exports={sceneModelRequestOptions};
