import * as THREE from 'three/webgpu';
import { SunShadowNode } from 'three/addons/lights/SunShadowNode.js';
import { peekShadowCadence } from './ShadowCadence.js';

// Parche de SunShadowNode.renderShadow: con la cascada lejana en pausa solo se redibuja la cercana (ver ShadowCadence.js).
let resetScene = null, resetCamera = null;

/** Escribe la profundidad de fondo en la mitad del atlas que se va a volver a dibujar. */
function resetViewportDepth(renderer) {
  if (!resetScene) {
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorWrite = false;
    material.depthTest = false;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.position.z = -0.99999;
    quad.frustumCulled = false;
    resetScene = new THREE.Scene();
    resetScene.add(quad);
    resetCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  renderer.render(resetScene, resetCamera);
}

const renderFull = SunShadowNode.prototype.renderShadow;

SunShadowNode.prototype.renderShadow = function (frame) {
  const cadence = peekShadowCadence(this.shadow), { renderer } = frame;
  if (!cadence || cadence.renderFar || renderer.reversedDepthBuffer) {
    renderFull.call(this, frame);
    if (cadence) cadence.full = false;
    return;
  }
  const { shadow, shadowMap, light } = this, { scene, camera } = frame;
  shadow.updateMatrices(light, camera);
  const tileWidth = shadow.mapSize.width, tileHeight = shadow.mapSize.height, viewport = shadow.getViewport(0);
  const previousName = scene.name;
  scene.name = `Shadow Map [ ${light.name || 'ID: ' + light.id} ] · cercana`;
  renderer.autoClear = false;
  shadowMap.viewport.set(tileWidth * viewport.x, shadowMap.height - tileHeight * (viewport.y + viewport.w), tileWidth * viewport.z, tileHeight * viewport.w);
  resetViewportDepth(renderer);
  renderer.render(scene, shadow.getCamera(0));
  scene.name = previousName;
};
