// Navegación entre pestañas (Reloj / Rutina / Configurar) y lista de ejercicios
let modal, modalList, modalDaySpan, newExerciseInput;

const DAY_NAMES = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

function getDayFromQuery() {
  const d = new URLSearchParams(location.search).get('dia');
  return DAY_NAMES[d] ? d : 'lunes';
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderExercises(day) {
  const list = document.getElementById('exerciseList');
  list.innerHTML = '';
  const arr = loadExercises(day);
  if (!arr.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin ejercicios. Pulsa "Añadir ejercicio".';
    list.appendChild(li);
  }
  arr.forEach((ex, idx) => {
    const li = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'text'; text.textContent = ex;
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn danger small'; del.textContent = 'Eliminar';
    del.addEventListener('click', () => { arr.splice(idx, 1); saveExercises(day, arr); renderExercises(day); });
    li.append(text, del);
    list.appendChild(li);
  });
}

function renderModalList(day) {
  modalList.innerHTML = '';
  const arr = loadExercises(day);
  arr.forEach((ex, idx) => {
    const div = document.createElement('div');
    div.className = 'modal-item';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = ex;
    inp.addEventListener('change', () => { const a = loadExercises(day); a[idx] = inp.value; saveExercises(day, a); renderExercises(day); });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn danger small'; del.textContent = 'Eliminar';
    del.addEventListener('click', () => { const a = loadExercises(day); a.splice(idx, 1); saveExercises(day, a); renderModalList(day); renderExercises(day); });
    div.append(inp, del);
    modalList.appendChild(div);
  });
}

function openModal(day) {
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modalDaySpan.textContent = capitalize(day);
  renderModalList(day);
}
function closeModal() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  newExerciseInput.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const day = getDayFromQuery();
  const views = { reloj: 'viewReloj', rutina: 'viewRutina', config: 'viewConfig' };

  // sin pestaña elegida: volver al inicio (ahí se elige Reloj o Rutina)
  const first = location.hash.slice(1);
  if (!views[first]) { location.replace(`index.html?dia=${day}`); return; }

  modal = document.getElementById('modal');
  modalList = document.getElementById('modalList');
  modalDaySpan = document.getElementById('modalDay');
  newExerciseInput = document.getElementById('newExerciseInput');

  function show(name) {
    Object.entries(views).forEach(([k, id]) => document.getElementById(id).classList.toggle('hidden', k !== name));
    document.body.classList.toggle('view-reloj', name === 'reloj');
    document.querySelectorAll('.mainnav [data-go]').forEach(b => {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    try { history.replaceState(null, '', `?dia=${day}#${name}`); } catch (e) { /* ignorar */ }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const leave = e.target.closest('[data-leave]');
    if (leave) {
      if (window.Reloj.isRunning() && !confirm('El reloj está en marcha. ¿Salir de todas formas?')) e.preventDefault();
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) show(go.dataset.go);
  });

  const dayName = DAY_NAMES[day];
  document.getElementById('dayTitle').textContent = dayName;
  document.getElementById('dayLabel').textContent = dayName;
  const home = `index.html?dia=${day}`;
  document.getElementById('navInicio').href = home;
  document.getElementById('logoLink').href = home;

  renderExercises(day);
  Reloj.init(day);

  document.getElementById('addNewExercise').addEventListener('click', () => {
    const txt = newExerciseInput.value.trim();
    if (!txt) return alert('Escribe un ejercicio');
    const arr = loadExercises(day); arr.push(txt); saveExercises(day, arr);
    renderModalList(day); renderExercises(day); newExerciseInput.value = '';
  });
  document.getElementById('saveModal').addEventListener('click', closeModal);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('editBtn').addEventListener('click', () => openModal(day));
  document.getElementById('addExerciseBtn').addEventListener('click', () => openModal(day));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (views[h]) show(h); });
  show(first);
});
