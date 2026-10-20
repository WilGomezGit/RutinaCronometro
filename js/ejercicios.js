// Lista de ejercicios por día (vista "Ver rutina")
const defaultExercises = {
  lunes: ["3 × 1 min saltar cuerda (calentamiento)", "4 × 10-12 Press de pecho", "3 × 12 Aperturas con mancuernas", "3 × 12-15 Fondos en silla", "3 × 10-12 Extensión de tríceps", "5 min cuerda (intervalos)"],
  martes: ["3 × 1 min saltar cuerda", "4 × 10-12 Remo inclinado", "3 × 10 Remo a una mano", "4 × 12 Curl de bíceps alternado", "3 × 12 Curl martillo", "5 min saltar cuerda"],
  miercoles: ["3 × 1 min saltar cuerda", "4 × 12-15 Sentadillas con mancuernas", "3 × 10 Zancadas por pierna", "4 × 12 Peso muerto rumano", "3 × 15 Hip thrust", "5-7 min cuerda"],
  jueves: ["3 × 1 min saltar cuerda", "4 × 10-12 Press militar", "3 × 12-15 Elevaciones laterales", "3 × 12 Elevaciones frontales", "3 × 30-45 seg Plancha", "3 × 15-20 Giros rusos", "5 min cuerda"],
  viernes: ["Circuito - 3-4 rondas: 1 min cuerda, 12 press, 12 remo, 12 sentadillas, 10 press militar, 12 curl, 12 tríceps, 30s plancha, 5 min cuerda"]
};

function loadExercises(day) {
  try {
    const raw = localStorage.getItem(`ejercicios_${day}`);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignorar */ }
  return [...(defaultExercises[day] || [])];
}

function saveExercises(day, arr) {
  try { localStorage.setItem(`ejercicios_${day}`, JSON.stringify(arr)); } catch (e) { /* ignorar */ }
}
