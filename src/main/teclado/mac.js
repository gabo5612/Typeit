// Backend de tecleo para macOS.
//
// Manda las teclas con `System Events` via osascript. Se eligio esto sobre un
// modulo nativo (robotjs / nut.js) a proposito: no hay nada que compilar ni
// que re-buildear por version de Electron, y las teclas salen como CGEvents
// reales del sistema - para el sitio web son indistinguibles de un teclado
// fisico (no hay evento `paste`, y `isTrusted` es true).
//
// A cambio, macOS exige el permiso de Accesibilidad. Ese permiso se otorga POR
// BINARIO: la app empaquetada y `npm start` (que corre como "Electron") se
// piden por separado.

const { spawn } = require('node:child_process');
const { systemPreferences } = require('electron');

// El script se pasa por stdin (`osascript -`), asi no hay que copiar ningun
// archivo .applescript al bundle de webpack. El plan viaja aparte, en un
// archivo, porque en un texto largo no entra comodo en argv.
//
// El plan es "code:delay,code:delay,...":
//   code >= 0 -> code point Unicode  |  -1 backspace  |  -2 return  |  -3 tab
//
// `log` escribe en stderr y sale al instante (no se bufferea), asi que el
// proceso padre puede seguir el progreso tecla por tecla.
const SCRIPT = `
on run argv
	set planPath to item 1 of argv
	set planText to read (POSIX file planPath)
	set plan to my splitText(planText, ",")
	set i to 0
	tell application "System Events"
		repeat with p in plan
			set i to i + 1
			set parts to my splitText(p as text, ":")
			set c to (item 1 of parts) as integer
			set d to (item 2 of parts) as integer
			if c is -1 then
				key code 51
			else if c is -2 then
				key code 36
			else if c is -3 then
				key code 48
			else
				keystroke my charDe(c)
			end if
			log "P" & i
			if d > 0 then delay (d / 1000)
		end repeat
	end tell
	return "fin"
end run

-- "character id" es una construccion del lenguaje AppleScript, no un comando de
-- System Events: usarla DENTRO del bloque tell de System Events falla con
-- -1728 ("Can't get character id 72"). Metida en un handler y llamada con "my"
-- se evalua en el contexto del script y resuelve bien, incluido cualquier code
-- point fuera del BMP (emoji).
on charDe(c)
	return character id c
end charDe

on splitText(t, sep)
	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to sep
	set parts to text items of t
	set AppleScript's text item delimiters to oldDelims
	return parts
end splitText
`;

// Medido con planes de 300 eventos: el interprete gasta ~4 ms por vuelta
// (parseo + character id + keystroke + log). Se le resta a cada espera para
// que el ritmo real coincida con el planificado.
const OVERHEAD_MS = 4;

const nombre = 'macOS (System Events)';

/**
 * En macOS el permiso de Accesibilidad es obligatorio: sin el, osascript
 * devuelve el error -1743 y no se escribe nada.
 *
 * @param {{pedir?: boolean}} opciones `pedir: true` abre el dialogo del
 *   sistema que lleva a Ajustes > Privacidad > Accesibilidad.
 */
function permisos({ pedir = false } = {}) {
  const concedido = systemPreferences.isTrustedAccessibilityClient(pedir);
  return {
    concedido,
    mensaje: concedido
      ? 'Permiso de Accesibilidad concedido.'
      : 'Falta el permiso de Accesibilidad. Abri Ajustes del Sistema > Privacidad y seguridad > Accesibilidad y activa Typeit.',
  };
}

/** No hay nada que preparar en disco: el script va por stdin. */
async function preparar() {}

/** @returns {import('node:child_process').ChildProcess} */
function ejecutar(_dirTrabajo, planPath) {
  const proceso = spawn('osascript', ['-', planPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  proceso.stdin.write(SCRIPT);
  proceso.stdin.end();
  return proceso;
}

/**
 * Traduce los errores tipicos de osascript a algo accionable. El -1743 es el
 * unico que se ve en la practica y siempre significa lo mismo.
 */
function explicarError(stderr) {
  if (/-1743|not allowed assistive|no tiene permiso/i.test(stderr)) {
    return 'macOS bloqueo el tecleo: falta el permiso de Accesibilidad para Typeit (Ajustes del Sistema > Privacidad y seguridad > Accesibilidad).';
  }
  return null;
}

module.exports = { nombre, OVERHEAD_MS, permisos, preparar, ejecutar, explicarError };
