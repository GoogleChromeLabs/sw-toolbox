/*
  Copyright 2014 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';

var Route = require('./route');

function regexEscape(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var keyMatch = function(map, string) {
  // This would be better written as a for..of loop, but that would break the minifyify process
  // in the build.
  var entriesIterator = map.entries();
  var item = entriesIterator.next();
  while (!item.done) {
    var pattern = new RegExp(item.value[0]);
    if (pattern.test(string)) {
      return item.value[1];
    }
    item = entriesIterator.next();
  }
  return null;
};

var Router = function() {
  this.routes = new Map();
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
  if (origin instanceof RegExp) {
    origin = origin.source;
  } else {
    origin = regexEscape(origin);
  }
  method = method.toLowerCase();

  var route = new Route(method, path, handler, options);

  if (!this.routes.has(origin)) {
    this.routes.set(origin, new Map());
  }

  var methodMap = this.routes.get(origin);
  if (!methodMap.has(method)) {
    methodMap.set(method, new Map());
  }

  var routeMap = methodMap.get(method);
  routeMap.set(route.regexp.source, route);
};

Router.prototype.matchMethod = function(method, url) {
  url = new URL(url);
  var origin = url.origin;
  var path = url.pathname;
  method = method.toLowerCase();

  var methods = keyMatch(this.routes, origin);
  if (!methods) {
    return null;
  }

  var routes = methods.get(method);
  if (!routes) {
    return null;
  }

  var route = keyMatch(routes, path);

  if (route) {
    return route.makeHandler(path);
  }

  return null;
};

Router.prototype.match = function(request) {
  return this.matchMethod(request.method, request.url) || this.matchMethod('any', request.url);
};

module.exports = new Router();
