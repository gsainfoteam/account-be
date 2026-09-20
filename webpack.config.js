const webpack = require('webpack');
const path = require('path');

/**
 * @param {webpack.Configuration} options
 * @param {typeof webpack} webpackInstance
 * @returns {webpack.Configuration}
 */
module.exports = function (options, webpackInstance) {
  return {
    ...options,
    entry: {
      main: path.resolve(__dirname, 'src/main.ts'),
      instrumentation: path.resolve(__dirname, 'src/instrumentation.ts'),
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
  };
};
