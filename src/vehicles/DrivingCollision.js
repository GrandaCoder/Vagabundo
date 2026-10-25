import * as THREE from 'three';
/** Oriented footprint against static boxes and oriented buses, with vertical separation. */
export function vehicleIntersects(car,position,yaw,entry){
 if(entry.vehicle===car)return false;
 const box=entry.box;if(position.y>=box.max.y-.08||position.y+1.5<=box.min.y+.02)return false;
 const u=new THREE.Vector2(Math.cos(yaw),-Math.sin(yaw)),v=new THREE.Vector2(-u.y,u.x);
 const center=entry.obb?new THREE.Vector2(entry.obb.center.x,entry.obb.center.z):new THREE.Vector2((box.min.x+box.max.x)/2,(box.min.z+box.max.z)/2);
 const a=entry.obb?new THREE.Vector2(entry.obb.axes[0].x,entry.obb.axes[0].z).normalize():new THREE.Vector2(1,0);
 const b=entry.obb?new THREE.Vector2(entry.obb.axes[2].x,entry.obb.axes[2].z).normalize():new THREE.Vector2(0,1);
 const hx=entry.obb?entry.obb.halfSize.x:(box.max.x-box.min.x)/2,hz=entry.obb?entry.obb.halfSize.z:(box.max.z-box.min.z)/2;
 const d=new THREE.Vector2(position.x-center.x,position.z-center.y);
 for(const axis of [u,v,a,b]){
  const r=car.length/2*Math.abs(u.dot(axis))+car.width/2*Math.abs(v.dot(axis));
  const other=hx*Math.abs(a.dot(axis))+hz*Math.abs(b.dot(axis));
  if(Math.abs(d.dot(axis))>=r+other-.02)return false;
 }return true;
}
export function vehicleBlocked(car,position,yaw,collisions){
 const r=Math.hypot(car.length,car.width)/2;
 const entries=collisions.queryStatic(position.x-r,position.z-r,position.x+r,position.z+r,[]);
 return entries.some(e=>vehicleIntersects(car,position,yaw,e))||(collisions.dynamicColliders??[]).some(e=>vehicleIntersects(car,position,yaw,e));
}
