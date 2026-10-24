import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareSceneTextures,resizeTexture,textureAssetKey} from '../src/core/TextureBudget.js';
const canvas=(w,h)=>({width:w,height:h,getContext:()=>({drawImage(){}})});
test('las imágenes grandes se reducen conservando proporción, orientación y espacio de color',()=>{
 const t=new THREE.Texture({width:4096,height:2048});t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;assert.equal(resizeTexture(t,1024,canvas),true);assert.equal(t.image.width,1024);assert.equal(t.image.height,512);assert.equal(t.flipY,false);assert.equal(t.colorSpace,THREE.SRGBColorSpace);assert.equal(resizeTexture(t,1024,canvas),false);
 const data=new THREE.DataTexture(new Uint8Array(16),2,2);assert.equal(resizeTexture(data,1,canvas),false);
});
test('el mismo recurso de ropa comparte textura, pero no mezcla color, UV o imágenes diferentes',async()=>{
 const scene=new THREE.Group(),a=new THREE.Texture({width:4096,height:4096}),b=new THREE.Texture({width:4096,height:4096}),c=b.clone();
 a.userData.assetUrl=b.userData.assetUrl=c.userData.assetUrl='/models/personaje/texturas/normal.webp';c.colorSpace=THREE.SRGBColorSpace;
 const materials=[a,b,c].map(map=>new THREE.MeshStandardMaterial({normalMap:map}));materials.forEach(m=>scene.add(new THREE.Mesh(new THREE.BoxGeometry(),m)));
 const result=await prepareSceneTextures([scene],{assets:new Map(),makeCanvas:canvas,yieldTask:async()=>{}});assert.equal(result.textures.size,2);assert.equal(result.reused,1);assert.equal(result.resized,2);assert.equal(materials[0].normalMap,materials[1].normalMap);assert.notEqual(materials[0].normalMap,materials[2].normalMap);
 const different=a.clone();different.repeat.x=2;assert.notEqual(textureAssetKey(a),textureAssetKey(different));different.userData.assetUrl='/models/other.webp';assert.notEqual(textureAssetKey(a),textureAssetKey(different));
});
