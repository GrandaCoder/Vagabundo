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
