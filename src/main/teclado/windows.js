// Backend de tecleo para Windows.
//
// Usa PowerShell con un P/Invoke a `SendInput` (user32). Es la misma API que
// usa un driver de teclado, asi que las teclas llegan a la ventana activa como
// entrada real: no hay evento `paste` y para el sitio web son indistinguibles
// de un teclado fisico.
//
// Se manda cada caracter con KEYEVENTF_UNICODE (y no con SendKeys / codigos de
// tecla virtuales) porque asi el texto sale igual sin importar la distribucion
// de teclado del usuario: acentos, ñ, ¿, ¡ y emoji incluidos, sin depender de
// que esas teclas existan en el layout activo.
//
// Limitacion conocida de Windows (UIPI): un proceso sin elevar no puede mandar
// input a una ventana que corre como administrador. Para un navegador normal
// no aplica.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SCRIPT = `param([Parameter(Mandatory=$true)][string]$PlanPath)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class TypeitInput
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    // Un caracter Unicode: se manda como scan code con KEYEVENTF_UNICODE, que
    // no depende del layout activo. Los caracteres fuera del BMP (emoji) son
    // dos UTF-16 y hay que mandar las dos mitades del surrogate.
    public static void SendChar(char c)
    {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wScan = (ushort)c;
        inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
        inputs[1] = inputs[0];
        inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    // Teclas de control (Enter, Tab, Backspace): con KEYEVENTF_UNICODE no
    // producen la accion, hay que mandar el virtual key code de verdad.
    public static void SendKey(ushort vk)
    {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = vk;
        inputs[1] = inputs[0];
        inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

$VK_BACK = 0x08
$VK_TAB = 0x09
$VK_RETURN = 0x0D

# Start-Sleep tiene una granularidad de ~15 ms en Windows, que a velocidades
# altas se come el ritmo. Para esperas cortas se usa spin-wait con Stopwatch
# (quema CPU, pero solo por unos milisegundos por tecla).
function Wait-Ms([int]$ms) {
    if ($ms -le 0) { return }
    if ($ms -ge 30) { Start-Sleep -Milliseconds $ms; return }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalMilliseconds -lt $ms) { }
}

$plan = [System.IO.File]::ReadAllText($PlanPath).Split(',')
$i = 0
foreach ($p in $plan) {
    if ($p.Length -eq 0) { continue }
    $i++
    $parts = $p.Split(':')
    $code = [int]$parts[0]
    $d = [int]$parts[1]

    if ($code -eq -1) { [TypeitInput]::SendKey($VK_BACK) }
    elseif ($code -eq -2) { [TypeitInput]::SendKey($VK_RETURN) }
    elseif ($code -eq -3) { [TypeitInput]::SendKey($VK_TAB) }
    else {
        foreach ($ch in [char[]][char]::ConvertFromUtf32($code)) {
            [TypeitInput]::SendChar($ch)
        }
    }

    [Console]::Error.WriteLine("P$i")
    Wait-Ms $d
}
[Console]::Error.WriteLine("fin")
`;

// SendInput es mucho mas barato que el interprete de AppleScript, pero el
// bucle de PowerShell sigue costando algo por vuelta.
const OVERHEAD_MS = 2;

const nombre = 'Windows (SendInput)';

/** Windows no pide ningun permiso especial para SendInput. */
function permisos() {
  return { concedido: true, mensaje: 'Windows no requiere permisos especiales.' };
}

function rutaScript(dirTrabajo) {
  return path.join(dirTrabajo, 'typeit-escribir.ps1');
}

/**
 * El .ps1 no puede ir dentro del bundle de webpack (PowerShell necesita un
 * archivo real), asi que se escribe en la carpeta de trabajo de la app. Se
 * reescribe en cada arranque para que una version vieja no sobreviva a un
 * update.
 */
async function preparar(dirTrabajo) {
  await fs.promises.mkdir(dirTrabajo, { recursive: true });
  await fs.promises.writeFile(rutaScript(dirTrabajo), SCRIPT, 'utf8');
}

/** @returns {import('node:child_process').ChildProcess} */
function ejecutar(dirTrabajo, planPath) {
  return spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', rutaScript(dirTrabajo),
      '-PlanPath', planPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
}

function explicarError(stderr) {
  if (/cannot be loaded because running scripts is disabled/i.test(stderr)) {
    return 'PowerShell bloqueo el script. Typeit ya lo lanza con -ExecutionPolicy Bypass; si sigue fallando, hay una politica de grupo que lo impide.';
  }
  if (/Add-Type|CS\d{4}/i.test(stderr)) {
    return 'No se pudo compilar el componente de teclado (.NET). Verifica que PowerShell 5.1 este disponible.';
  }
  return null;
}

module.exports = { nombre, OVERHEAD_MS, permisos, preparar, ejecutar, explicarError };
