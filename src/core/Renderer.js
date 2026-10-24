import {prepareSceneTextures} from './TextureBudget.js';
import {collectShaderWarmupJobs,compileShaderJobs} from './ShaderWarmup.js';
import {syncVehicleBatches,disposeVehicleBatches} from '../vehicles/VehicleBatches.js';
import {ClusteredLighting} from 'three/addons/lighting/ClusteredLighting.js';
import {VisualPipeline} from '../graphics/VisualPipeline.js';
import * as THREE from 'three/webgpu';
import { createWebGPURenderer,initializeWebGPU,WEBGPU_QUALITY_KEY } from './WebGPU.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PlayerSilhouette } from './PlayerSilhouette.js';
import { AdaptiveResolution } from './AdaptiveResolution.js';
import { FrustumCulling } from './FrustumCulling.js';
import { paintLoadingFrame } from '../ui/LoadingScreen.js';
import { GRAPHICS_PROFILES, effectiveQuality } from './GraphicsQuality.js';

export class Renderer {
  constructor(canvas) {
    this.instance = createWebGPURenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.resolution = new AdaptiveResolution(window.devicePixelRatio);
    this.instance.setPixelRatio(this.resolution.ratio);
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;

    // Look realista: tone mapping fílmico
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.05;
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.silhouette = new PlayerSilhouette();
    this.culling = new FrustumCulling();
    // El contador incluye las tres pasadas, no solo la última del personaje.
    this.instance.info.autoReset = false;

    this._resizeListener=()=>this._onResize();this._visibilityListener=()=>this.resolution.resetWindow();
    window.addEventListener('resize',this._resizeListener);document.addEventListener('visibilitychange',this._visibilityListener);
  }

  setQuality(level = 'alta', persist = true) {
    this.quality = ['baja', 'media', 'alta'].includes(level) ? level : 'alta';
    const limit = GRAPHICS_PROFILES[this.quality].pixelRatio;
    this.resolution.setLimit(Math.min(globalThis.window?.devicePixelRatio || 1, limit));
    this.instance.setPixelRatio(this.resolution.ratio);
    this.instance.shadowMap.enabled = this.effectiveQuality !== 'baja';
    this.instance.shadowMap.needsUpdate = true;
    try { if(persist)localStorage.setItem(WEBGPU_QUALITY_KEY, this.quality); } catch { /* sin almacenamiento */ }
  }

  get effectiveQuality() { return effectiveQuality(this.quality ?? 'alta', this.resolution?.pressure ?? 0); }

