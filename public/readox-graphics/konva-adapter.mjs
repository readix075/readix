/** Optional Konva rendering adapter. Inject an actual Konva instance from an installed package.
 * The adapter never changes the existing Readox UI and creates no toolbar.
 */
import {GraphicsDocument} from './core.mjs';
export function createKonvaStage(Konva,container,source,{interactive=true}={}){
 if(!Konva?.Stage||!Konva?.Layer)throw new Error('Konva SDK requis (non inclus dans cette archive)');
 const documentModel=source instanceof GraphicsDocument?source:new GraphicsDocument(source);
 const page=documentModel.snapshot().page;
 const stage=new Konva.Stage({container,width:page.width,height:page.height});
 const layer=new Konva.Layer();stage.add(layer);
 const nodes=new Map();
 function draw(){layer.destroyChildren();nodes.clear();const d=documentModel.snapshot();stage.size({width:d.page.width,height:d.page.height});layer.add(new Konva.Rect({x:0,y:0,width:d.page.width,height:d.page.height,fill:d.page.background,listening:false}));
 for(const o of d.items){if(!o.visible)continue;const base={id:o.id,x:o.x,y:o.y,width:o.w,height:o.h,rotation:o.rotation,opacity:o.opacity/100,draggable:interactive&&!o.locked};let node;
 if(o.type==='rect')node=new Konva.Rect({...base,fill:o.bg||o.color||'#000',cornerRadius:o.radius||0});
 if(o.type==='ellipse')node=new Konva.Ellipse({...base,x:o.x+o.w/2,y:o.y+o.h/2,radiusX:o.w/2,radiusY:o.h/2});
 if(o.type==='text')node=new Konva.Text({...base,text:o.text||'',fontSize:o.size||24,fontFamily:o.fontFamily||'Arial',fill:o.color||'#000',align:o.align||'left',fontStyle:o.bold?'bold':'normal'});
 if(o.type==='line')node=new Konva.Line({...base,points:[0,0,o.w,o.h],stroke:o.color||'#000',strokeWidth:o.strokeWidth||2});
 if(o.type==='image'&&o.src){node=new Konva.Image(base);const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{node.image(img);layer.batchDraw()};img.src=o.src;}
 if(!node)continue;layer.add(node);nodes.set(o.id,node);node.on('dragend',()=>documentModel.update(o.id,{x:node.x(),y:node.y()}));}
 layer.draw();}
 draw();return {stage,layer,documentModel,nodes,refresh:draw,destroy:()=>stage.destroy()};
}
