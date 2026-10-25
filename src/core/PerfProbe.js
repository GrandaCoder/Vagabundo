/** Sonda de rendimiento para `?perf`: escenarios repetibles desde la consola, sin tocar el guardado. */
export function frameStats(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = p => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] * 10) / 10 : 0;
  return { frames: sorted.length, max: at(1), p95: at(.95), p99: at(.99), over500ms: sorted.filter(ms => ms > 500).length };
}

function delta(after, before) {
  return Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]));
}

export function installPerfProbe(game, target = globalThis) {
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  /** Mide intervalos de cuadro y trabajo gráfico mientras corre `step(progress)`. */
  const measure = async (name, seconds, step = () => {}) => {
    const diagnostics = game.renderer.diagnostics, before = diagnostics.snapshot(), events = diagnostics.events.length;
    const bakes = game.sceneMgr.atmosphere?.bakeCount ?? 0, intervals = [], started = performance.now();
    let last = started;
    while (last - started < seconds * 1000) {
      step(Math.min(1, (last - started) / (seconds * 1000)));
      await nextFrame();
      const now = performance.now();
      intervals.push(now - last);
      last = now;
    }
    const info = game.renderer.instance.info.render;
    return { name, ...frameStats(intervals), work: delta(diagnostics.snapshot(), before), bakes: (game.sceneMgr.atmosphere?.bakeCount ?? 0) - bakes,
      events: diagnostics.events.slice(events), quality: game.renderer.effectiveQuality, pixelRatio: game.renderer.instance.getPixelRatio(),
      drawCalls: info.drawCalls, triangles: info.triangles, memoryMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  };
  const probe = {
    report: () => game.getPerformanceReport(),
    idle: (seconds = 3) => measure('quieto', seconds),
    turn: (seconds = 4) => { const yaw = game.cameraRig.yaw; return measure('giro 360', seconds, p => { game.cameraRig.yaw = yaw + p * Math.PI * 2; }); },
    toggleCamera: async (seconds = 2) => { game.hud?.cameraButton?.click(); return measure('cámara ' + game.cameraRig.mode, seconds); },
    quality: async (level, seconds = 3) => { await game.setGraphicsQuality(level, false); return measure('calidad ' + level, seconds); },
    pressure: (value, seconds = 3) => { game.renderer.resolution.pressure = value; return measure('pressure ' + value, seconds); },
    ratio: (value, seconds = 3) => { game.renderer.resolution.ratio = value; game.renderer.instance.setPixelRatio(value); return measure('pixelRatio ' + value, seconds); },
    lockQuality: (locked = true) => { game.renderer.adaptiveLocked = locked; return locked; }
  };
  target.__bazukoPerf = probe;
  return probe;
}
