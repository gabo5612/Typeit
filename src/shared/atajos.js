// Traduccion entre un KeyboardEvent capturado en el renderer y el string de
// "accelerator" que entiende Electron (globalShortcut). Vive en shared porque
// lo usan los dos lados: el renderer para mostrarlo/capturarlo y el main para
// registrarlo.

// El atajo por defecto es una tecla de funcion suelta: no choca con nada de lo
// que el usuario vaya a escribir en el sitio destino, y no depende de que el
// navegador la deje pasar (globalShortcut la captura antes que la app activa).
const ATAJO_DEFAULT = 'F9';

// Teclas sueltas (sin modificadores) que se aceptan como atajo. Cualquier otra
// tecla suelta se rechaza: registrar "a" a nivel global dejaria al usuario sin
// poder escribir esa letra en NINGUNA app mientras Typeit este abierto.
const TECLAS_SUELTAS_OK = new Set([
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20',
]);

/** Nombre que Electron le da a cada tecla dentro de un accelerator. */
function nombreDeTecla(key, code) {
  if (/^F\d{1,2}$/.test(key)) return key;
  switch (key) {
    case ' ': return 'Space';
    case 'Escape': return 'Escape';
    case 'Enter': return 'Return';
    case 'Tab': return 'Tab';
    case 'Backspace': return 'Backspace';
    case 'Delete': return 'Delete';
    case 'ArrowUp': return 'Up';
    case 'ArrowDown': return 'Down';
    case 'ArrowLeft': return 'Left';
    case 'ArrowRight': return 'Right';
    case 'Home': return 'Home';
    case 'End': return 'End';
    case 'PageUp': return 'PageUp';
    case 'PageDown': return 'PageDown';
    default: break;
  }
  // Para letras y numeros se usa `code` (KeyA / Digit1) en vez de `key`: asi
  // el atajo no cambia segun el layout ni segun si Shift esta apretado
  // (Shift+2 da "@" en `key`, pero el accelerator tiene que decir "2").
  if (/^Key[A-Z]$/.test(code || '')) return code.slice(3);
  if (/^Digit\d$/.test(code || '')) return code.slice(5);
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  return null;
}

const MODIFICADORES = ['Control', 'Shift', 'Alt', 'Meta', 'CommandOrControl'];

/**
 * Convierte un KeyboardEvent (o un objeto con la misma forma) en accelerator.
 *
 * @returns {{accelerator: string} | {error: string}}
 */
function acceleratorDesdeEvento(evento) {
  const { key, code, ctrlKey, shiftKey, altKey, metaKey } = evento;
  if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(key)) {
    return { error: 'Falta la tecla principal (solo se presionaron modificadores).' };
  }

  const tecla = nombreDeTecla(key, code);
  if (!tecla) return { error: `Tecla no soportada: ${key}` };

  const partes = [];
  if (ctrlKey) partes.push('Control');
  if (altKey) partes.push('Alt');
  if (shiftKey) partes.push('Shift');
  if (metaKey) partes.push('Command');
  partes.push(tecla);

  if (partes.length === 1 && !TECLAS_SUELTAS_OK.has(tecla)) {
    return {
      error: `"${tecla}" sola bloquearia esa tecla en todo el sistema. Usa una tecla F o agregale Ctrl/Alt/Cmd.`,
    };
  }

  return { accelerator: partes.join('+') };
}

/**
 * Version legible del accelerator para mostrar en la UI.
 *
 * `plataforma` se recibe por parametro (el renderer la saca de app:info): este
 * modulo tambien se empaqueta para el navegador, donde no hay `process`.
 */
function formatearAtajo(accelerator, plataforma) {
  if (!accelerator) return '';
  const esMac = (plataforma ?? (typeof process === 'undefined' ? '' : process.platform)) === 'darwin';
  return accelerator
    .split('+')
    .map((parte) => {
      if (parte === 'CommandOrControl' || parte === 'CmdOrCtrl') return esMac ? '⌘' : 'Ctrl';
      if (parte === 'Command' || parte === 'Cmd') return esMac ? '⌘' : 'Win';
      if (parte === 'Control' || parte === 'Ctrl') return esMac ? '⌃' : 'Ctrl';
      if (parte === 'Alt') return esMac ? '⌥' : 'Alt';
      if (parte === 'Shift') return esMac ? '⇧' : 'Shift';
      return parte;
    })
    .join(esMac ? '' : '+');
}

/** Chequeo defensivo antes de pasarle el string a globalShortcut.register. */
function esAcceleratorValido(accelerator) {
  if (typeof accelerator !== 'string' || !accelerator.length) return false;
  const partes = accelerator.split('+');
  const tecla = partes[partes.length - 1];
  const mods = partes.slice(0, -1);
  if (!tecla) return false;
  if (mods.some((m) => !MODIFICADORES.includes(m) && m !== 'Command' && m !== 'Cmd' && m !== 'Ctrl')) return false;
  if (mods.length === 0 && !TECLAS_SUELTAS_OK.has(tecla)) return false;
  return true;
}

module.exports = {
  ATAJO_DEFAULT,
  TECLAS_SUELTAS_OK,
  acceleratorDesdeEvento,
  formatearAtajo,
  esAcceleratorValido,
};
