'use strict';

var Route = require('./route');

var Router = function() {
  this.routes = {};
  this.default = null;
};

['get', 'post', 'put', 'delete', 'head', 'any'].forEach(function(method) {
  Router.prototype[method] = function(path, handler, options) {
    return this.add(method, path, handler, options);
  };
});

Router.prototype.add = function(method, path, handler, options) {
  options = options || {};
  var origin = options.origin || self.location.origin;
  method = method.toLowerCase();
  var route = new Route(method, path, handler, options);
  this.routes[origin] = this.routes[origin] || {};
  this.routes[origin][method] = this.routes[origin][method] || {};
  this.routes[origin][method][route.regexp.toString()] = route;
};

Router.prototype.matchMethod = function(method, url) {
  url = new URL(url);
  var origin = url.origin;
  var path = url.pathname;
  method = method.toLowerCase();

  if (!this.routes[origin] || !this.routes[origin][method]) {
    return null;
  }
  var routes = this.routes[origin][method];

  var match, route;
  var patterns = Object.keys(routes);
  for (var i = 0; i < patterns.length; i++) {
    route = routes[patterns[i]];
    match = route.regexp.exec(path);
    if (match) {
      return route.makeHandler(path);
    }
  }
  return null;
};

Router.prototype.match = function(request) {
  return this.matchMethod(request.method, request.url) || this.matchMethod('any', request.url);
};

module.exports = new Router();
