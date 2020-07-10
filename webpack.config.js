const path = require('path');
module.exports = {
  entry: './js/main.js',
  output: {
    filename: '_bundled.js',
    path: path.resolve(__dirname, 'js'),
  },
};
