import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SurfaceMaterials} from '../src/graphics/SurfaceMaterials.js';
test('los materiales TSL comparten recursos y conservan clima, opacidad y límites',()=>{
 const bank=new SurfaceMaterials(),source=new THREE.MeshStandardMaterial({color:'#895634',roughness:.9});const scene=new THREE.Scene();
 const a=new THREE.Mesh(new THREE.BoxGeometry(3,8,4),source),b=new THREE.Mesh(a.geometry,source);b.position.x=10;scene.add(a,b);const bounds=new THREE.Box3().setFromObject(scene);
 bank.apply(scene,new Map([[source,'road']]));assert.equal(a.material,b.material);assert.equal(a.material.isNodeMaterial,true);assert.ok(a.material.roughnessNode);assert.ok(bounds.equals(new THREE.Box3().setFromObject(scene)));
 source.roughness=.45;source.opacity=.3;source.transparent=true;assert.equal(a.material.roughness,.45);assert.equal(a.material.opacity,.3);assert.equal(a.material.transparent,true);assert.equal(a.material.color,source.color);
 const wall=source.clone();bank.apply(new THREE.Mesh(a.geometry,wall));wall.opacity=.8;assert.equal(a.material.opacity,.3);bank.dispose();assert.equal(bank.resources.size,0);
});
