import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { openPauseMenu } from '../src/ui/PauseMenu.js';

beforeEach(() => {
  globalThis.window = new EventTarget();
  globalThis.document = {
    createElement(tag) {
      return {
        tag,
        className: '',
        textContent: '',
        children: [],
        attributes: {},
        addEventListener() {},
        setAttribute(k, v) { this.attributes[k] = v; },
        append(...nodes) { this.children.push(...nodes); }
      };
    }
  };
});

test('openPauseMenu abre el menú con controles de audio, estado y opciones rápidas', () => {
  let openedConfig = null;
  const game = {
    _deathPending: false,
    creator: { isOpen: false },
    audio: { volume: 0.7, isMuted: () => false, setVolume() {}, toggleMute() {} },
    stats: { dinero: 5000, level: 2, salud: 85, sed: 70, hambre: 60 },
    clock: { day: 1, hour: 14.5 },
    look: { nombre: 'Tester' },
    menu: {
      open(cfg) { openedConfig = cfg; }
    }
  };

  openPauseMenu(game);
  assert.ok(openedConfig);
  assert.equal(openedConfig.title, 'Partida en Pausa');

  const rendered = openedConfig.render();
  assert.ok(rendered.body);
  assert.ok(rendered.foot);
  assert.equal(rendered.foot.length, 1);
});

test('el selector temporal se bloquea al preparar y conserva la elección si falla',async()=>{
  let config,resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const originalCreate=document.createElement;
  document.createElement=tag=>{const node=originalCreate(tag);node.listeners={};node.addEventListener=(name,fn)=>{node.listeners[name]=fn;};return node;};
  const game={stats:{},clock:{hour:12,day:1},vehicleVisualMode:'slop',setVehicleVisualMode:()=>pending,menu:{open(c){config=c;}}};
  openPauseMenu(game);const {body}=config.render();
  const find=node=>node.attributes?.['aria-label']==='Vehículos'?node:(node.children??[]).filter(n=>typeof n==='object').map(find).find(Boolean);
  const select=find(body);assert.ok(select);select.value='actual';
  const originalError=console.error;console.error=()=>{};
  try{const change=select.listeners.change();assert.equal(select.disabled,true);reject(new Error('fallo de carga'));await change;assert.equal(select.disabled,false);assert.equal(select.value,'slop');}finally{console.error=originalError;}
});

test('reabrir pausa durante una preparación recupera el selector al terminar',async()=>{
  let config,resolve;const pending=new Promise(yes=>resolve=yes);
  const game={stats:{},clock:{hour:12,day:1},vehicleVisualMode:'slop',vehicleVisualChanging:true,_vehicleVisualChange:pending,setVehicleVisualMode(){},menu:{open(c){config=c;}}};
  openPauseMenu(game);const {body}=config.render();
  const find=node=>node.attributes?.['aria-label']==='Vehículos'?node:(node.children??[]).filter(n=>typeof n==='object').map(find).find(Boolean);
  const select=find(body);assert.equal(select.attributes.disabled,'');game.vehicleVisualMode='actual';resolve();await pending;await Promise.resolve();await Promise.resolve();assert.equal(select.disabled,false);assert.equal(select.value,'actual');
});
