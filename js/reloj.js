// Reloj de saltos: anillo de progreso, conteo estimado de saltos y resumen final.
// El motor (fases, tiempos, pausa, saltos) es el mismo de siempre; lo nuevo es solo presentación
// (acumuladores, línea de tiempo, lista de series y "Siguiente fase").
(function () {
  const $ = id => document.getElementById(id);
  const CIRC = 2 * Math.PI * 164;
  const ring = $('ring');
  ring.style.strokeDasharray = CIRC;

  let day, cfg;
  let phases = [], idx = 0, grand = 0;
  let phaseStart = 0, phaseElapsed = 0, doneBefore = 0;
  let running = false, paused = false, raf = 0, lastBeep = -1, wakeLock = null;
  let sets = [];   // resultados por serie

  // --- Presentación ---
  const NAME = { prep: 'Prepárate', ready: 'Prepárate', work: 'Activo', rest: 'Descansa' };
  const CHIP = { prep: 'Preparación', ready: 'Preparación', work: 'Ejercicio', rest: 'Descanso' };
  const NEXT = { prep: 'Prepárate', ready: 'Prepárate', work: 'Ejercicio', rest: 'Descanso' };
  const BODY = { prep: 'phase-preparation', ready: 'phase-preparation', work: 'phase-exercise', rest: 'phase-rest' };
  const BODY_ALL = ['phase-preparation', 'phase-exercise', 'phase-rest'];
  let workTotal = 0, restTotal = 0, totalSeries = 0;
  let segEls = [], seriesInfo = [], seriesEls = [];

  const mmss = s => fmt(Math.floor(s + 1e-6));   // acumulados: sin redondear hacia arriba

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

  // segundos acumulados de un tipo de fase (fases completas + parcial actual)
  function spent(type, el) {
    let s = 0;
    for (let i = 0; i < idx; i++) if (phases[i].type === type) s += phases[i].dur;
    if (phases[idx] && phases[idx].type === type) s += el;
    return s;
  }
  function workedSoFar(el) { return spent('work', el); }

  function updateToggle() {
    const label = !running ? 'Iniciar' : paused ? 'Continuar' : 'Pausar';
    $('startLabel').textContent = label;
    $('startButton').dataset.state = running && !paused ? 'pause' : 'play';
    $('skipButton').disabled = !running;
  }

  function setPhaseUI(p) {
    const type = p ? p.type : 'prep';
    $('viewReloj').dataset.phase = type === 'ready' ? 'prep' : type;
    document.body.classList.remove(...BODY_ALL);
    document.body.classList.add(BODY[type]);
    $('phase').textContent = p ? NAME[type] : 'Listo';
    $('phaseChip').textContent = p ? CHIP[type] : 'Listo';
    $('serieChip').textContent = `Serie ${p ? (p.n || 0) : 0} de ${totalSeries}`;
    const nxt = phases[idx + 1];
    $('next').textContent = p ? (nxt ? `Siguiente: ${NEXT[nxt.type]} ${nxt.dur} s` : 'Última fase') : '';
    updateSeries();
  }

  // --- Línea de tiempo y lista de series (se dibujan desde `phases`) ---
  function buildTimeline() {
    const tl = $('timeline');
    tl.innerHTML = '';
    segEls = phases.map(p => {
      const seg = document.createElement('span');
      seg.className = 'seg ' + p.type;
      seg.style.flex = `${p.dur} 1 0`;
      const fill = document.createElement('i');
      seg.appendChild(fill);
      tl.appendChild(seg);
      return fill;
    });
  }

  function buildSeries() {
    seriesInfo = [];
    phases.forEach((p, i) => {
      if (p.type !== 'work') return;
      let last = i, rest = 0;
      phases.forEach((q, j) => { if (q.n === p.n && q.type !== 'work' && q.type !== 'prep') { last = Math.max(last, j); if (q.type === 'rest') rest = q.dur; } });
      seriesInfo.push({ n: p.n, work: i, last, desc: `${p.dur} s activo` + (rest ? ` · ${rest} s descanso` : '') });
    });
    const list = $('seriesList');
    list.innerHTML = '';
    seriesEls = seriesInfo.map(s => {
      const row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = `<span class="snum">${s.n}</span><span class="sdesc">${s.desc}</span><span class="sst"></span>`;
      list.appendChild(row);
      return row;
    });
  }

  function updateSeries() {
    const ST = { done: 'Hecha', work: 'Activo', rest: 'Descansando', todo: 'Pendiente' };
    seriesInfo.forEach((s, k) => {
      const st = idx > s.last ? 'done' : idx === s.work ? 'work' : idx > s.work ? 'rest' : 'todo';
      seriesEls[k].dataset.st = st;
      seriesEls[k].querySelector('.sst').textContent = ST[st];
    });
  }

  function draw() {
    const p = phases[idx];
    if (!p) return false;
    const el = Math.min(p.dur, paused ? phaseElapsed : phaseElapsed + (performance.now() - phaseStart) / 1000);
    const left = p.dur - el;
    $('timer').textContent = fmt(left);
    ring.style.strokeDashoffset = CIRC * (1 - left / p.dur);   // se ajusta a cada fase
    const done = doneBefore + el;
    $('elapsed').textContent = 'Total ' + mmss(done);
    $('remaining').textContent = `Restante ${fmt(grand - done)} de ${fmt(grand)}`;
    document.title = `${fmt(left)} · ${NAME[p.type]}`;
    segEls[idx].style.width = (el / p.dur * 100) + '%';

    const w = spent('work', el), r = spent('rest', el);
    $('workClock').textContent = mmss(w);
    $('restClock').textContent = mmss(r);
    $('workBar').style.width = (workTotal ? w / workTotal * 100 : 0) + '%';
    $('restBar').style.width = (restTotal ? r / restTotal * 100 : 0) + '%';

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
    segEls[idx].style.width = '100%';
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
    updateSeries();
    updateToggle();
    document.title = 'Wil Fit Timer';
    const total = sets.reduce((s, x) => s + x.jumps, 0);
    const secs = sets.reduce((s, x) => s + x.dur, 0);
    $('sumTotal').textContent = total;
    $('sumLine').textContent = `${fmt(secs)} saltando · ${cfg.cadence} saltos/min · ${fmt(grand)} de rutina`;
    $('sumRows').innerHTML = sets.map(x => `<tr><td>${x.n}</td><td>${fmt(x.dur)}</td><td>${x.jumps}</td></tr>`).join('');
    $('clockScreen').classList.add('hidden');
    $('summary').classList.remove('hidden');
    document.body.classList.remove(...BODY_ALL);
    try { $('alertSound').play().catch(() => {}); } catch (e) { /* ignorar */ }
    if (window.confetti) confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
  }

  // prepara fases, totales y UI a partir de la configuración guardada
  function load() {
    cfg = loadConfig(day);
    phases = buildPhases(cfg);
    grand = totalSeconds(cfg);
    workTotal = phases.filter(p => p.type === 'work').reduce((s, p) => s + p.dur, 0);
    restTotal = phases.filter(p => p.type === 'rest').reduce((s, p) => s + p.dur, 0);
    totalSeries = cfg.blocks.reduce((n, b) => n + b.reps, 0);
    idx = 0; doneBefore = 0; phaseElapsed = 0; sets = [];
    buildTimeline(); buildSeries();
    $('summary').classList.add('hidden'); $('clockScreen').classList.remove('hidden');
    $('workClock').textContent = $('restClock').textContent = '00:00';
    $('workBar').style.width = $('restBar').style.width = '0';
    $('workNote').textContent = `de ${fmt(workTotal)} · solo tiempo activo, sin descansos`;
    $('restNote').textContent = `de ${fmt(restTotal)} de descanso`;
  }

  function start() {
    cancelAnimationFrame(raf);
    load();
    phaseStart = performance.now();
    running = true; paused = false; lastBeep = -1;
    updateToggle();
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
    load();
    setPhaseUI(null);
    $('timer').textContent = fmt(phases[0] ? phases[0].dur : 0);
    const jumpSecs = cfg.blocks.reduce((s, b) => s + b.work * b.reps, 0);
    $('next').textContent = `${totalSeries} series · ${fmt(grand)} · ≈${jumpsFor(jumpSecs)} saltos`;
    ring.style.strokeDashoffset = 0;
    $('elapsed').textContent = 'Total 00:00';
    $('remaining').textContent = `Restante ${fmt(grand)} de ${fmt(grand)}`;
    ['jumpsNow', 'jumpsRate', 'jumpsSet'].forEach(i => $(i).textContent = '0');
    updateToggle();
    document.title = 'Wil Fit Timer';
  }

  function togglePause() {
    if (!running) return;
    if (paused) { phaseStart = performance.now(); paused = false; }
    else { phaseElapsed += (performance.now() - phaseStart) / 1000; paused = true; }
    updateToggle();
  }

  // salta al inicio de la siguiente fase (la fase actual cuenta como completada)
  function skip() {
    if (!running) return;
    nextPhase();
    if (running) draw();
  }

  // --- Configuración ---
  const num = (v, min) => { v = parseInt(v, 10); return isNaN(v) ? min : Math.max(min, v); };

  function renderConfig() {
    const c = loadConfig(day);
    $('cfgPrep').value = c.prep; $('cfgPost').value = c.postRest; $('cfgCad').value = c.cadence;
    $('blocks').innerHTML = c.blocks.map((b, i) => `
      <div class="block" data-i="${i}">
        <div><label>Salto (s)</label><input type="number" min="1" inputmode="numeric" data-k="work" value="${b.work}"></div>
        <div><label>Descanso (s)</label><input type="number" min="0" inputmode="numeric" data-k="rest" value="${b.rest}"></div>
        <div><label>Veces</label><input type="number" min="1" inputmode="numeric" data-k="reps" value="${b.reps}"></div>
        <button type="button" class="btn danger small" data-del="${i}" aria-label="Borrar bloque ${i + 1}"><svg class="ico" style="pointer-events:none"><use href="#i-trash"/></svg></button>
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
      const btn = e.target.closest('[data-del]');
      if (btn) mutate(c => { if (c.blocks.length > 1) c.blocks.splice(+btn.dataset.del, 1); }, true);
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
      $('startButton').addEventListener('click', () => { if (running) togglePause(); else start(); });
      $('resetButton').addEventListener('click', reset);
      $('againButton').addEventListener('click', reset);
      $('skipButton').addEventListener('click', skip);
      document.addEventListener('visibilitychange', () => { if (running && !document.hidden) lockScreen(); });
    },
    isRunning: () => running
  };
})();