  /** Mapa de entorno neutro: da reflejos (charcos, vidrios) y luz rebotada a los materiales PBR */
  createEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.instance);
    const room=new RoomEnvironment();
    const target=pmrem.fromScene(room, 0.04);
    const tex=target.texture;this.environment=target;room.dispose();
    pmrem.dispose();
    return tex;
  }

  _onResize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);
  }

  async prepare(scene, camera, extraModels = []) {
    const started=performance.now();
    console.info('[WebGPU] Preparando recursos');
    syncVehicleBatches(scene,camera);
    const budget=await prepareSceneTextures([scene,...extraModels]);
    const textures=budget.textures;this.textureStats={unique:textures.size,resized:budget.resized,reused:budget.reused,prepareMs:performance.now()-started};
    console.info('[WebGPU] Texturas únicas',this.textureStats);
    let uploaded = 0, lastYield = performance.now();
    for (const texture of textures) {
      this.instance.initTexture(texture);
      uploaded++;
      if (performance.now()-lastYield>32){this.onPrepareProgress?.(`Texturas WebGPU: ${uploaded}/${textures.size}`);await paintLoadingFrame();lastYield=performance.now();}
    }
    this.textureStats.uploadMs=performance.now()-started-this.textureStats.prepareMs;
    if(this.instance.backend?.isWebGPUBackend)return this._compileWebGPU(scene,camera,extraModels);
    let target,targets;
    if(this.instance.backend?.isWebGPUBackend){
      this._ensurePipeline(scene,camera);target=this.instance.getRenderTarget();targets=this.instance.getMRT();this.instance.setRenderTarget(this.pipeline.scenePass.renderTarget);this.instance.setMRT(this.pipeline.scenePass.getMRT());
    }
    try{await this.instance.compileAsync(scene, camera);
    // Referencias temporales: no cambia los padres ni el LOD visible de cada NPC.
    const models = new THREE.Group();
    models.children = extraModels;
    try { await this.instance.compileAsync(models, camera, scene); }
    finally { models.children = []; }
    }finally{if(this.instance.backend?.isWebGPUBackend){this.instance.setRenderTarget(target);this.instance.setMRT(targets);}}
  }

  async _compileWebGPU(scene,camera,extraModels){
    const started=performance.now();
    this._ensurePipeline(scene,camera);
    const visible=scene.visible;scene.visible=false;
    try{this.pipeline.render(this.hour??22);}finally{scene.visible=visible;}
    const renderer=this.instance,target=renderer.getRenderTarget(),targets=renderer.getMRT(),culled=[];
    const {jobs,objects}=collectShaderWarmupJobs([scene,...extraModels]);
    this.startupStats={shaderFamilies:jobs.length,renderObjects:objects,textures:this.textureStats};
    console.info('[WebGPU] Familias gráficas',this.startupStats);
    this.onPrepareProgress?.(`Shaders TSL: 0/${jobs.length} familias`);
    renderer.setRenderTarget(this.pipeline.scenePass.renderTarget);renderer.setMRT(this.pipeline.scenePass.getMRT());
    try{await compileShaderJobs(jobs,async object=>{
      culled.push([object,object.frustumCulled]);object.frustumCulled=false;await renderer.compileAsync(object,camera,scene);
    },{concurrency:4,onProgress:(done,total)=>this.onPrepareProgress?.(`Shaders TSL: ${done}/${total} familias`)});}
    finally{for(const [object,value] of culled)object.frustumCulled=value;renderer.setRenderTarget(target);renderer.setMRT(targets);}
    this.startupStats.compileMs=performance.now()-started;
  }

  prepareDynamic(root,scene,camera,decorate=()=>{}){
    const prepare=async()=>{
      if(this._disposed)return;
      const budget=await prepareSceneTextures([root]);decorate(root);
      for(const texture of budget.textures)this.instance.initTexture(texture);
      this._ensurePipeline(scene,camera);
      const target=this.instance.getRenderTarget(),targets=this.instance.getMRT();let pending;
      try{
        this.instance.setRenderTarget(this.pipeline.scenePass.renderTarget);this.instance.setMRT(this.pipeline.scenePass.getMRT());
        pending=this.instance.compileAsync(root,camera,scene);
      }finally{this.instance.setRenderTarget(target);this.instance.setMRT(targets);}
      await pending;
    };
    const pending=(this._dynamicQueue??Promise.resolve()).then(prepare);this._dynamicQueue=pending.catch(()=>{});return pending;
  }

  async initialize() {
    return this._initialization ??= initializeWebGPU(this.instance).then(()=>{
      this.instance.onDeviceLost=info=>this.onDeviceLost?.(info);
      this.instance.lighting=new ClusteredLighting(256,32,28,48);
      return this;
    });
  }

  async waitForGPU() {
    await this.instance.backend.device.queue.onSubmittedWorkDone();
  }

  dispose() {
    this._disposed=true;
    window.removeEventListener('resize',this._resizeListener);document.removeEventListener('visibilitychange',this._visibilityListener);this.silhouette.material.dispose();
    if(this._pipelineScene)disposeVehicleBatches(this._pipelineScene);
    this.pipeline?.dispose();this.environment?.dispose();this.instance.dispose();
  }

  _ensurePipeline(scene,camera){
    if(!this.pipeline||this.pipeline.quality!==this.effectiveQuality||this._pipelineScene!==scene||this._pipelineCamera!==camera){
      this.pipeline?.dispose();this._pipelineScene=scene;this._pipelineCamera=camera;
      this.pipeline=new VisualPipeline(this.instance,scene,camera,this.effectiveQuality,()=>{
        if(this._overlayRoot&&this._overlayEnabled)this.silhouette.render(this.instance,scene,camera,this._overlayRoot,this.overlayLights);
      });
    }
  }

  render(scene, camera, playerRoot = null, shadowLights = [], showSilhouette = true) {
    syncVehicleBatches(scene,camera);
    this.instance.info.reset();
    this.culling.apply(camera, this.instance.shadowMap.enabled ? shadowLights : []);
    try {
      if(this.instance.backend?.isWebGPUBackend){
      this._ensurePipeline(scene,camera);
      this._overlayRoot=playerRoot;this._overlayEnabled=showSilhouette&&GRAPHICS_PROFILES[this.effectiveQuality].silhouette;
      this.pipeline.render(this.hour??22);
      } else {this.instance.render(scene,camera);}
      if (!this.pipeline && playerRoot && showSilhouette && GRAPHICS_PROFILES[this.effectiveQuality].silhouette) {
        this.silhouette.render(this.instance, scene, camera, playerRoot, this.overlayLights);
      }
    } finally {
      this.culling.restore();
    }
  }

  adaptResolution(frameMs) {
    if (this.resolution.sample(frameMs)) {
      if (this.instance.getPixelRatio() !== this.resolution.ratio) this.instance.setPixelRatio(this.resolution.ratio);
      const shadows = this.effectiveQuality !== 'baja';
      if (this.instance.shadowMap.enabled !== shadows) {
        this.instance.shadowMap.enabled = shadows;
        this.instance.shadowMap.needsUpdate = true;
      }
    }
  }
}
