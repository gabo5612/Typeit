// Guarda de version de Node antes de empaquetar.
//
// Node 24 rompe extract-zip (el que usa @electron/packager para desempaquetar
// la distribucion de Electron): extrae UN archivo y el proceso termina con
// codigo 0, sin error y sin rechazar la promesa. El resultado es un `make` que
// dice "Finalizing package", sale con exito y no genera nada - una hora de
// buscar el problema en el lugar equivocado.
//
// Node 22 (el del .nvmrc) lo hace bien. Este script convierte ese fallo mudo en
// un mensaje claro.

const fs = require('node:fs');
const path = require('node:path');

const requerida = Number(
  fs.readFileSync(path.join(__dirname, '..', '.nvmrc'), 'utf-8').trim().replace(/^v/, '').split('.')[0],
);
const actual = Number(process.versions.node.split('.')[0]);

if (actual !== requerida) {
  console.error(`
  El build necesita Node ${requerida}.x y estas en Node ${process.versions.node}.

  Node 24 rompe extract-zip en silencio: el make termina "bien" pero no
  genera ningun artefacto.

    nvm use ${requerida}      (o: nvm install ${requerida})

  Para correr la app en desarrollo (npm start) cualquier version sirve.
`);
  process.exit(1);
}
