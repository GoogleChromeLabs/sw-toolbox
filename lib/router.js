'use strict';

var pathRegexp = require('path-to-regexp');
var url = new URL('./', self.scope);
var baseUrl = url.protocol + '//' + url.host;
var basePath = url.pathname;

var Route = function(method, path, handler) {
  // The URL() constructor can't parse express-style routes as they are not
  // valid urls. This means we have to manually manipulate relative urls into
  // absolute ones. This check is extremely naive but implementing a tweaked
  // version of the full algorithm seems like overkill
  // (https://url.spec.whatwg.org/#concept-basic-url-parser)
  if (!(path.indexOf('http://') === 0 || path.indexOf('https://') === 0)) {
    if (path.indexOf('/') !== 0) {
      path = basePath + path;
    }
    path = baseUrl + path;
  }

  this.method = method;
  this.keys = [];
  this.regexp = pathRegexp(path, this.keys);
  this.handler = handler;
};

Route.prototype.makeHandler = function(url) {
    var match = this.regexp.exec(url);
    var values = {};
    this.keys.forEach(function(key, index) {
      values[key.name] = match[index + 1];
    });
    return function(request) {
      return this.handler(request, values);
    }.bind(this);
};

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
  this.routes[method] = this.routes[method] || {};
  this.routes[method][path] = new Route(method.toLowerCase(), path, handler);
};

Router.prototype.matchMethod = function(method, url) {
  var routes = this.routes[method.toLowerCase()];
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
