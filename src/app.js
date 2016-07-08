// src/app.js
export class App {
  // Implement configureRouter method
  configureRouter(config, router) {
    config.title = 'Scotch IG';
    // Use map to set array of possible routes
    config.map([
      { route: ['','home'], name: 'home', moduleId: './home', nav: true, title:'Home' },
      { route: 'me', name: 'me',  moduleId: './me',    nav: true, title:'Me' }
    ]);

    // Create a binding to the router object
    this.router = router;
  }
}