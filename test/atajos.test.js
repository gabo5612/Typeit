// El riesgo que cubren estos tests: registrar como atajo GLOBAL una tecla que
// el usuario necesita para escribir. Si "a" se pudiera registrar, Typeit le
// robaria esa letra a todas las apps del sistema mientras este abierto.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ATAJO_DEFAULT,
  acceleratorDesdeEvento,
  formatearAtajo,
  esAcceleratorValido,
} = require('../src/shared/atajos.js');

const evento = (parcial) => ({
  key: '', code: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...parcial,
});

test('una tecla de funcion sola es un atajo valido', () => {
  assert.deepEqual(acceleratorDesdeEvento(evento({ key: 'F9' })), { accelerator: 'F9' });
});

test('una letra sola se rechaza (bloquearia esa tecla en todo el sistema)', () => {
  const r = acceleratorDesdeEvento(evento({ key: 'a', code: 'KeyA' }));
  assert.ok(r.error, 'deberia rechazarse');
  assert.match(r.error, /todo el sistema|tecla F/i);
});

test('una letra CON modificador si es valida', () => {
  assert.deepEqual(
    acceleratorDesdeEvento(evento({ key: 'a', code: 'KeyA', metaKey: true, shiftKey: true })),
    { accelerator: 'Shift+Command+A' },
  );
});

test('la letra sale de `code`, no de `key`: el layout no cambia el atajo', () => {
  // Con Shift, `key` de la tecla 2 es "@" en un layout US - el accelerator
  // tiene que seguir diciendo "2".
  const r = acceleratorDesdeEvento(evento({ key: '@', code: 'Digit2', ctrlKey: true, shiftKey: true }));
  assert.deepEqual(r, { accelerator: 'Control+Shift+2' });
});

test('presionar solo un modificador no arma nada', () => {
  const r = acceleratorDesdeEvento(evento({ key: 'Shift', shiftKey: true }));
  assert.ok(r.error);
});

test('el orden de los modificadores es estable', () => {
  const r = acceleratorDesdeEvento(evento({
    key: 'k', code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true,
  }));
  assert.deepEqual(r, { accelerator: 'Control+Alt+Shift+Command+K' });
});

test('esAcceleratorValido rechaza teclas sueltas que no son F', () => {
  assert.equal(esAcceleratorValido('F9'), true);
  assert.equal(esAcceleratorValido('Control+Shift+P'), true);
  assert.equal(esAcceleratorValido('A'), false);
  assert.equal(esAcceleratorValido('Space'), false);
  assert.equal(esAcceleratorValido(''), false);
  assert.equal(esAcceleratorValido(null), false);
});

test('el atajo por defecto es valido', () => {
  assert.equal(esAcceleratorValido(ATAJO_DEFAULT), true);
});

test('formatearAtajo usa simbolos en mac y palabras en Windows', () => {
  assert.equal(formatearAtajo('Control+Shift+Command+K', 'darwin'), '⌃⇧⌘K');
  assert.equal(formatearAtajo('Control+Shift+K', 'win32'), 'Ctrl+Shift+K');
  assert.equal(formatearAtajo('F9', 'darwin'), 'F9');
  assert.equal(formatearAtajo('', 'darwin'), '');
});
