/* */ 
var Base64Url = require('./lib/base64_url');
var assert_required = require('./lib/assert_required');
var is_array = require('./lib/is-array');
var index_of = require('./lib/index-of');
var qs = require('qs');
var xtend = require('xtend');
var trim = require('trim');
var reqwest = require('reqwest');
var WinChan = require('winchan');
var jsonp = require('jsonp');
var jsonpOpts = {
  param: 'cbx',
  timeout: 8000,
  prefix: '__auth0jp'
};
var same_origin = require('./lib/same-origin');
var json_parse = require('./lib/json-parse');
var LoginError = require('./lib/LoginError');
var use_jsonp = require('./lib/use_jsonp');
function isInternetExplorer() {
  var rv = -1;
  var ua = navigator.userAgent;
  var re;
  if (navigator.appName === 'Microsoft Internet Explorer') {
    re = new RegExp('MSIE ([0-9]{1,}[\.0-9]{0,})');
    if (re.exec(ua) != null) {
      rv = parseFloat(RegExp.$1);
    }
  } else if (ua.indexOf('Trident') > -1) {
    re = new RegExp('rv:([0-9]{2,2}[\.0-9]{0,})');
    if (re.exec(ua) !== null) {
      rv = parseFloat(RegExp.$1);
    }
  }
  return rv;
}
function stringifyPopupSettings(popupOptions) {
  var settings = '';
  for (var key in popupOptions) {
    settings += key + '=' + popupOptions[key] + ',';
  }
  return settings.slice(0, -1);
}
function checkIfSet(obj, key) {
  return !!(obj && obj[key] != null);
}
function handleRequestError(err, callback) {
  var status = err.status;
  var responseText = 'string' === typeof err.responseText ? err.responseText : err;
  var isAffectedIEVersion = isInternetExplorer() === 10 || isInternetExplorer() === 11;
  var zeroStatus = (!status || status === 0);
  var onLine = !!window.navigator.onLine;
  if (zeroStatus && !onLine) {
    status = 0;
    responseText = {code: 'offline'};
  } else if (zeroStatus && isAffectedIEVersion) {
    status = 401;
    responseText = {code: 'invalid_user_password'};
  } else if (zeroStatus) {
    status = 0;
    responseText = {code: 'connection_refused_timeout'};
  }
  var error = new LoginError(status, responseText);
  callback(error);
}
function joinUrl(protocol, domain, endpoint) {
  return protocol + '//' + domain + endpoint;
}
function Auth0(options) {
  if (!(this instanceof Auth0)) {
    return new Auth0(options);
  }
  assert_required(options, 'clientID');
  assert_required(options, 'domain');
  this._useJSONP = null != options.forceJSONP ? !!options.forceJSONP : use_jsonp() && !same_origin('https:', options.domain);
  this._clientID = options.clientID;
  this._callbackURL = options.callbackURL || document.location.href;
  this._shouldRedirect = !!options.callbackURL;
  this._domain = options.domain;
  this._callbackOnLocationHash = false || options.callbackOnLocationHash;
  this._cordovaSocialPlugins = {facebook: this._phonegapFacebookLogin};
  this._useCordovaSocialPlugins = false || options.useCordovaSocialPlugins;
  this._sendClientInfo = null != options.sendSDKClientInfo ? options.sendSDKClientInfo : true;
}
Auth0.version = require('./version').str;
Auth0.clientInfo = {
  name: 'auth0.js',
  version: Auth0.version
};
Auth0.prototype.openWindow = function(url, name, options) {
  return window.open(url, name, stringifyPopupSettings(options));
};
Auth0.prototype._redirect = function(url) {
  global.window.location = url;
};
Auth0.prototype._getCallbackOnLocationHash = function(options) {
  return (options && typeof options.callbackOnLocationHash !== 'undefined') ? options.callbackOnLocationHash : this._callbackOnLocationHash;
};
Auth0.prototype._getCallbackURL = function(options) {
  return (options && typeof options.callbackURL !== 'undefined') ? options.callbackURL : this._callbackURL;
};
Auth0.prototype._getClientInfoString = function() {
  var clientInfo = JSON.stringify(Auth0.clientInfo);
  return Base64Url.encode(clientInfo);
};
Auth0.prototype._getClientInfoHeader = function() {
  return {'Auth0-Client': this._getClientInfoString()};
};
Auth0.prototype._renderAndSubmitWSFedForm = function(options, formHtml) {
  var div = document.createElement('div');
  div.innerHTML = formHtml;
  var form = document.body.appendChild(div).children[0];
  if (options.popup && !this._getCallbackOnLocationHash(options)) {
    form.target = 'auth0_signup_popup';
  }
  form.submit();
};
Auth0.prototype._getMode = function(options) {
  return {
    scope: 'openid',
    response_type: this._getCallbackOnLocationHash(options) ? 'token' : 'code'
  };
};
Auth0.prototype._configureOfflineMode = function(options) {
  if (options.scope && options.scope.indexOf('offline_access') >= 0) {
    options.device = options.device || 'Browser';
  }
};
Auth0.prototype._getUserInfo = function(profile, id_token, callback) {
  if (!(profile && !profile.user_id)) {
    return callback(null, profile);
  }
  var _this = this;
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/tokeninfo';
  var url = joinUrl(protocol, domain, endpoint);
  var fail = function(status, description) {
    var error = new Error(status + ': ' + (description || ''));
    error.error = status;
    error.error_description = description;
    callback(error);
  };
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify({id_token: id_token}), jsonpOpts, function(err, resp) {
      if (err) {
        return fail(0, err.toString());
      }
      return resp.status === 200 ? callback(null, resp.user) : fail(resp.status, resp.err || resp.error);
    });
  }
  return reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'json',
    crossOrigin: !same_origin(protocol, domain),
    data: {id_token: id_token}
  }).fail(function(err) {
    fail(err.status, err.responseText);
  }).then(function(userinfo) {
    callback(null, userinfo);
  });
};
Auth0.prototype.getProfile = function(id_token, callback) {
  if ('function' !== typeof callback) {
    throw new Error('A callback function is required');
  }
  if (!id_token || typeof id_token !== 'string') {
    return callback(new Error('Invalid token'));
  }
  this._getUserInfo(this.decodeJwt(id_token), id_token, callback);
};
Auth0.prototype.validateUser = function(options, callback) {
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/public/api/users/validate_userpassword';
  var url = joinUrl(protocol, domain, endpoint);
  var query = xtend(options, {
    client_id: this._clientID,
    username: trim(options.username || options.email || '')
  });
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(err);
      }
      if ('error' in resp && resp.status !== 404) {
        return callback(new Error(resp.error));
      }
      callback(null, resp.status === 200);
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'text',
    data: query,
    crossOrigin: !same_origin(protocol, domain),
    error: function(err) {
      if (err.status !== 404) {
        return callback(new Error(err.responseText));
      }
      callback(null, false);
    },
    success: function(resp) {
      callback(null, resp.status === 200);
    }
  });
};
Auth0.prototype.decodeJwt = function(jwt) {
  var encoded = jwt && jwt.split('.')[1];
  return json_parse(Base64Url.decode(encoded));
};
Auth0.prototype.parseHash = function(hash) {
  hash = hash || window.location.hash;
  var parsed_qs;
  if (hash.match(/error/)) {
    hash = hash.substr(1).replace(/^\//, '');
    parsed_qs = qs.parse(hash);
    var err = {
      error: parsed_qs.error,
      error_description: parsed_qs.error_description
    };
    return err;
  }
  if (!hash.match(/access_token/)) {
    return null;
  }
  hash = hash.substr(1).replace(/^\//, '');
  parsed_qs = qs.parse(hash);
  var id_token = parsed_qs.id_token;
  var refresh_token = parsed_qs.refresh_token;
  var prof = this.decodeJwt(id_token);
  var invalidJwt = function(error) {
    var err = {
      error: 'invalid_token',
      error_description: error
    };
    return err;
  };
  var audiences = is_array(prof.aud) ? prof.aud : [prof.aud];
  if (index_of(audiences, this._clientID) === -1) {
    return invalidJwt('The clientID configured (' + this._clientID + ') does not match with the clientID set in the token (' + audiences.join(', ') + ').');
  }
  if (prof.iss && prof.iss !== 'https://' + this._domain + '/') {
    return invalidJwt('The domain configured (https://' + this._domain + '/) does not match with the domain set in the token (' + prof.iss + ').');
  }
  return {
    accessToken: parsed_qs.access_token,
    idToken: id_token,
    idTokenPayload: prof,
    refreshToken: refresh_token,
    state: parsed_qs.state
  };
};
Auth0.prototype.signup = function(options, callback) {
  var _this = this;
  var opts = {
    client_id: this._clientID,
    redirect_uri: this._getCallbackURL(options),
    email: trim(options.email || options.username || ''),
    tenant: this._domain.split('.')[0]
  };
  if (typeof options.username === 'string') {
    opts.username = trim(options.username);
  }
  var query = xtend(this._getMode(options), options, opts);
  this._configureOfflineMode(query);
  if (!checkIfSet(options, 'sso')) {
    options.sso = true;
  }
  if (!checkIfSet(options, 'auto_login')) {
    options.auto_login = true;
  }
  var popup;
  var will_popup = options.auto_login && options.popup && (!this._getCallbackOnLocationHash(options) || options.sso);
  if (will_popup) {
    popup = this._buildPopupWindow(options);
  }
  function success() {
    if (options.auto_login) {
      return _this.login(options, callback);
    }
    if ('function' === typeof callback) {
      return callback();
    }
  }
  function fail(status, resp) {
    var error = new LoginError(status, resp);
    if (popup && 'function' === typeof popup.kill) {
      popup.kill();
    }
    if ('function' === typeof callback) {
      return callback(error);
    }
    throw error;
  }
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/dbconnections/signup';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return fail(0, err);
      }
      return resp.status == 200 ? success() : fail(resp.status, resp.err || resp.error);
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'html',
    data: query,
    success: success,
    crossOrigin: !same_origin(protocol, domain),
    error: function(err) {
      fail(err.status, err.responseText);
    }
  });
};
Auth0.prototype.changePassword = function(options, callback) {
  var query = {
    tenant: this._domain.split('.')[0],
    client_id: this._clientID,
    connection: options.connection,
    email: trim(options.email || '')
  };
  if (typeof options.password === "string") {
    query.password = options.password;
  }
  function fail(status, resp) {
    var error = new LoginError(status, resp);
    if (callback) {
      return callback(error);
    }
  }
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/dbconnections/change_password';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return fail(0, err);
      }
      return resp.status == 200 ? callback(null, resp.message) : fail(resp.status, resp.err || resp.error);
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'html',
    data: query,
    crossOrigin: !same_origin(protocol, domain),
    error: function(err) {
      fail(err.status, err.responseText);
    },
    success: function(r) {
      callback(null, r);
    }
  });
};
Auth0.prototype._buildAuthorizeQueryString = function(args, blacklist) {
  var query = this._buildAuthorizationParameters(args, blacklist);
  return qs.stringify(query);
};
Auth0.prototype._buildAuthorizationParameters = function(args, blacklist) {
  var query = xtend.apply(null, args);
  this._configureOfflineMode(query);
  if (this._sendClientInfo)
    query['auth0Client'] = this._getClientInfoString();
  blacklist = blacklist || ['popup', 'popupOptions'];
  var i,
      key;
  for (i = 0; i < blacklist.length; i++) {
    key = blacklist[i];
    delete query[key];
  }
  if (query.connection_scope && is_array(query.connection_scope)) {
    query.connection_scope = query.connection_scope.join(',');
  }
  return query;
};
Auth0.prototype.login = Auth0.prototype.signin = function(options, callback) {
  if (!checkIfSet(options, 'sso')) {
    options.sso = true;
  }
  if (typeof options.passcode !== 'undefined') {
    return this.loginWithPasscode(options, callback);
  }
  if (typeof options.username !== 'undefined' || typeof options.email !== 'undefined') {
    return this.loginWithUsernamePassword(options, callback);
  }
  if (!!window.cordova || !!window.electron) {
    return this.loginPhonegap(options, callback);
  }
  if (!!options.popup && this._getCallbackOnLocationHash(options)) {
    return this.loginWithPopup(options, callback);
  }
  this._authorize(options);
};
Auth0.prototype._authorize = function(options) {
  var qs = [this._getMode(options), options, {
    client_id: this._clientID,
    redirect_uri: this._getCallbackURL(options)
  }];
  var query = this._buildAuthorizeQueryString(qs);
  var url = joinUrl('https:', this._domain, '/authorize?' + query);
  if (options.popup) {
    this._buildPopupWindow(options, url);
  } else {
    this._redirect(url);
  }
};
Auth0.prototype._computePopupPosition = function(options) {
  options = options || {};
  var width = options.width || 500;
  var height = options.height || 600;
  var screenX = typeof window.screenX !== 'undefined' ? window.screenX : window.screenLeft;
  var screenY = typeof window.screenY !== 'undefined' ? window.screenY : window.screenTop;
  var outerWidth = typeof window.outerWidth !== 'undefined' ? window.outerWidth : document.body.clientWidth;
  var outerHeight = typeof window.outerHeight !== 'undefined' ? window.outerHeight : (document.body.clientHeight - 22);
  var left = screenX + (outerWidth - width) / 2;
  var top = screenY + (outerHeight - height) / 2;
  return {
    width: width,
    height: height,
    left: left,
    top: top
  };
};
Auth0.prototype.loginPhonegap = function(options, callback) {
  if (this._shouldAuthenticateWithCordovaPlugin(options.connection)) {
    this._socialPhonegapLogin(options, callback);
    return;
  }
  var mobileCallbackURL = joinUrl('https:', this._domain, '/mobile');
  var _this = this;
  var qs = [this._getMode(options), options, {
    client_id: this._clientID,
    redirect_uri: mobileCallbackURL
  }];
  if (this._sendClientInfo) {
    qs.push({auth0Client: this._getClientInfoString()});
  }
  var query = this._buildAuthorizeQueryString(qs);
  var popupUrl = joinUrl('https:', this._domain, '/authorize?' + query);
  var popupOptions = xtend({location: 'yes'}, options.popupOptions);
  delete popupOptions.width;
  delete popupOptions.height;
  var ref = this.openWindow(popupUrl, '_blank', popupOptions);
  var answered = false;
  function errorHandler(event) {
    if (answered) {
      return;
    }
    answered = true;
    ref.close();
    callback(new Error(event.message), null);
  }
  function startHandler(event) {
    if (answered) {
      return;
    }
    if (event.url && !(event.url.indexOf(mobileCallbackURL + '#') === 0 || event.url.indexOf(mobileCallbackURL + '?') === 0)) {
      return;
    }
    var result = _this.parseHash(event.url.slice(mobileCallbackURL.length));
    if (!result) {
      answered = true;
      ref.close();
      callback(new Error('Error parsing hash'), null);
      return;
    }
    if (result.idToken) {
      answered = true;
      ref.close();
      callback(null, result);
      return;
    }
    answered = true;
    ref.close();
    callback(new Error(result.err || result.error || 'Something went wrong'), null);
  }
  function exitHandler() {
    if (answered) {
      return;
    }
    ref.removeEventListener('loaderror', errorHandler);
    ref.removeEventListener('loadstart', startHandler);
    ref.removeEventListener('exit', exitHandler);
    callback(new Error('Browser window closed'), null);
  }
  ref.addEventListener('loaderror', errorHandler);
  ref.addEventListener('loadstart', startHandler);
  ref.addEventListener('exit', exitHandler);
};
Auth0.prototype.loginWithPopup = function(options, callback) {
  var _this = this;
  if (!callback) {
    throw new Error('popup mode should receive a mandatory callback');
  }
  var qs = [this._getMode(options), options, {
    client_id: this._clientID,
    owp: true
  }];
  if (this._sendClientInfo) {
    qs.push({auth0Client: this._getClientInfoString()});
  }
  var query = this._buildAuthorizeQueryString(qs);
  var popupUrl = joinUrl('https:', this._domain, '/authorize?' + query);
  var popupPosition = this._computePopupPosition(options.popupOptions);
  var popupOptions = xtend(popupPosition, options.popupOptions);
  var popup = WinChan.open({
    url: popupUrl,
    relay_url: 'https://' + this._domain + '/relay.html',
    window_features: stringifyPopupSettings(popupOptions)
  }, function(err, result) {
    _this._current_popup = null;
    if (err) {
      return callback(new LoginError(err), null, null, null, null, null);
    }
    if (!result) {
      return callback(new LoginError('Something went wrong'), null, null, null, null, null);
    }
    if (result.id_token) {
      return callback(null, _this._prepareResult(result));
    }
    if (result.err) {
      return callback(new LoginError(result.err.status, result.err.details || result.err), null, null, null, null, null);
    }
    if (result.error) {
      return callback(new LoginError(result.status, result.details || result), null, null, null, null, null);
    }
    return callback(new LoginError('Something went wrong'), null, null, null, null, null);
  });
  popup.focus();
};
Auth0.prototype._shouldAuthenticateWithCordovaPlugin = function(connection) {
  var socialPlugin = this._cordovaSocialPlugins[connection];
  return this._useCordovaSocialPlugins && !!socialPlugin;
};
Auth0.prototype._socialPhonegapLogin = function(options, callback) {
  var socialAuthentication = this._cordovaSocialPlugins[options.connection];
  var _this = this;
  socialAuthentication(options.connection_scope, function(error, accessToken, extras) {
    if (error) {
      callback(error, null, null, null, null);
      return;
    }
    var loginOptions = xtend({access_token: accessToken}, options, extras);
    _this.loginWithSocialAccessToken(loginOptions, callback);
  });
};
Auth0.prototype._phonegapFacebookLogin = function(scopes, callback) {
  if (!window.facebookConnectPlugin || !window.facebookConnectPlugin.login) {
    callback(new Error('missing plugin phonegap-facebook-plugin'), null, null);
    return;
  }
  var fbScopes;
  if (scopes && is_array(scopes)) {
    fbScopes = scopes;
  } else if (scopes) {
    fbScopes = [scopes];
  } else {
    fbScopes = ['public_profile'];
  }
  window.facebookConnectPlugin.login(fbScopes, function(state) {
    callback(null, state.authResponse.accessToken, {});
  }, function(error) {
    callback(new Error(error), null, null);
  });
};
Auth0.prototype.loginWithUsernamePasswordAndSSO = function(options, callback) {
  var _this = this;
  var popupPosition = this._computePopupPosition(options.popupOptions);
  var popupOptions = xtend(popupPosition, options.popupOptions);
  var popup = WinChan.open({
    url: 'https://' + this._domain + '/sso_dbconnection_popup/' + this._clientID,
    relay_url: 'https://' + this._domain + '/relay.html',
    window_features: stringifyPopupSettings(popupOptions),
    popup: this._current_popup,
    params: {
      domain: this._domain,
      clientID: this._clientID,
      options: {
        username: trim(options.username || options.email || ''),
        password: options.password,
        connection: options.connection,
        state: options.state,
        scope: options.scope
      }
    }
  }, function(err, result) {
    _this._current_popup = null;
    if (err) {
      return callback(new LoginError(err), null, null, null, null, null);
    }
    if (!result) {
      return callback(new LoginError('Something went wrong'), null, null, null, null, null);
    }
    if (result.id_token) {
      return callback(null, _this._prepareResult(result));
    }
    if (result.err) {
      return callback(new LoginError(result.err.status, result.err.details || result.err), null, null, null, null, null);
    }
    if (result.error) {
      return callback(new LoginError(result.status, result.details || result), null, null, null, null, null);
    }
    return callback(new LoginError('Something went wrong'), null, null, null, null, null);
  });
  popup.focus();
};
Auth0.prototype.loginWithResourceOwner = function(options, callback) {
  var _this = this;
  var query = xtend(this._getMode(options), options, {
    client_id: this._clientID,
    username: trim(options.username || options.email || ''),
    grant_type: 'password'
  });
  this._configureOfflineMode(query);
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/oauth/ro';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._sendClientInfo && this._useJSONP) {
    query['auth0Client'] = this._getClientInfoString();
  }
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(err);
      }
      if ('error' in resp) {
        var error = new LoginError(resp.status, resp.error);
        return callback(error);
      }
      callback(null, _this._prepareResult(resp));
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'json',
    data: query,
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    success: function(resp) {
      callback(null, _this._prepareResult(resp));
    },
    error: function(err) {
      handleRequestError(err, callback);
    }
  });
};
Auth0.prototype.loginWithSocialAccessToken = function(options, callback) {
  var _this = this;
  var query = this._buildAuthorizationParameters([{scope: 'openid'}, options, {client_id: this._clientID}]);
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/oauth/access_token';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(err);
      }
      if ('error' in resp) {
        var error = new LoginError(resp.status, resp.error);
        return callback(error);
      }
      callback(null, _this._prepareResult(resp));
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'json',
    data: query,
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    success: function(resp) {
      callback(null, _this._prepareResult(resp));
    },
    error: function(err) {
      handleRequestError(err, callback);
    }
  });
};
Auth0.prototype._buildPopupWindow = function(options, url) {
  if (this._current_popup && !this._current_popup.closed) {
    return this._current_popup;
  }
  url = url || 'about:blank';
  var _this = this;
  var defaults = {
    width: 500,
    height: 600
  };
  var opts = xtend(defaults, options.popupOptions || {});
  var popupOptions = stringifyPopupSettings(opts);
  this._current_popup = window.open(url, 'auth0_signup_popup', popupOptions);
  if (!this._current_popup) {
    throw new Error('Popup window cannot not been created. Disable popup blocker or make sure to call Auth0 login or singup on an UI event.');
  }
  this._current_popup.kill = function() {
    this.close();
    _this._current_popup = null;
  };
  return this._current_popup;
};
Auth0.prototype.loginWithUsernamePassword = function(options, callback) {
  if (callback && callback.length > 1 && (!options.sso || window.cordova)) {
    return this.loginWithResourceOwner(options, callback);
  }
  var _this = this;
  var popup;
  if (options.popup && !this._getCallbackOnLocationHash(options)) {
    popup = this._buildPopupWindow(options);
  }
  if (callback && callback.length > 1 && options.sso) {
    return this.loginWithUsernamePasswordAndSSO(options, callback);
  }
  var query = xtend(this._getMode(options), options, {
    client_id: this._clientID,
    redirect_uri: this._getCallbackURL(options),
    username: trim(options.username || options.email || ''),
    tenant: this._domain.split('.')[0]
  });
  this._configureOfflineMode(query);
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/usernamepassword/login';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        if (popup && popup.kill) {
          popup.kill();
        }
        return callback(err);
      }
      if ('error' in resp) {
        if (popup && popup.kill) {
          popup.kill();
        }
        var error = new LoginError(resp.status, resp.error);
        return callback(error);
      }
      _this._renderAndSubmitWSFedForm(options, resp.form);
    });
  }
  function return_error(error) {
    if (callback) {
      return callback(error);
    }
    throw error;
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'html',
    data: query,
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    success: function(resp) {
      _this._renderAndSubmitWSFedForm(options, resp);
    },
    error: function(err) {
      if (popup && popup.kill) {
        popup.kill();
      }
      handleRequestError(err, return_error);
    }
  });
};
Auth0.prototype.loginWithPasscode = function(options, callback) {
  if (options.email == null && options.phoneNumber == null) {
    throw new Error('email or phoneNumber is required for authentication');
  }
  if (options.passcode == null) {
    throw new Error('passcode is required for authentication');
  }
  options.connection = options.email == null ? 'sms' : 'email';
  if (!this._shouldRedirect) {
    options = xtend(options, {
      username: options.email == null ? options.phoneNumber : options.email,
      password: options.passcode,
      sso: false
    });
    delete options.email;
    delete options.phoneNumber;
    delete options.passcode;
    return this.loginWithResourceOwner(options, callback);
  }
  var verifyOptions = {connection: options.connection};
  if (options.phoneNumber) {
    options.phone_number = options.phoneNumber;
    delete options.phoneNumber;
    verifyOptions.phone_number = options.phone_number;
  }
  if (options.email) {
    verifyOptions.email = options.email;
  }
  options.verification_code = options.passcode;
  delete options.passcode;
  verifyOptions.verification_code = options.verification_code;
  var _this = this;
  this._verify(verifyOptions, function(error) {
    if (error) {
      return callback(error);
    }
    _this._verify_redirect(options);
  });
};
Auth0.prototype._verify = function(options, callback) {
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/passwordless/verify';
  var url = joinUrl(protocol, domain, endpoint);
  var data = options;
  if (this._useJSONP) {
    if (this._sendClientInfo) {
      data['auth0Client'] = this._getClientInfoString();
    }
    return jsonp(url + '?' + qs.stringify(data), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(new Error(0 + ': ' + err.toString()));
      }
      return resp.status === 200 ? callback(null, true) : callback({status: resp.status});
    });
  }
  return reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    data: data
  }).fail(function(err) {
    try {
      callback(JSON.parse(err.responseText));
    } catch (e) {
      var error = new Error(err.status + '(' + err.statusText + '): ' + err.responseText);
      error.statusCode = err.status;
      error.error = err.statusText;
      error.message = err.responseText;
      callback(error);
    }
  }).then(function(result) {
    callback(null, result);
  });
};
Auth0.prototype._verify_redirect = function(options) {
  var qs = [this._getMode(options), options, {
    client_id: this._clientID,
    redirect_uri: this._getCallbackURL(options)
  }];
  var query = this._buildAuthorizeQueryString(qs);
  var url = joinUrl('https:', this._domain, '/passwordless/verify_redirect?' + query);
  this._redirect(url);
};
Auth0.prototype.renewIdToken = function(id_token, callback) {
  this.getDelegationToken({
    id_token: id_token,
    scope: 'passthrough',
    api: 'auth0'
  }, callback);
};
Auth0.prototype.refreshToken = function(refresh_token, callback) {
  this.getDelegationToken({
    refresh_token: refresh_token,
    scope: 'passthrough',
    api: 'auth0'
  }, callback);
};
Auth0.prototype.getDelegationToken = function(options, callback) {
  options = options || {};
  if (!options.id_token && !options.refresh_token) {
    throw new Error('You must send either an id_token or a refresh_token to get a delegation token.');
  }
  var query = xtend({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: this._clientID,
    target: options.targetClientId || this._clientID,
    api_type: options.api
  }, options);
  delete query.hasOwnProperty;
  delete query.targetClientId;
  delete query.api;
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/delegation';
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    return jsonp(url + '?' + qs.stringify(query), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(err);
      }
      if ('error' in resp) {
        var error = new LoginError(resp.status, resp.error_description || resp.error);
        return callback(error);
      }
      callback(null, resp);
    });
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'json',
    data: query,
    crossOrigin: !same_origin(protocol, domain),
    success: function(resp) {
      callback(null, resp);
    },
    error: function(err) {
      try {
        callback(JSON.parse(err.responseText));
      } catch (e) {
        var er = err;
        var isAffectedIEVersion = isInternetExplorer() === 10 || isInternetExplorer() === 11;
        var zeroStatus = (!er.status || er.status === 0);
        if (zeroStatus && !window.navigator.onLine) {
          er = {};
          er.status = 0;
          er.responseText = {code: 'offline'};
        } else if (zeroStatus && isAffectedIEVersion) {
          er = {};
          er.status = 401;
          er.responseText = {code: 'invalid_operation'};
        } else if (zeroStatus) {
          er = {};
          er.status = 0;
          er.responseText = {code: 'connection_refused_timeout'};
        } else {
          er.responseText = err;
        }
        callback(new LoginError(er.status, er.responseText));
      }
    }
  });
};
Auth0.prototype.logout = function(query) {
  var url = joinUrl('https:', this._domain, '/logout');
  if (query) {
    url += '?' + qs.stringify(query);
  }
  this._redirect(url);
};
Auth0.prototype.getSSOData = function(withActiveDirectories, cb) {
  if (typeof withActiveDirectories === 'function') {
    cb = withActiveDirectories;
    withActiveDirectories = false;
  }
  var noResult = {sso: false};
  if (this._useJSONP) {
    var error = new Error("The SSO data can't be obtained using JSONP");
    setTimeout(function() {
      cb(error, noResult);
    }, 0);
    return;
  }
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/user/ssodata';
  var url = joinUrl(protocol, domain, endpoint);
  var sameOrigin = same_origin(protocol, domain);
  var data = {};
  if (withActiveDirectories) {
    data = {
      ldaps: 1,
      client_id: this._clientID
    };
  }
  return reqwest({
    url: sameOrigin ? endpoint : url,
    method: 'get',
    type: 'json',
    data: data,
    crossOrigin: !sameOrigin,
    withCredentials: !sameOrigin,
    timeout: 3000
  }).fail(function(err) {
    var error = new Error("There was an error in the request that obtains the user's SSO data.");
    error.cause = err;
    cb(error, noResult);
  }).then(function(resp) {
    cb(null, resp);
  });
};
Auth0.prototype.getConnections = function(callback) {
  return jsonp('https://' + this._domain + '/public/api/' + this._clientID + '/connections', jsonpOpts, callback);
};
Auth0.prototype.startPasswordless = function(options, callback) {
  if ('object' !== typeof options) {
    throw new Error('An options object is required');
  }
  if ('function' !== typeof callback) {
    throw new Error('A callback function is required');
  }
  if (!options.email && !options.phoneNumber) {
    throw new Error('An `email` or a `phoneNumber` is required.');
  }
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = '/passwordless/start';
  var url = joinUrl(protocol, domain, endpoint);
  var data = {client_id: this._clientID};
  if (options.email) {
    data.email = options.email;
    data.connection = 'email';
    if (options.authParams) {
      data.authParams = options.authParams;
    }
    if (!options.send || options.send === "link") {
      if (!data.authParams) {
        data.authParams = {};
      }
      data.authParams.redirect_uri = this._callbackURL;
      data.authParams.response_type = this._shouldRedirect && !this._callbackOnLocationHash ? "code" : "token";
    }
    if (options.send) {
      data.send = options.send;
    }
  } else {
    data.phone_number = options.phoneNumber;
    data.connection = 'sms';
  }
  if (this._useJSONP) {
    if (this._sendClientInfo) {
      data['auth0Client'] = this._getClientInfoString();
    }
    return jsonp(url + '?' + qs.stringify(data), jsonpOpts, function(err, resp) {
      if (err) {
        return callback(new Error(0 + ': ' + err.toString()));
      }
      return resp.status === 200 ? callback(null, true) : callback(resp.err || resp.error);
    });
  }
  return reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: 'post',
    type: 'json',
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    data: data
  }).fail(function(err) {
    try {
      callback(JSON.parse(err.responseText));
    } catch (e) {
      var error = new Error(err.status + '(' + err.statusText + '): ' + err.responseText);
      error.statusCode = err.status;
      error.error = err.statusText;
      error.message = err.responseText;
      callback(error);
    }
  }).then(function(result) {
    callback(null, result);
  });
};
Auth0.prototype.requestMagicLink = function(attrs, cb) {
  return this.startPasswordless(attrs, cb);
};
Auth0.prototype.requestEmailCode = function(attrs, cb) {
  attrs.send = "code";
  return this.startPasswordless(attrs, cb);
};
Auth0.prototype.verifyEmailCode = function(attrs, cb) {
  attrs.passcode = attrs.code;
  delete attrs.code;
  return this.login(attrs, cb);
};
Auth0.prototype.requestSMSCode = function(attrs, cb) {
  return this.startPasswordless(attrs, cb);
};
Auth0.prototype.verifySMSCode = function(attrs, cb) {
  attrs.passcode = attrs.code;
  delete attrs.code;
  return this.login(attrs, cb);
};
Auth0.prototype.getUserCountry = function(cb) {
  var protocol = 'https:';
  var domain = this._domain;
  var endpoint = "/user/geoloc/country";
  var url = joinUrl(protocol, domain, endpoint);
  if (this._useJSONP) {
    var error = new Error("The user's country can't be obtained using JSONP");
    setTimeout(function() {
      cb(error);
    }, 0);
    return;
  }
  reqwest({
    url: same_origin(protocol, domain) ? endpoint : url,
    method: "get",
    type: "json",
    headers: this._getClientInfoHeader(),
    crossOrigin: !same_origin(protocol, domain),
    success: function(resp) {
      cb(null, resp.country_code);
    },
    error: function(err) {
      var error = new Error("There was an error in the request that obtains the user's country");
      error.cause = err;
      cb(error);
    }
  });
};
Auth0.prototype._prepareResult = function(result) {
  if (!result || typeof result !== "object") {
    return;
  }
  var idTokenPayload = result.profile ? result.profile : this.decodeJwt(result.id_token);
  return {
    accessToken: result.access_token,
    idToken: result.id_token,
    idTokenPayload: idTokenPayload,
    refreshToken: result.refresh_token,
    state: result.state
  };
};
module.exports = Auth0;
