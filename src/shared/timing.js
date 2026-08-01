// Planificador de tecleo humano: convierte un texto en una lista de EVENTOS
// de teclado con su espera individual. Es logica pura (sin Electron, sin
// procesos hijos) para poder testearla con node:test, y es la unica fuente de
// verdad del "ritmo": los backends de macOS/Windows solo ejecutan el plan.
//
// Cada evento es { code, delayMs }:
//   - code >= 0  -> code point Unicode del caracter a escribir
//   - code < 0   -> tecla especial (ver TECLAS)
//   - delayMs    -> cuanto esperar DESPUES de ese evento
//
// El plan se serializa como "code:delay,code:delay,..." (solo digitos, ':' y
// ',') para pasarlo a AppleScript/PowerShell sin ningun problema de escape.

const TECLAS = {
  BACKSPACE: -1,
  RETURN: -2,
  TAB: -3,
};

const DEFAULTS = {
  // Palabras por minuto. La convencion de mecanografia es 1 palabra = 5
  // caracteres, asi que 45 wpm = 225 caracteres por minuto = ~267 ms/tecla.
  wpm: 45,
  // 0..1. Cuanto varia cada tecla respecto a la base. 0 = ritmo de metronomo
  // (se nota robotico), 0.35 = variacion humana normal.
  variacion: 0.35,
  // Pausas mas largas despues de puntuacion y saltos de linea.
  pausas: true,
  // % de teclas que salen mal y se corrigen con backspace (0 = nunca).
  errores: 0,
};

// Limites duros. El minimo evita planes imposibles de ejecutar (el overhead
// real por tecla del backend ya es de unos pocos ms).
const MIN_DELAY_MS = 10;
const MAX_DELAY_MS = 5000;

/**
 * PRNG determinista (mulberry32). Se usa una semilla explicita en los tests
 * para que el plan sea reproducible; en produccion se siembra al azar.
 */
