// @ts-check
'use strict';
/** Request bounds are separate from scene, source and visual acceptance.
 * Streaming framing can be much larger than the generated JSON itself.
 * Quality is opt-in; regional orchestration must also own its job deadline.
 * @param {unknown} [profile] */
function sceneExecutionPolicy(profile='standard') {
 if(profile!=='standard'&&profile!=='quality')throw new TypeError('Scene execution profile is invalid');
 return Object.freeze({
  timeoutMs:profile==='quality'?180000:60000,
  outputTokens:profile==='quality'?16000:6000,
  wireBytes:profile==='quality'?16*1024*1024:1024*1024,
  contentBytes:1024*1024,
  eventBytes:1024*1024
 });
}
module.exports={sceneExecutionPolicy};
