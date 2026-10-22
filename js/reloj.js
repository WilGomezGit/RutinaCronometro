// Reloj de saltos: anillo de progreso, conteo estimado de saltos y resumen final.
// Sesión 1: salto de cuerda (bloques configurables, con preparación solo al comenzar).
// Sesión 2 (opcional): otros ejercicios, ejercicio → descanso hasta pulsar "Terminar rutina", sin preparación.
(function () {
  const $ = id => document.getElementById(id);
  const CIRC = 2 * Math.PI * 164;
  const ring = $('ring');
  ring.style.strokeDasharray = CIRC;

  let day, cfg, othersOn = false;
  let phases = [], idx = 0, grand = 0;
  let phaseStart = 0, phaseElapsed = 0, doneBefore = 0;
  let running = false, paused = false, raf = 0, lastBeep = -1, wakeLock = null;
  let sets = [], otherSets = [], otherCount = 0;   // resultados por serie / por ejercicio

  // --- Presentación ---
  const NAME = { prep: 'Prepárate', ready: 'Prepárate', work: 'Activo', rest: 'Descansa' };
  const CHIP = { prep: 'Preparación', ready: 'Preparación', work: 'Ejercicio', rest: 'Descanso' };
  const NEXT = { prep: 'Prepárate', ready: 'Prepárate', work: 'Ejercicio', rest: 'Descanso' };
  const BODY = { prep: 'phase-preparation', ready: 'phase-preparation', work: 'phase-exercise', rest: 'phase-rest' };
  const BODY_ALL = ['phase-preparation', 'phase-exercise', 'phase-rest'];
  let workTotal = 0, restTotal = 0, totalSeries = 0, lastNotes = ['', ''];
  let segEls = [], seriesInfo = [], seriesEls = [];

  const mmss = s => fmt(Math.floor(s + 1e-6));   // acumulados: sin redondear hacia arriba

  // Dígitos que suben desde abajo al cambiar (cada dígito en su propia ranura)
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  function roll(el) {
    let text = '', slots = [];
    return function set(next, instant) {
      if (next === text) return;
      el.dataset.value = next;
      if (slots.length !== next.length) {
        el.innerHTML = '';
        slots = [...next].map(ch => {
          const slot = document.createElement('span');
          slot.className = ch === ':' ? 'sep' : 'dg';
          const cur = document.createElement('span');
          cur.className = 'cur'; cur.textContent = ch;
          slot.appendChild(cur); el.appendChild(slot);
          return slot;
        });
        text = next; return;
      }
      [...next].forEach((ch, i) => {
        if (ch === text[i]) return;
        const slot = slots[i];
        slot.querySelectorAll('.old').forEach(n => n.remove());
        const old = slot.querySelector('.cur');
        const nw = document.createElement('span');
        nw.className = 'cur'; nw.textContent = ch;
        old.className = 'old'; old.setAttribute('aria-hidden', 'true');
        slot.appendChild(nw);
        if (instant || document.hidden || (reduceMotion && reduceMotion.matches) || !old.animate) { old.remove(); return; }
        const opts = { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' };
        old.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-110%)', opacity: 0 }], { ...opts, fill: 'forwards' })
          .onfinish = () => old.remove();
        nw.animate([{ transform: 'translateY(110%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], opts);
      });
      text = next;
    };
  }
  const setTimer = roll($('timer')), setWork = roll($('workClock')), setRest = roll($('restClock'));

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

  // segundos acumulados de un tipo de fase (fases completas + parcial actual), opcionalmente de una sesión
  function spent(type, el, session) {
    let s = 0;
    for (let i = 0; i < idx; i++) if (phases[i].type === type && (!session || phases[i].session === session)) s += phases[i].dur;
    const p = phases[idx];
    if (p && p.type === type && (!session || p.session === session)) s += el;
    return s;
  }
  function workedSoFar(el) { return spent('work', el, 'cuerda'); }   // los saltos solo cuentan la cuerda

  function currentEl() {
    const p = phases[idx];
    return Math.min(p.dur, paused ? phaseElapsed : phaseElapsed + (performance.now() - phaseStart) / 1000);
  }

  // totales por tipo (fase actual con `el` segundos; idx === phases.length si ya terminó)
  function totalsAt(el) {
    const t = { work: 0, rest: 0, prep: 0, cuerda: 0, otros: 0 };
    phases.forEach((p, i) => {
      const d = i < idx ? p.dur : (i === idx ? el : 0);
      if (!d) return;
      if (p.type === 'work') { t.work += d; t[p.session === 'otros' ? 'otros' : 'cuerda'] += d; }
      else if (p.type === 'rest') t.rest += d;
      else t.prep += d;
    });
    return t;
  }

  function updateToggle() {
    const label = !running ? 'Iniciar' : paused ? 'Continuar' : 'Pausar';
    $('startLabel').textContent = label;
    $('startButton').dataset.state = running && !paused ? 'pause' : 'play';
    $('skipButton').disabled = !running;
    $('finishButton').classList.toggle('hidden', !running);
  }

  // siguiente fase conocida o prevista (las de "otros ejercicios" se generan sobre la marcha)
  function peekNext(i) {
    if (phases[i + 1]) return phases[i + 1];
    if (!othersOn) return null;
    const p = phases[i];
    if (p.session === 'otros' && p.type === 'work' && cfg.others.rest > 0) return { type: 'rest', dur: cfg.others.rest };
    return { type: 'work', dur: cfg.others.work };
  }

  function serieText(p) {
    if (!p) return `Serie 0 de ${totalSeries}`;
    return p.session === 'otros' ? `Otros ejercicios · ${p.n}` : `Serie ${p.n || 0} de ${totalSeries}`;
  }

  function setPhaseUI(p) {
    const type = p ? p.type : 'prep';
    $('viewReloj').dataset.phase = type === 'ready' ? 'prep' : type;
    document.body.classList.remove(...BODY_ALL);
    document.body.classList.add(BODY[type]);
    $('phase').textContent = p ? NAME[type] : 'Listo';
    $('phaseChip').textContent = p ? CHIP[type] : 'Listo';
    $('serieChip').textContent = serieText(p);
    const nxt = p && peekNext(idx);
    $('next').textContent = p ? (nxt ? `Siguiente: ${NEXT[nxt.type]} ${nxt.dur} s` : 'Última fase') : '';
    updateSeries();
  }

  // --- Línea de tiempo y lista de series (se dibujan desde `phases`) ---
  function addSegment(p) {
    const seg = document.createElement('span');
    seg.className = 'seg ' + p.type;
    seg.style.flex = `${p.dur} 1 0`;
    const fill = document.createElement('i');
    seg.appendChild(fill);
    $('timeline').appendChild(seg);
    segEls.push(fill);
  }

  function addSeriesRow(info) {
    const row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = `<span class="snum">${info.label}</span><span class="sdesc">${info.desc}</span><span class="sst"></span>`;
    $('seriesList').appendChild(row);
    seriesInfo.push(info); seriesEls.push(row);
  }

  function buildTimelineAndSeries() {
    $('timeline').innerHTML = ''; $('seriesList').innerHTML = '';
    segEls = []; seriesInfo = []; seriesEls = [];
    phases.forEach(addSegment);
    phases.forEach((p, i) => {
      if (p.type !== 'work') return;
      let last = i, rest = 0;
      phases.forEach((q, j) => { if (q.n === p.n && q.type !== 'work' && q.type !== 'prep') { last = Math.max(last, j); if (q.type === 'rest') rest = q.dur; } });
      addSeriesRow({ label: p.n, work: i, last, desc: `${p.dur} s activo` + (rest ? ` · ${rest} s descanso` : '') });
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

  // Otros ejercicios: genera la siguiente fase (ejercicio → descanso → ejercicio …)
  function extendOthers() {
    const last = phases[phases.length - 1];
    const o = cfg.others;
    let p;
    if (last.session === 'otros' && last.type === 'work' && o.rest > 0) {
      p = { type: 'rest', session: 'otros', dur: o.rest, n: last.n };
    } else {
      otherCount++;
      p = { type: 'work', session: 'otros', dur: o.work, n: otherCount };
      addSeriesRow({ label: 'E' + otherCount, work: phases.length, last: phases.length + (o.rest > 0 ? 1 : 0),
        desc: `${o.work} s ejercicio` + (o.rest > 0 ? ` · ${o.rest} s descanso` : '') });
    }
    phases.push(p);
    addSegment(p);
  }

  function draw() {
    const p = phases[idx];
    if (!p) return false;
    const el = currentEl();
    const left = p.dur - el;
    setTimer(fmt(left));
    ring.style.strokeDashoffset = CIRC * (1 - left / p.dur);   // se ajusta a cada fase
    const done = doneBefore + el;
    $('elapsed').textContent = 'Total ' + mmss(done);
    $('remaining').textContent = p.session === 'otros' ? 'Otros ejercicios' : `Restante ${fmt(grand - done)} de ${fmt(grand)}`;
    document.title = `${fmt(left)} · ${NAME[p.type]}`;
    segEls[idx].style.width = (el / p.dur * 100) + '%';

    // acumuladores: ejercicio = cuerda + otros (sin descansos); descanso aparte
    const w = spent('work', el), r = spent('rest', el);
    const ow = spent('work', el, 'otros'), or = spent('rest', el, 'otros');
    setWork(mmss(w));
    setRest(mmss(r));
    $('workBar').style.width = Math.min(100, workTotal ? w / workTotal * 100 : 0) + '%';
    $('restBar').style.width = Math.min(100, restTotal ? r / restTotal * 100 : 0) + '%';
    const wn = ow > 0 ? `de ${fmt(workTotal)} de cuerda · +${mmss(ow)} otros` : `de ${fmt(workTotal)} · solo tiempo activo, sin descansos`;
    const rn = or > 0 ? `de ${fmt(restTotal)} de cuerda · +${mmss(or)} otros` : `de ${fmt(restTotal)} de descanso`;
    if (wn !== lastNotes[0]) $('workNote').textContent = lastNotes[0] = wn;
    if (rn !== lastNotes[1]) $('restNote').textContent = lastNotes[1] = rn;

    const worked = workedSoFar(el);
    $('jumpsNow').textContent = jumpsFor(worked);
    $('jumpsRate').textContent = worked > 0 ? cfg.cadence : 0;
    $('jumpsSet').textContent = p.type === 'work' && p.session === 'cuerda' ? jumpsFor(el) : '0';

    const sec = Math.ceil(left);
    if (sec <= 3 && sec > 0 && sec !== lastBeep) { lastBeep = sec; beep(660, 120); }
    return el >= p.dur;
  }

  function tick() {
    if (!running) return;
    if (!paused && draw()) nextPhase();
    raf = requestAnimationFrame(tick);
  }

  function record(p, dur) {
    if (p.type !== 'work') return;
    if (p.session === 'otros') otherSets.push({ n: p.n, dur });
    else sets.push({ n: p.n, dur, jumps: jumpsFor(dur) });
  }

  function nextPhase() {
    const done = phases[idx];
    record(done, done.dur);
    segEls[idx].style.width = '100%';
    doneBefore += done.dur;
    idx++;
    lastBeep = -1;
    if (idx >= phases.length) {
      if (othersOn) extendOthers();
      else { finish(totalsAt(0)); return; }
    }
    phaseElapsed = 0; phaseStart = performance.now();
    beep(1320, 300);
    if (navigator.vibrate) navigator.vibrate(200);
    setPhaseUI(phases[idx]);
    $('jumpsSet').textContent = '0';
  }

  // "Terminar rutina": cuenta lo hecho hasta ahora, incluida la fase en curso
  function endNow() {
    if (!running) return;
    if (phases[idx].session === 'cuerda' && !confirm('¿Terminar la rutina ahora?')) return;
    const p = phases[idx], el = currentEl();
    const d = Math.floor(el);
    if (d > 0) record(p, d);
    const tot = totalsAt(el);
    idx = phases.length;
    finish(tot);
  }

  function finish(tot) {
    running = false;
    cancelAnimationFrame(raf);
    unlockScreen();
    updateSeries();
    updateToggle();
    document.title = 'Wil Fit Timer';
    const total = sets.reduce((s, x) => s + x.jumps, 0);
    $('sumTotal').textContent = total;
    $('sumLine').textContent = `${fmt(tot.cuerda)} saltando · ${cfg.cadence} saltos/min` +
      (tot.otros ? ` · ${fmt(tot.otros)} en otros ejercicios` : '');
    $('sumLine2').textContent = `Ejercicio ${fmt(tot.work)} + descanso ${fmt(tot.rest)} + preparación ${fmt(tot.prep)} = ${fmt(tot.work + tot.rest + tot.prep)} en total`;
    $('sumRows').innerHTML = sets.map(x => `<tr><td>${x.n}</td><td>${fmt(x.dur)}</td><td>${x.jumps}</td></tr>`).join('') +
      otherSets.map(x => `<tr><td>E${x.n}</td><td>${fmt(x.dur)}</td><td>—</td></tr>`).join('');
    $('clockScreen').classList.add('hidden');
    $('summary').classList.remove('hidden');
    document.body.classList.remove(...BODY_ALL);
    try { $('alertSound').play().catch(() => {}); } catch (e) { /* ignorar */ }
    if (window.confetti) confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
  }

  // prepara fases, totales y UI a partir de la configuración guardada
  function load() {
    cfg = loadConfig(day);
    othersOn = !!cfg.others.enabled;
    phases = buildPhases(cfg);
    phases.forEach(p => { p.session = 'cuerda'; });
    grand = totalSeconds(cfg);
    workTotal = phases.filter(p => p.type === 'work').reduce((s, p) => s + p.dur, 0);
    restTotal = phases.filter(p => p.type === 'rest').reduce((s, p) => s + p.dur, 0);
    totalSeries = cfg.blocks.reduce((n, b) => n + b.reps, 0);
    idx = 0; doneBefore = 0; phaseElapsed = 0; sets = []; otherSets = []; otherCount = 0;
    buildTimelineAndSeries();
    $('summary').classList.add('hidden'); $('clockScreen').classList.remove('hidden');
    setWork('00:00', true); setRest('00:00', true);
    $('workBar').style.width = $('restBar').style.width = '0';
    lastNotes = [`de ${fmt(workTotal)} · solo tiempo activo, sin descansos`, `de ${fmt(restTotal)} de descanso`];
    $('workNote').textContent = lastNotes[0];
    $('restNote').textContent = lastNotes[1];
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
    setTimer(fmt(phases[0] ? phases[0].dur : 0), true);
    const jumpSecs = cfg.blocks.reduce((s, b) => s + b.work * b.reps, 0);
    $('next').textContent = `${totalSeries} series · ${fmt(grand)} · ≈${jumpsFor(jumpSecs)} saltos` + (othersOn ? ' + otros ejercicios' : '');
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
    $('cfgPostOn').checked = c.postRestOn; $('cfgPostField').classList.toggle('off', !c.postRestOn);
    $('cfgOOn').checked = c.others.enabled; $('cfgOWork').value = c.others.work; $('cfgORest').value = c.others.rest;
    $('cfgOFields').classList.toggle('off', !c.others.enabled);
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
    $('cfgSummary').textContent = `Cuerda: ${fmt(totalSeconds(c))} · ≈${Math.floor(jumpSecs * c.cadence / 60)} saltos a ${c.cadence}/min`;
  }

  function mutate(fn, rerender) {
    const c = loadConfig(day);
    fn(c); saveConfig(day, c);
    if (rerender) renderConfig(); else updateSummary(c);
    if (!running) reset();
  }

  function initConfig() {
    $('cfgPrep').addEventListener('input', e => mutate(c => c.prep = num(e.target.value, 0)));
    $('cfgPostOn').addEventListener('change', e => mutate(c => c.postRestOn = e.target.checked, true));
    $('cfgPost').addEventListener('input', e => mutate(c => c.postRest = num(e.target.value, 1)));
    $('cfgCad').addEventListener('input', e => mutate(c => c.cadence = num(e.target.value, 1)));
    $('cfgOOn').addEventListener('change', e => mutate(c => c.others.enabled = e.target.checked, true));
    $('cfgOWork').addEventListener('input', e => mutate(c => c.others.work = num(e.target.value, 1)));
    $('cfgORest').addEventListener('input', e => mutate(c => c.others.rest = num(e.target.value, 0)));
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
      $('finishButton').addEventListener('click', endNow);
      document.addEventListener('visibilitychange', () => { if (running && !document.hidden) lockScreen(); });
    },
    isRunning: () => running
  };
})();
