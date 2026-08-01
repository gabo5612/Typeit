# Typeit

App de escritorio (Electron) que **teclea un texto por vos** en cualquier app o
sitio web, simulando el ritmo de una persona escribiendo.

Sirve para los sitios donde no se puede pegar: campos que bloquean `paste`,
formularios que validan que el texto se haya tipeado, editores que rechazan el
portapapeles.

Funciona en **macOS** y **Windows**.

## Flujo de uso

1. Pegá el texto en Typeit.
2. Dale **Empezar** — la app queda *armada* y se encoge a una barra flotante.
3. Hacé clic en el campo donde querés el texto (en el navegador, en Word, donde sea).
4. Presioná el atajo (por defecto <kbd>F9</kbd>). Typeit empieza a escribir ahí.

Mientras escribe:

- El mismo atajo **pausa** y **reanuda**.
- <kbd>Esc</kbd> **corta** todo.
- La barra flotante es *click-through* mientras teclea, para que un clic
  accidental no le robe el foco al sitio.

## Cómo escribe

No se usa el portapapeles ni `document.execCommand`: las teclas se generan a
nivel de sistema operativo, así que para el sitio son indistinguibles de un
teclado físico (no dispara evento `paste`, y los eventos tienen `isTrusted`).

| Plataforma | Motor | Permiso |
| --- | --- | --- |
| macOS | `osascript` → System Events (`keystroke` / `key code`) | **Accesibilidad** |
| Windows | PowerShell → `SendInput` con `KEYEVENTF_UNICODE` | ninguno |

Se eligió esto en vez de un módulo nativo (robotjs, nut.js) a propósito: no hay
nada que compilar ni re-buildear por versión de Electron.

En Windows se manda cada carácter como Unicode en vez de como código de tecla,
así el texto sale igual sin importar la distribución de teclado (acentos, ñ, ¿,
¡ y emoji incluidos).

### Ritmo humano

`src/shared/timing.js` convierte el texto en un plan de teclas con su espera
individual. Es lógica pura y está cubierta por tests. Lo que modela:

- **Velocidad** en palabras por minuto (1 palabra = 5 caracteres).
- **Variación** por tecla — con 0% el ritmo es de metrónomo, que es justo el
  patrón que delata a un bot.
- **Pausas naturales**: más largas después de `.`/`!`/`?`, medianas después de
  `,`/`;`/`:`, y de vez en cuando una pausa de "pensar".
- **Errores y correcciones**: teclea una letra vecina en QWERTY, la borra con
  backspace y sigue. El texto final siempre es el correcto (hay un test que lo
  verifica).

El plan viaja al script de AppleScript/PowerShell serializado como
`codepoint:ms,codepoint:ms,...` — solo dígitos, `-`, `:` y `,`. Así el texto del
usuario puede traer comillas, backslashes, saltos de línea o `$(rm -rf /)` sin
que haya nada que escapar.

## Permisos en macOS

macOS pide **Accesibilidad** para que una app pueda mandar teclas a otra. El
permiso se otorga **por binario**, así que se piden por separado:

- `npm start` → aparece como **Electron**
- la app empaquetada → aparece como **Typeit**

Ajustes del Sistema → Privacidad y seguridad → Accesibilidad. La app muestra un
aviso con un botón que abre ese panel directo.

Hay un campo **"Probar acá mismo"** que escribe una frase de prueba dentro de la
propia ventana usando el mismo mecanismo del sistema: si funciona ahí, el
permiso está bien dado.

## Desarrollo

```bash
npm install
npm start     # levanta la app con hot reload
npm test      # tests (node:test sobre el binario de Electron)
npm run lint
npm run make  # instaladores: .dmg/.zip en macOS, Squirrel .exe/.zip en Windows
```

Los módulos nativos no se cross-compilan, así que el build de Windows se hace
en una PC con Windows.

## Estructura

```
src/
  main/                 proceso main (Node)
    index.js            ventana, IPC, atajo global, modo compacto
    preload.js          puente contextBridge (única superficie del renderer)
    settings-store.js   config persistida y validada
    teclado/
      index.js          máquina de estados: armar/escribir/pausar/detener
      mac.js            backend osascript
      windows.js        backend PowerShell + SendInput
  renderer/             React 19 (sin Node)
    App.jsx, views/, theme.css
  shared/               lógica pura, la usan main y renderer y la cubren tests
    timing.js           planificación del ritmo humano
    atajos.js           KeyboardEvent <-> accelerator de Electron
test/                   node:test
```

## Notas

- **Pausar mata el proceso hijo y reanudar arranca uno nuevo** con el resto del
  plan. `SIGSTOP` no existe en Windows, y como el backend reporta el progreso
  tecla por tecla el corte es exacto — un solo mecanismo para las dos
  plataformas.
- **El texto del usuario no se persiste.** Vive en memoria mientras la ventana
  está abierta. El plan se escribe a un archivo temporal con permisos `0600`
  que se borra al terminar cada corrida.
- **No se puede usar cualquier tecla como atajo.** Una letra suelta registrada
  como atajo global se la robaría a todas las apps del sistema, así que solo se
  aceptan teclas F sueltas o combinaciones con modificador.
- **Windows (UIPI):** un proceso sin elevar no puede mandar input a una ventana
  que corre como administrador. Para un navegador normal no aplica.
