(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
self.shed = require('../lib/shed.js');
},{"../lib/shed.js":3}],2:[function(require,module,exports){
'use strict';

var pathRegexp = require('path-to-regexp');
var url = new URL('./', self.location);
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

},{"path-to-regexp":4}],3:[function(require,module,exports){
'use strict';

require('serviceworker-cache-polyfill/lib/caches');
var router = require('./router');

var version = 1;
var cachePrefix = 'shed-' + self.scope + '-';
var cacheName = cachePrefix + version;
var preCacheItems = [];
var DEBUG = false;

// A regular expression to apply to HTTP response codes. Codes that match will
// be considered successes, while others will not, and will not be cached.
// TODO: Make this user configurable
var SUCCESS_RESPONSES = /^0|([123]\d\d)|(40[14567])|410$/;

// Internal Helpers

function debug(message) {
  if (DEBUG) {
    console.log('[shed] ' + message);
  }
}

function openCache() {
  return caches.open(cacheName);
}

function networkFetch(request) {
  return fetch(request);
}

function cacheFetch(request) {
  return openCache().then(function(cache) {
    return cache.match(request);
  });
}

function fetchAndCache(request) {
  return networkFetch(request.clone()).then(function(response) {

    // Only cache successful responses
    if (SUCCESS_RESPONSES.test(response.status)) {
      openCache().then(function(cache) {
        cache.put(request, response);
      });
    }

    return response.clone();
  });
}

// Setup

debug('service worker is loading');

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

self.addEventListener('install', function(event) {
  debug('install event fired');
  debug('preCache list: ' + preCacheItems);
  event.waitUntil(
    openCache().then(function(cache) {
      return cache.addAll(preCacheItems);
    })
  );
});

self.addEventListener('activate', function(event) {
  debug('activate event fired, removing old caches');
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          if (name.indexOf(cachePrefix) === 0) {
            var thisVersion = name.substring(cachePrefix.length);
            if (isNumber(thisVersion) && thisVersion < version) {
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

// Event overwrite detection

setTimeout(function() {
  var events = ['fetch', 'install', 'activate'];
  var overwritten = [];

  events.forEach(function(eventName) {
    if (self['on' + eventName]) {
      overwritten.push(eventName);
    }
  });

  if (overwritten.length > 0) {
    console.warn('Necessary event listeners (' + overwritten.join(', ') + ') were overwritten. Avoid using self.onfetch = ... when setting listeners.');
  }
}, 0);


// Strategies

function networkOnly(request) {
  debug('Trying network only');
  return networkFetch(request);
}

function networkFirst(request) {
  debug('Trying network first');
  return fetchAndCache(request).then(function(response) {
    if (SUCCESS_RESPONSES.test(response.status)) {
      return response;
    }

    return cacheFetch(request).then(function(cacheResponse) {
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
    debug('Network error, fallback to cache');
    return cacheFetch(request);
  });
}

function cacheOnly(request) {
  debug('Trying cache only');
  return cacheFetch(request);
}

function cacheFirst(request) {
  debug('Trying cache first');
  return cacheFetch(request).then(function (response) {
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
  return openCache().then(function(cache) {
    return cache.add(url);
  });
}

function uncache(url) {
  return openCache().then(function(cache) {
    return cache.delete(url);
  });
}

function precache(items) {
  if (!Array.isArray(items)) {
    items = [items];
  }
  preCacheItems = items;
}

module.exports = {
  networkOnly: networkOnly,
  networkFirst: networkFirst,
  cacheOnly: cacheOnly,
  cacheFirst: cacheFirst,
  fastest: fastest,
  router: router,
  cache: cache,
  uncache: uncache,
  precache: precache
};

},{"./router":2,"serviceworker-cache-polyfill/lib/caches":5}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
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
