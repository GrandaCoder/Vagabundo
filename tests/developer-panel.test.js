import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeveloperPanel } from '../src/ui/DeveloperPanel.js';

function fakeDom() {
  const node = tag => ({
    tag, children: [], attributes: {}, listeners: {}, textContent: '', hidden: false,
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener(name, fn) { this.listeners[name] = fn; }, append(...nodes) { this.children.push(...nodes); },
    focus() {}, remove() {}
  });
  globalThis.document = { createElement: node, body: node('body') };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}
const all = root => [root, ...(root.children ?? []).filter(n => typeof n === 'object').flatMap(all)];

test('la hora del día de desarrollo está en el panel DEV y marca el perfil activo', () => {
  fakeDom();
  const calls = [];
  const sceneMgr = { _timeProfileOverride: null, setTimeProfile(id) { calls.push(id); this._timeProfileOverride = id; } };
  const game = { sceneMgr, debugSystems: { subscribe: () => () => {}, isEnabled: () => true, pending: new Set(), counts: () => ({}) } };
  const panel = new DeveloperPanel(game);
  try {
    const buttons = all(panel.panel).filter(n => n.attributes['data-profile']);
    assert.deepEqual(buttons.map(b => b.attributes['data-profile']), ['golden', 'midday', 'blue-hour', 'night', 'clock']);
    panel.refresh();
    assert.equal(buttons.at(-1).attributes['aria-pressed'], 'true', 'por omisión sigue el reloj');
    buttons[0].listeners.click();
    assert.deepEqual(calls, ['golden']);
    assert.equal(buttons[0].attributes['aria-pressed'], 'true');
    assert.equal(buttons.at(-1).attributes['aria-pressed'], 'false');
    buttons.at(-1).listeners.click();
    assert.deepEqual(calls, ['golden', null], 'el botón de reloj devuelve la hora real sin guardar nada');
  } finally { clearInterval(panel.timer); }
});

test('el panel DEV activa la lluvia y reinicia las necesidades', () => {
  fakeDom();
  const rain = [];
  const weather = { isRaining: false, forceRain(on) { rain.push(on); this.isRaining = on; } };
  const stats = { hambre: 3, sed: 9, energia: 40, salud: 50, higiene: 1, animo: 7, vicio: 0 };
  const game = { weather, stats, debugSystems: { subscribe: () => () => {}, isEnabled: () => true, pending: new Set(), counts: () => ({}) } };
  const panel = new DeveloperPanel(game);
  try {
    panel.rainButton.listeners.click();
    assert.deepEqual(rain, [true]);
    assert.equal(panel.rainButton.attributes['aria-pressed'], 'true');
    panel.rainButton.listeners.click();
    assert.deepEqual(rain, [true, false]);
    panel.needsButton.listeners.click();
    assert.ok(Object.values(stats).every(v => v === 100));
  } finally { clearInterval(panel.timer); }
});
