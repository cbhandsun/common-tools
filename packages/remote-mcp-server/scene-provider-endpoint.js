// @ts-check
'use strict';

/** Parse an operator-supplied endpoint without coercing objects or retaining
 * raw URL parser errors, which can expose credentials in their input field.
 * @param {unknown} endpoint
 * @returns {URL} */
function parseSceneProviderEndpoint(endpoint){
 if(typeof endpoint!=='string'||endpoint.length===0||endpoint.length>4096||/[\r\n\0]/u.test(endpoint))
  throw new TypeError('Scene provider configuration is invalid');
 let url;
 try{url=new URL(endpoint);}catch{
  throw new TypeError('Scene provider configuration is invalid');
 }
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))
  ||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/chat/completions'))
  throw new TypeError('Scene provider configuration is invalid');
 return url;
}
module.exports={parseSceneProviderEndpoint};
