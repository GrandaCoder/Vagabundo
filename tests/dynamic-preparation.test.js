import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Renderer} from '../src/core/Renderer.js';
test('compilar detalle conserva el MRT hasta terminar y excluye el render concurrente',async()=>{
 let resolve,reject;const pending=new Promise((a,b)=>{resolve=a;reject=b;}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
 let target='screen',mrt=null,calls=0;
 const renderer=Object.assign(Object.create(Renderer.prototype),{instance:{initTexture(){},getRenderTarget:()=>target,getMRT:()=>mrt,setRenderTarget:t=>target=t,setMRT:t=>mrt=t,compileAsync(){calls++;assert.equal(root.children[0].frustumCulled,false);return pending;}},pipeline:{scenePass:{renderTarget:'scene',getMRT:()=> 'mrt'}},_ensurePipeline(){}});
 const task=renderer.prepareDynamic(root,new THREE.Scene(),new THREE.PerspectiveCamera());
 await new Promise(r=>setImmediate(r));assert.equal(renderer.compilingDynamic,true);assert.equal(target,'scene');assert.equal(mrt,'mrt');assert.doesNotThrow(()=>renderer.render());
 reject(new Error('device lost'));await assert.rejects(task,/device lost/);assert.equal(target,'screen');assert.equal(mrt,null);assert.equal(renderer.compilingDynamic,false);assert.equal(root.children[0].frustumCulled,true);
 renderer._disposed=true;await renderer.prepareDynamic(root);assert.equal(calls,1);
});
