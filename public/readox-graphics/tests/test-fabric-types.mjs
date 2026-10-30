import {GraphicsDocument} from '../core.mjs';
import {supportedTypes} from '../fabric-adapter.mjs';
import assert from 'node:assert/strict';
for(const type of supportedTypes){const d=new GraphicsDocument({page:{width:510,height:660},items:[{id:'x',type,x:1,y:2,w:40,h:30}]});assert.equal(d.snapshot().items[0].type,type);d.update('x',{x:20});assert.equal(d.get('x').x,20);d.undo();assert.equal(d.get('x').x,1);}
console.log('OK',supportedTypes.length,'types: load/update/undo');
