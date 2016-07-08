// src/home.js

import {inject} from 'aurelia-framework';
import {AuthService} from './auth-service';
import {IgService} from './ig-service';

// Browser-based implementation of Aurelia's platform abstraction layer.
// activate() will throw an error if missing
import {initialize} from 'aurelia-pal-browser';
initialize()

// DI for AuthService
@inject(AuthService, IgService)
export class Home {
  heading = "Welcome to Scotch IG";

  constructor(authService, igService){
    // Setup Dependencies
    this.authService = authService;
    this.igService = igService;
  }

  signin() {
    // Sign in
    this.authService.signin();
  }

  signout() {
    // Sign out
    this.authService.signout();
  }

  // Lifecycle method called when a route is activated
  activate() {
    if(localStorage.getItem('token')){
      // Resolve promise returned from igService
      return this.igService.recent()
        .then(res => res.response.data)
        .then(recent =>
          {
            // Bind to view
            this.recent = recent
          });
      }
  }
}