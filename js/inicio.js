// Pantalla de inicio: elegir día y ver el resumen de su rutina (solo lectura)
(function () {
  const DAYS = [
    ['lunes', 'Lunes', 'Lun'], ['martes', 'Martes', 'Mar'], ['miercoles', 'Miércoles', 'Mié'],
    ['jueves', 'Jueves', 'Jue'], ['viernes', 'Viernes', 'Vie']
  ];
  const $ = id => document.getElementById(id);

  function initialDay() {
    const q = new URLSearchParams(location.search).get('dia');
    if (DAYS.some(d => d[0] === q)) return q;
    const today = [null, 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'][new Date().getDay()];
    return today || 'lunes';
  }

  let day = initialDay();

  function render() {
    const i = DAYS.findIndex(d => d[0] === day);
    const cfg = loadConfig(day);
    const series = cfg.blocks.reduce((n, b) => n + b.reps, 0);
    const jumpSecs = cfg.blocks.reduce((s, b) => s + b.work * b.reps, 0);

    $('dayName').textContent = $('dayName2').textContent = DAYS[i][1];
    $('dayLabel').textContent = DAYS[i][1];
    $('stSeries').textContent = series;
    $('stDur').textContent = fmt(totalSeconds(cfg));
    $('stJumps').textContent = '≈' + Math.floor(jumpSecs * cfg.cadence / 60);
    $('segs').innerHTML = '<i></i>'.repeat(series);

    $('days').innerHTML = '';
    DAYS.forEach((d, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', d[1]);
      b.setAttribute('aria-pressed', String(k === i));
      b.className = 'day' + (k < i ? ' past' : '');
      b.innerHTML = `<span>${d[2]}</span><i></i>`;
      b.addEventListener('click', () => { day = d[0]; render(); });
      $('days').appendChild(b);
    });

    const link = h => `rutina.html?dia=${day}#${h}`;
    $('goReloj').href = $('goReloj2').href = $('navReloj').href = link('reloj');
    $('goRutina').href = $('goRutina0').href = $('navRutina').href = link('rutina');
    $('goConfig').href = $('navConfig').href = link('config');
    try { history.replaceState(null, '', `?dia=${day}`); } catch (e) { /* ignorar */ }
  }

  render();
})();
