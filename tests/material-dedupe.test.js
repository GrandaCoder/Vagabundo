import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { materialSignature, MaterialDeduper } from '../src/world/bogota/StaticGeometry.js';

test('dos materiales idénticos comparten firma y uno distinto en cualquier valor visible no', () => {
  const map = new THREE.Texture();
  const a = new THREE.MeshStandardMaterial({ color: '#a5aaa5', roughness: .8, map });
  const b = new THREE.MeshStandardMaterial({ color: '#a5aaa5', roughness: .8, map });
  b.name = 'otro nombre';
  assert.equal(materialSignature(a), materialSignature(b));
  for (const change of [m => m.color.set('#a5aaa6'), m => { m.roughness = .7; }, m => { m.map = new THREE.Texture(); },
    m => { m.transparent = true; }, m => { m.side = THREE.DoubleSide; }, m => { m.userData.visibilityFade = true; }]) {
    const c = a.clone(); change(c);
    assert.notEqual(materialSignature(c), materialSignature(a));
  }
  assert.notEqual(materialSignature(new THREE.MeshLambertMaterial()), materialSignature(new THREE.MeshStandardMaterial()));
});

test('la unificación respeta los materiales vivos y libera solo las copias sin uso', () => {
  const live = new THREE.MeshStandardMaterial({ color: 'red' });
  const a = new THREE.MeshStandardMaterial({ color: 'red' }), b = new THREE.MeshStandardMaterial({ color: 'red' }), c = new THREE.MeshStandardMaterial({ color: 'red' });
  const deduper = new MaterialDeduper(new Set([live]));
  assert.equal(deduper.resolve(a), a);
  assert.equal(deduper.resolve(b), a);
  assert.equal(deduper.resolve(live), live, 'un material que el juego cambia en partida sigue siendo único');
  assert.equal(deduper.resolve(c), a);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), c));
  let disposed = 0;b.addEventListener('dispose', () => disposed++);c.addEventListener('dispose', () => disposed += 10);
  assert.equal(deduper.disposeUnused(root), 1);
  assert.equal(disposed, 1, 'c sigue en uso y no se libera');
});
