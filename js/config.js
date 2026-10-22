// Configuración del reloj (se guarda por día en localStorage)
const DEFAULT_CONFIG = {
  prep: 10,        // segundos de preparación, solo al iniciar el reloj
  postRestOn: false, // cuenta de preparación después de cada descanso (apagada por defecto)
  postRest: 10,    // segundos de esa cuenta, si se activa
  cadence: 140,    // saltos por minuto (130–150 aprox.)
  blocks: [
    { work: 60,  rest: 40,  reps: 5 },
    { work: 120, rest: 60,  reps: 2 },
    { work: 240, rest: 120, reps: 1 }
  ],
  // Otros ejercicios (pesas, etc.): van después de la cuerda, sin preparación,
  // y se repiten ejercicio → descanso hasta pulsar "Terminar rutina"
  others: { enabled: true, work: 45, rest: 30 }
};

function cfgKey(day) { return `reloj_${day}`; }

function loadConfig(day) {
  try {
    const c = JSON.parse(localStorage.getItem(cfgKey(day)));
    if (c && Array.isArray(c.blocks) && c.blocks.length) return { ...DEFAULT_CONFIG, ...c, others: { ...DEFAULT_CONFIG.others, ...c.others } };
  } catch (e) { /* localStorage no disponible */ }
  return structuredClone(DEFAULT_CONFIG);
}

function saveConfig(day, cfg) {
  try { localStorage.setItem(cfgKey(day), JSON.stringify(cfg)); } catch (e) { /* ignorar */ }
}

function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

// Lista plana de fases a partir de los bloques
function buildPhases(cfg) {
  const phases = [];
  if (cfg.prep > 0) phases.push({ type: 'prep', label: 'Prepárate', dur: cfg.prep });
  const total = cfg.blocks.reduce((n, b) => n + b.reps, 0);
  let n = 0;
  cfg.blocks.forEach((b, bi) => {
    for (let r = 1; r <= b.reps; r++) {
      n++;
      phases.push({ type: 'work', label: 'SALTA', dur: b.work, block: bi, rep: r, n, total });
      if (n < total) {
        if (b.rest > 0) phases.push({ type: 'rest', label: 'Descanso', dur: b.rest, n, total });
        if (cfg.postRestOn && cfg.postRest > 0) phases.push({ type: 'ready', label: 'Prepárate', dur: cfg.postRest, n, total });
      }
    }
  });
  return phases;
}

function totalSeconds(cfg) { return buildPhases(cfg).reduce((s, p) => s + p.dur, 0); }
