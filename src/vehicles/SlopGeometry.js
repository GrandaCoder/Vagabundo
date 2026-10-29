// Adapted from mrdoob/slop-newyork 09d27e050d1e75b7a0eea29a82e81aa4646f28e9.
// Copyright (c) 2026 Mr.doob. MIT; see THIRD_PARTY_NOTICES.md.
// Compatibility surface for Bogotá's simulation; all geometry comes from the current donor.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BODY_SPECS,buildCarGeometry as carGeometry,buildCarProxyGeometry as carProxy,buildSteerableWheelGeo} from './donor/cars.js';
import {BUS_SPEC,buildLoftedBusBodyGeometry,buildBusWheelGeo} from './donor/bus.js';
import {part} from './donor/vehicles.js';
export {CAR_PARTS,carLayout} from './donor/cars.js';
export {BUS_SPEC,BODY_SPECS};
BODY_SPECS.police={...BODY_SPECS.sedan,name:'police'};
BODY_SPECS.police_suv={...BODY_SPECS.suv,name:'police_suv'};
BODY_SPECS.bus=BUS_SPEC;
export function buildCarGeometry(spec,wheels=true,mirrors=false){
 if(spec.name!=='bus')return carGeometry(spec,wheels,mirrors);
 const pieces=[buildLoftedBusBodyGeometry()];
 if(wheels)for(const side of [-1,1])for(const z of [-spec.wheelZ,spec.wheelZ])pieces.push(buildBusWheelGeo(side).translate(side*spec.wheelX,spec.wheelRadius,z));
 const merged=mergeGeometries(pieces);pieces.forEach(p=>p.dispose());return merged;
}
export function buildCarProxyGeometry(spec){return spec.name==='bus'?part(new THREE.BoxGeometry(2.6,2.7,12.12).translate(0,1.65,-.16),0):carProxy(spec);}
export function buildWheelParts(spec,side){return [spec.name==='bus'?buildBusWheelGeo(side):buildSteerableWheelGeo(spec,side)];}
