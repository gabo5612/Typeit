// Objetivo del lint: cazar variables sin definir y hooks de React mal usados.
// No reformatea el codigo (sin Prettier, sin reglas estilisticas).

const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['node_modules/**', '.webpack/**', 'out/**'],
  },

  // Proceso main, modulos compartidos, configs de build y tests: CommonJS + Node.
  {
    files: ['src/main/**/*.js', 'src/shared/**/*.js', 'test/**/*.js', 'forge.config.js', 'webpack.*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // El codebase usa `catch {}` deliberado (siempre con comentario del porque).
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },

  // Vive en el renderer pero es CommonJS a proposito: lo comparten webpack (que
  // le da `module`) y los tests de node.
  {
    files: ['src/renderer/formato.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },

  // Constantes magicas que inyecta el plugin webpack de Electron Forge.
  {
    files: ['src/main/index.js'],
    languageOptions: {
      globals: {
        MAIN_WINDOW_WEBPACK_ENTRY: 'readonly',
        MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: 'readonly',
      },
    },
  },

  // Renderer: React + JSX en el navegador (via contextBridge, sin Node).
  {
    files: ['src/renderer/**/*.jsx', 'src/renderer/index.js'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^React$', ignoreRestSiblings: true }],
    },
  },
];
