// src/auth-service.js

// Import Auth0
import Auth0 from 'auth0-js';

export class AuthService {
  constructor() {
    // Initialize Auth0
    this.auth0 = new Auth0({
      domain:       'robinclaes.eu.auth0.com',
      clientID:     'fJqsyvJcwasCOJvirff5AJ6OAyIa66If',
      callbackURL:  'http://localhost:8080/#/',
      callbackOnLocationHash: true
    });
  }

  signin() {
    //Keep a copy of 'original' this
    const _this = this;
    // Login with IG
    this.auth0.login({
      connection: 'instagram',
      popup: true
    },
    function(err, profile) {
      if (err) {
        alert("something went wrong: " + err.message);
        return;
      }
      // Use ID token to get Instagram user profile
      _this.auth0.getProfile(profile.idToken, function (err, profile) {
        if(err) {
          alert(err);
          return;
        }
        localStorage.setItem('token', profile.identities[0].access_token);
      });
    });
  }

  signout() {
    localStorage.removeItem('token');
  }

}