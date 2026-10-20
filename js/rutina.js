// Navegación (menú / reloj / rutina) y lista de ejercicios
let modal, modalList, modalDaySpan, newExerciseInput;

function getDayFromQuery() {
  return new URLSearchParams(location.search).get('dia') || 'lunes';
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
    del.className = 'btn danger small'; del.textContent = 'Eliminar';
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
    inp.value = ex;
    inp.addEventListener('change', () => { const a = loadExercises(day); a[idx] = inp.value; saveExercises(day, a); renderExercises(day); });
    const del = document.createElement('button');
    del.className = 'btn danger small'; del.textContent = 'Eliminar';
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
  const views = { choice: 'viewChoice', rutina: 'viewRutina', reloj: 'viewReloj' };

  modal = document.getElementById('modal');
  modalList = document.getElementById('modalList');
  modalDaySpan = document.getElementById('modalDay');
  newExerciseInput = document.getElementById('newExerciseInput');

  function show(name) {
    Object.entries(views).forEach(([k, id]) => document.getElementById(id).classList.toggle('hidden', k !== name));
    document.getElementById('siteHeader').classList.toggle('hidden', name === 'reloj');
    document.getElementById('siteFooter').classList.toggle('hidden', name === 'reloj');
    if (name !== 'reloj') document.body.classList.remove('phase-preparation', 'phase-exercise', 'phase-rest');
    try { history.replaceState(null, '', `?dia=${day}${name === 'choice' ? '' : '#' + name}`); } catch (e) { /* ignorar */ }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    if (window.Reloj.isRunning() && go.dataset.go !== 'reloj' && !confirm('El reloj está en marcha. ¿Salir de todas formas?')) return;
    show(go.dataset.go);
  });

  document.getElementById('dayTitle').textContent = capitalize(day);
  document.getElementById('pageTitle').textContent = capitalize(day);
  document.getElementById('choiceTitle').textContent = `${capitalize(day)}: ¿qué quieres hacer?`;

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

  const h = location.hash.slice(1);
  show(views[h] ? h : 'choice');
});
