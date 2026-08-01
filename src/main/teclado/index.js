// Motor de tecleo: elige el backend segun la plataforma y le pone encima la
// maquina de estados (armar / escribir / pausar / reanudar / detener).
//
// Detalle de diseno importante: la pausa NO suspende el proceso hijo (SIGSTOP
// no existe en Windows). En vez de eso se mata el proceso y se recuerda en que
// tecla iba; reanudar arranca uno nuevo con el resto del plan. Como el backend
// reporta el progreso tecla por tecla, el corte es exacto y el mecanismo es el
// mismo en las dos plataformas.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { serializarPlan, duracionPlanMs } = require('../../shared/timing');

function cargarBackend() {
  if (process.platform === 'darwin') return require('./mac');
  if (process.platform === 'win32') return require('./windows');
  return null;
}

const ESTADOS = {
  INACTIVO: 'inactivo',
  ARMADO: 'armado',
  ESCRIBIENDO: 'escribiendo',
  PAUSADO: 'pausado',
};

/**
 * @param {{onEstado: (estado: object) => void, log?: (msg: string) => void}} deps
 */
function crearTeclado({ onEstado, log = () => {} }) {
  const backend = cargarBackend();
  const dirTrabajo = path.join(app.getPath('userData'), 'motor');

  let estado = ESTADOS.INACTIVO;
  let plan = [];
  let indice = 0; // teclas ya escritas
  let proceso = null;
  // Cuando matamos el proceso a proposito, el 'close' que llega despues no es
  // un error - esta bandera lo distingue de una caida real.
  let cierreEsperado = null; // null | 'pausa' | 'stop'
  let ultimoError = null;

  function snapshot() {
    return {
      estado,
      total: plan.length,
      escritas: indice,
      restanteMs: duracionPlanMs(plan.slice(indice)),
      error: ultimoError,
      soportado: !!backend,
      backend: backend ? backend.nombre : null,
    };
  }

  function emitir() {
    onEstado(snapshot());
  }

  function setEstado(nuevo) {
    estado = nuevo;
    emitir();
  }

  async function preparar() {
    if (!backend) return;
    await fs.promises.mkdir(dirTrabajo, { recursive: true });
    await backend.preparar(dirTrabajo);
  }

  function permisos(opciones) {
    if (!backend) {
      return { concedido: false, mensaje: `Typeit todavia no soporta ${process.platform}.` };
    }
    return backend.permisos(opciones);
  }

  /**
   * Escribe el resto del plan a un archivo y lanza el backend.
   *
   * El archivo contiene el texto del usuario (como code points), asi que se
   * crea con permisos 0600 y se borra al terminar la corrida.
   */
  async function lanzarDesdeIndice() {
    const resto = plan.slice(indice);
    if (resto.length === 0) {
      terminar(null);
      return;
    }

    // Compensacion del overhead del interprete: sin esto el texto sale
    // sistematicamente mas lento que la velocidad configurada.
    const compensado = resto.map((ev) => ({
      code: ev.code,
      delayMs: Math.max(0, ev.delayMs - backend.OVERHEAD_MS),
    }));

    const planPath = path.join(dirTrabajo, 'plan.txt');
    await fs.promises.writeFile(planPath, serializarPlan(compensado), { encoding: 'utf8', mode: 0o600 });

    const base = indice;
    const hijo = backend.ejecutar(dirTrabajo, planPath);
    proceso = hijo;
    cierreEsperado = null;

    let stderrExtra = '';
    let pendiente = '';

    hijo.stderr.setEncoding('utf8');
    hijo.stderr.on('data', (chunk) => {
      pendiente += chunk;
      const lineas = pendiente.split('\n');
      pendiente = lineas.pop();
      for (const linea of lineas) {
        const m = /^P(\d+)\s*$/.exec(linea.trim());
        if (m) {
          indice = base + Number(m[1]);
          emitir();
        } else if (linea.trim() && linea.trim() !== 'fin') {
          stderrExtra += `${linea}\n`;
        }
      }
    });

    hijo.on('error', (err) => {
      stderrExtra += `${err.message}\n`;
    });

    hijo.on('close', (code) => {
      proceso = null;
      fs.promises.unlink(planPath).catch(() => {});

      if (cierreEsperado === 'pausa') {
        cierreEsperado = null;
        setEstado(ESTADOS.PAUSADO);
        return;
      }
      if (cierreEsperado === 'stop') {
        cierreEsperado = null;
        plan = [];
        indice = 0;
        setEstado(ESTADOS.INACTIVO);
        return;
      }

      if (code === 0 && indice >= plan.length) {
        terminar(null);
        return;
      }

      // Salio solo antes de tiempo: es un error de verdad.
      const explicado = backend.explicarError(stderrExtra);
      const motivo = explicado
        || (stderrExtra.trim() ? stderrExtra.trim().split('\n').slice(-2).join(' ') : `El motor de teclado termino inesperadamente (codigo ${code}).`);
      log(`error de tecleo: ${motivo}`);
      terminar(motivo);
    });

    setEstado(ESTADOS.ESCRIBIENDO);
  }

  function terminar(error) {
    ultimoError = error;
    plan = [];
    indice = 0;
    setEstado(ESTADOS.INACTIVO);
  }

  function matar(motivo) {
    if (!proceso) return false;
    cierreEsperado = motivo;
    proceso.kill('SIGKILL');
    return true;
  }

  // --- API publica ---------------------------------------------------------

  /** Deja la app esperando el atajo. No escribe nada todavia. */
  function armar(nuevoPlan) {
    if (estado === ESTADOS.ESCRIBIENDO) return snapshot();
    plan = nuevoPlan;
    indice = 0;
    ultimoError = null;
    setEstado(ESTADOS.ARMADO);
    return snapshot();
  }

  function desarmar() {
    if (estado === ESTADOS.ESCRIBIENDO) return snapshot();
    plan = [];
    indice = 0;
    setEstado(ESTADOS.INACTIVO);
    return snapshot();
  }

  /** Arranca (o reanuda) la escritura. Lo llama el atajo global. */
  async function arrancar() {
    if (estado !== ESTADOS.ARMADO && estado !== ESTADOS.PAUSADO) return snapshot();
    if (!plan.length) return snapshot();
    const permiso = permisos({ pedir: false });
    if (!permiso.concedido) {
      terminar(permiso.mensaje);
      return snapshot();
    }
    ultimoError = null;
    await lanzarDesdeIndice();
    return snapshot();
  }

  function pausar() {
    if (estado !== ESTADOS.ESCRIBIENDO) return snapshot();
    matar('pausa');
    return snapshot();
  }

  function detener() {
    if (proceso) matar('stop');
    else {
      plan = [];
      indice = 0;
      setEstado(ESTADOS.INACTIVO);
    }
    return snapshot();
  }

  /**
   * Lo que hace el atajo global: es un solo boton para todo el ciclo.
   * armado -> arranca | escribiendo -> pausa | pausado -> reanuda
   */
  async function alternar() {
    if (estado === ESTADOS.ARMADO || estado === ESTADOS.PAUSADO) return arrancar();
    if (estado === ESTADOS.ESCRIBIENDO) return pausar();
    return snapshot();
  }

  return {
    ESTADOS,
    preparar,
    permisos,
    armar,
    desarmar,
    arrancar,
    pausar,
    detener,
    alternar,
    alternando: () => estado,
    snapshot,
    soportado: () => !!backend,
  };
}

module.exports = { crearTeclado, ESTADOS };
