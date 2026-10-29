// Adapted from mrdoob/slop-newyork 09d27e050d1e75b7a0eea29a82e81aa4646f28e9.
// Copyright (c) 2026 Mr.doob. MIT; see THIRD_PARTY_NOTICES.md.
import {createLoftedCarMaterial,carStyleCode} from './donor/cars.js';
import {createLoftedBusMaterial,createBusWheelMaterial} from './donor/bus.js';
export {carStyleCode};
export function vehicleStyle(variant,seed=0){return carStyleCode({livery:variant.startsWith('police')?1:0,metallic:Math.abs(seed)%2,trim:Math.abs(seed)%3,wheel:Math.abs(seed)%4});}
export function createSlopMaterial(spec,paint=null){
 const mat=spec.name==='bus'?createLoftedBusMaterial(paint):createLoftedCarMaterial(spec,paint);
 mat.name=spec.name+' · Slop 09d27e0';mat.userData.shaderFamily='slop-current:'+spec.name+':'+(paint===null?'batch':'fixed');
 return mat;
}
export function createVehicleWheelMaterial(spec){return spec.name==='bus'?createBusWheelMaterial().clone():createSlopMaterial(spec,'#bfc5cb');}
