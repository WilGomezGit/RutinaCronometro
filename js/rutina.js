// js/rutina.js (corregido)

// globals that functions will use
let modal, modalList, modalDaySpan, newExerciseInput;
let alertSound;

//// --- Helper to get query param 'dia' ---
function getDayFromQuery() {
  const params = new URLSearchParams(location.search);
  return params.get('dia') || 'lunes';
}

//// --- Default exercises per day ---
const defaultExercises = {
  lunes: ["3 × 1 min saltar cuerda (calentamiento)", "4 × 10-12 Press de pecho", "3 × 12 Aperturas con mancuernas", "3 × 12-15 Fondos en silla", "3 × 10-12 Extensión de tríceps", "5 min cuerda (intervalos)"],
  martes: ["3 × 1 min saltar cuerda", "4 × 10-12 Remo inclinado", "3 × 10 Remo a una mano", "4 × 12 Curl de bíceps alternado", "3 × 12 Curl martillo", "5 min saltar cuerda"],
  miercoles: ["3 × 1 min saltar cuerda", "4 × 12-15 Sentadillas con mancuernas", "3 × 10 Zancadas por pierna", "4 × 12 Peso muerto rumano", "3 × 15 Hip thrust", "5-7 min cuerda"],
  jueves: ["3 × 1 min saltar cuerda", "4 × 10-12 Press militar", "3 × 12-15 Elevaciones laterales", "3 × 12 Elevaciones frontales", "3 × 30-45 seg Plancha", "3 × 15-20 Giros rusos", "5 min cuerda"],
  viernes: ["Circuito - 3-4 rondas: 1 min cuerda, 12 press, 12 remo, 12 sentadillas, 10 press militar, 12 curl, 12 tríceps, 30s plancha, 5 min cuerda"]
};

//// --- LocalStorage helpers ---
function loadExercises(day) {
  const key = `ejercicios_${day}`;
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  return defaultExercises[day] || [];
}
function saveExercises(day, arr) {
  const key = `ejercicios_${day}`;
  localStorage.setItem(key, JSON.stringify(arr));
}

//// --- Render exercises ---
function renderExercises(day) {
  const list = document.getElementById('exerciseList');
  if (!list) return;
  list.innerHTML = '';
  const arr = loadExercises(day);
  arr.forEach((ex, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="text">${ex}</div><div><button class="btn danger small" data-idx="${idx}">Eliminar</button></div>`;
    list.appendChild(li);
  });

  // delete handlers (rebind after render)
  document.querySelectorAll('.btn.danger.small').forEach(b => {
    b.addEventListener('click', (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      arr.splice(i, 1);
      saveExercises(window.currentDay, arr);
      renderExercises(window.currentDay);
    });
  });
}

//// --- Modal controls ---
function openModal(day) {
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modalDaySpan.textContent = capitalize(day);
  renderModalList(day);
  window.currentModalDay = day;
}
function closeModal() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  newExerciseInput.value = '';
  window.currentModalDay = null;
}
function renderModalList(day) {
  modalList.innerHTML = '';
  const arr = loadExercises(day);
  arr.forEach((ex, idx) => {
    const div = document.createElement('div');
    div.className = 'modal-item';
    div.innerHTML = `<input value="${ex.replace(/"/g, '&quot;')}" data-idx="${idx}"><button class="btn danger small" data-idx="${idx}">Eliminar</button>`;
    modalList.appendChild(div);
  });

  // delete
  modalList.querySelectorAll('.btn.danger.small').forEach(b => {
    b.addEventListener('click', (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      const arr = loadExercises(window.currentModalDay);
      arr.splice(i, 1);
      saveExercises(window.currentModalDay, arr);
      renderModalList(window.currentModalDay);
    });
  });

  // change
  modalList.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', (ev) => {
      const i = Number(ev.currentTarget.dataset.idx);
      const arr = loadExercises(window.currentModalDay);
      arr[i] = ev.currentTarget.value;
      saveExercises(window.currentModalDay, arr);
      renderExercises(window.currentModalDay);
    });
  });
}

//// --- Helpers ---
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

//// --- Timer variables & helpers ---
let isPreparation = true;
let isExercise = false;
let isPaused = false;
let preparationTime = 30;
let exerciseTime = 60;
let restTime = 30;
let totalTime = 0;
let interval;
let milestone40Reached = false;

function updateTimerDisplay(time) {
  const minutes = String(Math.floor(time / 60)).padStart(2, '0');
  const seconds = String(time % 60).padStart(2, '0');
  const el = document.getElementById("timer");
  if (el) el.textContent = `${minutes}:${seconds}`;
}
function updateTotalTimeDisplay() {
  const minutes = String(Math.floor(totalTime / 60)).padStart(2, '0');
  const seconds = String(totalTime % 60).padStart(2, '0');
  const el = document.getElementById("totalTimeText");
  if (el) el.textContent = `Tiempo TOTAL: ${minutes}:${seconds}`;
}
function loadConfetti() {
  if (window.confetti) {
    confetti({
      particleCount: 200,
      spread: 90,
      origin: { y: 0.6 }
    });
  }
}

function animateTimer(type = 'phase-pulse') {
  const timerEl = document.getElementById("timer");
  if (!timerEl) return;
  timerEl.classList.remove('phase-pulse', 'phase-pop');
  void timerEl.offsetWidth;
  timerEl.classList.add(type);
}

function setPhaseBadge(label, tone) {
  const badge = document.getElementById("phaseBadge");
  if (!badge) return;
  badge.textContent = label;
  badge.style.background = tone.bg;
  badge.style.color = tone.color;
}

