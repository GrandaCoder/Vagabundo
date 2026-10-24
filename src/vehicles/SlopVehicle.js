import {vehicleBatches} from './VehicleBatches.js';
import * as THREE from 'three';
import { BODY_SPECS,buildCarGeometry } from './SlopGeometry.js';
import { createSlopMaterial } from './SlopMaterial.js';

const geometries=new Map();
const PAINTS=['#e0dfd5','#aeb6be','#25292d','#8d2929','#254f73','#506542','#88847b','#d2c9ae'];
export function createSlopVehicle({variant='sedan',seed=0,length=4.3,width=1.76,scene=null,mirrors=[]}={}) {
  const spec=BODY_SPECS[variant];if(!['sedan','taxi'].includes(variant))throw new Error('Tipo de vehículo no disponible');
  if(!geometries.has(variant)){
    const geometry=buildCarGeometry(spec,true,false);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.set(variant,geometry);
  }
  const geometry=geometries.get(variant),size=geometry.boundingBox.getSize(new THREE.Vector3());
  const material=createSlopMaterial(spec,variant==='taxi'?'#edbd18':PAINTS[Math.abs(seed)%PAINTS.length]);
  const mesh=new THREE.Mesh(geometry,material);mesh.rotation.y=Math.PI/2;mesh.castShadow=mesh.receiveShadow=true;
  const group=new THREE.Group();group.name=variant==='taxi'?'Taxi bogotano procedural':'Sedán procedural';
  group.scale.set(length/size.z,(variant==='taxi'?1.45:1.75)/size.y,width/size.x);
  // La carrocería original está centrada en X/Z y apoyada en Y=0.
  group.add(mesh);const state=material.userData.vehicleState;
  let disposed=false;
  const visual={group,wheels:[],tailMat:null,variant,material,
    updateMotion(distance,braking){state.wheelAngle.value=(state.wheelAngle.value+distance/(spec.wheelRadius*group.scale.y))%(Math.PI*2);state.braking.value=braking?1:0;},
    setNight(night){state.night.value=night?1:0;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();material.dispose();}
  };
  if(scene){
    const bank=vehicleBatches(scene),release=bank.add(visual,mesh,variant);visual.mirrorGroups=mirrors;
    const dispose=visual.dispose;let active=false;
    visual.activate=()=>{active=true;for(const mirror of mirrors)for(const child of mirror.children)child.visible=false;};
    visual.dispose=()=>{release();if(active)for(const mirror of mirrors)for(const child of mirror.children)child.visible=true;dispose();};
  }
  return visual;
}
