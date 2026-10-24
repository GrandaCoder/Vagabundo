import test from 'node:test';
import assert from 'node:assert/strict';
import {Npc,NPC_LOD} from '../src/entities/Npc.js';
test('la carga inicial puede preparar solo el LOD y mantiene el detalle completo por defecto',async()=>{
 let full=0;const npc={ready:Promise.resolve(),_loadFull:async()=>full++};await Npc.prototype.preload.call(npc,{full:false});assert.equal(full,0);await Npc.prototype.preload.call(npc);assert.equal(full,1);
});
test('el detalle completo se solicita una vez antes del primer plano y conserva la histéresis',()=>{
 let requested=0,shown;const lod={},full={};const npc={lodChar:lod,fullChar:null,_fullLoading:null,_loadFull(){requested++;return this._fullLoading=Promise.resolve();},_show(c){shown=c;}};
 Npc.prototype._updateDetail.call(npc,100);assert.equal(requested,0);assert.equal(shown,lod);Npc.prototype._updateDetail.call(npc,NPC_LOD.prefetch-1);Npc.prototype._updateDetail.call(npc,6);assert.equal(requested,1);assert.equal(shown,lod);
 npc.fullChar=full;Npc.prototype._updateDetail.call(npc,6);assert.equal(shown,full);Npc.prototype._updateDetail.call(npc,8);assert.equal(shown,full);Npc.prototype._updateDetail.call(npc,11);assert.equal(shown,lod);
});
