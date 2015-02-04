(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
self.shed = require('../lib/shed.js');
},{"../lib/shed.js":6}],2:[function(require,module,exports){
'use strict';

var globalOptions = require('./options');

function debug(message, options) {
  options = options || {};
  var flag = options.debug || globalOptions.debug;  
  if (flag) {
    console.log('[shed] ' + message);
  }
}

function openCache(options) {
  options = options || {};
  var cacheName = options.cacheName || globalOptions.cacheName;
  debug('Opening cache "' + cacheName + '"', options);
  return caches.open(cacheName);
}

function fetchAndCache(request, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;  
  return fetch(request.clone()).then(function(response) {

    // Only cache successful responses
    if (successResponses.test(response.status)) {
      openCache(options).then(function(cache) {
        cache.put(request, response);
      });
    }

    return response.clone();
  });
}

function renameCache(source, destination, options) {
  debug('Renaming cache: [' + source + '] to [' + destination + ']', options);
  return caches.delete(destination).then(function() {
    return Promise.all([
      caches.open(source),
      caches.open(destination)
    ]).then(function(results) {
      var sourceCache = results[0];
      var destCache = results[1];

      return sourceCache.keys().then(function(requests) {
        return Promise.all(requests.map(function(request) {
          return sourceCache.match(request).then(function(response) {
            return destCache.put(request, response);
          });
        }));
      }).then(function() {
        return caches.delete(source);
      });
    });
  });
}

module.exports = {
  debug: debug,
  fetchAndCache: fetchAndCache,
  openCache: openCache,
  renameCache: renameCache
};
},{"./options":3}],3:[function(require,module,exports){
'use strict';

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration, but it was not implemented in Chrome 40.
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || new URL('./', self.location).href;
}

module.exports = {
	cacheName: '$$$shed-cache$$$' + scope + '$$$',
	debug: false,
	preCacheItems: [],
	// A regular expression to apply to HTTP response codes. Codes that match
	// will be considered successes, while others will not, and will not be
	// cached.
	successResponses: /^0|([123]\d\d)|(40[14567])|410$/,
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
  this.options = options;
  this.handler = handler;
};

Route.prototype.makeHandler = function(url) {
  var match = this.regexp.exec(url);
  var values = {};
  this.keys.forEach(function(key, index) {
    values[key.name] = match[index + 1];
  });
  return function(request) {
    return this.handler(request, values, this.options);
  }.bind(this);
};

module.exports = Route;

},{"path-to-regexp":13}],5:[function(require,module,exports){
'use strict';

var Route = require('./route');

function regexEscape(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var keyMatch = function(object, string) {
  var keys = Object.keys(object);
  for (var i = 0; i < keys.length; i++) {
    var pattern = new RegExp(keys[i]);
    if (pattern.test(string)) {
      return object[keys[i]];
    }
  }
  return null;
};

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
  if (origin instanceof RegExp) {
    origin = origin.source;
  } else {
    origin = regexEscape(origin);
  }
  method = method.toLowerCase();
  var route = new Route(method, path, handler, options);
  this.routes[origin] = this.routes[origin] || {};
  this.routes[origin][method] = this.routes[origin][method] || {};
  this.routes[origin][method][route.regexp.source] = route;
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

  var routes = methods[method];
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

},{"./route":4}],6:[function(require,module,exports){
'use strict';

require('serviceworker-cache-polyfill/lib/caches');
var options = require('./options');
var router = require('./router');
var helpers = require('./helpers');
var strategies = require('./strategies');

helpers.debug('Shed is loading');

// Install

self.addEventListener('install', function(event) {
  var inactiveCache = options.cacheName + '$$$inactive$$$';
  helpers.debug('install event fired');
  helpers.debug('creating cache [' + inactiveCache + ']');
  helpers.debug('preCache list: ' + (options.preCacheItems.join(', ') || '(none)'));
  event.waitUntil(
    helpers.openCache({cacheName: inactiveCache}).then(function(cache) {
      return cache.addAll(options.preCacheItems);
    })
  );
});

// Activate

self.addEventListener('activate', function(event) {
  helpers.debug('activate event fired');
  var inactiveCache = options.cacheName + '$$$inactive$$$';
  event.waitUntil(helpers.renameCache(inactiveCache, options.cacheName));
});

// Fetch

self.addEventListener('fetch', function(event) {
  var handler = router.match(event.request);

  if (handler) {
    event.respondWith(handler(event.request));
  } else if (router.default) {
    event.respondWith(router.default(event.request));
  }
});

// Caching

function cache(url, options) {
  return helpers.openCache(options).then(function(cache) {
    return cache.add(url);
  });
}

function uncache(url, options) {
  return helpers.openCache(options).then(function(cache) {
    return cache.delete(url);
  });
}

function precache(items) {
  if (!Array.isArray(items)) {
    items = [items];
  }
  options.preCacheItems = options.preCacheItems.concat(items);
}

module.exports = {
  networkOnly: strategies.networkOnly,
  networkFirst: strategies.networkFirst,
  cacheOnly: strategies.cacheOnly,
  cacheFirst: strategies.cacheFirst,
  fastest: strategies.fastest,
  router: router,
  options: options,
  cache: cache,
  uncache: uncache,
  precache: precache
};

},{"./helpers":2,"./options":3,"./router":5,"./strategies":10,"serviceworker-cache-polyfill/lib/caches":14}],7:[function(require,module,exports){
'use strict';
var helpers = require('../helpers');

function cacheFirst(request, values, options) {
  helpers.debug('Strategy: cache first [' + request.url + ']', options);
  return helpers.openCache(options).then(function(cache) {
    return cache.match(request).then(function (response) {
      if (response) {
        return response;
      }

      return helpers.fetchAndCache(request, options);
    });
  });
}

module.exports = cacheFirst;
},{"../helpers":2}],8:[function(require,module,exports){
'use strict';
var helpers = require('../helpers');

function cacheOnly(request, values, options) {
  helpers.debug('Strategy: cache only [' + request.url + ']', options);
  return helpers.openCache(options).then(function(cache) {
    return cache.match(request);
  });
}

module.exports = cacheOnly;

},{"../helpers":2}],9:[function(require,module,exports){
'use strict';
var helpers = require('../helpers');
var cacheOnly = require('./cacheOnly');

function fastest(request, values, options) {
  helpers.debug('Strategy: fastest [' + request.url + ']', options);
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
    helpers.fetchAndCache(request.clone(), options).then(resolve, maybeReject);
    cacheOnly(request, options).then(resolve, maybeReject);
  });
}

module.exports = fastest;
},{"../helpers":2,"./cacheOnly":8}],10:[function(require,module,exports){
module.exports = {
  networkOnly: require('./networkOnly'),
  networkFirst: require('./networkFirst'),
  cacheOnly: require('./cacheOnly'),
  cacheFirst: require('./cacheFirst'),
  fastest: require('./fastest')	
};
},{"./cacheFirst":7,"./cacheOnly":8,"./fastest":9,"./networkFirst":11,"./networkOnly":12}],11:[function(require,module,exports){
'use strict';
var globalOptions = require('../options');
var helpers = require('../helpers');

function networkFirst(request, values, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;
  helpers.debug('Strategy: network first [' + request.url + ']', options);
  return helpers.openCache(options).then(function(cache) {
    return helpers.fetchAndCache(request, options).then(function(response) {
      if (successResponses.test(response.status)) {
        return response;
      }

      return cache.match(request).then(function(cacheResponse) {
        helpers.debug('Response was an HTTP error', options);
        if (cacheResponse) {
          helpers.debug('Resolving with cached response instead', options);
          return cacheResponse;
        } else {
          // If we didn't have anything in the cache, it's better to return the
          // error page than to return nothing
          helpers.debug('No cached result, resolving with HTTP error response from network', options);
          return response;
        }
      });
    }).catch(function(error) {
      helpers.debug('Network error, fallback to cache [' + request.url + ']', options);
      return cache.match(request);
    });
  });
}

module.exports = networkFirst;
},{"../helpers":2,"../options":3}],12:[function(require,module,exports){
'use strict';
var helpers = require('../helpers');

function networkOnly(request, values, options) {
  helpers.debug('Strategy: network only [' + request.url + ']', options);
  return fetch(request);
}

module.exports = networkOnly;
},{"../helpers":2}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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
