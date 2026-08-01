// Corre con: npm test (electron con ELECTRON_RUN_AS_NODE=1, ver package.json).
// El settings.json es editable a mano, asi que lo que se prueba aca es que
// ningun valor invalido -leido de disco o pasado por IPC- llegue al motor.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const settingsStore = require('../src/main/settings-store.js');

function conCarpetaTemporal(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typeit-test-'));
  settingsStore.usarCarpeta(dir);
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const escribirCrudo = (dir, obj) =>
  fs.writeFileSync(path.join(dir, 'settings.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));

test('sin archivo devuelve los defaults completos', () => {
  conCarpetaTemporal(() => {
    assert.deepEqual(settingsStore.getConfig(), settingsStore.DEFAULTS);
  });
});

test('un settings.json corrupto no tumba la app, cae a defaults', () => {
  conCarpetaTemporal((dir) => {
    escribirCrudo(dir, '{ esto no es json');
    assert.deepEqual(settingsStore.getConfig(), settingsStore.DEFAULTS);
  });
});

test('un archivo a medias completa las claves que faltan', () => {
  conCarpetaTemporal((dir) => {
    escribirCrudo(dir, { wpm: 70 });
    const c = settingsStore.getConfig();
    assert.equal(c.wpm, 70);
    assert.equal(c.variacion, settingsStore.DEFAULTS.variacion);
    assert.equal(c.atajo, settingsStore.DEFAULTS.atajo);
  });
});

test('los numeros fuera de rango se recortan al leer', () => {
  conCarpetaTemporal((dir) => {
    escribirCrudo(dir, { wpm: 99999, variacion: -3, errores: 500, retrasoInicioMs: -1 });
    const c = settingsStore.getConfig();
    assert.equal(c.wpm, 400);
    assert.equal(c.variacion, 0);
    assert.equal(c.errores, 10);
    assert.equal(c.retrasoInicioMs, 0);
  });
});

test('un wpm no numerico cae al default en vez de dar NaN', () => {
  conCarpetaTemporal((dir) => {
    escribirCrudo(dir, { wpm: 'rapido' });
    assert.equal(settingsStore.getConfig().wpm, settingsStore.DEFAULTS.wpm);
  });
});

test('un atajo invalido guardado a mano se ignora', () => {
  conCarpetaTemporal((dir) => {
    // "A" sola secuestraria esa letra en todo el sistema.
    escribirCrudo(dir, { atajo: 'A' });
    assert.equal(settingsStore.getConfig().atajo, settingsStore.DEFAULTS.atajo);
  });
});

test('setConfig es un merge parcial: no pisa lo que no viene en el patch', () => {
  conCarpetaTemporal(() => {
    settingsStore.setConfig({ wpm: 80, pausas: false });
    settingsStore.setConfig({ errores: 3 });
    const c = settingsStore.getConfig();
    assert.equal(c.wpm, 80);
    assert.equal(c.pausas, false);
    assert.equal(c.errores, 3);
  });
});

test('setConfig con un atajo invalido conserva el que ya funcionaba', () => {
  conCarpetaTemporal(() => {
    settingsStore.setConfig({ atajo: 'Control+Shift+P' });
    settingsStore.setConfig({ atajo: 'Q' });
    assert.equal(settingsStore.getConfig().atajo, 'Control+Shift+P');
  });
});

test('la configuracion sobrevive entre lecturas (se persiste a disco)', () => {
  conCarpetaTemporal((dir) => {
    settingsStore.setConfig({ wpm: 33, compacto: false });
    const enDisco = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
    assert.equal(enDisco.wpm, 33);
    assert.equal(enDisco.compacto, false);
    assert.equal(settingsStore.getConfig().wpm, 33);
  });
});

test('el texto del usuario nunca se persiste', () => {
  conCarpetaTemporal((dir) => {
    settingsStore.setConfig({ wpm: 50, texto: 'algo confidencial' });
    const enDisco = fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8');
    assert.ok(!enDisco.includes('confidencial'), 'se filtro texto del usuario al settings.json');
  });
});
