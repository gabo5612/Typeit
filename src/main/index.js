// Bootstrap del proceso main: ventana, IPC, atajo global y modo compacto.
// La logica real vive en modulos aparte:
//   - teclado/            -> motor de tecleo (backend por plataforma + estados)
//   - shared/timing.js    -> planificacion del ritmo humano (puro, testeado)
//   - settings-store.js   -> configuracion persistida y validada

const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require('electron');
const settingsStore = require('./settings-store');
const { crearTeclado } = require('./teclado');
const { planificarTecleo } = require('../shared/timing');
const { esAcceleratorValido } = require('../shared/atajos');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const VENTANA_NORMAL = { width: 780, height: 820, minWidth: 560, minHeight: 520 };
const VENTANA_COMPACTA = { width: 380, height: 128 };

let ventana = null;
let teclado = null;
// Cuenta regresiva entre el atajo y la primera tecla. El token invalida un
// arranque pendiente si el usuario cancela antes de que se cumpla.
let tokenArranque = 0;

function enviar(canal, payload) {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send(canal, payload);
}

// --- Modo compacto ---------------------------------------------------------
// Mientras se escribe, la ventana se encoge a una barra arriba a la derecha
// para no tapar el campo destino. Durante el tecleo ademas se vuelve
// click-through: un clic accidental sobre ella le robaria el foco al sitio y
// el resto del texto terminaria escribiendose DENTRO de Typeit.

let boundsNormales = null;
// En modo prueba el destino del tecleo es la PROPIA ventana de Typeit, asi que
// no hay que encogerla ni moverla (y tiene que seguir enfocada).
let enPrueba = false;

function entrarCompacto() {
  if (!ventana || ventana.isDestroyed()) return;
  if (!boundsNormales) boundsNormales = ventana.getBounds();
  const area = screen.getPrimaryDisplay().workArea;
  ventana.setResizable(false);
  ventana.setBounds({
    width: VENTANA_COMPACTA.width,
    height: VENTANA_COMPACTA.height,
    x: area.x + area.width - VENTANA_COMPACTA.width - 24,
    y: area.y + 24,
  });
  ventana.setAlwaysOnTop(true, 'screen-saver');
  // showInactive: aparecer sin robarle el foco al sitio destino.
  if (!ventana.isVisible()) ventana.showInactive();
}

function salirCompacto() {
  if (!ventana || ventana.isDestroyed()) return;
  ventana.setIgnoreMouseEvents(false);
  ventana.setAlwaysOnTop(false);
  ventana.setResizable(true);
  if (boundsNormales) {
    ventana.setBounds(boundsNormales);
    boundsNormales = null;
  }
  if (!ventana.isVisible()) ventana.showInactive();
}

function aplicarModoVentana(estado) {
  if (enPrueba) return;
  const { compacto } = settingsStore.getConfig();
  if (!compacto) {
    ventana?.setIgnoreMouseEvents(estado.estado === 'escribiendo');
    return;
  }
  if (estado.estado === 'armado' || estado.estado === 'escribiendo' || estado.estado === 'pausado') {
    entrarCompacto();
    // Solo click-through mientras realmente esta tecleando; en pausa hay que
    // poder tocar los botones.
    ventana?.setIgnoreMouseEvents(estado.estado === 'escribiendo');
  } else {
    salirCompacto();
  }
}

// --- Atajos globales -------------------------------------------------------

let atajoRegistrado = null;
let escapeRegistrado = false;

