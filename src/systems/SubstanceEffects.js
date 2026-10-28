// src/systems/SubstanceEffects.js
// Efectos de consumo: lo que se ve y se oye al consumir pegante, pastilla o hierba.
// La duración avanza con la simulación; los desvanecidos de cortes y reemplazos, con el tiempo real,
// porque la escena se sigue dibujando en pausa y un corte instantáneo se vería.
import { SubstanceAudio } from './SubstanceAudio.js';
import { EFFECT_CUT_FADE, EFFECT_FADE_IN, EFFECT_FADE_OUT, SUBSTANCE_EFFECTS } from '../data/substanceEffects.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

export class SubstanceEffects {
  constructor({
    canvas = null, audio = null, sound = new SubstanceAudio(audio), eventTarget = globalThis.window,
    now = () => performance.now(), reducedMotion = prefersReducedMotion()
  } = {}) {
    this.canvas = canvas;
    this.sound = sound;
    this.eventTarget = eventTarget;
    this.now = now;
    this.calm = reducedMotion ? 0.2 : 1;

    this._effect = null;  // { id, recipe, elapsed, intensity }
    this._fade = null;    // { id, recipe, from, start, t }: efecto que se desvanece en tiempo real
    this._queued = null;  // sustancia que espera a que termine el desvanecido

    this._onConsumed = (e) => this.consume(e.detail?.id);
    eventTarget?.addEventListener?.('substance-consumed', this._onConsumed);
  }

  get active() {
    this._advanceFade();
    return !!(this._effect || this._fade);
  }

  get currentId() {
    this._advanceFade();
    return (this._effect ?? this._fade)?.id ?? null;
  }

  get intensity() {
    this._advanceFade();
    if (this._fade) return this._fade.from * clamp01(1 - (this.now() - this._fade.start) / (EFFECT_CUT_FADE * 1000));
    return this._effect?.intensity ?? 0;
  }

  /** @returns {boolean} false si la sustancia no tiene efecto (p. ej. tintico) */
  consume(id) {
    if (!SUBSTANCE_EFFECTS[id]) return false;
    this._advanceFade();
    this.sound.playOnset(id);
    if (this._effect?.id === id) {
      // Misma sustancia: renueva la duración sin bajar la intensidad.
      this._effect.elapsed = 0;
    } else if (this._effect || this._fade) {
      this._fadeOut();
      this._queued = id;
    } else {
      this._start(id);
    }
    return true;
  }

  /** Solo en cuadros sin pausa: menús, inventario, sueño y pestaña oculta congelan el efecto. */
  update(dt) {
    this._advanceFade();
    const fx = this._effect;
    if (!fx) return;
    fx.elapsed += dt;
    if (fx.elapsed >= fx.recipe.seconds) {
      this._effect = null;
      this.sound.stopSustain();
      return;
    }
    fx.intensity = Math.min(fx.intensity + dt / EFFECT_FADE_IN, clamp01((fx.recipe.seconds - fx.elapsed) / EFFECT_FADE_OUT));
  }

  /** Corte forzado (dormir, morir, recuperarse): se desvanece, nunca de golpe. */
  end() {
    this._advanceFade();
    this._queued = null;
    this._fadeOut();
  }

  dispose() {
    this.eventTarget?.removeEventListener?.('substance-consumed', this._onConsumed);
    this._effect = this._fade = this._queued = null;
    this.sound.dispose();
  }

  _start(id) {
    this._effect = { id, recipe: SUBSTANCE_EFFECTS[id], elapsed: 0, intensity: 0 };
    this.sound.startSustain(id);
  }

  _fadeOut() {
    if (!this._effect) return;
    const { id, recipe, elapsed, intensity } = this._effect;
    this._fade = { id, recipe, from: intensity, start: this.now(), t: elapsed };
    this._effect = null;
  }

  _advanceFade() {
    if (!this._fade || this.now() - this._fade.start < EFFECT_CUT_FADE * 1000) return;
    this._fade = null;
    this.sound.stopSustain();
    const next = this._queued;
    this._queued = null;
    if (next) this._start(next);
  }
}
