// @ts-check
"use strict";
const {parseLocalTargets,localResponseFormat,decodeLocalResponse,sceneRegionalOutputPrompt,sceneRelationOutputPrompt}=require("../slideclone-core/scene-plan/source-scene-local-response");
const {sceneModelRequestOptions}=require("./scene-model-request-options");
const {sceneExecutionPolicy}=require('./scene-execution-policy');
const {readSceneResponseContent,sceneResponseFailureCode,awaitSceneResponse}=require('./scene-response-content');
const {sceneTransportFailureCode}=require('./scene-request-failure');
const {readSceneExecutionControls}=require('./scene-execution-controls');
const {parseSceneProviderEndpoint}=require('./scene-provider-endpoint');
/** @typedef {{bytes:Buffer,label:string}} SceneImage */
/** JSON mode constrains syntax only. Enable it for a verified compatible
 * transport; scene admission and all source/quality gates remain mandatory.
 * @param {{endpoint:string,model:string,token:string,fetchImpl?:typeof fetch,enforceLocalSchema?:boolean,enforceJsonOutput?:boolean,streaming?:boolean,executionProfile?:'standard'|'quality',globalTimeoutMs?:60000|90000|120000}} options */
function createSceneVisionClient({ endpoint, model, token, fetchImpl = fetch, enforceLocalSchema = false, enforceJsonOutput = false, streaming = false, executionProfile='standard',globalTimeoutMs }) {
  const policy=sceneExecutionPolicy(executionProfile);
  if(globalTimeoutMs!==undefined&&((globalTimeoutMs!==60000&&globalTimeoutMs!==90000&&globalTimeoutMs!==120000)||executionProfile!=='standard'))throw new TypeError('Scene global timeout configuration is invalid');
  const url = parseSceneProviderEndpoint(endpoint);
  if (typeof model !== "string" || !/^[A-Za-z0-9/_.:-]{1,128}$/u.test(model)
    || typeof token !== "string" || !token || token.length > 16384 || /[\r\n\0]/u.test(token)
    || typeof enforceLocalSchema!=="boolean"||typeof enforceJsonOutput!=='boolean'||typeof streaming!=='boolean') throw new TypeError("Scene provider configuration is invalid");
  /** @param {{prompt:string,images:SceneImage[],isCancellationRequested:()=>Promise<boolean>,task?:"structure"|"classify-ocr",localTargets?:import("../slideclone-core/scene-plan/source-scene-local-response").LocalTargets}} request */
  return async function recognizeScene({ prompt, images, isCancellationRequested, task, localTargets }) {
    if (typeof prompt !== "string" || prompt.length > 200000 || !Array.isArray(images) || images.length < 1 || images.length > 32
      || images.some(image => !Buffer.isBuffer(image.bytes) || image.bytes.length < 8 || typeof image.label !== "string" || image.label.length > 1024)
      || images.reduce((sum, image) => sum + image.bytes.length, 0) > 12 * 1024 * 1024
      || (task!==undefined&&task!=="structure"&&task!=="classify-ocr")) throw new TypeError("Scene provider request is invalid");
    const targets=localTargets===undefined?undefined:parseLocalTargets(localTargets);
    if(targets&&task!=="classify-ocr")throw new TypeError("Scene local response task is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const controller = new AbortController();
    const timeoutMs=task==='structure'&&globalTimeoutMs!==undefined?globalTimeoutMs:policy.timeoutMs;
    const started=performance.now();
    let failureCode = "SCENE_TRANSPORT_FAILED";
    let failurePhase = 'request-build';
    /** @type {number|undefined} */
    let httpStatus;
    const timeout = setTimeout(() => { failureCode = "SCENE_PROVIDER_TIMEOUT"; controller.abort(); }, timeoutMs);
    const cancellation = setInterval(() => { Promise.resolve().then(isCancellationRequested).then(cancelled => {
      if (cancelled) { failureCode = "SCENE_CANCELLED"; controller.abort(); }
    }, () => { failureCode = "SCENE_CANCELLATION_FAILED"; controller.abort(); }); }, 250);
    try {
      const outputPrompt=targets?`${prompt}\nOUTPUT TRANSPORT: use the required keyed JSON shape. reviewsByIndex maps every requested existing index string to its classification; recoveredByIndex maps every missing index string to {text,confidence,box_2d,color}. No index fields inside entries. For unreadable units use text:null,confidence:0,box_2d:null,color:null. reviewsByIndex MUST have EXACT keys ${JSON.stringify(targets.reviews.map(String))}; recoveredByIndex MUST have EXACT keys ${JSON.stringify(targets.missing.map(String))}. No omissions or extra entries.`:prompt;
      const structuralPrompt=targets?.structures?`\nstructuresByIndex MUST have EXACT keys ${JSON.stringify(targets.structures.map(String))}. Each value is {kind,confidence,regionId,box_2d,nativeGeometry}, with kind container/icon/unknown. For unknown geometry and every non-container use nativeGeometry:null. For an observed container, preserve the source geometry proposal specified in the structural instructions; it remains subject to complete source measurement. Use unknown,0,null,null,null for insufficient evidence. No omissions or extra entries.`:'';
      const inventoryPrompt=targets?.inventories?`\ninventoriesByIndex MUST have EXACT keys ${JSON.stringify(targets.inventories.map(String))}. Each value is {kind,confidence,regionId,box_2d}, with kind icon/unknown, describing one COMPLETE pictorial child inside its specified node. Use unknown,0,null,null for insufficient evidence. Never return the parent node or text as an icon. No omissions or extra entries.`:'';
      const relationPrompt=targets?.relations?sceneRelationOutputPrompt(targets):'';
      const regionalPrompt=targets?sceneRegionalOutputPrompt(targets):'';
      const jsonObjectMode=!(targets&&enforceLocalSchema)&&task!==undefined&&enforceJsonOutput;
      const requestedPrompt=outputPrompt+structuralPrompt+inventoryPrompt+relationPrompt+regionalPrompt;
      // OpenAI-compatible json_object mode rejects input that never names JSON;
      // gateways surface that as an opaque 5xx. Add a fixed trusted sentence only.
      const promptText=jsonObjectMode&&!/json/iu.test(requestedPrompt)?`${requestedPrompt}\nOUTPUT TRANSPORT: respond with exactly one JSON object.`:requestedPrompt;
      const content = [{ type: "text", text: promptText }, ...images.flatMap(image => [
        { type: "text", text: image.label }, { type: "image_url", image_url: { url: `data:image/png;base64,${image.bytes.toString("base64")}` } }
      ])];
      const init = { method: "POST", redirect: /** @type {RequestRedirect} */ ("error"), signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model, stream: streaming, max_tokens: policy.outputTokens,
          ...sceneModelRequestOptions(model,task),...(targets&&enforceLocalSchema?{response_format:localResponseFormat(targets)}:
            jsonObjectMode?{response_format:{type:'json_object'}}:{}),messages: [{ role: "user", content }] }) };
      failurePhase='fetch';
      const response = await awaitSceneResponse(fetchImpl(url, init),controller.signal);
      failurePhase='response';
      if (!response.ok || !response.body) {
        failureCode = "SCENE_HTTP_FAILED";
        // Only the numeric status is retained; provider bodies/headers stay discarded.
        if(Number.isInteger(response.status)&&response.status>=100&&response.status<=599)httpStatus=response.status;
        throw new Error("Scene provider request failed");
      }
      let text;
      try{text=await readSceneResponseContent(response,streaming,controller.signal,executionProfile);}catch(error){
        const code=sceneResponseFailureCode(error);if(code)failureCode=code;
        controller.abort();throw error;
      }
      if(performance.now()-started>=timeoutMs){failureCode='SCENE_PROVIDER_TIMEOUT';controller.abort();throw new Error('Scene deadline expired');}
      if (await isCancellationRequested()) { failureCode = "SCENE_CANCELLED"; throw new Error("editable job was cancelled"); }
      failureCode = "SCENE_INVALID_OUTPUT_JSON";
      const parsed=/** @type {unknown} */ (JSON.parse(text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "")));
      failureCode = "SCENE_LOCAL_TARGET_BINDING_FAILED";
      return targets?decodeLocalResponse(parsed,targets):parsed;
    } catch (error) {
      // Provider bodies and exceptions may echo image contents or credentials.
      throw Object.assign(new Error("Scene provider recognition failed"), { code: failureCode,phase:failurePhase,
        ...(failurePhase==='fetch'?{transportCode:sceneTransportFailureCode(error)}:{}),...(httpStatus!==undefined?{httpStatus}:{}) });
    } finally { clearTimeout(timeout); clearInterval(cancellation);controller.abort(); }
  };
}
/** @param {NodeJS.ProcessEnv} environment */
function sceneVisionFromEnvironment(environment) {
  const execution=readSceneExecutionControls(environment);
  /** @param {string} key @returns {string|undefined} */
  const own=key=>{
    const property=Object.getOwnPropertyDescriptor(environment,key);
    if(property&&!('value'in property))throw new TypeError('Scene provider configuration is invalid');
    const value=/** @type {unknown} */(property?.value);
    if(value===undefined)return undefined;
    if(typeof value!=='string')throw new TypeError('Scene provider configuration is invalid');
    return value;
  };
  const endpoint = own('COMMON_TOOLS_IMAGE_SCENE_ENDPOINT'), model = own('COMMON_TOOLS_IMAGE_SCENE_MODEL'), token = own('COMMON_TOOLS_IMAGE_SCENE_TOKEN');
  const jsonOutput=own('COMMON_TOOLS_IMAGE_SCENE_JSON_OUTPUT');
  if (endpoint === undefined && model === undefined && token === undefined&&jsonOutput===undefined) {
    if(execution.reviewBatches!==1||execution.globalTimeoutMs!==60000)throw new TypeError('Scene provider configuration is incomplete');
    return undefined;
  }
  if (!endpoint || !model || !token) throw new TypeError("Scene provider configuration is incomplete");
  if(endpoint.length>4096)throw new TypeError('Scene provider configuration is invalid');
  if(jsonOutput!==undefined&&jsonOutput!=='true'&&jsonOutput!=='false')throw new TypeError('Scene provider configuration is invalid');
  return createSceneVisionClient({ endpoint, model, token,enforceJsonOutput:jsonOutput==='true',globalTimeoutMs:execution.globalTimeoutMs });
}
module.exports = { createSceneVisionClient, sceneVisionFromEnvironment };
