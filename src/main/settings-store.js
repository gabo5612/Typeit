// Configuracion de la app (clave/valor) persistida como JSON en la carpeta de
// datos del usuario. Todo lo que se guarda pasa por un clamp/validacion: el
// archivo es editable a mano y un valor corrupto no deberia poder romper el
// motor de tecleo (ni, por ejemplo, registrar un atajo global invalido).
//
// El TEXTO a escribir NO se guarda a proposito: es contenido del usuario y
// vive solo en memoria mientras la ventana esta abierta.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { ATAJO_DEFAULT, esAcceleratorValido } = require('../shared/atajos');
const { DEFAULTS: TIMING_DEFAULTS } = require('../shared/timing');

const DEFAULTS = {
  atajo: ATAJO_DEFAULT,
  wpm: TIMING_DEFAULTS.wpm,
  variacion: TIMING_DEFAULTS.variacion,
  pausas: TIMING_DEFAULTS.pausas,
  errores: TIMING_DEFAULTS.errores,
  // Cuanto espera despues del atajo antes de la primera tecla. Da margen para
  // soltar la tecla y para que el campo destino termine de tomar el foco.
  retrasoInicioMs: 400,
  // Encoger la ventana a una barra flotante mientras se escribe, para no tapar
  // el campo destino pero seguir viendo el progreso.
  compacto: true,
};

// Los tests corren con ELECTRON_RUN_AS_NODE=1, donde `require('electron')`
// devuelve un string y no hay `app.getPath`. Con esto pueden apuntar el store a
// una carpeta temporal, igual que db.initDb(dbPath) en QuickTask2.0.
let dirDatos = null;

function usarCarpeta(dir) {
  dirDatos = dir;
}

function settingsPath() {
  return path.join(dirDatos ?? app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const filePath = settingsPath();
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    // Archivo corrupto (o a medio escribir): se ignora y se vuelve a defaults
    // en vez de tumbar el arranque.
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function clampNum(valor, fallback, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Devuelve SIEMPRE un objeto completo y valido, aunque el JSON este a medias. */
function getConfig() {
  const s = loadSettings();
  const atajo = typeof s.atajo === 'string' && esAcceleratorValido(s.atajo) ? s.atajo : DEFAULTS.atajo;
  return {
    atajo,
    wpm: Math.round(clampNum(s.wpm, DEFAULTS.wpm, 5, 400)),
    variacion: clampNum(s.variacion, DEFAULTS.variacion, 0, 1),
    pausas: typeof s.pausas === 'boolean' ? s.pausas : DEFAULTS.pausas,
    errores: clampNum(s.errores, DEFAULTS.errores, 0, 10),
    retrasoInicioMs: Math.round(clampNum(s.retrasoInicioMs, DEFAULTS.retrasoInicioMs, 0, 10000)),
    compacto: typeof s.compacto === 'boolean' ? s.compacto : DEFAULTS.compacto,
  };
}

/** Merge parcial: solo pisa las claves presentes en `patch`. */
function setConfig(patch = {}) {
  const actual = getConfig();
  const mezcla = { ...actual };
  for (const clave of Object.keys(DEFAULTS)) {
    if (patch[clave] !== undefined) mezcla[clave] = patch[clave];
  }
  // Se re-valida guardando y releyendo por el mismo camino que getConfig, para
  // que un patch invalido caiga al valor anterior y no al default.
  const settings = loadSettings();
  Object.assign(settings, mezcla);
  saveSettings(settings);
  const guardado = getConfig();
  // Si el atajo propuesto era invalido, getConfig lo mando al default; se
  // restaura el que ya estaba funcionando.
  if (patch.atajo !== undefined && !esAcceleratorValido(patch.atajo)) {
    settings.atajo = actual.atajo;
    saveSettings(settings);
    return getConfig();
  }
  return guardado;
}

module.exports = { DEFAULTS, getConfig, setConfig, settingsPath, usarCarpeta };
