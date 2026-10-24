import * as THREE from 'three';
import { carLayout } from './SlopGeometry.js';

let labels;
function labelTexture() {
  if(labels)return labels;
  if(typeof document==='undefined') {
    labels=new THREE.DataTexture(new Uint8Array([255,240,190,255]),1,1);labels.needsUpdate=true;return labels;
  }
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff0b8';ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#151719';ctx.font='900 106px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('TAXI',256,68);
  ctx.fillStyle='#edb326';ctx.fillRect(0,128,512,128);
  ctx.fillStyle='#151719';ctx.font='bold 82px monospace';ctx.fillText('BOG 123',256,198);
  labels=new THREE.CanvasTexture(canvas);labels.colorSpace=THREE.SRGBColorSpace;return labels;
}
const f=n=>`(${Number(n).toFixed(7)})`;
function polygonMask(points,expression,inset=.035) {
  const center=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  const distances=points.map((a,i)=>{
    const b=points[(i+1)%points.length];let nx=-(b[1]-a[1]),ny=b[0]-a[0];const length=Math.hypot(nx,ny);nx/=length;ny/=length;
    if((center[0]-a[0])*nx+(center[1]-a[1])*ny<0){nx=-nx;ny=-ny;}
    return `(dot(${expression},vec2(${f(nx)},${f(ny)}))-${f(nx*a[0]+ny*a[1]+inset)})`;
  });
  return `smoothstep(0.0,0.008,${distances.reduce((a,b)=>`min(${a},${b})`)})`;
}

/** PBR WebGL: pintura, cristales y detalles en una sola malla, sin TSL. */
export function createSlopMaterial(spec,paint) {
  const L=carLayout(spec),cab=spec.cabin,bc=L.belt.cowl,bd=L.belt.deck,rf=L.rail.front,rm=L.rail.mid,rr=L.rail.rear;
  const side=polygonMask([[cab.cowl,bc.y],[cab.roofFront,rf.y],[L.rail.roofMid,rm.y],[cab.roofRear,rr.y],[cab.deck,bd.y]],'vec2(p.z,p.y)');
  const front=polygonMask([[-1,cab.cowl],[-1,cab.roofFront],[rf.x,cab.roofFront],[bc.x,cab.cowl]],'vec2(abs(p.x),p.z)');
  const rear=polygonMask([[-1,cab.roofRear],[-1,cab.deck],[bd.x,cab.deck],[rr.x,cab.roofRear]],'vec2(abs(p.x),p.z)');
  const state={wheelAngle:{value:0},braking:{value:0},night:{value:0},paint:{value:new THREE.Color(paint)},labels:{value:labelTexture()},taxi:{value:spec.sign?1:0}};
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',metalness:.35,roughness:.32});
  material.name='Carrocería procedural BAZUKO';material.userData.vehicleState=state;
  material.customProgramCacheKey=()=>`bazuko-slop-car-v1-${spec.name}`;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{slopWheel:state.wheelAngle,slopBrake:state.braking,slopNight:state.night,slopPaint:state.paint,slopLabels:state.labels,slopTaxi:state.taxi});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float partId;
