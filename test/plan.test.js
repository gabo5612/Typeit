// El plan serializado es el contrato entre el proceso main y los scripts de
// AppleScript / PowerShell. La propiedad que importa es que NUNCA salga un
// caracter que haya que escapar: el texto del usuario puede traer comillas,
// saltos de linea, backslashes o emoji, y todo eso tiene que viajar como
// numeros.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TECLAS,
  crearRng,
  planificarTecleo,
  serializarPlan,
  deserializarPlan,
  textoDelPlan,
} = require('../src/shared/timing.js');

const rng = () => crearRng(4242);

test('el plan serializado solo contiene digitos, guion, dos puntos y comas', () => {
  const hostil = `Comillas "dobles" y 'simples', backslash \\, backtick \`, $(rm -rf /),
tab\ty salto, unicode: ñáéíóú ¿¡ €, emoji 😀, y «guillemets».`;
  const serie = serializarPlan(planificarTecleo(hostil, { errores: 5 }, rng()));
  assert.match(serie, /^[0-9:,-]+$/, 'se colo un caracter que habria que escapar');
});

test('serializar y deserializar es ida y vuelta exacta', () => {
  const plan = planificarTecleo('Hola\tmundo\n¿que tal? 😀', { errores: 4 }, rng());
  const vuelta = deserializarPlan(serializarPlan(plan));
  assert.deepEqual(vuelta, plan);
  assert.equal(textoDelPlan(vuelta), textoDelPlan(plan));
});

test('las teclas especiales viajan como negativos reconocibles', () => {
  const serie = serializarPlan([
    { code: TECLAS.BACKSPACE, delayMs: 100 },
    { code: TECLAS.RETURN, delayMs: 200 },
    { code: TECLAS.TAB, delayMs: 0 },
  ]);
  assert.equal(serie, '-1:100,-2:200,-3:0');
});

test('deserializar cadena vacia da plan vacio (no un evento basura)', () => {
  assert.deepEqual(deserializarPlan(''), []);
});

test('un texto largo no explota el tamano del plan', () => {
  // 20k caracteres: el plan se escribe a archivo, pero conviene saber cuanto
  // pesa para que ningun backend lo reciba por argv sin querer.
  const serie = serializarPlan(planificarTecleo('lorem ipsum '.repeat(1700), {}, rng()));
  assert.ok(serie.length < 300000, `el plan pesa ${serie.length} bytes`);
});
