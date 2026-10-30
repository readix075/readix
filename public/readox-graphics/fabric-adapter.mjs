/** Readox C10.3 - Fabric.js 6 renderer for the structured graphics engine.
 * Isolated integration: no legacy editor UI modifications. SDK injected by host.
 */
import {GraphicsDocument} from './core.mjs';
import {applyAppearance,makeText,loadFonts} from './gf01.mjs';
import {normalizeImageSpec,imagePlacement} from './gf02.mjs';
const N=(x,d=0)=>Number.isFinite(+x)?+x:d;
const fill=o=>o.bg||o.fill||o.color||'#222222';
const poly=(sides,w,h,phase=-Math.PI/2)=>Array.from({length:sides},(_,i)=>({x:w/2+Math.cos(phase+2*Math.PI*i/sides)*w/2,y:h/2+Math.sin(phase+2*Math.PI*i/sides)*h/2}));
const star=(w,h,points=5)=>Array.from({length:points*2},(_,i)=>{const r=i%2?.43:1;const t=-Math.PI/2+i*Math.PI/points;return {x:w/2+Math.cos(t)*w/2*r,y:h/2+Math.sin(t)*h/2*r};});
export const supportedTypes=Object.freeze(['rect','roundedRect','square','frame','clipFrame','placeholder','badge','ribbon','divider','circle','ellipse','triangle','polygon','pentagon','hexagon','octagon','diamond','star','line','polyline','path','freeDraw','bezier','arc','arrow','doubleArrow','chevron','curvedArrow','text','textbox','richText','textOnPath','image','imageFrame','backgroundImage','patternImage','svg','icon','symbol','customShape','group','layerGroup','maskGroup','solidBackground','gradientBackground','patternBackground','imageBackground','speechBubble','callout','table','chart','qrCode','barcode']);
const rectTypes=new Set(['rect','roundedRect','square','frame','clipFrame','placeholder','badge','ribbon','solidBackground','gradientBackground','patternBackground']);
const imageTypes=new Set(['image','imageFrame','backgroundImage','patternImage','imageBackground']);
const textTypes=new Set(['text','textbox','richText','textOnPath']);
const lineTypes=new Set(['line','divider','arrow','doubleArrow']);
const pathTypes=new Set(['path','freeDraw','bezier','arc','curvedArrow']);
const groupTypes=new Set(['group','layerGroup','maskGroup','table','chart']);
const vectorTypes=new Set(['svg','icon','symbol','customShape','qrCode','barcode']);
function points(o){if(Array.isArray(o.points)&&o.points.length>=2)return o.points.map(p=>({x:N(p.x),y:N(p.y)}));const w=N(o.w,100),h=N(o.h,100);switch(o.type){case 'triangle':return poly(3,w,h);case 'pentagon':return poly(5,w,h);case 'hexagon':return poly(6,w,h);case 'octagon':return poly(8,w,h);case 'diamond':return poly(4,w,h,0);case 'star':return star(w,h,N(o.spikes,5));case 'chevron':return [{x:0,y:0},{x:w*.65,y:0},{x:w,y:h/2},{x:w*.65,y:h},{x:0,y:h},{x:w*.35,y:h/2}];case 'speechBubble':case 'callout':return [{x:0,y:0},{x:w,y:0},{x:w,y:h*.8},{x:w*.45,y:h*.8},{x:w*.25,y:h},{x:w*.3,y:h*.8},{x:0,y:h*.8}];default:return poly(4,w,h);}}
function opts(o,interactive){return {left:N(o.x),top:N(o.y),width:Math.max(1,N(o.w,100)),height:Math.max(1,N(o.h,100)),angle:N(o.rotation),opacity:Math.max(0,Math.min(1,N(o.opacity,100)/100)),selectable:interactive&&!o.locked,evented:interactive&&!o.locked,hasControls:interactive&&!o.locked,visible:o.visible!==false,stroke:o.stroke||undefined,strokeWidth:N(o.strokeWidth,1)};}
export async function createFabricCanvas(fabric,canvasElement,source,{interactive=true}={}){
 if(!fabric?.Canvas||!fabric?.Rect||!fabric?.Textbox||!fabric?.Polygon)throw Error('Fabric.js 6 requis (SDK non chargé)');
 const model=source instanceof GraphicsDocument?source:new GraphicsDocument(source);const page=model.snapshot().page;
 await loadFonts(model.snapshot().metadata?.fonts||[]);
 const canvas=new fabric.Canvas(canvasElement,{width:page.width,height:page.height,selection:interactive,backgroundColor:page.background});const objects=new Map();let updating=false;
 async function make(o){const p=opts(o,interactive);let obj=null;const f=fill(o);const type=o.type;
  if(rectTypes.has(type))obj=new fabric.Rect({...p,fill:f,rx:N(o.radius,type==='roundedRect'?12:0),ry:N(o.radius,type==='roundedRect'?12:0)});
  else if(type==='circle'||type==='ellipse')obj=new fabric.Ellipse({...p,rx:p.width/2,ry:p.height/2,fill:f});
  else if(type==='triangle'&&fabric.Triangle)obj=new fabric.Triangle({...p,fill:f});
  else if(['polygon','pentagon','hexagon','octagon','diamond','star','chevron','speechBubble','callout','triangle'].includes(type))obj=new fabric.Polygon(points(o),{...p,fill:f});
  else if(type==='polyline'&&fabric.Polyline)obj=new fabric.Polyline(points(o),{...p,fill:'transparent',stroke:o.stroke||o.color||'#222'});
  else if(lineTypes.has(type)){obj=new fabric.Line([0,0,p.width,p.height],{...p,fill:'transparent',stroke:o.stroke||o.color||'#222',strokeWidth:N(o.strokeWidth,2)});}
  else if(pathTypes.has(type)&&fabric.Path){const d=o.path||`M 0 ${p.height} Q ${p.width/2} 0 ${p.width} ${p.height}`;obj=new fabric.Path(d,{...p,fill:o.fill||'transparent',stroke:o.stroke||o.color||'#222',strokeWidth:N(o.strokeWidth,2)});}
  else if(textTypes.has(type))obj=makeText(fabric,o,p);
  else if(imageTypes.has(type)&&o.src&&fabric.FabricImage?.fromURL){
   obj=await fabric.FabricImage.fromURL(o.src,{crossOrigin:'anonymous'});
   const spec=normalizeImageSpec(o),m=imagePlacement(obj.width,obj.height,p.width,p.height,spec);
   // Fabric cropX/Y and width/height implement non-destructive cropping. A clipPath
   // prevents a cover-fit image from painting outside its document frame.
   obj.set({...p,cropX:m.cropX,cropY:m.cropY,width:m.cropWidth,height:m.cropHeight,
     scaleX:m.drawWidth/m.cropWidth,scaleY:m.drawHeight/m.cropHeight,
     flipX:spec.flipX,flipY:spec.flipY});
   obj.set({left:p.left+m.offsetX,top:p.top+m.offsetY});
   if(fabric.Rect){const clip=new fabric.Rect({left:p.left,top:p.top,width:p.width,height:p.height,
     rx:spec.cornerRadius,ry:spec.cornerRadius,absolutePositioned:true});obj.set('clipPath',clip);}
   obj.set('readoxImageFrame',{x:p.left,y:p.top,w:p.width,h:p.height,fit:spec.fit,crop:spec.crop});
  }
  else if(vectorTypes.has(type)&&o.svg&&fabric.loadSVGFromString){const parsed=await fabric.loadSVGFromString(o.svg);const els=parsed.objects.filter(Boolean);if(els.length&&fabric.util?.groupSVGElements)obj=fabric.util.groupSVGElements(els,parsed.options||{});if(obj)obj.set({...p,scaleX:p.width/Math.max(1,obj.width),scaleY:p.height/Math.max(1,obj.height)});}
  else if(groupTypes.has(type)&&Array.isArray(o.children)&&fabric.Group){const children=[];for(const child of o.children){const c=await make(child);if(c)children.push(c);}obj=new fabric.Group(children,p);}
  // Explicit, editable geometric placeholder for objects requiring specialized engines.
  if(!obj)obj=new fabric.Rect({...p,fill:'rgba(200,166,106,0.12)',stroke:'#C8A66A',strokeDashArray:[6,4]});
  applyAppearance(fabric,obj,o);obj.set('readoxId',o.id);obj.set('readoxType',type);return obj;
 }
 async function refresh(){updating=true;try{canvas.clear();objects.clear();const d=model.snapshot();canvas.setDimensions({width:d.page.width,height:d.page.height});canvas.backgroundColor=d.page.background;for(const o of d.items){if(o.visible===false)continue;const ob=await make(o);canvas.add(ob);objects.set(o.id,ob);}canvas.requestRenderAll();}finally{updating=false;}}
 function sync(e){if(updating||!interactive||!e?.target)return;const ob=e.target,id=ob.readoxId;if(!id||!model.get(id))return;const old=model.get(id);const patch={x:N(ob.left),y:N(ob.top),rotation:N(ob.angle),w:Math.max(1,N(ob.width)*N(ob.scaleX,1)),h:Math.max(1,N(ob.height)*N(ob.scaleY,1))};if(textTypes.has(old.type))patch.text=ob.text;
 if(imageTypes.has(old.type)){const frame=ob.readoxImageFrame;if(frame){patch.w=frame.w*N(ob.scaleX,1)/(Math.max(.0001,frame.w/Math.max(1,ob.width)));patch.h=frame.h*N(ob.scaleY,1)/(Math.max(.0001,frame.h/Math.max(1,ob.height)));patch.x=N(ob.left);patch.y=N(ob.top);}}
 model.update(id,patch);}
 canvas.on('object:modified',sync);canvas.on('text:changed',sync);await refresh();
 return {canvas,documentModel:model,objects,refresh,destroy:()=>canvas.dispose(),toPNG:(scale=1)=>canvas.toDataURL({format:'png',multiplier:scale}),toJPG:(scale=1)=>canvas.toDataURL({format:'jpeg',quality:.92,multiplier:scale}),toSVG:()=>canvas.toSVG(),getJSON:()=>model.snapshot()};
}
