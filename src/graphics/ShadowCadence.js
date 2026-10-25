import { Matrix4 } from 'three';

/**
 * La cascada lejana del sol (hasta ~250 m, texel de ~25 cm) cambia poco entre dos cuadros y era la que más
 * dibujos y triángulos repetía. Se vuelve a dibujar un cuadro de cada dos; en los intermedios solo se
 * redibuja la cercana. Como las dos cascadas comparten un atlas y el vaciado de WebGPU no respeta el
 * recorte, la mitad cercana se limpia dibujando un cuadro que escribe la profundidad de fondo.
 *
 * - `advanceShadowCadence(light)` decide, una vez por cuadro y antes del descarte, si toca la lejana.
 * - Con la lejana en pausa, su matriz se conserva: el atlas guarda el dibujo anterior y debe leerse con la
 *   matriz con la que se hizo.
 */
export const FAR_CASCADE = 1;

const states = new WeakMap();

export function shadowCadence(light) {
  const shadow = light.shadow;
  if (!states.has(shadow)) states.set(shadow, { frame: 0, renderFar: true, full: true, kept: new Matrix4(), installed: false });
  return states.get(shadow);
}

/** Estado de una sombra si ya tiene cadencia (sin crearlo). */
export const peekShadowCadence = shadow => states.get(shadow) ?? null;

/** Cuadro siguiente: devuelve si hay que dibujar la cascada lejana. */
export function advanceShadowCadence(light) {
  const cadence = shadowCadence(light);
  cadence.frame++;
  cadence.renderFar = cadence.full || cadence.frame % 2 === 0;
  return cadence.renderFar;
}

/** La próxima actualización dibuja las dos cascadas (sombra recién activada, atlas nuevo o cambio de resolución). */
export function requestFullShadowUpdate(light) {
  if (light?.shadow) shadowCadence(light).full = true;
}

/** Conserva la matriz de la cascada lejana mientras no se dibuja. */
export function installShadowCadence(light) {
  const shadow = light.shadow, cadence = shadowCadence(light);
  if (cadence.installed) return;
  cadence.installed = true;
  const update = shadow.updateMatrices.bind(shadow);
  shadow.updateMatrices = function (source, camera) {
    const keep = !cadence.renderFar && !cadence.full;
    if (keep) cadence.kept.copy(this._matrices[FAR_CASCADE]);
    update(source, camera);
    if (keep) this._matrices[FAR_CASCADE].copy(cadence.kept);
  };
}
