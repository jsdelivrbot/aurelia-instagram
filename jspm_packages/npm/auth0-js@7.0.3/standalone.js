/* */ 
var Auth0 = require('./index');
if (typeof global.window.define == 'function' && global.window.define.amd) {
  global.window.define('auth0', function() {
    return Auth0;
  });
} else if (global.window) {
  global.window.Auth0 = Auth0;
}
