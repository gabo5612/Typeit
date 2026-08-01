// El renderer (y el preload, que Forge compila con esta misma config) NO usa
// las reglas de webpack.rules.js: node-loader y el asset-relocator-loader son
// para los modulos nativos del proceso main.
//
// El relocator, ademas de procesar los .node, inyecta un runtime con
// `__dirname + "/native_modules/"`. En el renderer -y en un preload
// sandboxeado- `__dirname` no existe: el preload no carga, `window.api` queda
// undefined y la ventana se ve en blanco. Por eso las reglas van separadas.

module.exports = {
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' },
      },
      {
        test: /\.css$/,
        use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.css'],
  },
};
