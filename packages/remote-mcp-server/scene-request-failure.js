// @ts-check
'use strict';
const {types}=require('node:util');
const CODES=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ABORT_ERR']);
/** Read only own data properties; transport exceptions are untrusted.
 * @param {unknown} value @param {string} key @returns {unknown} */
function data(value,key){
 if(value===null||typeof value!=='object'||types.isProxy(value))return undefined;
 const property=Object.getOwnPropertyDescriptor(value,key);
 return property&&'value' in property?property.value:undefined;
}
/** Never retain exception messages, headers, URLs or arbitrary provider codes.
 * @param {unknown} error @returns {string} */
function sceneTransportFailureCode(error){
 const direct=data(error,'code'),nested=data(data(error,'cause'),'code');
 for(const code of [direct,nested])if(typeof code==='string'&&CODES.has(code))return code;
 return 'UNKNOWN';
}
module.exports={sceneTransportFailureCode};
