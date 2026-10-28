import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { SubstanceEffects } from '../src/systems/SubstanceEffects.js';

let clock, sound, events;

beforeEach(() => {
  clock = 0;
  events = new EventTarget();
  sound = {
    onsets: [], sustains: [], stops: 0, disposed: 0,
    playOnset(id) { this.onsets.push(id); },
    startSustain(id) { this.sustains.push(id); },
    stopSustain() { this.stops++; },
    update() {},
    dispose() { this.disposed++; }
  };
});

const effects = (opts = {}) => new SubstanceEffects({ sound, now: () => clock, eventTarget: events, reducedMotion: false, ...opts });
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('un efecto nuevo sube en 3 s, se sostiene y se apaga al cumplir su duración', () => {
  const fx = effects();
  fx.consume('pegante');
  assert.equal(fx.intensity, 0);
  fx.update(1.5); assert.ok(close(fx.intensity, 0.5));
  fx.update(1.5); assert.equal(fx.intensity, 1);
  fx.update(29);  assert.ok(close(fx.intensity, 0.5)); // 32 de 35 s
  assert.equal(fx.active, true);
  fx.update(3);   assert.equal(fx.active, false);
  assert.equal(fx.intensity, 0);
  assert.deepEqual(sound.onsets, ['pegante']);
  assert.deepEqual(sound.sustains, ['pegante']);
  assert.equal(sound.stops, 1);
});

test('en pausa la duración no avanza y el sonido de consumir suena al instante', () => {
  const fx = effects();
  fx.consume('hierba');
  assert.deepEqual(sound.onsets, ['hierba']);
  clock += 5000;
  assert.equal(fx.intensity, 0);
  assert.equal(fx.active, true);
  assert.equal(fx.currentId, 'hierba');
  fx.update(1.5);
  assert.ok(close(fx.intensity, 0.5));
});

test('repetir la misma sustancia renueva la duración sin bajar la intensidad', () => {
  const fx = effects();
  fx.consume('pastilla');
  fx.update(3);
  fx.update(40);
  assert.ok(close(fx.intensity, 1 / 3));
  fx.consume('pastilla');
  assert.ok(close(fx.intensity, 1 / 3));
  fx.update(0.1);
  assert.ok(fx.intensity > 1 / 3);
  assert.deepEqual(sound.onsets, ['pastilla', 'pastilla']);
  assert.deepEqual(sound.sustains, ['pastilla']);
  fx.update(44);
  assert.equal(fx.active, true);
});

test('cambiar de sustancia desvanece la anterior en 1 s reales antes de subir la nueva', () => {
  const fx = effects();
  fx.consume('pegante');
  fx.update(3);
  fx.consume('pastilla');
  assert.equal(fx.currentId, 'pegante');
  assert.equal(fx.intensity, 1);
  clock += 500;
  assert.ok(close(fx.intensity, 0.5));
  clock += 600;
  assert.equal(fx.currentId, 'pastilla');
  assert.equal(fx.intensity, 0);
  fx.update(1.5);
  assert.ok(close(fx.intensity, 0.5));
  assert.equal(sound.stops, 1);
  assert.deepEqual(sound.sustains, ['pegante', 'pastilla']);
  assert.deepEqual(sound.onsets, ['pegante', 'pastilla']);
});

test('si se piden varias sustancias durante un desvanecido, gana la última', () => {
  const fx = effects();
  fx.consume('pegante');
  fx.update(3);
  fx.consume('pastilla');
  fx.consume('hierba');
  clock += 1100;
  assert.equal(fx.currentId, 'hierba');
  assert.deepEqual(sound.sustains, ['pegante', 'hierba']);
});

test('los cortes forzados se desvanecen en tiempo real aun en pausa', () => {
  const fx = effects();
  fx.consume('hierba');
  fx.update(3);
  fx.end();
  assert.equal(fx.intensity, 1);
  clock += 500;
  assert.ok(close(fx.intensity, 0.5));
  clock += 600;
  assert.equal(fx.active, false);
  assert.equal(sound.stops, 1);
  fx.end();
  assert.equal(sound.stops, 1);
});

test('un corte forzado descarta la sustancia que esperaba su turno', () => {
  const fx = effects();
  fx.consume('pegante');
  fx.update(3);
  fx.consume('pastilla');
  fx.end();
  clock += 1100;
  assert.equal(fx.active, false);
  assert.deepEqual(sound.sustains, ['pegante']);
});

test('tintico no activa nada y el evento substance-consumed sí', () => {
  const fx = effects();
  assert.equal(fx.consume('tintico'), false);
  assert.deepEqual(sound.onsets, []);
  assert.equal(fx.active, false);
  events.dispatchEvent(new CustomEvent('substance-consumed', { detail: { id: 'pegante' } }));
  assert.equal(fx.currentId, 'pegante');
  fx.dispose();
  assert.equal(fx.active, false);
  assert.equal(sound.disposed, 1);
  events.dispatchEvent(new CustomEvent('substance-consumed', { detail: { id: 'hierba' } }));
  assert.equal(fx.active, false);
  assert.deepEqual(sound.onsets, ['pegante']);
});
