import * as THREE from 'three/webgpu';
import {BODY_SPECS,buildCarProxyGeometry} from './SlopGeometry.js';
import {createSlopMaterial} from './SlopMaterial.js';
const banks=new WeakMap(),zero=new THREE.Matrix4().makeScale(0,0,0);
const CAPACITY=256;
export class VehicleBatches {
  constructor(scene){this.scene=scene;this.entries=new Set();this.types=new Map();this.root=new THREE.Group();this.root.name='Vehículos agrupados WebGPU';this.root.userData.noMerge=true;scene.add(this.root);this.position=new THREE.Vector3();this._disposed=false;}
  type(variant,geometry){
    if(this.types.has(variant))return this.types.get(variant);
    const material=createSlopMaterial(BODY_SPECS[variant],null);
    const make=geo=>{
      const mesh=new THREE.InstancedMesh(geo,material,CAPACITY);mesh.name=`${variant} · instancias`;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.instanceMatrix=new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array,16);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for(const [name,size] of [['paintColor',3],['carState',4],['wheelAngle',1],['carNight',1]])geo.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY*size),size).setUsage(THREE.DynamicDrawUsage));
      this.root.add(mesh);return mesh;
    };
    const type={near:make(geometry.clone()),far:make(buildCarProxyGeometry(BODY_SPECS[variant])),material};this.types.set(variant,type);return type;
  }
  add(visual,mesh,variant){
    if(this.entries.size>=CAPACITY)throw new Error('Se alcanzó el banco de vehículos');
    const type=this.type(variant,mesh.geometry),entry={visual,mesh,type};this.entries.add(entry);mesh.visible=false;
    return ()=>{this.entries.delete(entry);};
  }
  ensureMirrors(visual){
    const source=visual.mirrorGroups?.[0];if(!source||this.mirrors)return;
    this.mirrors=source.children.filter(m=>m.isMesh).map(source=>{
      const mesh=new THREE.InstancedMesh(source.geometry.clone(),source.material.clone(),CAPACITY*2);mesh.count=0;mesh.name='Retrovisores robables agrupados';mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.instanceMatrix=new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array,16);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;
    });
  }
  sync(camera){
    for(const type of this.types.values()){type.near.count=0;type.far.count=0;}
    camera?.getWorldPosition(this.position);
    for(const mesh of this.mirrors??[])mesh.count=0;
    for(const {visual,mesh,type} of this.entries){
      if(!visual.group.parent)continue;let visible=true;for(let p=visual.group;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)continue;
      mesh.updateWorldMatrix(true,false);const distance=this.position.distanceToSquared(mesh.getWorldPosition(this._p??=new THREE.Vector3()));if(camera&&distance>280*280)continue;
      const target=camera&&distance>85*85?type.far:type.near,i=target.count++,state=visual.material.userData.vehicleState;
      this.ensureMirrors(visual);
      if(distance<70*70)for(const mirror of visual.mirrorGroups??[])if(mirror.visible){mirror.children.filter(m=>m.isMesh).forEach((source,j)=>{const batch=this.mirrors[j];source.updateWorldMatrix(true,false);batch.setMatrixAt(batch.count++,source.matrixWorld);});}
      target.setMatrixAt(i,mesh.matrixWorld);const g=target.geometry.attributes,c=state.paint.value;
      g.paintColor.setXYZ(i,c.r,c.g,c.b);g.carState.setXYZW(i,state.braking.value,visual.turnSignal>0?1:0,visual.turnSignal<0?1:0,0);g.wheelAngle.setX(i,state.wheelAngle.value);g.carNight.setX(i,state.night.value);
    }
    for(const mesh of this.mirrors??[])mesh.instanceMatrix.needsUpdate=true;
    for(const type of this.types.values())for(const mesh of [type.near,type.far]){mesh.instanceMatrix.needsUpdate=true;for(const key of ['paintColor','carState','wheelAngle','carNight'])mesh.geometry.attributes[key].needsUpdate=true;}
  }
  dispose(){if(this._disposed)return;this._disposed=true;this.root.removeFromParent();for(const type of this.types.values()){type.near.dispose();type.far.dispose();type.near.geometry.dispose();type.far.geometry.dispose();type.material.dispose();}for(const mesh of this.mirrors??[]){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}this.types.clear();this.entries.clear();banks.delete(this.scene);}
}
export function vehicleBatches(scene){let bank=banks.get(scene);if(!bank){bank=new VehicleBatches(scene);banks.set(scene,bank);}return bank;}
export function syncVehicleBatches(scene,camera){banks.get(scene)?.sync(camera);}
export function disposeVehicleBatches(scene){banks.get(scene)?.dispose();}
