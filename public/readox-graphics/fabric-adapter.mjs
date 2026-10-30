/** Readox Graphics: optional Fabric.js v6 adapter, no UI changes.
 * Pass the installed Fabric namespace and a canvas element to createFabricCanvas.
 */
import {GraphicsDocument} from './core.mjs';
export async function createFabricCanvas(fabric, canvasElement, source, {interactive=true}={}) {
  if(!fabric?.Canvas || !fabric?.Rect || !fabric?.Textbox) throw new Error('Fabric.js v6 requis : installer le SDK');
  const model=source instanceof GraphicsDocument?source:new GraphicsDocument(source);
  const page=model.snapshot().page;
  const canvas=new fabric.Canvas(canvasElement,{width:page.width,height:page.height,selection:interactive,backgroundColor:page.background});
  const objects=new Map();
  let updating=false;
  const common=o=>({left:o.x,top:o.y,width:o.w,height:o.h,angle:o.rotation||0,opacity:(o.opacity??100)/100,selectable:interactive&&!o.locked,evented:interactive&&!o.locked,hasControls:interactive&&!o.locked,visible:o.visible!==false});
  async function make(o){const props=common(o);let obj;
    if(o.type==='rect')obj=new fabric.Rect({...props,fill:o.bg||o.color||'#000',rx:o.radius||0,ry:o.radius||0});
    else if(o.type==='ellipse')obj=new fabric.Ellipse({...props,rx:o.w/2,ry:o.h/2,fill:o.bg||o.color||'#000'});
    else if(o.type==='text')obj=new fabric.Textbox(o.text||'',{...props,fontSize:o.size||24,fontFamily:o.fontFamily||'Arial',fontWeight:o.bold?'bold':'normal',fill:o.color||'#000',textAlign:o.align||'left'});
    else if(o.type==='line')obj=new fabric.Line([o.x,o.y,o.x+o.w,o.y+o.h],{stroke:o.color||'#000',strokeWidth:o.strokeWidth||2,opacity:props.opacity,selectable:props.selectable,evented:props.evented});
    else if(o.type==='image'&&o.src){obj=await fabric.FabricImage.fromURL(o.src,{crossOrigin:'anonymous'});obj.set({...props,scaleX:o.w/(obj.width||1),scaleY:o.h/(obj.height||1)});}
    if(obj){obj.set('readoxId',o.id);return obj;}return null;
  }
  async function refresh(){updating=true;try{canvas.clear();objects.clear();const doc=model.snapshot();canvas.setDimensions({width:doc.page.width,height:doc.page.height});canvas.backgroundColor=doc.page.background;for(const item of doc.items){if(!item.visible)continue;const obj=await make(item);if(obj){canvas.add(obj);objects.set(item.id,obj);}}canvas.requestRenderAll();}finally{updating=false;}}
  function sync(e){if(updating||!interactive||!e?.target)return;const obj=e.target;const id=obj.readoxId;if(!id||!model.get(id))return;const p={x:obj.left,y:obj.top,rotation:obj.angle||0};if(obj.type==='textbox'){p.text=obj.text;p.w=obj.width*obj.scaleX;p.h=obj.height*obj.scaleY;}else if(obj.type!=='line'){p.w=obj.width*obj.scaleX;p.h=obj.height*obj.scaleY;}model.update(id,p);}
  canvas.on('object:modified',sync);canvas.on('text:changed',sync);
  await refresh();return {canvas,documentModel:model,objects,refresh,destroy:()=>canvas.dispose()};
}
