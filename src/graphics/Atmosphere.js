// Sky/PMREM/SunLight arrangement adapted from Slop New York 1b54e165 (MIT).
import * as THREE from 'three/webgpu';
import {SkyMesh} from 'three/addons/objects/SkyMesh.js';
import {SunLight} from 'three/addons/lights/SunLight.js';
import {SunLightNode} from 'three/addons/lights/SunLightNode.js';
import {uniform,mix,vec4,float} from 'three/tsl';
import {cityUniforms} from './GraphicsState.js';
export function atmosphericState(hour,wetness=0){
  const h=((hour%24)+24)%24,day=THREE.MathUtils.smoothstep(h,5.5,8)*(1-THREE.MathUtils.smoothstep(h,17.5,19.5));
  const warm=Math.max(0,1-Math.min(Math.abs(h-6.5),Math.abs(h-18))/1.8);
  return {day,warm,night:1-day,clouds:THREE.MathUtils.clamp(.3+wetness*.55,0,1),sun:day*(5.5-wetness*2.4)+.22,ambient:.55+day*.9};
}
export class Atmosphere {
  constructor(scene,renderer,ambient){
    this.scene=scene;this.renderer=renderer;this.ambient=ambient;this.envScene=new THREE.Scene();
    renderer.library.addLight(SunLightNode,SunLight);
    this.sun=new SunLight(0xffedce,4);this.sun.castShadow=true;this.sun.shadow.camera.far=140;this.sun.shadow.normalBias=.05;
    scene.add(this.sun);
    this.sky=new SkyMesh();this.sky.name='Cielo atmosférico de Bogotá';this.sky.scale.setScalar(200000);this.sky.frustumCulled=false;
    this.sky.cloudScale.value=.00018;this.sky.cloudSpeed.value=.000015;this.sky.turbidity.value=8;this.sky.rayleigh.value=2.5;
    this.night=uniform(0);const raw=this.sky.material.colorNode;
    this.sky.material.colorNode=vec4(mix(raw.rgb.mul(.145),new THREE.Color('#0c172c'),this.night),float(1));
    scene.add(this.sky);this.pmrem=new THREE.PMREMGenerator(renderer);this.target=null;this.quality='alta';
  }
  update(hour,wetness=0){
    const p=atmosphericState(hour,wetness);this.hour=hour;this.wetness=wetness;
    this.night.value=p.night;cityUniforms.night.value=p.night;cityUniforms.uInteriorGlow.value=.25+p.night;cityUniforms.wetness.value=wetness;cityUniforms.clouds.value=p.clouds;
    this.day=p.day;this.sun.castShadow=this.quality!=='baja'&&p.day>.05;
    this.sun.intensity=p.sun;this.sun.color.set('#fff1d9').lerp(new THREE.Color('#ffb26d'),p.warm).lerp(new THREE.Color('#93b9ef'),p.night);
    const angle=(hour-6)/24*Math.PI*2;this.sun.position.set(Math.cos(angle)*.7,Math.max(.18,Math.sin(angle)),.45).normalize();this.sun.updateMatrixWorld();
    this.ambient.intensity=p.ambient;this.ambient.color.set('#a9c9ed');this.ambient.groundColor.set('#846b52');
    this.sky.sunPosition.value.copy(this.sun.position);this.sky.cloudCoverage.value=p.clouds;this.sky.cloudDensity.value=.3+wetness*.35;
    this.scene.environmentIntensity=.3+p.day*.4;
    const fog=new THREE.Color('#142337').lerp(new THREE.Color('#a8bdca'),p.day).lerp(new THREE.Color('#b59a87'),p.warm*.35);
    this.scene.background.copy(fog);this.scene.fog.color.copy(fog);
    this.scene.fog.near=35+p.day*30;this.scene.fog.far=(this.quality==='baja'?145:this.quality==='media'?200:280)*(1-wetness*.12);
    const bucket=Math.floor(hour*2)+Math.floor(wetness*4)*100;
    if(this.bucket!==bucket){this.bucket=bucket;this.bake();}
  }
  bake(){
    const position=this.sky.position.clone();this.sky.position.set(0,0,0);this.sky.showSunDisc.value=0;this.envScene.add(this.sky);
    try{this.target=this.pmrem.fromScene(this.envScene,0,.1,100,{renderTarget:this.target});this.scene.environment=this.target.texture;}
    finally{this.sky.showSunDisc.value=1;this.scene.add(this.sky);this.sky.position.copy(position);}
  }
  setQuality(level){this.quality=level;this.sun.castShadow=level!=='baja'&&(this.day??0)>.05;const size=level==='alta'?2048:1024;if(this.sun.shadow.mapSize.x!==size){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(size,size);this.sun.shadow.needsUpdate=true;}}
  followTarget(position){this.sky.position.copy(position);}
  dispose(){this.sky.removeFromParent();this.sky.geometry.dispose();this.sky.material.dispose();this.sun.removeFromParent();this.sun.dispose();this.target?.dispose();this.pmrem.dispose();}
}