// update visible background (override gradient)
function updateBackground() {
  document.body.classList.remove('phase-preparation', 'phase-exercise', 'phase-rest');
  if (isPreparation) {
    document.body.classList.add('phase-preparation');
    setPhaseBadge('Preparación activa', { bg: '#fde68a', color: '#7c2d12' });
  } else if (isExercise) {
    document.body.classList.add('phase-exercise');
    setPhaseBadge('Ejercicio', { bg: '#fecaca', color: '#7f1d1d' });
  } else {
    document.body.classList.add('phase-rest');
    setPhaseBadge('Descanso', { bg: '#bfdbfe', color: '#1e3a8a' });
  }
}

// core timer
function startTimer() {
  clearInterval(interval);

  // read current values from inputs
  restTime = parseInt(document.getElementById("restTimeInput").value, 10) || 10;
  exerciseTime = parseInt(document.getElementById("exerciseTimeInput").value, 10) || 60;
  let timeLeft = isPreparation ? preparationTime : (isExercise ? exerciseTime : restTime);

  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = isPreparation ? "Preparación" : (isExercise ? "EJERCICIO GO! GO!" : "Descanso");
  animateTimer('phase-pop');

  // immediately update bg
  updateBackground();

  interval = setInterval(() => {
    if (isPaused) return;

    timeLeft--;
    updateTimerDisplay(timeLeft);

    if (!isPreparation && isExercise) totalTime++;
    updateTotalTimeDisplay();

    // aviso 4s antes
    if (timeLeft === 4) {
      alertSound && alertSound.play && alertSound.play().catch(e => console.log("Audio bloqueado o no disponible", e));
    }

    if (totalTime >= 2400 && !milestone40Reached) {
      milestone40Reached = true;
      loadConfetti();
      setPhaseBadge('Meta 40 min cumplida 🏆', { bg: '#bbf7d0', color: '#14532d' });
      setTimeout(() => alert("¡Felicidades! Has completado 40 minutos de ejercicio 🎉. Puedes continuar entrenando."), 150);
    }

    if (timeLeft === 0) {
      clearInterval(interval);

      if (isPreparation) {
        isPreparation = false;
        isExercise = true;
      } else {
        isExercise = !isExercise;
        restTime = parseInt(document.getElementById("restTimeInput").value, 10);
      }

      startTimer();
      animateTimer('phase-pulse');
    }
  }, 1000);
}

//// --- Init (single DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', function () {
  // grab DOM refs
  modal = document.getElementById('modal');
  modalList = document.getElementById('modalList');
  modalDaySpan = document.getElementById('modalDay');
  newExerciseInput = document.getElementById('newExerciseInput');

  const addNewExerciseBtn = document.getElementById('addNewExercise');
  const saveModalBtn = document.getElementById('saveModal');
  const closeModalBtn = document.getElementById('closeModal');
  const editBtn = document.getElementById('editBtn');
  const addExerciseBtn = document.getElementById('addExerciseBtn');
  const startBtn = document.getElementById('startButton');
  const pauseBtn = document.getElementById('pauseButton');
  const resetBtn = document.getElementById('resetButton');

  // audio: prefer <audio id="alertSound"> in HTML, si no existe hace fallback
  alertSound = document.getElementById('alertSound') || new Audio('assets/sounds/alert.mp3');
  try { alertSound.load(); } catch (e) { /* ignore */ }

  // make sure background changes animate (safer si también lo pones en CSS)
  document.body.style.transition = "background 0.5s ease, background-color 0.5s ease";

  // events
  addNewExerciseBtn && addNewExerciseBtn.addEventListener('click', () => {
    const day = window.currentModalDay;
    if (!day) return;
    const txt = newExerciseInput.value.trim();
    if (!txt) return alert('Escribe un ejercicio');
    const arr = loadExercises(day);
    arr.push(txt);
    saveExercises(day, arr);
    renderModalList(day);
    renderExercises(day);
    newExerciseInput.value = '';
  });

  saveModalBtn && saveModalBtn.addEventListener('click', closeModal);
  closeModalBtn && closeModalBtn.addEventListener('click', closeModal);
  editBtn && editBtn.addEventListener('click', () => openModal(window.currentDay));
  addExerciseBtn && addExerciseBtn.addEventListener('click', () => openModal(window.currentDay));

  // start: first click unlocks audio in many browsers
 startBtn && startBtn.addEventListener('click', () => {
  clearInterval(interval);
  isPaused = false;
  isPreparation = true;
  isExercise = false;
  milestone40Reached = false;
  document.body.classList.add('timer-solo');

  // 🔊 desbloqueo de audio más limpio
  if (alertSound && alertSound.load) {
    try { alertSound.load(); } catch(e){}
  }

  startTimer();
});
  pauseBtn && pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? "CONTINUAR!" : "PAUSA";
  });

  resetBtn && resetBtn.addEventListener('click', () => {
    clearInterval(interval);
    isPreparation = true;
    isExercise = false;
    totalTime = 0;
    milestone40Reached = false;
    document.body.classList.remove('timer-solo');
    updateTimerDisplay(preparationTime);
    updateTotalTimeDisplay();
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = "Preparación";
    updateBackground();
    pauseBtn && (pauseBtn.textContent = "PAUSA");
    isPaused = false;
  });

  // init page
  const day = getDayFromQuery();
  window.currentDay = day;
  document.getElementById('dayTitle').textContent = capitalize(day);
  document.getElementById('pageTitle').textContent = `Rutina — ${capitalize(day)}`;
  renderExercises(day);
  renderModalList(day);
  updateTimerDisplay(preparationTime);
  updateTotalTimeDisplay();
  updateBackground();
});
