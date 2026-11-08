// @ts-check
'use strict';
/** Parse output intent without loading reconstruction or quality auditors.
 * @param {unknown} value @returns {'source-fidelity'|'semantic-native'} */
function parseNativeOutputPolicy(value){
 if(value===undefined)return 'source-fidelity';
 if(value!=='source-fidelity'&&value!=='semantic-native')throw new TypeError('native-output-policy-invalid');
 return value;
}
module.exports={parseNativeOutputPolicy};
