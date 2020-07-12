const path = require('path');
module.exports = {
  entry: './js/main.js',
  output: {
    filename: 'js_bundled.js',
    path: path.resolve(__dirname, '.'),
  },
  mode: 'development',
  optimization: {
    minimize: false
  }
};
