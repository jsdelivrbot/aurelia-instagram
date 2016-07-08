/* */ 
(function(Buffer, process) {
  'use strict';
  var bytes = require('bytes');
  var iconv = require('iconv-lite');
  var unpipe = require('unpipe');
  module.exports = getRawBody;
  var iconvEncodingMessageRegExp = /^Encoding not recognized: /;
  function getDecoder(encoding) {
    if (!encoding)
      return null;
    try {
      return iconv.getDecoder(encoding);
    } catch (e) {
      if (!iconvEncodingMessageRegExp.test(e.message))
        throw e;
      throw createError(415, 'specified encoding unsupported', 'encoding.unsupported', {encoding: encoding});
    }
  }
  function getRawBody(stream, options, callback) {
    var done = callback;
    var opts = options || {};
    if (options === true || typeof options === 'string') {
      opts = {encoding: options};
    }
    if (typeof options === 'function') {
      done = options;
      opts = {};
    }
    if (done !== undefined && typeof done !== 'function') {
      throw new TypeError('argument callback must be a function');
    }
    if (!done && !global.Promise) {
      throw new TypeError('argument callback is required');
    }
    var encoding = opts.encoding !== true ? opts.encoding : 'utf-8';
    var limit = bytes.parse(opts.limit);
    var length = opts.length != null && !isNaN(opts.length) ? parseInt(opts.length, 10) : null;
    if (done) {
      return readStream(stream, encoding, length, limit, done);
    }
    return new Promise(function executor(resolve, reject) {
      readStream(stream, encoding, length, limit, function onRead(err, buf) {
        if (err)
          return reject(err);
        resolve(buf);
      });
    });
  }
  function halt(stream) {
    unpipe(stream);
    if (typeof stream.pause === 'function') {
      stream.pause();
    }
  }
  function createError(status, message, type, props) {
    var error = new Error();
    Error.captureStackTrace(error, createError);
    for (var prop in props) {
      error[prop] = props[prop];
    }
    error.message = message;
    error.status = status;
    error.statusCode = status;
    Object.defineProperty(error, 'type', {
      value: type,
      enumerable: true,
      writable: true,
      configurable: true
    });
    return error;
  }
  function readStream(stream, encoding, length, limit, callback) {
    var complete = false;
    var sync = true;
    if (limit !== null && length !== null && length > limit) {
      return done(createError(413, 'request entity too large', 'entity.too.large', {
        expected: length,
        length: length,
        limit: limit
      }));
    }
    var state = stream._readableState;
    if (stream._decoder || (state && (state.encoding || state.decoder))) {
      return done(createError(500, 'stream encoding should not be set', 'stream.encoding.set'));
    }
    var received = 0;
    var decoder;
    try {
      decoder = getDecoder(encoding);
    } catch (err) {
      return done(err);
    }
    var buffer = decoder ? '' : [];
    stream.on('aborted', onAborted);
    stream.on('close', cleanup);
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onEnd);
    sync = false;
    function done() {
      var args = new Array(arguments.length);
      for (var i = 0; i < args.length; i++) {
        args[i] = arguments[i];
      }
      complete = true;
      if (sync) {
        process.nextTick(invokeCallback);
      } else {
        invokeCallback();
      }
      function invokeCallback() {
        cleanup();
        if (args[0]) {
          halt(stream);
        }
        callback.apply(null, args);
      }
    }
    function onAborted() {
      if (complete)
        return;
      done(createError(400, 'request aborted', 'request.aborted', {
        code: 'ECONNABORTED',
        expected: length,
        length: length,
        received: received
      }));
    }
    function onData(chunk) {
      if (complete)
        return;
      received += chunk.length;
      decoder ? buffer += decoder.write(chunk) : buffer.push(chunk);
      if (limit !== null && received > limit) {
        done(createError(413, 'request entity too large', 'entity.too.large', {
          limit: limit,
          received: received
        }));
      }
    }
    function onEnd(err) {
      if (complete)
        return;
      if (err)
        return done(err);
      if (length !== null && received !== length) {
        done(createError(400, 'request size did not match content length', 'request.size.invalid', {
          expected: length,
          length: length,
          received: received
        }));
      } else {
        var string = decoder ? buffer + (decoder.end() || '') : Buffer.concat(buffer);
        done(null, string);
      }
    }
    function cleanup() {
      buffer = null;
      stream.removeListener('aborted', onAborted);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onEnd);
      stream.removeListener('close', cleanup);
    }
  }
})(require('buffer').Buffer, require('process'));
