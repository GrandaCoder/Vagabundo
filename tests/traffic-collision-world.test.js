import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as textures from '../src/world/bogota/textures.js';
mock.module('../src/world/bogota/textures.js',{namedExports:{...textures,radialSprite:()=>new THREE.Texture()}});
const {TrafficSystem}=await import('../src/systems/TrafficSystem.js');
const {TrafficRoute}=await import('../src/world/bogota/TrafficRoute.js');
const {Car}=await import('../src/entities/Car.js');
const {PlayerDriving}=await import('../src/vehicles/PlayerDriving.js');
const {BusService}=await import('../src/world/bogota/BusService.js');
test('golpear un conductor desplaza su cuerpo y recupera el carril de forma continua',()=>{
 const scene=new THREE.Scene(),route=new TrafficRoute(0,240,0,240,3.2),traffic=new TrafficSystem(scene,[route],{carsPerRoute:1,random:()=>.5}),v=traffic.vehicles[0];
 v.distance=11.8;v.speed=0;const d=new THREE.Vector3();route.sample(v.distance,v.car.position,d);v.car.group.rotation.y=0;traffic.update(.01);
 const car=new Car(scene,new THREE.Vector3(16,0,3.5),Math.PI/2);car.prepareDrivingVisual();traffic.setParkedCars([car]);
 const player={position:new THREE.Vector3(16,0,5.4),root:new THREE.Group(),velocity:new THREE.Vector3()},collisions={queryStatic:()=>[],dynamicColliders:[]};
 const driver=new PlayerDriving({player,cars:()=>[car],collisions,district:()=>({getMovementGroundHeight:(x,z,y)=>y}),contacts:(car,owner)=>traffic.collideDrivenCar(car,owner)});
 assert.equal(driver.enter(car),true);driver.speed=12;driver.update(.1,{isDown:()=>false,consumePress:()=>false,isRunning:false});
 assert.ok(Math.hypot(v.vx,v.vz)>0);assert.ok(Math.abs(v.yawVel)>0||Math.abs(v.rollVel)>0);assert.ok(traffic.physics.sparks.items.some(p=>p.life>0));
 driver.cancel();car.position.set(16,0,40);for(let i=0;i<600;i++)traffic.update(.02);
 assert.ok(Math.abs(v.dl)<.1);assert.ok(Math.abs(v.yawOffset)<.01);assert.ok(Number.isFinite(v.car.position.x));
 traffic.dispose();car.dispose();
});
test('choques en el viaducto no transmiten impulsos a los carros de abajo',()=>{
 const scene=new THREE.Scene(),traffic=new TrafficSystem(scene,[new TrafficRoute(0,240,0,240,3.2)],{carsPerRoute:1,random:()=>.5}),v=traffic.vehicles[0];traffic.update(.01);
 const car=new Car(scene,v.car.position.clone().setY(7.82));traffic.setParkedCars([car]);const body=traffic.physics.body(car,{speed:0,vx:8});traffic.physics.step(traffic.vehicles,traffic.parkedCars,[],null,.01,null);
 assert.equal(v.vx,0);assert.equal(v.vz,0);assert.ok(body.vx>0);traffic.dispose();car.dispose();
});

test('el impulso del bus se amortigua sin acumular deriva fuera del carril',()=>{
 const scene=new THREE.Scene(),traffic=new TrafficSystem(scene,[],{carsPerRoute:0});
 const bus=new BusService({x:8,startZ:0,endZ:200});scene.add(bus.group);traffic.setBus(bus);
 traffic.physics.body(bus,bus,{bus:true});bus.vx=3;
 for(let i=0;i<200;i++){traffic.physics.step([],[],traffic.busVehicles,null,.02,null);bus.update(.02);assert.ok(Math.abs(bus.position.x-bus.laneX)<=.451);}
 assert.ok(Math.abs(bus.vx)<.001);assert.ok(Math.abs(bus.position.x-bus.laneX)<.01);
 traffic.dispose();bus.dispose();
});
