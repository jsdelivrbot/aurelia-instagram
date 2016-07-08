// src/ig-service.js
import {inject} from 'aurelia-framework';
import {HttpClient} from 'aurelia-http-client';

//DI
@inject(HttpClient)
export class IgService {
  token = localStorage.getItem('token');
  constructor(http) {
    //Configure basw URL
    http.configure(config => {
      config
        .withBaseUrl('https://api.instagram.com/v1/');
    });
    // Set http property
    this.http = http;
  }

  recent() {
    // Return a promise which when resolved will respond with recent posts
    return this.http.jsonp(`users/self/media/recent/?access_token=${this.token}`, 'callback');
  }

  me() {
    // Return a promise which when resolved will respond with user's profile
    return this.http.jsonp(`users/self/?access_token=${this.token}`, 'callback');
  }

}