'use strict';

var Route = require('./route');

var Router = function() {
  this.routes = {};
  this.default = null;
};

Router.prototype.get = function(path, handler) {
  return this.add('get', path, handler);
};

Router.prototype.post = function(path, handler) {
  return this.add('post', path, handler);
};

Router.prototype.put = function(path, handler) {
  return this.add('put', path, handler);
};

Router.prototype.delete = function(path, handler) {
  return this.add('delete', path, handler);
};

Router.prototype.head = function(path, handler) {
  return this.add('head', path, handler);
};

Router.prototype.any = function(path, handler) {
  return this.add('any', path, handler);
};

Router.prototype.add = function(method, path, handler) {
  method = method.toLowerCase();
  var route = new Route(method, path, handler);
  this.routes[method] = this.routes[method] || {};
  this.routes[method][route.regexp.toString()] = route;
};

Router.prototype.matchMethod = function(method, url) {
  var routes = this.routes[method.toLowerCase()];
  if (!routes) {
    return null;
  }
  var match, route;
  var paths = Object.keys(routes);
  for (var i = 0; i < paths.length; i++) {
    route = routes[paths[i]];
    match = route.regexp.exec(url);
    if (match) {
      return route.makeHandler(url);
    }
  }
  return null;
};

Router.prototype.match = function(request) {
  return this.matchMethod(request.method, request.url) || this.matchMethod('any', request.url);
};

module.exports = new Router();