varying vec3 vSlopPosition;
varying vec3 vSlopNormal;
varying float vSlopPart;
uniform float slopWheel;
vec2 slopRotate(vec2 v){float c=cos(slopWheel),s=sin(slopWheel);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
if(partId>1.5 && partId<3.5) objectNormal.yz=slopRotate(objectNormal.yz);`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vSlopPosition=position;vSlopNormal=normal;vSlopPart=partId;
if(partId>1.5 && partId<3.5){vec2 axle=vec2(${f(spec.wheelRadius)},sign(position.z)*${f(spec.wheelZ)});transformed.yz=slopRotate(position.yz-axle)+axle;}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vSlopPosition;
varying vec3 vSlopNormal;
varying float vSlopPart;
uniform float slopWheel;
uniform float slopBrake;
uniform float slopNight;
uniform float slopTaxi;
uniform vec3 slopPaint;
uniform sampler2D slopLabels;
float slopPart(float id){return 1.0-step(.25,abs(vSlopPart-id));}
float slopRect(vec2 p,vec2 size){vec2 d=abs(p)-size;return 1.0-smoothstep(-.006,.006,max(d.x,d.y));}
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec3 p=vSlopPosition,n=normalize(vSlopNormal);
float body=slopPart(0.0),cabin=slopPart(1.0),tyre=slopPart(2.0),alloy=slopPart(3.0),trim=slopPart(4.0),signPart=slopPart(6.0);
float sideGlass=${side};
${cab.pillars.map(z=>`sideGlass*=smoothstep(.028,.045,abs(p.z-${f(z)}));`).join('\n')}
float glass=cabin*max(sideGlass*step(.45,abs(n.x)),max((${front})*step(.1,n.z),(${rear})*step(.1,-n.z)));
float head=body*step(${f(spec.zFront-.55)},p.z)*step(.02,n.z)*slopRect(vec2(abs(p.x)-${f(spec.headlight[0])},p.y-${f(spec.headlight[1])}),vec2(${f(spec.headlight[2])},${f(spec.headlight[3])}));
float tail=body*step(p.z,${f(spec.zRear+.55)})*step(.02,-n.z)*slopRect(vec2(abs(p.x)-${f(spec.taillight[0])},p.y-${f(spec.taillight[1])}),vec2(${f(spec.taillight[2])},${f(spec.taillight[3])}));
float frontFace=body*step(${f(spec.zFront-.5)},p.z)*step(.12,n.z),rearFace=body*step(p.z,${f(spec.zRear+.5)})*step(.12,-n.z);
float grille=frontFace*max(slopRect(vec2(p.x,p.y-${f(spec.grille[0])}),vec2(${f(spec.grille[1])},${f(spec.grille[2])})),slopRect(vec2(p.x,p.y-${f(spec.intake[0])}),vec2(${f(spec.intake[1])},${f(spec.intake[2])})));
float plateF=frontFace*slopRect(vec2(p.x,p.y-${f(spec.plates[0])}),vec2(.155,.055));
float plateR=rearFace*slopRect(vec2(p.x,p.y-${f(spec.plates[1])}),vec2(.155,.055));
float seams=0.0;
${spec.doors.map(z=>`seams=max(seams,1.0-smoothstep(.003,.009,abs(p.z-${f(z)})));`).join('\n')}
seams*=body*step(.4,abs(n.x))*step(.35,p.y)*step(p.y,.9);
vec3 col=slopPaint*(.78+.22*smoothstep(.2,.65,p.y))*(1.0-.45*seams);
col=mix(col,vec3(.018,.028,.039),glass);
col=mix(col,vec3(.008),tyre);col=mix(col,vec3(.52,.56,.6),alloy);
vec2 wheelUV=vec2(p.y-${f(spec.wheelRadius)},p.z-sign(p.z)*${f(spec.wheelZ)});
float spokes=step(.2,sin((atan(wheelUV.x,wheelUV.y)-slopWheel)*5.0));
col=mix(col,mix(vec3(.055),vec3(.65),spokes),alloy);
col=mix(col,vec3(.025),max(trim,grille));
col=mix(col,vec3(.8,.83,.79),head);col=mix(col,vec3(.55,.012,.016),tail);
vec2 plateUV=vec2(p.x/.31+.5,(p.y-mix(${f(spec.plates[0])},${f(spec.plates[1])},plateR))/.11+.5);
col=mix(col,texture2D(slopLabels,vec2(clamp(plateUV.x,0.0,1.0),clamp(plateUV.y,0.0,1.0)*.5)).rgb,max(plateF,plateR));
col=mix(col,vec3(.9,.82,.55),signPart);
// La placa superior comparte atlas con las matrículas, sin carteles extranjeros.
float signFace=signPart*step(.5,abs(n.z));
vec2 signUV=vec2(p.x*sign(n.z)/.58+.5,(p.y-${f((()=>{const c=L.cabin(cab.roofFront+(cab.roofRear-cab.roofFront)*.45);return c.railY+c.h+.105;})())})/.17+.5);
col=mix(col,texture2D(slopLabels,vec2(clamp(signUV.x,0.0,1.0),.5+clamp(signUV.y,0.0,1.0)*.5)).rgb,signFace*slopTaxi);
diffuseColor.rgb*=col;
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(.32,.12,glass);roughnessFactor=mix(roughnessFactor,.88,tyre);roughnessFactor=mix(roughnessFactor,.24,alloy);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
metalnessFactor=mix(.4,.2,glass);metalnessFactor=mix(metalnessFactor,.0,tyre);metalnessFactor=mix(metalnessFactor,.85,alloy);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=head*vec3(1.0,.88,.65)*(.12+slopNight*2.0)+tail*vec3(1.0,.015,.008)*(.2+slopNight*.35+slopBrake*2.4)+signPart*slopTaxi*vec3(.2,.15,.055)*slopNight;`);
  };
  return material;
}
