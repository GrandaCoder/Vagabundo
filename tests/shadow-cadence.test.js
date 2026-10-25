import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { advanceShadowCadence, installShadowCadence, requestFullShadowUpdate, shadowCadence } from '../src/graphics/ShadowCadence.js';
import { setShadowActive } from '../src/graphics/ShadowState.js';
import { FrustumCulling } from '../src/core/FrustumCulling.js';

function fakeSun() {
  const shadow = {
    autoUpdate: true, intensity: 1, needsUpdate: false, calls: 0,
    _matrices: [new THREE.Matrix4(), new THREE.Matrix4()],
    updateMatrices() { this.calls++; this._matrices[1].makeTranslation(this.calls, 0, 0); },
    getFrustum: () => new THREE.Frustum()
  };
  return { castShadow: true, visible: true, isSunLight: true, shadow };
}

test('la cascada lejana se dibuja un cuadro de cada dos tras el primero completo', () => {
  const sun = fakeSun();
  const pattern = Array.from({ length: 6 }, () => advanceShadowCadence(sun));
  assert.deepEqual(pattern, [true, true, true, true, true, true], 'mientras no se confirme el cuadro completo se dibujan las dos');
  shadowCadence(sun).full = false;
  assert.deepEqual(Array.from({ length: 6 }, () => advanceShadowCadence(sun)).map(Boolean), [false, true, false, true, false, true].map((v, i) => (shadowCadence(sun).frame - 6 + i + 1) % 2 === 0));
});

test('con la lejana en pausa se conserva su matriz y las demás se actualizan', () => {
  const sun = fakeSun(), cadence = shadowCadence(sun);
  installShadowCadence(sun);
  installShadowCadence(sun);
  cadence.full = false;
  cadence.renderFar = true;
  sun.shadow.updateMatrices(sun, null);
  const drawn = sun.shadow._matrices[1].clone();
  cadence.renderFar = false;
  sun.shadow.updateMatrices(sun, null);
  sun.shadow.updateMatrices(sun, null);
  assert.ok(sun.shadow._matrices[1].equals(drawn), 'la matriz con la que se dibujó el atlas se conserva');
  assert.equal(sun.shadow.calls, 3, 'las matrices cercanas sí se recalculan en cada llamada');
  cadence.renderFar = true;
  sun.shadow.updateMatrices(sun, null);
  assert.ok(!sun.shadow._matrices[1].equals(drawn), 'al volver a dibujarla usa la matriz nueva');
});

test('activar la sombra o cambiar su resolución exige un cuadro completo', () => {
  const sun = fakeSun(), cadence = shadowCadence(sun);
  cadence.full = false;
  setShadowActive(sun, false);
  setShadowActive(sun, true);
  assert.equal(cadence.full, true);
  cadence.full = false;
  requestFullShadowUpdate(sun);
  assert.equal(cadence.full, true);
});

test('el descarte solo conserva lo que ve la cascada lejana en los cuadros en que se dibuja', () => {
  const culling = new FrustumCulling(), sun = fakeSun(), camera = new THREE.PerspectiveCamera();
  const seen = [];
  const original = sun.shadow.getFrustum;
  sun.shadow.getFrustum = index => { seen.push(index); return original(); };
  shadowCadence(sun).full = false;
  const counts = [];
  for (let i = 0; i < 4; i++) { seen.length = 0; culling.apply(camera, [sun]); counts.push(culling.shadowFrustums.length); }
  assert.deepEqual(counts.sort(), [1, 1, 2, 2]);
});
