"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {sceneModelRequestOptions}=require("../packages/remote-mcp-server/scene-model-request-options");
test("scene options preserve text reasoning and omit unsupported image reasoning",()=>{
 for(const task of ["structure","classify-ocr"]){
  for(const model of ["gpt-5.6","gemini-3.1-pro-low"])assert.deepEqual(sceneModelRequestOptions(model,task),{reasoning_effort:"low"});
  for(const model of ["gemini-3.1-flash-image","gpt-image-2.5-sunburst","gpt-image-2.5-flare","provider/gemini-3.1-flash-image"])assert.deepEqual(sceneModelRequestOptions(model,task),{});
 }
 assert.deepEqual(sceneModelRequestOptions("gpt-5.6",undefined),{});
});
test("scene options reject malformed boundaries without inspecting unknown objects",()=>{
 let touched=false;
 const hostile={get model(){touched=true;throw new Error("private");}};
 const proxy=new Proxy({}, {get(){touched=true;throw new Error("private");}});
 for(const model of [undefined,null,"","x".repeat(129),"gpt\nsecret","<script>",hostile,proxy])assert.throws(()=>sceneModelRequestOptions(model,"structure"),{name:"TypeError",message:"Scene model request options are invalid"});
 for(const task of [null,"", "other", hostile,proxy])assert.throws(()=>sceneModelRequestOptions("gpt-5.6",task),TypeError);
 assert.equal(touched,false);
 assert.deepEqual(sceneModelRequestOptions("x".repeat(128),"structure"),{reasoning_effort:"low"});
});