function crearRng(semilla) {
  let a = semilla >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Teclas vecinas en QWERTY: de donde sale el "typo" cuando se simulan errores.
// Solo minusculas; para una mayuscula se toma la vecina y se pasa a mayuscula.
const VECINAS = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok',
  o: 'ipl', p: 'ol', a: 'qsz', s: 'awdx', d: 'sefc', f: 'drgv', g: 'fthb',
  h: 'gyjn', j: 'hukm', k: 'jil', l: 'kop', z: 'asx', x: 'zsdc', c: 'xdfv',
  v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

const FIN_ORACION = '.!?';
const PAUSA_MEDIA = ',;:';

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizarOpciones(opciones = {}) {
  return {
    wpm: clamp(Number(opciones.wpm) || DEFAULTS.wpm, 5, 400),
    variacion: clamp(Number(opciones.variacion ?? DEFAULTS.variacion), 0, 1),
    pausas: opciones.pausas ?? DEFAULTS.pausas,
    errores: clamp(Number(opciones.errores) || 0, 0, 10),
  };
}

/**
 * Convierte el texto en una lista de code points, mapeando los caracteres de
 * control a teclas especiales. Se itera por CODE POINT (no por unidad UTF-16)
 * para que un emoji sea un solo evento y no dos mitades de surrogate.
 */
function aEventosBase(texto) {
  const salida = [];
  for (const ch of String(texto)) {
    if (ch === '\r') continue; // CRLF -> un solo RETURN (lo aporta el \n)
    if (ch === '\n') salida.push({ code: TECLAS.RETURN, ch });
    else if (ch === '\t') salida.push({ code: TECLAS.TAB, ch });
    else salida.push({ code: ch.codePointAt(0), ch });
  }
  return salida;
}

/**
 * Genera un plan de tecleo a partir del texto.
 *
 * @param {string} texto
 * @param {{wpm?: number, variacion?: number, pausas?: boolean, errores?: number}} opciones
 * @param {() => number} [rng] generador 0..1 (inyectable para tests)
 * @returns {Array<{code: number, delayMs: number}>}
 */
function planificarTecleo(texto, opciones = {}, rng = Math.random) {
  const op = normalizarOpciones(opciones);
  const base = aEventosBase(texto);
  if (base.length === 0) return [];

  // wpm -> ms por tecla (1 palabra = 5 caracteres, convencion de mecanografia).
  const msPorTecla = 60000 / (op.wpm * 5);
  const plan = [];

  const espera = (factor) => {
    // Variacion simetrica alrededor de la base. Con variacion=0.35 una tecla
    // tarda entre el 65% y el 135% del ritmo nominal.
    const jitter = 1 + (rng() * 2 - 1) * op.variacion;
    return clamp(Math.round(msPorTecla * factor * jitter), MIN_DELAY_MS, MAX_DELAY_MS);
  };

  for (let i = 0; i < base.length; i++) {
    const { code, ch } = base[i];
    const siguiente = base[i + 1];

    // --- Error humano: teclear la vecina, notarlo, borrar y corregir -------
    if (op.errores > 0 && code >= 0 && rng() * 100 < op.errores) {
      const minuscula = ch.toLowerCase();
      const vecinas = VECINAS[minuscula];
      if (vecinas) {
        const elegida = vecinas[Math.floor(rng() * vecinas.length)];
        const equivocada = ch === minuscula ? elegida : elegida.toUpperCase();
        plan.push({ code: equivocada.codePointAt(0), delayMs: espera(1) });
        // El "me di cuenta" tarda mas que una tecla normal.
        plan.push({ code: TECLAS.BACKSPACE, delayMs: espera(1.8) });
      }
    }

    // --- La tecla en si ----------------------------------------------------
    let factor = 1;
    // Los espacios se teclean con el pulgar, mas rapido que una letra.
    if (ch === ' ') factor = 0.8;

    if (op.pausas && siguiente) {
      // La pausa va DESPUES del signo, o sea antes de la tecla siguiente -
      // por eso se aplica sobre la espera del caracter actual.
      if (FIN_ORACION.includes(ch)) factor += 5;
      else if (PAUSA_MEDIA.includes(ch)) factor += 2;
      else if (code === TECLAS.RETURN) factor += 3;
    }

    // Pausa de "pensar": ~1.5% de las veces se frena entre 300 y 900 ms. Es
    // lo que mas rompe el patron de metronomo en un texto largo.
    if (op.pausas && siguiente && rng() < 0.015) {
      plan.push({ code, delayMs: clamp(Math.round(espera(factor) + 300 + rng() * 600), MIN_DELAY_MS, MAX_DELAY_MS) });
      continue;
    }

    plan.push({ code, delayMs: espera(factor) });
  }

  // La ultima tecla no necesita esperar a nada.
  plan[plan.length - 1].delayMs = 0;
  return plan;
}

/** Duracion total estimada del plan, en ms. */
function duracionPlanMs(plan) {
  return plan.reduce((total, ev) => total + ev.delayMs, 0);
}

/**
 * Estima cuanto tarda un texto sin generar el plan completo (para mostrarlo en
 * la UI mientras el usuario mueve el slider). Es una aproximacion: usa el
 * ritmo medio, sin jitter ni errores.
 */
function estimarDuracionMs(texto, opciones = {}) {
  const op = normalizarOpciones(opciones);
  const eventos = aEventosBase(texto);
  if (eventos.length === 0) return 0;
  const msPorTecla = 60000 / (op.wpm * 5);
  let total = 0;
  for (let i = 0; i < eventos.length - 1; i++) {
    const { code, ch } = eventos[i];
    let factor = ch === ' ' ? 0.8 : 1;
    if (op.pausas) {
      if (FIN_ORACION.includes(ch)) factor += 5;
      else if (PAUSA_MEDIA.includes(ch)) factor += 2;
      else if (code === TECLAS.RETURN) factor += 3;
    }
    total += msPorTecla * factor;
  }
  // Errores: cada uno agrega una tecla de mas + un backspace lento.
  if (op.errores > 0) total += eventos.length * (op.errores / 100) * msPorTecla * 2.8;
  // Pausas de pensar: 1.5% de las teclas, ~600 ms promedio.
  if (op.pausas) total += eventos.length * 0.015 * 600;
  return Math.round(total);
}

/**
 * Serializa el plan al formato que consumen los backends: "code:delay,...".
 * Solo produce digitos, '-', ':' y ',' - nunca hay que escapar nada, que es
 * justo el punto (el texto del usuario puede tener comillas, saltos de linea,
 * acentos o emoji sin romper el script de AppleScript/PowerShell).
 */
function serializarPlan(plan) {
  return plan.map((ev) => `${ev.code}:${ev.delayMs}`).join(',');
}

/** Inversa de serializarPlan (solo se usa en tests). */
function deserializarPlan(texto) {
  if (!texto) return [];
  return texto.split(',').map((par) => {
    const [code, delayMs] = par.split(':');
    return { code: Number(code), delayMs: Number(delayMs) };
  });
}

/** Reconstruye el texto que produciria un plan (aplicando los backspaces). */
function textoDelPlan(plan) {
  const salida = [];
  for (const ev of plan) {
    if (ev.code === TECLAS.BACKSPACE) salida.pop();
    else if (ev.code === TECLAS.RETURN) salida.push('\n');
    else if (ev.code === TECLAS.TAB) salida.push('\t');
    else salida.push(String.fromCodePoint(ev.code));
  }
  return salida.join('');
}

module.exports = {
  TECLAS,
  DEFAULTS,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  crearRng,
  planificarTecleo,
  duracionPlanMs,
  estimarDuracionMs,
  serializarPlan,
  deserializarPlan,
  textoDelPlan,
};
