import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as THREE from 'three';
import { SceneManager } from '../src/core/Scene.js';
import { isShadowActive } from '../src/graphics/ShadowState.js';

test('SceneManager ajusta sombras y niebla según nivel de calidad gráfica', () => {
  const sceneMgr = new SceneManager();
  assert.equal(sceneMgr.sun.castShadow, true);

  // Calidad baja: pausa la sombra sin cambiar castShadow (cambiarlo reconstruye toda la escena)
  sceneMgr.setQuality('baja');
  assert.equal(sceneMgr.sun.castShadow, true);
  assert.equal(isShadowActive(sceneMgr.sun), false);
  assert.equal(sceneMgr.sun.shadow.intensity, 0);
  assert.equal(sceneMgr.scene.fog.near, 40);

  // Calidad media: sombras ligeras; la resolución solo cambia con la elección manual
  sceneMgr.setQuality('media');
  assert.equal(isShadowActive(sceneMgr.sun), true);
  assert.equal(sceneMgr.sun.shadow.mapSize.x, 2048);
  sceneMgr.setShadowResolution('media');
  assert.equal(sceneMgr.sun.shadow.mapSize.x, 1024);

  // Calidad alta: sombras nítidas
  sceneMgr.setQuality('alta');sceneMgr.setShadowResolution('alta');
  assert.equal(isShadowActive(sceneMgr.sun), true);
  assert.equal(sceneMgr.sun.shadow.intensity, 1);
  assert.equal(sceneMgr.sun.shadow.mapSize.x, 2048);
});
