// @ts-check
'use strict';

/** Inspect authored paint only. A valid DrawingML gradient does not establish
 * that LibreOffice rendered it faithfully. Never rewrite paint or grant a
 * visual-quality exemption from this diagnostic.
 * @param {unknown} input
 * @returns {{status:'not-needed'|'requires-office-verification'|'unverified-markup',gradientStrokes:number|null}} */
function inspectLibreOfficeGradientEvidence(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>4*1024*1024||/<!DOCTYPE|<!ENTITY/iu.test(input))
  throw new TypeError('Renderer gradient evidence XML is invalid');
 if(/<!\[CDATA\[/u.test(input))return {status:'unverified-markup',gradientStrokes:null};
 const xml=input.replace(/<!--[\s\S]*?-->/gu,'');
 if(/<!--|-->|<!/u.test(xml))throw new TypeError('Renderer gradient evidence markup is invalid');
 const drawing='http://schemas.openxmlformats.org/drawingml/2006/main';
 const presentation='http://schemas.openxmlformats.org/presentationml/2006/main';
 /** @type {()=>{status:'unverified-markup',gradientStrokes:null}} */
 const unknown=()=>({status:'unverified-markup',gradientStrokes:null});
 if(!/^(?:\s*<\?xml\s[^?]*\?>)?\s*<p:sld\b/u.test(xml)||!/<\/p:sld>\s*$/u.test(xml))return unknown();
 // Namespace declarations may be local, as in the actual .NET writer output.
 // Keep their lexical scope; a sibling cannot borrow a closed node's binding.
 /** @type {{name:string,a:string,p:string}[]} */ const stack=[];
 let count=0,tags=0,lineDepth=0,gradient=false,closed=false,cursor=0;
 for(const match of xml.matchAll(/<(?:[^<>"']|"[^"<>]*"|'[^'<>]*')+>/gu)){
  if(++tags>100000)throw new RangeError('Renderer gradient evidence budget exceeded');
  if(xml.slice(cursor,match.index).includes('<'))return unknown();cursor=match.index+match[0].length;
  const tag=match[0];
  if(tag.startsWith('<?xml'))continue;
  const name=tag.match(/^<\/?([A-Za-z_][\w.:-]*)(?=\s|\/?>)/u)?.[1];
  if(!name||closed)return unknown();
  const closing=tag.startsWith('</'),selfClosing=/\/\s*>$/u.test(tag);
  if(closing){
   if(stack.at(-1)?.name!==name||tag!==`</${name}>`)return unknown();
   if(name==='a:ln'){count+=Number(gradient);lineDepth=0;gradient=false;}
   stack.pop();closed=stack.length===0;continue;
  }
  const parent=stack.at(-1),scope={name,a:parent?.a??'',p:parent?.p??''};
  let attributes=tag.slice(name.length+1,selfClosing?tag.lastIndexOf('/'):-1);
  const bound=new Set();
  while(attributes.trim()){
   const attribute=attributes.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])(.*?)\2/u);
   if(!attribute||bound.has(attribute[1]))return unknown();
   const key=attribute[1],value=attribute[3];bound.add(key);attributes=attributes.slice(attribute[0].length);
   if(key==='xmlns:a'){if(value!==drawing)return unknown();scope.a=value;}
   if(key==='xmlns:p'){if(value!==presentation)return unknown();scope.p=value;}
  }
  if(name.startsWith('a:')&&scope.a!==drawing||name.startsWith('p:')&&scope.p!==presentation)return unknown();
  if(!parent&&name!=='p:sld')return unknown();
  if(name==='a:ln'){
   if(lineDepth)return unknown();
   if(!selfClosing){lineDepth=stack.length+1;gradient=false;}
  }else if(name==='a:gradFill'&&lineDepth){
   if(gradient||stack.length!==lineDepth)return unknown();gradient=true;
  }
  if(!selfClosing){if(stack.length>=128)return unknown();stack.push(scope);}
 }
 if(stack.length||!closed||lineDepth||xml.slice(cursor).includes('<'))return unknown();
 return {status:count?'requires-office-verification':'not-needed',gradientStrokes:count};
}

module.exports={inspectLibreOfficeGradientEvidence};
