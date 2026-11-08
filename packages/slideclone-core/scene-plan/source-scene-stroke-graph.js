// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list,box}=require('./source-scene-group-containment');
/** Fixed, source-independent constants (pre-registered; never tuned per image). */
const MAX_ITERATIONS=128,MAX_GRAPH=8192,SPUR_PX=6,RDP_EPSILON=1.5,DIRECTION_PX=12,
 BARB_MIN_PX=3,BARB_MAX_PX=48,BARB_MIN_DEG=15,BARB_MAX_DEG=75;// barb-vs-shaft angle, both measured outward from the tip
/** @typedef {{id:string,x:number,y:number,kind:'end'|'junction'|'loop'}} StrokeNode */
/** @typedef {{id:string,from:string,to:string,points:[number,number][],lengthPx:number}} StrokeEdge */
/** @typedef {{nodeId:string,tip:[number,number],direction:[number,number],shaftEdgeId:string,barbEdgeIds:[string,string]}} ArrowheadCandidate */
/** @param {unknown} rgba @param {number} length */
function readPixels(rgba,length){
 if(types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError('Scene stroke raster is invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',rgba),offset=Reflect.get(proto,'byteOffset',rgba),size=Reflect.get(proto,'length',rgba);
 if(!types.isArrayBuffer(buffer)||size!==length)throw new TypeError('Scene stroke raster is invalid');
 return new Uint8Array(buffer,offset,size);
}
/** Ramer-Douglas-Peucker on integer pixel chains. @param {[number,number][]} pts @returns {[number,number][]} */
function simplify(pts){
 if(pts.length<3)return pts.map(p=>[p[0],p[1]]);
 const keep=new Uint8Array(pts.length);keep[0]=1;keep[pts.length-1]=1;
 /** @type {[number,number][]} */const stack=[[0,pts.length-1]];
 while(stack.length){
  const range=stack.pop();if(!range)break;const [a,b]=range,pa=pts[a],pb=pts[b];if(!pa||!pb)continue;
  const dx=pb[0]-pa[0],dy=pb[1]-pa[1],norm=Math.hypot(dx,dy);let best=-1,index=-1;
  for(let i=a+1;i<b;i++){const p=pts[i];if(!p)continue;const d=norm?Math.abs(dy*(p[0]-pa[0])-dx*(p[1]-pa[1]))/norm:Math.hypot(p[0]-pa[0],p[1]-pa[1]);if(d>best){best=d;index=i;}}
  if(best>RDP_EPSILON&&index>0){keep[index]=1;stack.push([a,index],[index,b]);}
 }
 /** @type {[number,number][]} */const out=[];for(let i=0;i<pts.length;i++){const p=pts[i];if(keep[i]&&p)out.push([p[0],p[1]]);}return out;
}
/** Skeleton line graph of dark, non-OCR ink: endpoints, junctions, simplified
 * edges and arrowhead candidates (two short barbs folded back around a shaft).
 * This is SOURCE EVIDENCE for connector endpoints/direction only. It grants no
 * ownership, relation, class or erase authority; reviewers and the compiler
 * still decide. Limits fail closed instead of truncating.
 * @param {unknown} value */
function extractSceneStrokeGraph(value){
 if(!record(value)||!record(value.image)||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.sourceHash))
  throw new TypeError('Scene stroke source is invalid');
 const {width,height}=value.image;
 if(typeof width!=='number'||typeof height!=='number'||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||width*height>4000000)
  throw new TypeError('Scene stroke raster is invalid');
 const pixels=readPixels(value.image.rgba,width*height*4);
 const textBoxes=value.textBoxes;
 if(!list(textBoxes)||textBoxes.length>512)throw new TypeError('Scene stroke text boxes are invalid');
 const ink=new Uint8Array(width*height),inText=new Uint8Array(width*height);
 for(let i=0;i<width*height;i++){const o=i*4;ink[i]=(pixels[o+3]??0)>=128&&(pixels[o]??0)+(pixels[o+1]??0)+(pixels[o+2]??0)<570?1:0;}
 for(const t of textBoxes){
  if(!box(t)||![t.x,t.y,t.w,t.h].every(Number.isSafeInteger)||t.x<0||t.y<0||t.w<1||t.h<1||t.x+t.w>width||t.y+t.h>height)
   throw new TypeError('Scene stroke text boxes are invalid');
  for(let y=t.y;y<t.y+t.h;y++)inText.fill(1,y*width+t.x,y*width+t.x+t.w);
 }
 // Erase glyph components contained inside OCR boxes while preserving continuous
 // connector strokes that pass through an OCR box's whitespace corner.
 const seenText=new Uint8Array(width*height),qText=new Int32Array(width*height);
 for(let i=0;i<width*height;i++){
  if(!ink[i]||!inText[i]||seenText[i])continue;
  let head=0,tail=0,outside=false;qText[tail++]=i;seenText[i]=1;
  while(head<tail){const cur=qText[head++]??0,x=cur%width,y=(cur-x)/width;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx;if(!ink[n])continue;
    if(!inText[n])outside=true;else if(!seenText[n]){seenText[n]=1;qText[tail++]=n;}}}
  if(!outside)for(let k=0;k<tail;k++)ink[qText[k]??0]=0;
 }
 /** @param {number} x @param {number} y */
 const at=(x,y)=>x>=0&&y>=0&&x<width&&y<height?ink[y*width+x]??0:0;
 // Clockwise from north: P2..P9.
 const DX=[0,1,1,1,0,-1,-1,-1],DY=[-1,-1,0,1,1,1,0,-1];
 /** @param {number} i */
 const ring=i=>{const x=i%width,y=(i-x)/width;return DX.map((dx,k)=>at(x+dx,y+(DY[k]??0)));};
 /** @param {number[]} p */
 const transitions=p=>{let a=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])a++;return a;};
 /** @type {number[]} */let active=[];for(let i=0;i<ink.length;i++)if(ink[i])active.push(i);
 let iterations=0;
 for(let changed=true;changed;){
  if(++iterations>MAX_ITERATIONS)throw new RangeError('Scene stroke thinning budget exceeded');
  changed=false;
  for(const step of [0,1]){
   const remove=[];
   for(const i of active){
    if(!ink[i])continue;const p=ring(i),b=p.reduce((s,v)=>s+v,0);
    if(b<2||b>6||transitions(p)!==1)continue;
    const [p2,,p4,,p6,,p8]=p;
    if(step===0?(p2&&p4&&p6)||(p4&&p6&&p8):(p2&&p4&&p8)||(p2&&p6&&p8))continue;
    remove.push(i);
   }
   for(const i of remove)ink[i]=0;if(remove.length)changed=true;
  }
  active=active.filter(i=>ink[i]);
 }
 // Classify skeleton pixels by crossing number (robust to staircase corners).
 const role=new Uint8Array(width*height);// 1 edge, 2 end, 3 junction
 for(const i of active){const p=ring(i),b=p.reduce((s,v)=>s+v,0);if(!b)continue;const a=transitions(p);role[i]=b===1||a===1?2:a>=3?3:1;}
 const cluster=new Int32Array(width*height).fill(-1);
 /** In-frame 8-neighbour indices. @param {number} j @returns {number[]} */
 const neighbours=j=>{const x=j%width,y=Math.floor(j/width),out=[];
  for(let k=0;k<8;k++){const nx=x+(DX[k]??0),ny=y+(DY[k]??0);if(nx>=0&&ny>=0&&nx<width&&ny<height)out.push(ny*width+nx);}return out;};
 /** @type {{x:number,y:number,kind:'end'|'junction'|'loop',pixels:number[]}[]} */const rawNodes=[];
 for(const i of active){
  if(role[i]!==2&&role[i]!==3||(cluster[i]??-1)>=0)continue;
  const id=rawNodes.length;/** @type {number[]} */const queue=[i];/** @type {number[]} */const members=[];cluster[i]=id;
  while(queue.length){const j=queue.pop();if(j===undefined)break;members.push(j);
   for(const n of neighbours(j))if((role[n]===2||role[n]===3)&&(cluster[n]??-1)<0){cluster[n]=id;queue.push(n);}}
  if(rawNodes.length>=MAX_GRAPH)throw new RangeError('Scene stroke graph budget exceeded');
  const kind=members.some(m=>role[m]===3)?'junction':'end';
  const cx=members.reduce((s,m)=>s+m%width,0)/members.length,cy=members.reduce((s,m)=>s+Math.floor(m/width),0)/members.length;
  rawNodes.push({x:Math.round(cx),y:Math.round(cy),kind,pixels:members});
 }
 const visited=new Uint8Array(width*height);
 /** @type {{a:number,b:number,pts:[number,number][]}[]} */const rawEdges=[];const direct=new Set();
 /** @param {number} i @returns {[number,number]} */
 const xy=i=>{const x=i%width;return [x,(i-x)/width];};
 /** @param {number} start @param {number} first @param {number} origin */
 const walk=(start,first,origin)=>{
  /** @type {[number,number][]} */const pts=[xy(start)];let prev=start,cur=first;
  for(let guard=0;guard<=width*height;guard++){
   pts.push(xy(cur));
   const c=cluster[cur]??-1;if(c>=0)return {b:c,pts};
   visited[cur]=1;const [x,y]=xy(cur);let next=-1,nextNode=-1;
   for(const k of [0,2,4,6,1,3,5,7]){const nx=x+(DX[k]??0),ny=y+(DY[k]??0);if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx;
    if(n===prev||!role[n])continue;const nc=cluster[n]??-1;
    if(nc>=0){if(nextNode<0&&!(nc===origin&&pts.length<4))nextNode=n;continue;}
    if(!visited[n]&&next<0)next=n;}
   const chosen=nextNode>=0?nextNode:next;
   if(chosen<0)return {b:-1,pts};
   prev=cur;cur=chosen;
  }
  throw new RangeError('Scene stroke trace budget exceeded');
 };
 for(const [id,node]of rawNodes.entries())for(const p of node.pixels){
  const [x,y]=xy(p);
  for(let k=0;k<8;k++){const nx=x+(DX[k]??0),ny=y+(DY[k]??0);if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx;
   if(!role[n]||visited[n])continue;const nc=cluster[n]??-1;
   if(nc===id)continue;
   if(nc>=0){const key=Math.min(id,nc)+':'+Math.max(id,nc);if(!direct.has(key)){direct.add(key);rawEdges.push({a:id,b:nc,pts:[xy(p),xy(n)]});}continue;}
   const traced=walk(p,n,id);let b=traced.b;
   if(b<0){if(rawNodes.length>=MAX_GRAPH)throw new RangeError('Scene stroke graph budget exceeded');const last=traced.pts[traced.pts.length-1]??[x,y];b=rawNodes.length;rawNodes.push({x:last[0],y:last[1],kind:'end',pixels:[]});}
   rawEdges.push({a:id,b,pts:traced.pts});
   if(rawEdges.length>MAX_GRAPH)throw new RangeError('Scene stroke graph budget exceeded');
  }
 }
 // Remaining unvisited edge pixels form closed loops without nodes.
 for(const i of active){
  if(role[i]!==1||visited[i])continue;
  if(rawNodes.length>=MAX_GRAPH)throw new RangeError('Scene stroke graph budget exceeded');
  const id=rawNodes.length,[x,y]=xy(i);rawNodes.push({x,y,kind:'loop',pixels:[i]});cluster[i]=id;
  const nb=[0,2,4,6,1,3,5,7].map(k=>[x+(DX[k]??0),y+(DY[k]??0)]).find(([nx,ny])=>nx!==undefined&&ny!==undefined&&at(nx,ny)&&role[ny*width+nx]===1&&!visited[ny*width+nx]);
  if(!nb||nb[0]===undefined||nb[1]===undefined){continue;}
  const traced=walk(i,nb[1]*width+nb[0],id);rawEdges.push({a:id,b:traced.b<0?id:traced.b,pts:traced.pts});
  if(rawEdges.length>MAX_GRAPH)throw new RangeError('Scene stroke graph budget exceeded');
 }
 /** @param {[number,number][]} pts */
 const length=pts=>{let s=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(a&&b)s+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return s;};
 // Collapse tiny parallel thinning-bubble loops, prune short spurs (preserving paired barbs), then merge degree-2 junctions.
 let edges=rawEdges.map(e=>({...e,alive:true,len:length(e.pts)}));
 for(let i=0;i<edges.length;i++){const e1=edges[i];if(!e1?.alive||e1.a===e1.b||e1.len>=SPUR_PX)continue;
  for(let j=i+1;j<edges.length;j++){const e2=edges[j];if(!e2?.alive||e2.len>=SPUR_PX)continue;
   if((e1.a===e2.a&&e1.b===e2.b)||(e1.a===e2.b&&e1.b===e2.a)){const keep=e1.a,drop=e1.b;e1.alive=false;e2.alive=false;
    for(const e of edges)if(e.alive){if(e.a===drop)e.a=keep;if(e.b===drop)e.b=keep;if(e.a===e.b)e.alive=false;}break;}}}
 const degree=()=>{const d=new Map();for(const e of edges)if(e.alive){d.set(e.a,(d.get(e.a)??0)+1);d.set(e.b,(d.get(e.b)??0)+1);}return d;};
 {const d=degree();for(const e of edges){if(!e.alive||e.a===e.b)continue;const na=rawNodes[e.a],nb=rawNodes[e.b];if(!na||!nb)continue;
  const jId=na.kind==='end'&&nb.kind==='junction'?e.b:nb.kind==='end'&&na.kind==='junction'?e.a:-1;
  if(jId<0||(d.get(jId)??0)<3)continue;
  const inc=edges.filter(x=>x.alive&&(x.a===jId||x.b===jId));
  const paired=inc.length===3&&e.len>=BARB_MIN_PX&&inc.some(s=>s.len>=16&&inc.filter(x=>{const o=rawNodes[x.a===jId?x.b:x.a];return x!==s&&o?.kind==='end'&&x.len>=BARB_MIN_PX&&x.len<=BARB_MAX_PX&&x.len<s.len;}).length===2);
  if(!paired&&e.len<SPUR_PX){e.alive=false;d.set(e.a,(d.get(e.a)??1)-1);d.set(e.b,(d.get(e.b)??1)-1);}}}
 for(let merged=true;merged;){
  merged=false;const d=degree();
  for(const [id,count]of d){
   const node=rawNodes[id];if(!node||node.kind!=='junction'||count!==2)continue;
   const pair=edges.filter(e=>e.alive&&(e.a===id||e.b===id));const [e1,e2]=pair;if(!e1||!e2||e1===e2||e1.a===e1.b||e2.a===e2.b)continue;
   const p1=e1.b===id?e1.pts:[...e1.pts].reverse(),p2=e2.a===id?e2.pts:[...e2.pts].reverse();
   const a=e1.b===id?e1.a:e1.b,b=e2.a===id?e2.b:e2.a;
   e1.alive=false;e2.alive=false;const pts=[...p1,...p2.slice(1)];edges.push({a,b,pts,alive:true,len:length(pts)});node.kind='loop';merged=true;break;
  }
 }
 edges=edges.filter(e=>e.alive);
 const used=new Set(edges.flatMap(e=>[e.a,e.b]));
 const order=[...used].sort((a,b)=>{const na=rawNodes[a],nb=rawNodes[b];return (na?.y??0)-(nb?.y??0)||(na?.x??0)-(nb?.x??0)||a-b;});
 const nodeId=new Map(order.map((n,i)=>[n,'stroke-node-'+i]));
 /** @type {StrokeNode[]} */const nodes=order.map(n=>{const r=rawNodes[n];if(!r)throw new TypeError('Scene stroke graph is invalid');
  return {id:nodeId.get(n)??'',x:r.x,y:r.y,kind:r.kind};});
 const sortedEdges=edges.sort((p,q)=>(nodeId.get(p.a)??'').localeCompare(nodeId.get(q.a)??'')||(nodeId.get(p.b)??'').localeCompare(nodeId.get(q.b)??'')||p.len-q.len);
 /** @type {StrokeEdge[]} */const outEdges=sortedEdges.map((e,i)=>({id:'stroke-edge-'+i,from:nodeId.get(e.a)??'',to:nodeId.get(e.b)??'',points:simplify(e.pts),lengthPx:Math.round(e.len*10)/10}));
 // Arrowhead candidates: degree-3 junction, two short barbs ending at free ends, folded back on opposite sides of the shaft.
 /** @param {StrokeEdge} e @param {string} from @returns {[number,number]} */
 const direction=(e,from)=>{const pts=e.from===from?e.points:[...e.points].reverse(),o=pts[0];if(!o)return [0,0];
  let target=pts[pts.length-1]??o;for(const p of pts){if(Math.hypot(p[0]-o[0],p[1]-o[1])>=DIRECTION_PX){target=p;break;}}
  const dx=target[0]-o[0],dy=target[1]-o[1],n=Math.hypot(dx,dy)||1;return [dx/n,dy/n];};
 const kindOf=new Map(nodes.map(n=>[n.id,n.kind]));
 /** @type {ArrowheadCandidate[]} */const arrowheads=[];
 for(const node of nodes){
  if(node.kind!=='junction')continue;const incident=outEdges.filter(e=>e.from===node.id||e.to===node.id);if(incident.length!==3||incident.some(e=>e.from===e.to))continue;
  for(const shaft of incident){
   const barbs=incident.filter(e=>e!==shaft);const [b1,b2]=barbs;if(!b1||!b2)continue;
   const far=(/** @type {StrokeEdge} */e)=>e.from===node.id?e.to:e.from;
   if(barbs.some(b=>kindOf.get(far(b))!=='end'||b.lengthPx<BARB_MIN_PX||b.lengthPx>BARB_MAX_PX||b.lengthPx>=shaft.lengthPx))continue;
   const s=direction(shaft,node.id),d1=direction(b1,node.id),d2=direction(b2,node.id);
   const angle=(/** @type {[number,number]} */a,/** @type {[number,number]} */b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;
   const a1=angle(s,d1),a2=angle(s,d2),c1=s[0]*d1[1]-s[1]*d1[0],c2=s[0]*d2[1]-s[1]*d2[0];
   if(a1<BARB_MIN_DEG||a1>BARB_MAX_DEG||a2<BARB_MIN_DEG||a2>BARB_MAX_DEG||Math.sign(c1)===Math.sign(c2))continue;
   const ids=[b1.id,b2.id].sort();
   arrowheads.push({nodeId:node.id,tip:[node.x,node.y],direction:[Math.round(-s[0]*1000)/1000,Math.round(-s[1]*1000)/1000],shaftEdgeId:shaft.id,barbEdgeIds:[ids[0]??'',ids[1]??'']});
  }
 }
 return {version:1,sourceHash:value.sourceHash,widthPx:width,heightPx:height,nodes,edges:outEdges,arrowheads,
  evidence:{method:'zhang-suen-skeleton-graph-v1',iterations,skeletonPixels:active.length,textBoxes:textBoxes.length,
   constants:{spurPx:SPUR_PX,rdpEpsilon:RDP_EPSILON,barbPx:[BARB_MIN_PX,BARB_MAX_PX],barbDeg:[BARB_MIN_DEG,BARB_MAX_DEG]},sourceAuthorized:false}};
}
module.exports={extractSceneStrokeGraph};
