/* */ 
(function(Buffer) {
  'use strict';
  var crypto = require('crypto');
  var generateAttempts = crypto.randomBytes === crypto.pseudoRandomBytes ? 1 : 3;
  module.exports = randomBytes;
  module.exports.sync = randomBytesSync;
  function randomBytes(size, callback) {
    if (callback !== undefined && typeof callback !== 'function') {
      throw new TypeError('argument callback must be a function');
    }
    if (!callback && !global.Promise) {
      throw new TypeError('argument callback is required');
    }
    if (callback) {
      return generateRandomBytes(size, generateAttempts, callback);
    }
    return new Promise(function executor(resolve, reject) {
      generateRandomBytes(size, generateAttempts, function onRandomBytes(err, str) {
        if (err)
          return reject(err);
        resolve(str);
      });
    });
  }
  function randomBytesSync(size) {
    var err = null;
    for (var i = 0; i < generateAttempts; i++) {
      try {
        return crypto.randomBytes(size);
      } catch (e) {
        err = e;
      }
    }
    throw err;
  }
  function generateRandomBytes(size, attempts, callback) {
    crypto.randomBytes(size, function onRandomBytes(err, buf) {
      if (!err)
        return callback(null, buf);
      if (!--attempts)
        return callback(err);
      setTimeout(generateRandomBytes.bind(null, size, attempts, callback), 10);
    });
  }
})(require('buffer').Buffer);
