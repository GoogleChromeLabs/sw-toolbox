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
var helpers = require('./helpers');
var FUNC_PAT = 'funcUrlPattern';

function regexEscape(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var keyMatch = function(map, stringOrRes) {
  // This would be better written as a for..of loop, but that would break the
  // minifyify process in the build.
  var entriesIterator = map.entries();
  var item = entriesIterator.next();
  var matches = [];

  while (!item.done) {
    // if the urlPattern is a custom function, match with this
    if (typeof item.value[0] === 'function') {
      var funcUrlPattern = item.value[0];
      if (funcUrlPattern(stringOrRes)) {
        matches.push(item.value[1]);
      }
    } else {
      var pattern = new RegExp(item.value[0]);
      if (pattern.test(stringOrRes)) {
        matches.push(item.value[1]);
      }
    }

    item = entriesIterator.next();
  }

  return matches;
};

var Router = function() {
  this.routes = new Map();
  // Create the dummy origin for RegExp-based routes
  this.routes.set(RegExp, new Map());
  this.default = null;
};

['get', 'post', 'put', 'delete', 'head', 'any'].forEach(function(method) {
  Router.prototype[method] = function(pathOrFunc, handler, options) {
    return this.add(method, pathOrFunc, handler, options);
  };
});

Router.prototype.add = function(method, pathOrFunc, handler, options) {
  options = options || {};
  var origin;

  if (pathOrFunc instanceof RegExp) {
    // We need a unique key to use in the Map to distinguish RegExp paths
    // from Express-style paths + origins. Since we can use any object as the
    // key in a Map, let's use the RegExp constructor!
    origin = RegExp;
  } else if (typeof pathOrFunc === 'function') {
    // if urlPattern is a function
    origin = FUNC_PAT;
  } else {
    origin = options.origin || self.location.origin;
    if (origin instanceof RegExp) {
      origin = origin.source;
    } else {
      origin = regexEscape(origin);
    }
  }

  method = method.toLowerCase();

  var route = new Route(method, pathOrFunc, handler, options);

  if (!this.routes.has(origin)) {
    this.routes.set(origin, new Map());
  }

  var methodMap = this.routes.get(origin);
  if (!methodMap.has(method)) {
    methodMap.set(method, new Map());
  }

  var routeMap = methodMap.get(method);


  // urlPattern is a custom function
  if (origin === FUNC_PAT) {
    routeMap.set(route.funcUrlPattern, route);
  } else {
    var regExp = route.regexp || route.fullUrlRegExp;

    if (routeMap.has(regExp.source)) {
      var t = '"' + pathOrFunc + '" resolves to same regex as existing route.';
      helpers.debug(t);
    }

    routeMap.set(regExp.source, route);
  }
};

Router.prototype.matchMethod = function(method, request) {
  var urlObject = new URL(request.url);
  var origin = urlObject.origin;
  var path = urlObject.pathname;

  // We want to first check to see if there's a match against any
  // "Express-style" routes (string for the path, RegExp for the origin).
  // Checking for Express-style matches first maintains the legacy behavior.
  // If there's no match, we next check for a match against any RegExp routes,
  // where the RegExp in question matches the full URL (both origin and path).
  return this._match(method, keyMatch(this.routes, origin), path) ||
    this._match(method, [this.routes.get(RegExp)], request.url) ||
    this._match(method, [this.routes.get(FUNC_PAT)], request);
};

Router.prototype._match = function(method, methodMaps, pathOrUrlOrRes) {
  if (methodMaps.length === 0) {
    return null;
  }

  for (var i = 0; i < methodMaps.length; i++) {
    var methodMap = methodMaps[i];
    var routeMap = methodMap && methodMap.get(method.toLowerCase());
    if (routeMap) {
      var routes = keyMatch(routeMap, pathOrUrlOrRes);
      if (routes.length > 0) {
        return routes[0].makeHandler(pathOrUrlOrRes);
      }
    }
  }

  return null;
};

Router.prototype.match = function(request) {
  return this.matchMethod(request.method, request) ||
      this.matchMethod('any', request);
};

module.exports = new Router();
