import {Atmosphere,atmosphericState} from '../src/graphics/Atmosphere.js';
import {GRAPHICS_PROFILES} from '../src/core/GraphicsQuality.js';
import {LocalLights} from '../src/core/LocalLights.js';
import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
test('el clima y reloj producen transiciones continuas de luz y nubosidad',()=>{
 const night=atmosphericState(23,.8),day=atmosphericState(13,0);assert.equal(night.night,1);assert.equal(day.day,1);assert.ok(day.sun>night.sun);assert.ok(night.clouds>day.clouds);
 for(let h=0;h<24;h+=.01){const a=atmosphericState(h),b=atmosphericState(h+.001);assert.ok(Math.abs(a.sun-b.sun)<.02);}
});
test('los perfiles WebGPU limitan luces y dejan SSR solo en alta',()=>{
 assert.deepEqual(['baja','media','alta'].map(q=>GRAPHICS_PROFILES[q].localLights),[16,48,96]);assert.equal(GRAPHICS_PROFILES.alta.ssr,true);assert.equal(GRAPHICS_PROFILES.media.ssr,false);assert.equal(GRAPHICS_PROFILES.baja.bloom,false);
 const scene=new THREE.Scene(),lights=new LocalLights(scene);lights.setQuality('baja');const spot=new THREE.SpotLight('white',650,30);spot.position.set(2,1,0);spot.target.position.set(10,0,0);scene.add(spot,spot.target);lights.update(0,new THREE.Vector3());assert.ok(lights.spotPool.some(s=>s.intensity===650));assert.ok(lights.pool.every(s=>s.intensity===0));lights.dispose();
});

test('las sombras solares se desactivan de noche y regresan de dia segun calidad',()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog('black',1,100);
 const fake={scene,quality:'alta',sun:new THREE.DirectionalLight(),ambient:new THREE.HemisphereLight(),night:{value:0},sky:{sunPosition:{value:new THREE.Vector3()},cloudCoverage:{},cloudDensity:{}},bake(){}};
 Atmosphere.prototype.update.call(fake,22,.6);assert.equal(fake.sun.castShadow,false);
 Atmosphere.prototype.update.call(fake,12,0);assert.equal(fake.sun.castShadow,true);
 fake.quality='baja';Atmosphere.prototype.update.call(fake,12,0);assert.equal(fake.sun.castShadow,false);
});
