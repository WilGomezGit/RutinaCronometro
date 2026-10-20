// Reloj de saltos: anillo de progreso, conteo estimado de saltos y resumen final
(function () {
  const $ = id => document.getElementById(id);
  const CIRC = 2 * Math.PI * 90;
  let day, cfg;
  let phases = [], idx = 0, grand = 0;
  let phaseStart = 0, phaseElapsed = 0, doneBefore = 0;
  let running = false, paused = false, raf = 0, lastBeep = -1, wakeLock = null;
  let sets = [];   // resultados por serie

  const TONES = {
    prep: ['#fde68a', 'Preparación'], ready: ['#fde68a', 'Preparación'],
    work: ['#bbf7d0', 'Ejercicio'], rest: ['#bfdbfe', 'Descanso']
  };

  function beep(freq, ms) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; g.gain.value = 0.25;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + ms / 1000);
    } catch (e) { /* sin audio */ }
  }

  async function lockScreen() {
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignorar */ }
  }
  function unlockScreen() { try { wakeLock && wakeLock.release(); } catch (e) { /* ignorar */ } wakeLock = null; }

  function jumpsFor(sec) { return Math.floor(sec * cfg.cadence / 60); }

  function workedSoFar(el) {
    // segundos de salto acumulados (fases completas + parcial actual)
    let s = 0;
    for (let i = 0; i < idx; i++) if (phases[i].type === 'work') s += phases[i].dur;
    if (phases[idx] && phases[idx].type === 'work') s += el;
    return s;
  }

  function setPhaseUI(p) {
    document.body.classList.remove('phase-preparation', 'phase-exercise', 'phase-rest');
    if (p) document.body.classList.add(p.type === 'work' ? 'phase-exercise' : p.type === 'rest' ? 'phase-rest' : 'phase-preparation');
    $('clockScreen').dataset.phase = p ? p.type : 'idle';
    $('phase').textContent = p ? p.label : 'Listo';
    $('round').textContent = p && p.total ? `Serie ${p.n} de ${p.total}` : '';
    const nxt = phases[idx + 1];
    $('next').textContent = p ? (nxt ? `Siguiente: ${nxt.label} ${fmt(nxt.dur)}` : 'Última fase') : '';
  }

  function draw() {
    const p = phases[idx];
    if (!p) return false;
    const el = Math.min(p.dur, paused ? phaseElapsed : phaseElapsed + (performance.now() - phaseStart) / 1000);
    const left = p.dur - el;
    $('timer').textContent = fmt(left);
    $('ring').style.strokeDashoffset = CIRC * (1 - left / p.dur);   // se ajusta a cada fase
    const done = doneBefore + el;
    $('totalBar').style.width = (done / grand * 100) + '%';
    $('elapsed').textContent = 'Transcurrido ' + fmt(done);
    $('remaining').textContent = 'Restante ' + fmt(grand - done);
    document.title = `${fmt(left)} · ${p.label}`;

    const worked = workedSoFar(el);
    $('jumpsNow').textContent = jumpsFor(worked);
    $('jumpsRate').textContent = worked > 0 ? cfg.cadence : 0;
    $('jumpsSet').textContent = p.type === 'work' ? jumpsFor(el) : '0';

    const sec = Math.ceil(left);
    if (sec <= 3 && sec > 0 && sec !== lastBeep) { lastBeep = sec; beep(660, 120); }
    return el >= p.dur;
  }

  function tick() {
    if (!running) return;
    if (!paused && draw()) nextPhase();
    raf = requestAnimationFrame(tick);
  }

  function nextPhase() {
    const done = phases[idx];
    if (done.type === 'work') sets.push({ n: done.n, dur: done.dur, jumps: jumpsFor(done.dur) });
    doneBefore += done.dur;
    idx++;
    lastBeep = -1;
    if (idx >= phases.length) { finish(); return; }
    phaseElapsed = 0; phaseStart = performance.now();
    beep(1320, 300);
    if (navigator.vibrate) navigator.vibrate(200);
    setPhaseUI(phases[idx]);
    $('jumpsSet').textContent = '0';
  }

  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    unlockScreen();
    document.title = 'Rutina — Wil';
    const total = sets.reduce((s, x) => s + x.jumps, 0);
    const secs = sets.reduce((s, x) => s + x.dur, 0);
    $('sumTotal').textContent = total;
    $('sumLine').textContent = `${fmt(secs)} saltando · ${cfg.cadence} saltos/min · ${fmt(grand)} de rutina`;
    $('sumRows').innerHTML = sets.map(x => `<tr><td>${x.n}</td><td>${fmt(x.dur)}</td><td>${x.jumps}</td></tr>`).join('');
    $('clockScreen').classList.add('hidden');
    $('summary').classList.remove('hidden');
    document.body.classList.remove('phase-preparation', 'phase-exercise', 'phase-rest');
    try { $('alertSound').play().catch(() => {}); } catch (e) { /* ignorar */ }
    if (window.confetti) confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
  }

  function start() {
    cfg = loadConfig(day);
    cancelAnimationFrame(raf);
    phases = buildPhases(cfg);
    grand = totalSeconds(cfg);
    idx = 0; doneBefore = 0; phaseElapsed = 0; sets = [];
    phaseStart = performance.now();
    running = true; paused = false; lastBeep = -1;
    $('summary').classList.add('hidden'); $('clockScreen').classList.remove('hidden');
    $('pauseButton').disabled = false; $('pauseButton').textContent = 'PAUSA';
    $('configBox').open = false;
    setPhaseUI(phases[0]);
    beep(1320, 250);
    try { $('alertSound').load(); } catch (e) { /* ignorar */ }
    lockScreen();
    tick();
  }

  function reset() {
    cancelAnimationFrame(raf);
    running = false; paused = false;
    unlockScreen();
    cfg = loadConfig(day);
    phases = buildPhases(cfg); grand = totalSeconds(cfg); idx = 0; doneBefore = 0; sets = [];
    $('summary').classList.add('hidden'); $('clockScreen').classList.remove('hidden');
    setPhaseUI(null);
    $('timer').textContent = fmt(phases[0] ? phases[0].dur : 0);
    const series = cfg.blocks.reduce((n, b) => n + b.reps, 0);
    const jumpSecs = cfg.blocks.reduce((s, b) => s + b.work * b.reps, 0);
    $('next').textContent = `${series} series · ${fmt(grand)} · ≈${jumpsFor(jumpSecs)} saltos`;
    $('ring').style.strokeDashoffset = 0;
    $('totalBar').style.width = '0';
    $('elapsed').textContent = 'Transcurrido 00:00';
    $('remaining').textContent = 'Restante ' + fmt(grand);
    ['jumpsNow', 'jumpsRate', 'jumpsSet'].forEach(i => $(i).textContent = '0');
    $('pauseButton').disabled = true; $('pauseButton').textContent = 'PAUSA';
    $('startButton').textContent = 'INICIO GO!';
    document.title = 'Rutina — Wil';
  }

  // --- Configuración ---
  const num = (v, min) => { v = parseInt(v, 10); return isNaN(v) ? min : Math.max(min, v); };

  function renderConfig() {
    const c = loadConfig(day);
    $('cfgPrep').value = c.prep; $('cfgPost').value = c.postRest; $('cfgCad').value = c.cadence;
    $('blocks').innerHTML = c.blocks.map((b, i) => `
      <div class="block" data-i="${i}">
        <div><label>Salto (s)</label><input type="number" min="1" data-k="work" value="${b.work}"></div>
        <div><label>Descanso (s)</label><input type="number" min="0" data-k="rest" value="${b.rest}"></div>
        <div><label>Veces</label><input type="number" min="1" data-k="reps" value="${b.reps}"></div>
        <button class="btn danger small" data-del="${i}" aria-label="Borrar bloque">✕</button>
      </div>`).join('');
    updateSummary(c);
  }

  function updateSummary(c) {
    const jumpSecs = c.blocks.reduce((s, b) => s + b.work * b.reps, 0);
    $('cfgSummary').textContent = `Duración total ${fmt(totalSeconds(c))} · ≈${Math.floor(jumpSecs * c.cadence / 60)} saltos a ${c.cadence}/min`;
  }

  function mutate(fn, rerender) {
    const c = loadConfig(day);
    fn(c); saveConfig(day, c);
    if (rerender) renderConfig(); else updateSummary(c);
    if (!running) reset();
  }

  function initConfig() {
    $('cfgPrep').addEventListener('input', e => mutate(c => c.prep = num(e.target.value, 0)));
    $('cfgPost').addEventListener('input', e => mutate(c => c.postRest = num(e.target.value, 0)));
    $('cfgCad').addEventListener('input', e => mutate(c => c.cadence = num(e.target.value, 1)));
    $('blocks').addEventListener('input', e => {
      const row = e.target.closest('.block'); if (!row) return;
      const k = e.target.dataset.k;
      mutate(c => c.blocks[row.dataset.i][k] = num(e.target.value, k === 'rest' ? 0 : 1));
    });
    $('blocks').addEventListener('click', e => {
      const del = e.target.dataset.del;
      if (del !== undefined) mutate(c => { if (c.blocks.length > 1) c.blocks.splice(+del, 1); }, true);
    });
    $('addBlock').addEventListener('click', () => mutate(c => c.blocks.push({ ...c.blocks[c.blocks.length - 1] }), true));
    $('restoreCfg').addEventListener('click', () => {
      saveConfig(day, structuredClone(DEFAULT_CONFIG)); renderConfig(); if (!running) reset();
    });
  }

  window.Reloj = {
    init(d) {
      day = d;
      initConfig(); renderConfig(); reset();
      $('startButton').addEventListener('click', start);
      $('againButton').addEventListener('click', reset);
      $('resetButton').addEventListener('click', reset);
      $('pauseButton').addEventListener('click', () => {
        if (!running) return;
        if (paused) { phaseStart = performance.now(); paused = false; $('pauseButton').textContent = 'PAUSA'; }
        else { phaseElapsed += (performance.now() - phaseStart) / 1000; paused = true; $('pauseButton').textContent = 'CONTINUAR'; }
      });
      document.addEventListener('visibilitychange', () => { if (running && !document.hidden) lockScreen(); });
    },
    isRunning: () => running
  };
})();
