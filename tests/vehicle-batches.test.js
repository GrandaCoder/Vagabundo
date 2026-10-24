import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSlopVehicle} from '../src/vehicles/SlopVehicle.js';
import {vehicleBatches,disposeVehicleBatches} from '../src/vehicles/VehicleBatches.js';
test('las instancias conservan transformaciones, pintura, frenado y ruedas sin reallocar buffers',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);root.position.set(20,0,10);root.rotation.y=.7;
 const a=createSlopVehicle({scene,seed:3}),b=createSlopVehicle({scene,seed:5});root.add(a.group);scene.add(b.group);b.group.position.set(150,0,0);a.activate();b.activate();a.updateMotion(3,true);a.setNight(true);
 const bank=vehicleBatches(scene),camera=new THREE.PerspectiveCamera();bank.sync(camera);const type=bank.types.get('sedan');assert.equal(type.material.positionNode,null);assert.equal(type.near.count,1);assert.equal(type.far.count,1);
 const matrix=new THREE.Matrix4();type.near.getMatrixAt(0,matrix);a.group.children[0].updateWorldMatrix(true,false);assert.ok(matrix.elements.every((v,i)=>Math.abs(v-a.group.children[0].matrixWorld.elements[i])<1e-5));
 assert.equal(type.near.geometry.attributes.carState.getX(0),1);assert.equal(type.near.geometry.attributes.carNight.getX(0),1);assert.ok(type.near.geometry.attributes.wheelAngle.getX(0)>0);
 const buffer=type.near.instanceMatrix.array;bank.sync(camera);assert.equal(type.near.instanceMatrix.array,buffer);
 a.dispose();bank.sync(camera);assert.equal(type.near.count,0);assert.equal(bank.entries.size,1);b.dispose();disposeVehicleBatches(scene);assert.equal(bank.root.parent,null);
});
test('los retrovisores agrupados siguen ocultación y reposición sin alterar sus grupos',()=>{
 const scene=new THREE.Scene(),anchor=new THREE.Group();scene.add(anchor);const mirrors=[-1,1].map(z=>{const g=new THREE.Group();g.position.set(.8,1,z);g.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.2),new THREE.MeshStandardMaterial()),new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),new THREE.MeshStandardMaterial()));anchor.add(g);return g;});
 const car=createSlopVehicle({scene,mirrors});anchor.add(car.group);car.activate();const bank=vehicleBatches(scene);bank.sync(new THREE.Camera());assert.equal(bank.mirrors[0].count,2);assert.ok(mirrors.every(m=>m.visible&&m.children.every(c=>!c.visible)));
 mirrors.forEach(m=>m.visible=false);bank.sync(new THREE.Camera());assert.equal(bank.mirrors[0].count,0);mirrors.forEach(m=>m.visible=true);bank.sync(new THREE.Camera());assert.equal(bank.mirrors[0].count,2);car.dispose();assert.ok(mirrors.every(m=>m.children.every(c=>c.visible)));disposeVehicleBatches(scene);
});
