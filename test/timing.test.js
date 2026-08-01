// timing.js es logica pura (sin Electron ni procesos hijos), asi que se testea
// directo con node:test. Es el modulo que define el "ritmo humano" y el que mas
// caro sale equivocar: un plan mal armado escribe texto distinto al pegado.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TECLAS,
  crearRng,
  planificarTecleo,
  duracionPlanMs,
  estimarDuracionMs,
  textoDelPlan,
} = require('../src/shared/timing.js');

// Semilla fija: los tests que dependen del azar tienen que ser reproducibles.
const rng = () => crearRng(20260801);

// --- Fidelidad del texto (lo mas importante) --------------------------------

test('el plan reproduce exactamente el texto de entrada', () => {
  const texto = 'Hola mundo, esto es una prueba.';
  const plan = planificarTecleo(texto, { errores: 0 }, rng());
  assert.equal(textoDelPlan(plan), texto);
});

test('los saltos de linea y tabs salen como teclas, no como caracteres', () => {
  const plan = planificarTecleo('a\nb\tc', {}, rng());
  const codes = plan.map((ev) => ev.code);
  assert.ok(codes.includes(TECLAS.RETURN), 'falta la tecla Return');
  assert.ok(codes.includes(TECLAS.TAB), 'falta la tecla Tab');
  assert.equal(textoDelPlan(plan), 'a\nb\tc');
});

test('CRLF de Windows produce UN solo Return (no dos)', () => {
  const plan = planificarTecleo('a\r\nb', {}, rng());
  assert.equal(plan.filter((ev) => ev.code === TECLAS.RETURN).length, 1);
  assert.equal(textoDelPlan(plan), 'a\nb');
});

test('acentos y ñ pasan como un solo evento cada uno', () => {
  const texto = 'añoración ¿qué? ¡sí!';
  const plan = planificarTecleo(texto, {}, rng());
  assert.equal(plan.length, [...texto].length);
  assert.equal(textoDelPlan(plan), texto);
});

test('un emoji es un evento, no dos mitades de surrogate', () => {
  const plan = planificarTecleo('a😀b', {}, rng());
  assert.equal(plan.length, 3);
  assert.equal(plan[1].code, 0x1f600);
  assert.equal(textoDelPlan(plan), 'a😀b');
});

test('con errores activados el texto FINAL sigue siendo el correcto', () => {
  const texto = 'el rapido zorro marron salta sobre el perro perezoso';
  // 100% de errores: cada letra se equivoca y se corrige, caso extremo.
  const plan = planificarTecleo(texto, { errores: 10 }, crearRng(7));
  assert.ok(plan.some((ev) => ev.code === TECLAS.BACKSPACE), 'no se genero ningun error');
  assert.equal(textoDelPlan(plan), texto);
});

test('texto vacio no genera plan', () => {
  assert.deepEqual(planificarTecleo('', {}, rng()), []);
});

// --- Ritmo -------------------------------------------------------------------

test('la duracion total se acerca al wpm pedido (+-20%)', () => {
  // 500 caracteres a 50 wpm = 250 cpm = 2 minutos exactos si no hubiera pausas.
  const texto = 'x'.repeat(500);
  const plan = planificarTecleo(texto, { wpm: 50, pausas: false, errores: 0 }, rng());
  const esperado = (500 / (50 * 5)) * 60000;
  const real = duracionPlanMs(plan);
  assert.ok(Math.abs(real - esperado) / esperado < 0.2, `esperado ~${esperado} ms, dio ${real} ms`);
});

test('mas wpm = menos tiempo', () => {
  const texto = 'una frase de prueba razonablemente larga para medir';
  const lento = duracionPlanMs(planificarTecleo(texto, { wpm: 20 }, rng()));
  const rapido = duracionPlanMs(planificarTecleo(texto, { wpm: 80 }, rng()));
  assert.ok(rapido < lento, `rapido=${rapido} deberia ser menor que lento=${lento}`);
});

test('variacion 0 da un ritmo de metronomo; variacion alta lo rompe', () => {
  const texto = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fijo = planificarTecleo(texto, { variacion: 0, pausas: false }, rng()).slice(0, -1);
  const unicos = new Set(fijo.map((ev) => ev.delayMs));
  assert.equal(unicos.size, 1, 'con variacion 0 todas las esperas deberian ser iguales');

  const variado = planificarTecleo(texto, { variacion: 0.5, pausas: false }, rng()).slice(0, -1);
  assert.ok(new Set(variado.map((ev) => ev.delayMs)).size > 5, 'con variacion 0.5 deberia haber esperas distintas');
});

test('con pausas activadas un punto frena mas que una letra', () => {
  // Sin variacion para aislar el efecto de la puntuacion del jitter.
  const plan = planificarTecleo('ab. cd', { variacion: 0, pausas: true }, rng());
  const trasLetraA = plan[0].delayMs;
  const trasPunto = plan[2].delayMs;
  assert.ok(trasPunto > trasLetraA * 3, `tras punto=${trasPunto} deberia ser mucho mayor que ${trasLetraA}`);
});

test('la ultima tecla no espera a nada', () => {
  const plan = planificarTecleo('hola', {}, rng());
  assert.equal(plan[plan.length - 1].delayMs, 0);
});

test('las esperas nunca bajan del minimo ejecutable', () => {
  // 400 wpm es el tope; a esa velocidad la espera nominal cae por debajo del
  // minimo y el clamp tiene que sostenerla.
  const plan = planificarTecleo('x'.repeat(200), { wpm: 400, variacion: 0.8 }, rng());
  assert.ok(plan.slice(0, -1).every((ev) => ev.delayMs >= 10), 'hay esperas por debajo de 10 ms');
});

test('wpm fuera de rango se recorta en vez de romper', () => {
  const cero = planificarTecleo('hola', { wpm: 0 }, rng());
  const negativo = planificarTecleo('hola', { wpm: -50 }, rng());
  assert.ok(duracionPlanMs(cero) > 0);
  assert.ok(duracionPlanMs(negativo) > 0);
});

// --- Estimacion para la UI ---------------------------------------------------

test('estimarDuracionMs queda cerca de la duracion real del plan', () => {
  const texto = 'Estimado equipo, adjunto el resumen del mes. Quedo atento a comentarios.\nSaludos.';
  const opciones = { wpm: 45, variacion: 0.35, pausas: true, errores: 0 };
  const estimado = estimarDuracionMs(texto, opciones);
  const real = duracionPlanMs(planificarTecleo(texto, opciones, rng()));
  // La estimacion ignora el jitter y promedia las pausas de "pensar", asi que
  // se le pide estar en el mismo orden de magnitud, no ser exacta.
  assert.ok(Math.abs(real - estimado) / estimado < 0.35, `estimado=${estimado} real=${real}`);
});

test('estimarDuracionMs de texto vacio es 0', () => {
  assert.equal(estimarDuracionMs('', {}), 0);
});
