'use strict';

var cleanDGM = function(dgm) {
  return dgm.replace(/:/g, '_').replace(/\//g, '-');
}

module.exports.cleanDGM = cleanDGM;