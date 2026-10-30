/** Readox GF-03 — non-destructive layout diagnostics and explicit repair proposals.
 * Geometry is in DOCUMENT units, never viewport pixels. No UI or browser dependency.
 */
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function rotatedBounds(o){
 const x=num(o.x),y=num(o.y),w=Math.max(0,num(o.w)),h=Math.max(0,num(o.h));
 const a=num(o.rotation)*Math.PI/180,cx=x+w/2,cy=y+h/2,c=Math.cos(a),s=Math.sin(a);
 const pts=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy])=>({x:cx+dx*c-dy*s,y:cy+dx*s+dy*c}));
 return {left:Math.min(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),right:Math.max(...pts.map(p=>p.x)),bottom:Math.max(...pts.map(p=>p.y))};
}
export function intersection(a,b){const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return w*h;}
export function textMetrics(item,measure){
 const size=Math.max(1,num(item.size??item.fontSize,16)),lineHeight=Math.max(.8,num(item.lineHeight,1.16)),spacing=num(item.charSpacing,0);
 const lines=String(item.text||'').split(/\r?\n/);
 const fn=measure||((s,sz)=>[...s].reduce((sum,ch)=>sum+(ch===' '?0.33:0.57)*sz,0));
 const width=Math.max(0,...lines.map(s=>fn(s,size,item.font||item.fontFamily||'Arial',item.weight||item.fontWeight)+Math.max(0,[...s].length-1)*spacing));
 return {width,height:lines.length*size*lineHeight,lines:lines.length,fontSize:size};
}
export function proposeTextFit(item,measure,{minSize=8,step=.25,padding=1}={}){
 const targetW=Math.max(0,num(item.w)-2*padding),targetH=Math.max(0,num(item.h)-2*padding);
 let size=Math.max(minSize,num(item.size??item.fontSize,16));let measured;
 for(;size>=minSize;size-=step){measured=textMetrics({...item,size,fontSize:size},measure);if(measured.width<=targetW&&measured.height<=targetH)return {fits:true,fontSize:Number(size.toFixed(2)),metrics:measured};}
 return {fits:false,fontSize:minSize,metrics:textMetrics({...item,size:minSize,fontSize:minSize},measure)};
}
function ignoredOverlap(a,b){
 if(a.id===b.id||a.visible===false||b.visible===false)return true;
 if(a.type==='image'&&b.type==='text'||a.type==='text'&&b.type==='image')return true; // intentional editorial overlay
 if(['image','rect','ellipse','path','svg'].includes(a.type)&&['image','rect','ellipse','path','svg'].includes(b.type))return true;
 if(a.groupId&&a.groupId===b.groupId)return true;
 if(a.allowOverlap||b.allowOverlap)return true;
 return false;
}
export function auditLayout(doc,{measure,margin=8,overlapThreshold=.25}={}){
 const page=doc?.page||{},W=num(page.width),H=num(page.height),items=Array.isArray(doc?.items)?doc.items:[],issues=[];
 if(W<=0||H<=0)return [{code:'INVALID_PAGE',severity:'error'}];
 const bounds=new Map();
 for(const item of items){if(!item||item.visible===false)continue;
  const b=rotatedBounds(item);bounds.set(item.id,b);
  if(![item.x,item.y,item.w,item.h].every(v=>Number.isFinite(Number(v)))||num(item.w)<=0||num(item.h)<=0){issues.push({code:'INVALID_BOUNDS',severity:'error',id:item.id});continue;}
  if(b.left<0||b.top<0||b.right>W||b.bottom>H)issues.push({code:'OUTSIDE_PAGE',severity:'warning',id:item.id,bounds:b});
  else if(b.left<margin||b.top<margin||b.right>W-margin||b.bottom>H-margin){if(item.type==='text'||item.type==='textbox')issues.push({code:'NEAR_TRIM',severity:'info',id:item.id});}
  if(['text','textbox','richText'].includes(item.type)){
   const m=textMetrics(item,measure);if(m.width>num(item.w)+.5||m.height>num(item.h)+.5)issues.push({code:'TEXT_OVERFLOW',severity:'warning',id:item.id,measured:m,proposal:proposeTextFit(item,measure)});
  }
 }
 // Text-vs-text only, to avoid treating intentional artwork and photograph overlays as defects.
 const texts=items.filter(i=>i&&i.visible!==false&&['text','textbox','richText'].includes(i.type));
 for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
  const a=texts[i],b=texts[j];if(ignoredOverlap(a,b))continue;
  const ba=bounds.get(a.id),bb=bounds.get(b.id);if(!ba||!bb)continue;
  const area=intersection(ba,bb),small=Math.min(num(a.w)*num(a.h),num(b.w)*num(b.h));
  if(small>0&&area/small>=overlapThreshold)issues.push({code:'TEXT_OVERLAP',severity:'warning',ids:[a.id,b.id],ratio:Number((area/small).toFixed(3))});
 }
 return issues;
}
export function safeTextFixes(doc,opts={}){
 const changes=[];for(const i of auditLayout(doc,opts))if(i.code==='TEXT_OVERFLOW'&&i.proposal?.fits){
  const item=doc.items.find(o=>o.id===i.id);const old=num(item.size??item.fontSize,16),next=i.proposal.fontSize;
  if(next<old)changes.push({id:i.id,from:old,to:next,patch:{size:next,fontSize:next}});
 }return changes;
}
export function applyTextFixes(doc,changes){const byId=new Map(changes.map(c=>[c.id,c]));return {...doc,items:(doc.items||[]).map(o=>byId.has(o.id)?{...o,...byId.get(o.id).patch}:o)};}
export function fitPageToViewport(page,viewport,{padding=24,minZoom=.1,maxZoom=2}={}){
 const w=Math.max(1,num(page.width)),h=Math.max(1,num(page.height));
 const availW=Math.max(1,num(viewport.width)-2*padding),availH=Math.max(1,num(viewport.height)-2*padding);
 const scale=clamp(Math.min(availW/w,availH/h),minZoom,maxZoom);
 return {scale,percent:Math.round(scale*100),renderWidth:w*scale,renderHeight:h*scale};
}
