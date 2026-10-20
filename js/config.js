// Configuración del reloj (se guarda por día en localStorage)
const DEFAULT_CONFIG = {
  prep: 10,        // segundos al iniciar
  postRest: 0,     // segundos "prepárate" después de cada descanso
  cadence: 140,    // saltos por minuto (130–150 aprox.)
  blocks: [
    { work: 60,  rest: 40,  reps: 5 },
    { work: 120, rest: 60,  reps: 2 },
    { work: 240, rest: 120, reps: 1 }
  ]
};

function cfgKey(day) { return `reloj_${day}`; }

function loadConfig(day) {
  try {
    const c = JSON.parse(localStorage.getItem(cfgKey(day)));
    if (c && Array.isArray(c.blocks) && c.blocks.length) return { ...DEFAULT_CONFIG, ...c };
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
        if (cfg.postRest > 0) phases.push({ type: 'ready', label: 'Prepárate', dur: cfg.postRest, n, total });
      }
    }
  });
  return phases;
}

function totalSeconds(cfg) { return buildPhases(cfg).reduce((s, p) => s + p.dur, 0); }
