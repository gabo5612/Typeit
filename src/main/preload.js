// Puente renderer <-> main. El renderer corre sin Node (contextIsolation), asi
// que esta es la unica superficie que ve: nada de fs, nada de child_process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    // Devuelve { config, avisoAtajo }: avisoAtajo != null si el atajo pedido
    // ya estaba tomado por otra app y se volvio al anterior.
    set: (patch) => ipcRenderer.invoke('config:set', patch),
  },
  motor: {
    // { pedir: true } abre el dialogo de Accesibilidad de macOS.
    permisos: (opciones) => ipcRenderer.invoke('motor:permisos', opciones),
    estado: () => ipcRenderer.invoke('motor:estado'),
    armar: (texto) => ipcRenderer.invoke('motor:armar', texto),
    desarmar: () => ipcRenderer.invoke('motor:desarmar'),
    pausar: () => ipcRenderer.invoke('motor:pausar'),
    reanudar: () => ipcRenderer.invoke('motor:reanudar'),
    detener: () => ipcRenderer.invoke('motor:detener'),
    probar: (texto) => ipcRenderer.invoke('motor:probar', texto),
  },
  // Suscripciones push del main. Devuelven la funcion para desuscribirse (el
  // cleanup del useEffect), si no cada re-render acumularia listeners.
  on: {
    estado: (cb) => {
      const handler = (_e, estado) => cb(estado);
      ipcRenderer.on('motor:estado', handler);
      return () => ipcRenderer.removeListener('motor:estado', handler);
    },
    cuenta: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('motor:cuenta', handler);
      return () => ipcRenderer.removeListener('motor:cuenta', handler);
    },
  },
});