function registrarAtajo(accelerator) {
  if (atajoRegistrado) {
    globalShortcut.unregister(atajoRegistrado);
    atajoRegistrado = null;
  }
  if (!esAcceleratorValido(accelerator)) return { ok: false, motivo: 'Atajo invalido.' };
  try {
    const ok = globalShortcut.register(accelerator, () => { manejarAtajo(); });
    if (!ok) return { ok: false, motivo: `Otra app ya tiene tomado ${accelerator}.` };
    atajoRegistrado = accelerator;
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

/**
 * Escape como freno de emergencia: se registra SOLO mientras se esta
 * tecleando, para no secuestrar la tecla el resto del tiempo.
 */
function sincronizarEscape(estado) {
  const debe = estado.estado === 'escribiendo';
  if (debe && !escapeRegistrado) {
    escapeRegistrado = globalShortcut.register('Escape', () => { teclado.detener(); });
  } else if (!debe && escapeRegistrado) {
    globalShortcut.unregister('Escape');
    escapeRegistrado = false;
  }
}

async function manejarAtajo() {
  if (!teclado) return;
  const estado = teclado.snapshot();

  if (estado.estado === 'armado') {
    const { retrasoInicioMs } = settingsStore.getConfig();
    const miToken = ++tokenArranque;
    if (retrasoInicioMs > 0) {
      enviar('motor:cuenta', { ms: retrasoInicioMs });
      await new Promise((r) => setTimeout(r, retrasoInicioMs));
      if (miToken !== tokenArranque) return; // se cancelo mientras tanto
      if (teclado.snapshot().estado !== 'armado') return;
    }
    await teclado.arrancar();
    return;
  }

  // escribiendo -> pausa | pausado -> reanuda
  tokenArranque++;
  await teclado.alternar();
}

// --- Ventana ---------------------------------------------------------------

function createWindow() {
  ventana = new BrowserWindow({
    ...VENTANA_NORMAL,
    show: false,
    title: 'Typeit',
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ventana.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  ventana.once('ready-to-show', () => ventana.show());

  // En dev, los errores del renderer terminan en la consola de devtools y no
  // en la terminal - con esto un fallo de arranque de React se ve en el mismo
  // log que todo lo demas, sin tener que abrir devtools.
  if (!app.isPackaged) {
    ventana.webContents.on('console-message', (...args) => {
      // Electron 36+ pasa un objeto de detalles; antes eran argumentos sueltos.
      const d = args[0] && typeof args[0] === 'object' && 'message' in args[0]
        ? args[0]
        : { message: args[2], sourceId: args[4], lineNumber: args[3] };
      console.error(`[renderer] ${d.message} (${d.sourceId}:${d.lineNumber})`);
    });
    ventana.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error(`[renderer] no cargo: ${desc} (${code})`);
    });
  }

  // Cualquier link externo (la ayuda de permisos) va al navegador, no a una
  // ventana de Electron.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// --- Arranque --------------------------------------------------------------

app.whenReady().then(async () => {
  teclado = crearTeclado({
    onEstado: (estado) => {
      enviar('motor:estado', estado);
      aplicarModoVentana(estado);
      sincronizarEscape(estado);
      if (estado.estado === 'inactivo') enPrueba = false;
    },
    log: (msg) => console.error(`[typeit] ${msg}`),
  });

  await teclado.preparar().catch((err) => {
    console.error('[typeit] no se pudo preparar el motor de teclado:', err);
  });

  createWindow();
  registrarAtajo(settingsStore.getConfig().atajo);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  teclado?.detener();
});

// --- IPC -------------------------------------------------------------------

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  plataforma: process.platform,
  backend: teclado.snapshot().backend,
  soportado: teclado.soportado(),
}));

ipcMain.handle('config:get', () => settingsStore.getConfig());

ipcMain.handle('config:set', (_e, patch) => {
  const antes = settingsStore.getConfig();
  const config = settingsStore.setConfig(patch ?? {});
  let avisoAtajo = null;
  if (config.atajo !== antes.atajo || !atajoRegistrado) {
    const r = registrarAtajo(config.atajo);
    if (!r.ok) {
      // No se pudo tomar el atajo nuevo: se vuelve al anterior para no dejar
      // la app sin ninguna forma de disparar la escritura.
      avisoAtajo = r.motivo;
      settingsStore.setConfig({ atajo: antes.atajo });
      registrarAtajo(antes.atajo);
    }
  }
  return { config: settingsStore.getConfig(), avisoAtajo };
});

ipcMain.handle('motor:permisos', (_e, opciones) => teclado.permisos(opciones ?? {}));

ipcMain.handle('motor:estado', () => teclado.snapshot());

ipcMain.handle('motor:armar', (_e, texto) => {
  const config = settingsStore.getConfig();
  const plan = planificarTecleo(texto ?? '', config);
  if (!plan.length) return { ...teclado.snapshot(), error: 'No hay texto para escribir.' };
  return teclado.armar(plan);
});

ipcMain.handle('motor:desarmar', () => {
  tokenArranque++;
  return teclado.desarmar();
});

ipcMain.handle('motor:detener', () => {
  tokenArranque++;
  return teclado.detener();
});

ipcMain.handle('motor:pausar', () => teclado.pausar());

ipcMain.handle('motor:reanudar', () => teclado.arrancar());

/**
 * Prueba: escribe en la propia ventana de Typeit, sin armar ni esperar el
 * atajo. Sirve para verificar de una que el permiso esta dado y que la
 * velocidad se siente bien, sin ir a probar en el sitio real.
 */
ipcMain.handle('motor:probar', async (_e, texto) => {
  const config = settingsStore.getConfig();
  const plan = planificarTecleo(texto ?? '', config);
  if (!plan.length) return teclado.snapshot();
  // El flag se apaga solo cuando el motor vuelve a 'inactivo' (ver onEstado):
  // `arrancar` resuelve al lanzar el proceso, no al terminar de escribir.
  enPrueba = true;
  teclado.armar(plan);
  return teclado.arrancar();
});
