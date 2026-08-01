const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    // Sin firma: build local para uso personal. En macOS arm64
    // @electron/packager igual hace un ad-hoc sign minimo del binario
    // (necesario para que corra), pero no se intenta firmar con una
    // identidad Developer ID.
    osxSign: false,
    // macOS pide permiso de Accesibilidad para poder mandar teclas a otras
    // apps. El permiso se otorga POR BINARIO, asi que la app empaquetada y
    // `npm start` (que corre como "Electron") se piden por separado.
    extendInfo: {
      NSAppleEventsUsageDescription:
        'Typeit necesita enviar pulsaciones de teclado para escribir el texto en la app o sitio que elijas.',
    },
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-dmg', config: {}, platforms: ['darwin'] },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: { name: 'Typeit', setupExe: 'Typeit-Setup.exe' },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        // Puerto poco comun: el default (3000) choca con otros proyectos en
        // esta Mac, igual que en QuickTask2.0.
        port: 47841,
        loggerPort: 47842,
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/index.js',
              name: 'main_window',
              preload: { js: './src/main/preload.js' },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      // Los tests corren con ELECTRON_RUN_AS_NODE=1 sobre el electron de
      // node_modules, no sobre el binario empaquetado - se puede apagar.
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Requiere firma con inyeccion de hashes; sin identidad de firma cuelga
      // el `make` en "Finalizing package" (mismo caso que QuickTask2.0).
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
