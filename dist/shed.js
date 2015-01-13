(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
self.shed = require('../lib/shed.js');
},{"../lib/shed.js":6}],2:[function(require,module,exports){
'use strict';

var CacheWrapper = function(name) {
  this._name = name;
  this._cache = null;
};

CacheWrapper.prototype.open = function() {
  if (!this._cache) {
    return caches.open(this._name).then(function(cache) {
      this._cache = cache;
      return cache;
    }.bind(this));
  } else {
    return Promise.resolve(this._cache);
  }
};

CacheWrapper.prototype.fetch = function(request) {
  return this.open().then(function(cache) {
    return cache.match(request);
  });
};

CacheWrapper.prototype.put = function(request, response) {
  return this.open().then(function(cache) {
    cache.put(request, response);
  });
};

CacheWrapper.prototype.add = function(requests) {
  if (!Array.isArray(requests)) {
    requests = [requests];
  }
  return this.open().then(function(cache) {
    return cache.addAll(requests);
  });
};

CacheWrapper.prototype.remove = function(request) {
  return this.open().then(function(cache) {
    cache.delete(request);
  });
};

module.exports = CacheWrapper;
},{}],3:[function(require,module,exports){
'use strict';

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || self.location;
}
var version = 1;
var cachePrefix = 'shed-' + scope + '-';


module.exports = {
	cacheName: cachePrefix + version,
	cachePrefix: cachePrefix,
	debug: false,
	preCacheItems: [],
	// A regular expression to apply to HTTP response codes. Codes that match will
	// be considered successes, while others will not, and will not be cached.
	successResponses: /^0|([123]\d\d)|(40[14567])|410$/,
	version: version,
};

},{}],4:[function(require,module,exports){
'use strict';

//TODO: Use self.registration.scope instead of self.location
var url = new URL('./', self.location);
var basePath = url.pathname;
var pathRegexp = require('path-to-regexp');


var Route = function(method, path, handler, options) {
  // The URL() constructor can't parse express-style routes as they are not
  // valid urls. This means we have to manually manipulate relative urls into
  // absolute ones. This check is extremely naive but implementing a tweaked
  // version of the full algorithm seems like overkill
  // (https://url.spec.whatwg.org/#concept-basic-url-parser)
  if (path.indexOf('/') !== 0) {
    path = basePath + path;
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

module.exports = Route;

},{"path-to-regexp":7}],5:[function(require,module,exports){
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

},{"./route":4}],6:[function(require,module,exports){
'use strict';

require('serviceworker-cache-polyfill/lib/caches');
var options = require('./options');
var router = require('./router');
var CacheWrapper = require('./cache-wrapper');

// TODO: If a user changes options.cacheName, nothing happens
var cache = new CacheWrapper(options.cacheName);

// Internal Helpers

function debug(message) {
  if (options.debug) {
    console.log('[shed] ' + message);
  }
}

function fetchAndCache(request) {
  return fetch(request.clone()).then(function(response) {

    // Only cache successful responses
    if (options.successResponses.test(response.status)) {
      cache.put(request, response);
    }

    return response.clone();
  });
}

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// Setup

debug('service worker is loading');

self.addEventListener('install', function(event) {
  debug('install event fired');
  debug('preCache list: ' + (options.preCacheItems.join(', ') || '(none)'));
  event.waitUntil(cache.add(options.preCacheItems));
});

self.addEventListener('activate', function(event) {
  debug('activate event fired, removing old caches');
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          if (name.indexOf(options.cachePrefix) === 0) {
            var thisVersion = name.substring(options.cachePrefix.length);
            if (isNumber(thisVersion) && thisVersion < options.version) {
              return true;
            }
          }
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  var handler = router.match(event.request);

  if (handler) {
    event.respondWith(handler(event.request));
  } else if (router.default) {
    event.respondWith(router.default(event.request));
  }
});

// Strategies

function networkOnly(request) {
  debug('Trying network only [' + request.url + ']');
  return fetch(request);
}

function networkFirst(request) {
  debug('Trying network first [' + request.url + ']');
  return fetchAndCache(request).then(function(response) {
    if (options.successResponses.test(response.status)) {
      return response;
    }

    return cache.fetch(request).then(function(cacheResponse) {
      debug('Response was an HTTP error');
      if (cacheResponse) {
        debug('Resolving with cached response instead');
        return cacheResponse;
      } else {
        // If we didn't have anything in the cache, it's better to return the
        // error page than to return nothing
        debug('No cached result, resolving with HTTP error response from network');
        return response;
      }
    });
  }).catch(function(error) {
    debug('Network error, fallback to cache [' + request.url + ']');
    return cache.fetch(request);
  });
}

function cacheOnly(request) {
  debug('Trying cache only [' + request.url + ']');
  return cache.fetch(request);
}

function cacheFirst(request) {
  debug('Trying cache first [' + request.url + ']');
  return cache.fetch(request).then(function (response) {
    if (response) {
      return response;
    }

    return fetchAndCache(request);
  });
}

function fastest(request) {
  var rejected = false;
  var reasons = [];

  var maybeReject = function(reason) {
    reasons.push(reason.toString());
    if (rejected) {
      return Promise.reject(new Error('Both cache and network failed: "' + reasons.join('", "') + '"'));
    }
    rejected = true;
  };

  return new Promise(function(resolve, reject) {
    fetchAndCache(request.clone()).then(resolve, maybeReject);
    cacheOnly(request).then(resolve, maybeReject);
  });
}

// Caching

function cache(url) {
  return cache.add(url);
}

function uncache(url) {
  return cache.remove(url);
}

function precache(items) {
  if (!Array.isArray(items)) {
    items = [items];
  }
  options.preCacheItems = items;
}

module.exports = {
  networkOnly: networkOnly,
  networkFirst: networkFirst,
  cacheOnly: cacheOnly,
  cacheFirst: cacheFirst,
  fastest: fastest,
  router: router,
  cache: cache,
  options: options,
  uncache: uncache,
  precache: precache
};

},{"./cache-wrapper":2,"./options":3,"./router":5,"serviceworker-cache-polyfill/lib/caches":8}],7:[function(require,module,exports){
/**
 * Expose `pathtoRegexp`.
 */
module.exports = pathtoRegexp;

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match already escaped characters that would otherwise incorrectly appear
  // in future matches. This allows the user to escape special characters that
  // shouldn't be transformed.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
  // "/route(\\d+)" => [undefined, undefined, undefined, "\d+", undefined]
  '([\\/.])?(?:\\:(\\w+)(?:\\(((?:\\\\.|[^)])*)\\))?|\\(((?:\\\\.|[^)])*)\\))([+*?])?',
  // Match regexp special characters that should always be escaped.
  '([.+*?=^!:${}()[\\]|\\/])'
].join('|'), 'g');

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1');
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
var attachKeys = function (re, keys) {
  re.keys = keys;

  return re;
};

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array should be passed in, which will contain the placeholder key
 * names. For example `/user/:id` will then contain `["id"]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 keys
 * @param  {Object}                options
 * @return {RegExp}
 */
function pathtoRegexp (path, keys, options) {
  if (keys && !Array.isArray(keys)) {
    options = keys;
    keys = null;
  }

  keys = keys || [];
  options = options || {};

  var strict = options.strict;
  var end = options.end !== false;
  var flags = options.sensitive ? '' : 'i';
  var index = 0;

  if (path instanceof RegExp) {
    // Match all capturing groups of a regexp.
    var groups = path.source.match(/\((?!\?)/g) || [];

    // Map all the matches to their numeric keys and push into the keys.
    keys.push.apply(keys, groups.map(function (match, index) {
      return {
        name:      index,
        delimiter: null,
        optional:  false,
        repeat:    false
      };
    }));

    // Return the source back to the user.
    return attachKeys(path, keys);
  }

  if (Array.isArray(path)) {
    // Map array parts into regexps and return their source. We also pass
    // the same keys and options instance into every generation to get
    // consistent matching groups before we join the sources together.
    path = path.map(function (value) {
      return pathtoRegexp(value, keys, options).source;
    });

    // Generate a new regexp instance by joining all the parts together.
    return attachKeys(new RegExp('(?:' + path.join('|') + ')', flags), keys);
  }

  // Alter the path string into a usable regexp.
  path = path.replace(PATH_REGEXP, function (match, escaped, prefix, key, capture, group, suffix, escape) {
    // Avoiding re-escaping escaped characters.
    if (escaped) {
      return escaped;
    }

    // Escape regexp special characters.
    if (escape) {
      return '\\' + escape;
    }

    var repeat   = suffix === '+' || suffix === '*';
    var optional = suffix === '?' || suffix === '*';

    keys.push({
      name:      key || index++,
      delimiter: prefix || '/',
      optional:  optional,
      repeat:    repeat
    });

    // Escape the prefix character.
    prefix = prefix ? '\\' + prefix : '';

    // Match using the custom capturing group, or fallback to capturing
    // everything up to the next slash (or next period if the param was
    // prefixed with a period).
    capture = escapeGroup(capture || group || '[^' + (prefix || '\\/') + ']+?');

    // Allow parameters to be repeated more than once.
    if (repeat) {
      capture = capture + '(?:' + prefix + capture + ')*';
    }

    // Allow a parameter to be optional.
    if (optional) {
      return '(?:' + prefix + '(' + capture + '))?';
    }

    // Basic parameter support.
    return prefix + '(' + capture + ')';
  });

  // Check whether the path ends in a slash as it alters some match behaviour.
  var endsWithSlash = path[path.length - 1] === '/';

  // In non-strict mode we allow an optional trailing slash in the match. If
  // the path to match already ended with a slash, we need to remove it for
  // consistency. The slash is only valid at the very end of a path match, not
  // anywhere in the middle. This is important for non-ending mode, otherwise
  // "/test/" will match "/test//route".
  if (!strict) {
    path = (endsWithSlash ? path.slice(0, -2) : path) + '(?:\\/(?=$))?';
  }

  // In non-ending mode, we need prompt the capturing groups to match as much
  // as possible by using a positive lookahead for the end or next path segment.
  if (!end) {
    path += strict && endsWithSlash ? '' : '(?=\\/|$)';
  }

  return attachKeys(new RegExp('^' + path + (end ? '$' : ''), flags), keys);
};

},{}],8:[function(require,module,exports){
if (!Cache.prototype.add) {
  Cache.prototype.add = function add(request) {
    return this.addAll([request]);
  };
}

if (!Cache.prototype.addAll) {
  Cache.prototype.addAll = function addAll(requests) {
    var cache = this;

    // Since DOMExceptions are not constructable:
    function NetworkError(message) {
      this.name = 'NetworkError';
      this.code = 19;
      this.message = message;
    }
    NetworkError.prototype = Object.create(Error.prototype);

    return Promise.resolve().then(function() {
      if (arguments.length < 1) throw new TypeError();
      
      // Simulate sequence<(Request or USVString)> binding:
      var sequence = [];

      requests = requests.map(function(request) {
        if (request instanceof Request) {
          return request;
        }
        else {
          return String(request); // may throw TypeError
        }
      });

      return Promise.all(
        requests.map(function(request) {
          if (typeof request === 'string') {
            request = new Request(request);
          }

          var scheme = new URL(request.url).protocol;

          if (scheme !== 'http:' && scheme !== 'https:') {
            throw new NetworkError("Invalid scheme");
          }

          return fetch(request.clone());
        })
      );
    }).then(function(responses) {
      // TODO: check that requests don't overwrite one another
      // (don't think this is possible to polyfill due to opaque responses)
      return Promise.all(
        responses.map(function(response, i) {
          return cache.put(requests[i], response);
        })
      );
    }).then(function() {
      return undefined;
    });
  };
}

if (!CacheStorage.prototype.match) {
  // This is probably vulnerable to race conditions (removing caches etc)
  CacheStorage.prototype.match = function match(request, opts) {
    var caches = this;

    return this.keys().then(function(cacheNames) {
      var match;

      return cacheNames.reduce(function(chain, cacheName) {
        return chain.then(function() {
          return match || caches.open(cacheName).then(function(cache) {
            return cache.match(request, opts);
          }).then(function(response) {
            match = response;
            return match;
          });
        });
      }, Promise.resolve());
    });
  };
}

},{}]},{},[1]);
