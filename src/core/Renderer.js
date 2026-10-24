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

    window.addEventListener('resize', () => this._onResize());
    document.addEventListener('visibilitychange', () => this.resolution.resetWindow());
  }

  setQuality(level = 'alta') {
    this.quality = ['baja', 'media', 'alta'].includes(level) ? level : 'alta';
    const limit = GRAPHICS_PROFILES[this.quality].pixelRatio;
    this.resolution.setLimit(Math.min(globalThis.window?.devicePixelRatio || 1, limit));
    this.instance.setPixelRatio(this.resolution.ratio);
    this.instance.shadowMap.enabled = this.effectiveQuality !== 'baja';
    this.instance.shadowMap.needsUpdate = true;
    try { localStorage.setItem(WEBGPU_QUALITY_KEY, this.quality); } catch { /* sin almacenamiento */ }
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
    const textures = new Set();
    for (const root of [scene, ...extraModels]) root.traverse(object => {
      for (const material of [object.material].flat().filter(Boolean)) {
        for (const value of Object.values(material)) {
          if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
        }
      }
    });
    let uploaded = 0;
    for (const texture of textures) {
      this.instance.initTexture(texture);
      if (++uploaded % 8 === 0) await paintLoadingFrame();
    }
    await this.instance.compileAsync(scene, camera);
    // Referencias temporales: no cambia los padres ni el LOD visible de cada NPC.
    const models = new THREE.Group();
    models.children = extraModels;
    try { await this.instance.compileAsync(models, camera, scene); }
    finally { models.children = []; }
  }

  async initialize() {
    return this._initialization ??= initializeWebGPU(this.instance).then(()=>{
      this.instance.onDeviceLost=info=>this.onDeviceLost?.(info);
      return this;
    });
  }

  async waitForGPU() {
    await this.instance.backend.device.queue.onSubmittedWorkDone();
  }

  dispose() {
    this.pipeline?.dispose();this.environment?.dispose();this.instance.dispose();
  }

  render(scene, camera, playerRoot = null, shadowLights = [], showSilhouette = true) {
    this.instance.info.reset();
    this.culling.apply(camera, this.instance.shadowMap.enabled ? shadowLights : []);
    try {
      this.instance.render(scene, camera);
      if (playerRoot && showSilhouette && GRAPHICS_PROFILES[this.effectiveQuality].silhouette) {
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
