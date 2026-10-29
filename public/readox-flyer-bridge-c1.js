/* Readox C1: contrat de commandes Flyer, sans interface ordinateur */
(function(){'use strict';
 const actions=Object.freeze({
  'flyer.text.add':'addText','flyer.image.add':'addImage','flyer.shape.add':'addShape',
  'flyer.document.blank':'blank','flyer.document.save':'save','flyer.document.load':'load',
  'flyer.document.preview':'preview','flyer.document.export':'export',
  'flyer.history.undo':'undo','flyer.history.redo':'redo',
  'flyer.object.duplicate':'duplicate','flyer.object.delete':'delete',
  'flyer.object.front':'front','flyer.object.back':'back',
  'flyer.zoom.in':'zoomIn','flyer.zoom.out':'zoomOut',
  'flyer.background.edit':'background'
 });
 function dispatch(name){
  const id=actions[name];if(!id)return {ok:false,error:'ACTION_INCONNUE',name};
  const el=document.getElementById(id);
  if(!el||el.disabled)return {ok:false,error:'COMMANDE_INDISPONIBLE',name,id};
  try{el.click();return {ok:true,name,id}}catch(e){return {ok:false,error:'EXECUTION_ECHOUEE',name,id,message:String(e&&e.message||e)}}
 }
 window.ReadoxFlyerBridge=Object.freeze({version:'C1',actions,dispatch,available(name){const id=actions[name];const el=id&&document.getElementById(id);return !!(el&&!el.disabled)}});
})();
