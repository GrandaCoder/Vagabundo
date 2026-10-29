// src/sala/pruebas.js
// Pruebas de la sala. Cada una monta solo lo que necesita sobre `sala` (ver Sala.js) y devuelve
// sus botones. Para agregar una: una entrada más en PRUEBAS; se abre con sala.html?prueba=<id>.
//
//   { id, nombre, descripcion, async montar(sala) → { acciones: [{ texto, hacer }], estado?() } }
import * as THREE from 'three';
import { Npc } from '../entities/Npc.js';
import { Car } from '../entities/Car.js';
import { WEAPONS } from '../data/weapons.js';
import { SUBSTANCE_EFFECTS } from '../data/substanceEffects.js';
import { SMOKABLES } from '../character/smoking.js';

const toast = (text) => window.dispatchEvent(new CustomEvent('toast', { detail: { text, type: 'info' } }));

/** Peatones quietos en semicírculo delante del jugador (para golpear o mirar) */
function ringOfNpcs(sala, count, radius) {
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (i + 0.5) / count - Math.PI / 2;
    const npc = new Npc(sala.scene, new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius), { gastada: true, wander: 0, facing: a + Math.PI });
    sala.npcs.push(npc);
  }
}

function fumar(sala) {
  const p = sala.player;
  return {
    acciones: [
      ...Object.entries(SMOKABLES).map(([id, s]) => ({
        texto: `${s.emoji} Prender ${s.name}`,
        hacer: () => { p.stopSmoking(); p.startSmoking(id); toast(`${s.emoji} Prendiste un ${s.name}`); }
      })),
      { texto: '⏩ Calada ya', hacer: () => { if (p.smoking) p.smoking.nextPuff = 0; } },
      { texto: '⏭ Casi se acaba', hacer: () => { if (p.smoking) p.smoking.left = 5; } },
      { texto: 'Apagar', hacer: () => p.stopSmoking() }
    ],
    estado: () => p.smoking
      ? `${p.smoking.kind}: quedan ${Math.ceil(p.smoking.left)} s\npróxima calada en ${Math.max(0, p.smoking.nextPuff).toFixed(1)} s${p.smoking.puff != null ? `\ncalada t=${p.smoking.puff.toFixed(2)}` : ''}`
      : 'sin fumar'
  };
}

export const PRUEBAS = [
  {
    id: 'personaje',
    nombre: 'Personaje y animaciones',
    descripcion: 'Solo el jugador. Cambia de modelo y dispara acciones.',
    montar(sala) {
      const p = sala.player;
      return {
        acciones: ['pedir', 'saltar', 'dormir'].map((a) => ({ texto: a, hacer: () => p.playAction(a, a === 'dormir' ? 4 : 1.2) }))
      };
    }
  },
  {
    id: 'fumar',
    nombre: 'Fumar',
    descripcion: 'Cigarrillo y porro en la mano, caladas y humo. Sube la velocidad para no esperar 30 s.',
    montar: fumar
  },
  {
    id: 'pelea',
    nombre: 'Pelea',
    descripcion: 'Cinco peatones quietos para probar golpes, combos y armas (G o clic).',
    montar(sala) {
      ringOfNpcs(sala, 5, 3);
      const p = sala.player;
      return {
        acciones: [
          ...Object.entries(WEAPONS).map(([id, w]) => ({ texto: w.name, hacer: () => p.equipWeapon(id) })),
          { texto: '⚡ Energía llena', hacer: () => { sala.stats.energia = 100; } },
          { texto: 'Nuevos peatones', hacer: () => {
            for (const npc of sala.npcs) npc.dispose?.() ?? npc.root?.removeFromParent();
            sala.npcs.length = 0;
            ringOfNpcs(sala, 5, 3);
          } }
        ],
        estado: () => `arma: ${p.equippedWeapon}  energía: ${Math.round(sala.stats.energia)}\nbuscado: ${sala.steal.buscado}`
      };
    }
  },
  {
    id: 'efectos',
    nombre: 'Efectos de sustancias',
    descripcion: 'La imagen de cada sustancia sin tener que conseguirla.',
    async montar(sala) {
      const { SubstanceEffects } = await import('../systems/SubstanceEffects.js');
      const fx = new SubstanceEffects({ canvas: sala.canvas, audio: null });
      sala.updaters.add((dt) => fx.update(dt));
      sala.beforeRender.add((camera) => fx.beforeRender(camera));
      sala.afterRender.add((camera) => fx.afterRender(camera));
      return {
        acciones: [
          ...Object.keys(SUBSTANCE_EFFECTS).map((id) => ({ texto: id, hacer: () => fx.consume(id) })),
          { texto: 'Terminar', hacer: () => fx.end() }
        ]
      };
    }
  },
  {
    id: 'carros',
    nombre: 'Carros',
    descripcion: 'Un carro particular y una patrulla parqueados para revisar modelos y luces.',
    montar(sala) {
      const cars = [
        new Car(sala.scene, new THREE.Vector3(-3, 0, 4), Math.PI / 2),
        new Car(sala.scene, new THREE.Vector3(3, 0, 4), Math.PI / 2, { kind: 'police' })
      ];
      sala.updaters.add((dt) => { for (const c of cars) c.update(dt); });
      let night = false;
      return {
        acciones: [{ texto: '💡 Luces', hacer: () => { night = !night; for (const c of cars) c.setNight?.(night, false); } }]
      };
    }
  }
];
