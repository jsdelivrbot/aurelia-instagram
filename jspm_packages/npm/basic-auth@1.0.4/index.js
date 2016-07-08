/* */ 
(function(Buffer) {
  'use strict';
  module.exports = auth;
  var credentialsRegExp = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9\-\._~\+\/]+=*) *$/;
  var userPassRegExp = /^([^:]*):(.*)$/;
  function auth(req) {
    if (!req) {
      throw new TypeError('argument req is required');
    }
    if (typeof req !== 'object') {
      throw new TypeError('argument req is required to be an object');
    }
    var header = getAuthorization(req.req || req);
    var match = credentialsRegExp.exec(header || '');
    if (!match) {
      return;
    }
    var userPass = userPassRegExp.exec(decodeBase64(match[1]));
    if (!userPass) {
      return;
    }
    return new Credentials(userPass[1], userPass[2]);
  }
  function decodeBase64(str) {
    return new Buffer(str, 'base64').toString();
  }
  function getAuthorization(req) {
    if (!req.headers || typeof req.headers !== 'object') {
      throw new TypeError('argument req is required to have headers property');
    }
    return req.headers.authorization;
  }
  function Credentials(name, pass) {
    this.name = name;
    this.pass = pass;
  }
})(require('buffer').Buffer);
