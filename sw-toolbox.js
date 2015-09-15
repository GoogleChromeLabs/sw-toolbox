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

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),o.toolbox=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

require('serviceworker-cache-polyfill');
var options = require('./options');
var router = require('./router');
var helpers = require('./helpers');
var strategies = require('./strategies');
var appCache = require('./appcache');

helpers.debug('Service Worker Toolbox is loading');

// Install

var flatten = function(items) {
  return items.reduce(function(a, b) {
    return a.concat(b);
  }, []);
};

self.addEventListener('install', function(event) {
  var inactiveCache = options.cacheName + '$$$inactive$$$';
  helpers.debug('install event fired');
  helpers.debug('creating cache [' + inactiveCache + ']');
  event.waitUntil(
    helpers.openCache({cacheName: inactiveCache}).then(function(cache) {
      return Promise.all(options.preCacheItems)
        .then(flatten)
        .then(function(preCacheItems) {
          helpers.debug('preCache list: ' + (preCacheItems.join(', ') || '(none)'));
          return cache.addAll(preCacheItems);
        });
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
  appcache: appCache,
  cache: cache,
  cacheFirst: strategies.cacheFirst,
  cacheOnly: strategies.cacheOnly,
  fastest: strategies.fastest,
  networkFirst: strategies.networkFirst,
  networkOnly: strategies.networkOnly,
  options: options,
  precache: precache,
  router: router,
  uncache: uncache
};

},{"./appcache":2,"./helpers":3,"./options":4,"./router":6,"./strategies":10,"serviceworker-cache-polyfill":16}],2:[function(require,module,exports){
/*
 Copyright 2015 Google Inc. All Rights Reserved.

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

var cacheFirst = require('./strategies/cacheFirst');
var networkOnly = require('./strategies/networkOnly');
var options = require('./options');
var parseManifest = require('parse-appcache-manifest');
var router = require('./router');

function use(manifestUrl) {
  return fetch(manifestUrl).then(function(response) {
    if (!response.ok) {
      throw new Error('Unable to fetch ' + manifestUrl + ' due to ' + response.statusText);
    }
    return response.text();
  }).then(function(manifest) {
    return parseManifest(manifest);
  }).then(function(parsedManifest) {
    // NETWORK section:
    parsedManifest.network.forEach(function(url) {
      if (url === '*') {
        // If '*' is present, then default to network-only for all requests that don't match any
        // other handlers.
        router.default = networkOnly;
      } else {
        // If this isn't '*' then set up an explicit network-only handler for anything that matches
        // that URL prefix.
        var absoluteUrl = new URL(url, location.href);
        router.get(absoluteUrl.pathname + '(.*)', networkOnly);
      }
    });

    // CACHE section:
    // Precache all the items that are explicitly mentioned here.
    options.preCacheItems = options.preCacheItems.concat(parsedManifest.cache);

    if (router.default) {
      // If the default strategy is already set to network-first, then we need to explicitly set up
      // cache-first strategies for all the URLs in the CACHE section.
      parsedManifest.cache.forEach(function(url) {
        var absoluteUrl = new URL(url, location.href);
        router.get(absoluteUrl.pathname, cacheFirst);
      });
    } else {
      // Use cache-first as the default strategy if it's not already set to network-first due to '*'
      // being in the NETWORK section.
      router.default = cacheFirst;
    }

    Object.keys(parsedManifest.fallback).forEach(function(originalUrl) {
      var absoluteOriginalUrl = new URL(originalUrl, location.href);
      var absoluteFallbackUrlString = new URL(parsedManifest.fallback[originalUrl],
        location.href).toString();

      // We also need to precache anything that's being used as a fallback.
      options.preCacheItems.push(absoluteFallbackUrlString);

      router.get(absoluteOriginalUrl.pathname, function(request) {
        return fetch(request).then(function(response) {
          if (response.ok) {
            return response;
          }
          throw new Error('Error while fetching ' + request.url + '(' + response.statusText + ')');
        }).catch(function(error) {
          console.log('Falling back to', absoluteFallbackUrlString, 'due to', error);
          return caches.match(absoluteFallbackUrlString);
        });
      });
    });
  });
}

module.exports = {
  use: use
};

},{"./options":4,"./router":6,"./strategies/cacheFirst":7,"./strategies/networkOnly":12,"parse-appcache-manifest":13}],3:[function(require,module,exports){
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

var globalOptions = require('./options');

function debug(message, options) {
  options = options || {};
  var flag = options.debug || globalOptions.debug;
  if (flag) {
    console.log('[sw-toolbox] ' + message);
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

    // Only cache GET requests with successful responses
    if (request.method === 'GET' && successResponses.test(response.status)) {
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

},{"./options":4}],4:[function(require,module,exports){
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

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration, but it was not implemented in Chrome 40.
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || new URL('./', self.location).href;
}

module.exports = {
	cacheName: '$$$toolbox-cache$$$' + scope + '$$$',
	debug: false,
	preCacheItems: [],
	// A regular expression to apply to HTTP response codes. Codes that match
	// will be considered successes, while others will not, and will not be
	// cached.
	successResponses: /^0|([123]\d\d)|(40[14567])|410$/,
};

},{}],5:[function(require,module,exports){
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

},{"path-to-regexp":14}],6:[function(require,module,exports){
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
  for (var item of map) {
    var pattern = new RegExp(item[0]), value = item[1];
    if (pattern.test(string)) {
      return value;
    }
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

},{"./route":5}],7:[function(require,module,exports){
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
},{"../helpers":3}],8:[function(require,module,exports){
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
var helpers = require('../helpers');

function cacheOnly(request, values, options) {
  helpers.debug('Strategy: cache only [' + request.url + ']', options);
  return helpers.openCache(options).then(function(cache) {
    return cache.match(request);
  });
}

module.exports = cacheOnly;

},{"../helpers":3}],9:[function(require,module,exports){
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
var helpers = require('../helpers');
var cacheOnly = require('./cacheOnly');

function fastest(request, values, options) {
  helpers.debug('Strategy: fastest [' + request.url + ']', options);

  return new Promise(function(resolve, reject) {
    var rejected = false;
    var reasons = [];

    var maybeReject = function(reason) {
      reasons.push(reason.toString());
      if (rejected) {
        reject(new Error('Both cache and network failed: "' + reasons.join('", "') + '"'));
      } else {
        rejected = true;
      }
    };

    var maybeResolve = function(result) {
      if (result instanceof Response) {
        resolve(result);
      } else {
        maybeReject('No result returned');
      }
    };

    helpers.fetchAndCache(request.clone(), options)
      .then(maybeResolve, maybeReject);

    cacheOnly(request, options)
      .then(maybeResolve, maybeReject);
  });
}

module.exports = fastest;

},{"../helpers":3,"./cacheOnly":8}],10:[function(require,module,exports){
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
module.exports = {
  networkOnly: require('./networkOnly'),
  networkFirst: require('./networkFirst'),
  cacheOnly: require('./cacheOnly'),
  cacheFirst: require('./cacheFirst'),
  fastest: require('./fastest')	
};
},{"./cacheFirst":7,"./cacheOnly":8,"./fastest":9,"./networkFirst":11,"./networkOnly":12}],11:[function(require,module,exports){
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
},{"../helpers":3,"../options":4}],12:[function(require,module,exports){
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
var helpers = require('../helpers');

function networkOnly(request, values, options) {
  helpers.debug('Strategy: network only [' + request.url + ']', options);
  return fetch(request);
}

module.exports = networkOnly;
},{"../helpers":3}],13:[function(require,module,exports){
// Generated by CoffeeScript 1.6.3
(function() {
  module.exports = function(manifest) {
    var currentSection, entries, firstLine, line, lines, mode, tokens, _i, _len;
    lines = manifest.split(/\r\n|\r|\n/);
    firstLine = lines.shift();
    if (firstLine.indexOf('CACHE MANIFEST') !== 0) {
      throw new Error("Invalid cache manifest header: " + firstLine);
    }
    if (firstLine.length > 'CACHE MANIFEST'.length && firstLine[14] !== ' ' && firstLine[14] !== '\t') {
      throw new Error("Invalid cache manifest header: " + firstLine);
    }
    currentSection = 'CACHE';
    entries = {
      cache: [],
      network: [],
      fallback: {},
      settings: [],
      tokens: []
    };
    mode = 'CACHE';
    entries.tokens = [
      {
        type: 'magic signature',
        value: 'CACHE MANIFEST'
      }
    ];
    for (_i = 0, _len = lines.length; _i < _len; _i++) {
      line = lines[_i];
      line = line.trim();
      if (!line.length) {
        entries.tokens.push({
          type: 'newline'
        });
      } else if (line.indexOf('#') === 0) {
        entries.tokens.push({
          type: 'comment',
          value: line.substring(1)
        });
      } else if (['CACHE:', 'FALLBACK:', 'NETWORK:', 'SETTINGS:'].indexOf(line) >= 0) {
        mode = line.substring(0, line.length - 1);
        entries.tokens.push({
          type: 'mode',
          value: mode
        });
      } else if (line.indexOf(':') === (line.length - 1)) {
        mode = 'unknown';
        entries.tokens.push({
          type: 'mode',
          value: mode,
          raw: line
        });
      } else {
        tokens = line.split(/[ ]+/);
        entries.tokens.push({
          type: 'data',
          tokens: tokens
        });
        if (mode === 'FALLBACK') {
          entries.fallback[tokens[0]] = tokens[1];
        } else if (mode !== 'unknown') {
          entries[mode.toLowerCase()].push(line);
        }
      }
    }
    return entries;
  };

}).call(this);

/*
//@ sourceMappingURL=parse-appcache-manifest.map
*/

},{}],14:[function(require,module,exports){
var isarray = require('isarray')

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp
module.exports.parse = parse
module.exports.compile = compile
module.exports.tokensToFunction = tokensToFunction
module.exports.tokensToRegExp = tokensToRegExp

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

/**
 * Parse a string for the raw tokens.
 *
 * @param  {String} str
 * @return {Array}
 */
function parse (str) {
  var tokens = []
  var key = 0
  var index = 0
  var path = ''
  var res

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0]
    var escaped = res[1]
    var offset = res.index
    path += str.slice(index, offset)
    index = offset + m.length

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1]
      continue
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path)
      path = ''
    }

    var prefix = res[2]
    var name = res[3]
    var capture = res[4]
    var group = res[5]
    var suffix = res[6]
    var asterisk = res[7]

    var repeat = suffix === '+' || suffix === '*'
    var optional = suffix === '?' || suffix === '*'
    var delimiter = prefix || '/'
    var pattern = capture || group || (asterisk ? '.*' : '[^' + delimiter + ']+?')

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      pattern: escapeGroup(pattern)
    })
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index)
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path)
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {String}   str
 * @return {Function}
 */
function compile (str) {
  return tokensToFunction(parse(str))
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length)

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^' + tokens[i].pattern + '$')
    }
  }

  return function (obj) {
    var path = ''
    var data = obj || {}

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]

      if (typeof token === 'string') {
        path += token

        continue
      }

      var value = data[token.name]
      var segment

      if (value == null) {
        if (token.optional) {
          continue
        } else {
          throw new TypeError('Expected "' + token.name + '" to be defined')
        }
      }

      if (isarray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but received "' + value + '"')
        }

        if (value.length === 0) {
          if (token.optional) {
            continue
          } else {
            throw new TypeError('Expected "' + token.name + '" to not be empty')
          }
        }

        for (var j = 0; j < value.length; j++) {
          segment = encodeURIComponent(value[j])

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment
        }

        continue
      }

      segment = encodeURIComponent(value)

      if (!matches[i].test(segment)) {
        throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
      }

      path += token.prefix + segment
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {String} str
 * @return {String}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1')
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys
  return re
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {String}
 */
function flags (options) {
  return options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {RegExp} path
 * @param  {Array}  keys
 * @return {RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g)

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        pattern: null
      })
    }
  }

  return attachKeys(path, keys)
}

/**
 * Transform an array into a regexp.
 *
 * @param  {Array}  path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = []

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source)
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options))

  return attachKeys(regexp, keys)
}

/**
 * Create a path regexp from string input.
 *
 * @param  {String} path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function stringToRegexp (path, keys, options) {
  var tokens = parse(path)
  var re = tokensToRegExp(tokens, options)

  // Attach keys back to the regexp.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] !== 'string') {
      keys.push(tokens[i])
    }
  }

  return attachKeys(re, keys)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {Array}  tokens
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function tokensToRegExp (tokens, options) {
  options = options || {}

  var strict = options.strict
  var end = options.end !== false
  var route = ''
  var lastToken = tokens[tokens.length - 1]
  var endsWithSlash = typeof lastToken === 'string' && /\/$/.test(lastToken)

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i]

    if (typeof token === 'string') {
      route += escapeString(token)
    } else {
      var prefix = escapeString(token.prefix)
      var capture = token.pattern

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*'
      }

      if (token.optional) {
        if (prefix) {
          capture = '(?:' + prefix + '(' + capture + '))?'
        } else {
          capture = '(' + capture + ')?'
        }
      } else {
        capture = prefix + '(' + capture + ')'
      }

      route += capture
    }
  }

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?'
  }

  if (end) {
    route += '$'
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithSlash ? '' : '(?=\\/|$)'
  }

  return new RegExp('^' + route, flags(options))
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 [keys]
 * @param  {Object}                [options]
 * @return {RegExp}
 */
function pathToRegexp (path, keys, options) {
  keys = keys || []

  if (!isarray(keys)) {
    options = keys
    keys = []
  } else if (!options) {
    options = {}
  }

  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys, options)
  }

  if (isarray(path)) {
    return arrayToRegexp(path, keys, options)
  }

  return stringToRegexp(path, keys, options)
}

},{"isarray":15}],15:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],16:[function(require,module,exports){
/**
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc3ctdG9vbGJveC5qcyIsImxpYi9hcHBjYWNoZS5qcyIsImxpYi9oZWxwZXJzLmpzIiwibGliL29wdGlvbnMuanMiLCJsaWIvcm91dGUuanMiLCJsaWIvcm91dGVyLmpzIiwibGliL3N0cmF0ZWdpZXMvY2FjaGVGaXJzdC5qcyIsImxpYi9zdHJhdGVnaWVzL2NhY2hlT25seS5qcyIsImxpYi9zdHJhdGVnaWVzL2Zhc3Rlc3QuanMiLCJsaWIvc3RyYXRlZ2llcy9pbmRleC5qcyIsImxpYi9zdHJhdGVnaWVzL25ldHdvcmtGaXJzdC5qcyIsImxpYi9zdHJhdGVnaWVzL25ldHdvcmtPbmx5LmpzIiwibm9kZV9tb2R1bGVzL3BhcnNlLWFwcGNhY2hlLW1hbmlmZXN0L2xpYi9wYXJzZS1hcHBjYWNoZS1tYW5pZmVzdC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9ub2RlX21vZHVsZXMvaXNhcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zZXJ2aWNld29ya2VyLWNhY2hlLXBvbHlmaWxsL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RZQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbnJlcXVpcmUoJ3NlcnZpY2V3b3JrZXItY2FjaGUtcG9seWZpbGwnKTtcbnZhciBvcHRpb25zID0gcmVxdWlyZSgnLi9vcHRpb25zJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgc3RyYXRlZ2llcyA9IHJlcXVpcmUoJy4vc3RyYXRlZ2llcycpO1xudmFyIGFwcENhY2hlID0gcmVxdWlyZSgnLi9hcHBjYWNoZScpO1xuXG5oZWxwZXJzLmRlYnVnKCdTZXJ2aWNlIFdvcmtlciBUb29sYm94IGlzIGxvYWRpbmcnKTtcblxuLy8gSW5zdGFsbFxuXG52YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGl0ZW1zKSB7XG4gIHJldHVybiBpdGVtcy5yZWR1Y2UoZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBhLmNvbmNhdChiKTtcbiAgfSwgW10pO1xufTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgdmFyIGluYWN0aXZlQ2FjaGUgPSBvcHRpb25zLmNhY2hlTmFtZSArICckJCRpbmFjdGl2ZSQkJCc7XG4gIGhlbHBlcnMuZGVidWcoJ2luc3RhbGwgZXZlbnQgZmlyZWQnKTtcbiAgaGVscGVycy5kZWJ1ZygnY3JlYXRpbmcgY2FjaGUgWycgKyBpbmFjdGl2ZUNhY2hlICsgJ10nKTtcbiAgZXZlbnQud2FpdFVudGlsKFxuICAgIGhlbHBlcnMub3BlbkNhY2hlKHtjYWNoZU5hbWU6IGluYWN0aXZlQ2FjaGV9KS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwob3B0aW9ucy5wcmVDYWNoZUl0ZW1zKVxuICAgICAgICAudGhlbihmbGF0dGVuKVxuICAgICAgICAudGhlbihmdW5jdGlvbihwcmVDYWNoZUl0ZW1zKSB7XG4gICAgICAgICAgaGVscGVycy5kZWJ1ZygncHJlQ2FjaGUgbGlzdDogJyArIChwcmVDYWNoZUl0ZW1zLmpvaW4oJywgJykgfHwgJyhub25lKScpKTtcbiAgICAgICAgICByZXR1cm4gY2FjaGUuYWRkQWxsKHByZUNhY2hlSXRlbXMpO1xuICAgICAgICB9KTtcbiAgICB9KVxuICApO1xufSk7XG5cbi8vIEFjdGl2YXRlXG5cbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignYWN0aXZhdGUnLCBmdW5jdGlvbihldmVudCkge1xuICBoZWxwZXJzLmRlYnVnKCdhY3RpdmF0ZSBldmVudCBmaXJlZCcpO1xuICB2YXIgaW5hY3RpdmVDYWNoZSA9IG9wdGlvbnMuY2FjaGVOYW1lICsgJyQkJGluYWN0aXZlJCQkJztcbiAgZXZlbnQud2FpdFVudGlsKGhlbHBlcnMucmVuYW1lQ2FjaGUoaW5hY3RpdmVDYWNoZSwgb3B0aW9ucy5jYWNoZU5hbWUpKTtcbn0pO1xuXG4vLyBGZXRjaFxuXG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2ZldGNoJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgdmFyIGhhbmRsZXIgPSByb3V0ZXIubWF0Y2goZXZlbnQucmVxdWVzdCk7XG5cbiAgaWYgKGhhbmRsZXIpIHtcbiAgICBldmVudC5yZXNwb25kV2l0aChoYW5kbGVyKGV2ZW50LnJlcXVlc3QpKTtcbiAgfSBlbHNlIGlmIChyb3V0ZXIuZGVmYXVsdCkge1xuICAgIGV2ZW50LnJlc3BvbmRXaXRoKHJvdXRlci5kZWZhdWx0KGV2ZW50LnJlcXVlc3QpKTtcbiAgfVxufSk7XG5cbi8vIENhY2hpbmdcblxuZnVuY3Rpb24gY2FjaGUodXJsLCBvcHRpb25zKSB7XG4gIHJldHVybiBoZWxwZXJzLm9wZW5DYWNoZShvcHRpb25zKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgcmV0dXJuIGNhY2hlLmFkZCh1cmwpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gdW5jYWNoZSh1cmwsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGhlbHBlcnMub3BlbkNhY2hlKG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICByZXR1cm4gY2FjaGUuZGVsZXRlKHVybCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwcmVjYWNoZShpdGVtcykge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG4gICAgaXRlbXMgPSBbaXRlbXNdO1xuICB9XG4gIG9wdGlvbnMucHJlQ2FjaGVJdGVtcyA9IG9wdGlvbnMucHJlQ2FjaGVJdGVtcy5jb25jYXQoaXRlbXMpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXBwY2FjaGU6IGFwcENhY2hlLFxuICBjYWNoZTogY2FjaGUsXG4gIGNhY2hlRmlyc3Q6IHN0cmF0ZWdpZXMuY2FjaGVGaXJzdCxcbiAgY2FjaGVPbmx5OiBzdHJhdGVnaWVzLmNhY2hlT25seSxcbiAgZmFzdGVzdDogc3RyYXRlZ2llcy5mYXN0ZXN0LFxuICBuZXR3b3JrRmlyc3Q6IHN0cmF0ZWdpZXMubmV0d29ya0ZpcnN0LFxuICBuZXR3b3JrT25seTogc3RyYXRlZ2llcy5uZXR3b3JrT25seSxcbiAgb3B0aW9uczogb3B0aW9ucyxcbiAgcHJlY2FjaGU6IHByZWNhY2hlLFxuICByb3V0ZXI6IHJvdXRlcixcbiAgdW5jYWNoZTogdW5jYWNoZVxufTtcbiIsIi8qXG4gQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGVGaXJzdCA9IHJlcXVpcmUoJy4vc3RyYXRlZ2llcy9jYWNoZUZpcnN0Jyk7XG52YXIgbmV0d29ya09ubHkgPSByZXF1aXJlKCcuL3N0cmF0ZWdpZXMvbmV0d29ya09ubHknKTtcbnZhciBvcHRpb25zID0gcmVxdWlyZSgnLi9vcHRpb25zJyk7XG52YXIgcGFyc2VNYW5pZmVzdCA9IHJlcXVpcmUoJ3BhcnNlLWFwcGNhY2hlLW1hbmlmZXN0Jyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcblxuZnVuY3Rpb24gdXNlKG1hbmlmZXN0VXJsKSB7XG4gIHJldHVybiBmZXRjaChtYW5pZmVzdFVybCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGZldGNoICcgKyBtYW5pZmVzdFVybCArICcgZHVlIHRvICcgKyByZXNwb25zZS5zdGF0dXNUZXh0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlLnRleHQoKTtcbiAgfSkudGhlbihmdW5jdGlvbihtYW5pZmVzdCkge1xuICAgIHJldHVybiBwYXJzZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgfSkudGhlbihmdW5jdGlvbihwYXJzZWRNYW5pZmVzdCkge1xuICAgIC8vIE5FVFdPUksgc2VjdGlvbjpcbiAgICBwYXJzZWRNYW5pZmVzdC5uZXR3b3JrLmZvckVhY2goZnVuY3Rpb24odXJsKSB7XG4gICAgICBpZiAodXJsID09PSAnKicpIHtcbiAgICAgICAgLy8gSWYgJyonIGlzIHByZXNlbnQsIHRoZW4gZGVmYXVsdCB0byBuZXR3b3JrLW9ubHkgZm9yIGFsbCByZXF1ZXN0cyB0aGF0IGRvbid0IG1hdGNoIGFueVxuICAgICAgICAvLyBvdGhlciBoYW5kbGVycy5cbiAgICAgICAgcm91dGVyLmRlZmF1bHQgPSBuZXR3b3JrT25seTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHRoaXMgaXNuJ3QgJyonIHRoZW4gc2V0IHVwIGFuIGV4cGxpY2l0IG5ldHdvcmstb25seSBoYW5kbGVyIGZvciBhbnl0aGluZyB0aGF0IG1hdGNoZXNcbiAgICAgICAgLy8gdGhhdCBVUkwgcHJlZml4LlxuICAgICAgICB2YXIgYWJzb2x1dGVVcmwgPSBuZXcgVVJMKHVybCwgbG9jYXRpb24uaHJlZik7XG4gICAgICAgIHJvdXRlci5nZXQoYWJzb2x1dGVVcmwucGF0aG5hbWUgKyAnKC4qKScsIG5ldHdvcmtPbmx5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENBQ0hFIHNlY3Rpb246XG4gICAgLy8gUHJlY2FjaGUgYWxsIHRoZSBpdGVtcyB0aGF0IGFyZSBleHBsaWNpdGx5IG1lbnRpb25lZCBoZXJlLlxuICAgIG9wdGlvbnMucHJlQ2FjaGVJdGVtcyA9IG9wdGlvbnMucHJlQ2FjaGVJdGVtcy5jb25jYXQocGFyc2VkTWFuaWZlc3QuY2FjaGUpO1xuXG4gICAgaWYgKHJvdXRlci5kZWZhdWx0KSB7XG4gICAgICAvLyBJZiB0aGUgZGVmYXVsdCBzdHJhdGVneSBpcyBhbHJlYWR5IHNldCB0byBuZXR3b3JrLWZpcnN0LCB0aGVuIHdlIG5lZWQgdG8gZXhwbGljaXRseSBzZXQgdXBcbiAgICAgIC8vIGNhY2hlLWZpcnN0IHN0cmF0ZWdpZXMgZm9yIGFsbCB0aGUgVVJMcyBpbiB0aGUgQ0FDSEUgc2VjdGlvbi5cbiAgICAgIHBhcnNlZE1hbmlmZXN0LmNhY2hlLmZvckVhY2goZnVuY3Rpb24odXJsKSB7XG4gICAgICAgIHZhciBhYnNvbHV0ZVVybCA9IG5ldyBVUkwodXJsLCBsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgcm91dGVyLmdldChhYnNvbHV0ZVVybC5wYXRobmFtZSwgY2FjaGVGaXJzdCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIGNhY2hlLWZpcnN0IGFzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IGlmIGl0J3Mgbm90IGFscmVhZHkgc2V0IHRvIG5ldHdvcmstZmlyc3QgZHVlIHRvICcqJ1xuICAgICAgLy8gYmVpbmcgaW4gdGhlIE5FVFdPUksgc2VjdGlvbi5cbiAgICAgIHJvdXRlci5kZWZhdWx0ID0gY2FjaGVGaXJzdDtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhwYXJzZWRNYW5pZmVzdC5mYWxsYmFjaykuZm9yRWFjaChmdW5jdGlvbihvcmlnaW5hbFVybCkge1xuICAgICAgdmFyIGFic29sdXRlT3JpZ2luYWxVcmwgPSBuZXcgVVJMKG9yaWdpbmFsVXJsLCBsb2NhdGlvbi5ocmVmKTtcbiAgICAgIHZhciBhYnNvbHV0ZUZhbGxiYWNrVXJsU3RyaW5nID0gbmV3IFVSTChwYXJzZWRNYW5pZmVzdC5mYWxsYmFja1tvcmlnaW5hbFVybF0sXG4gICAgICAgIGxvY2F0aW9uLmhyZWYpLnRvU3RyaW5nKCk7XG5cbiAgICAgIC8vIFdlIGFsc28gbmVlZCB0byBwcmVjYWNoZSBhbnl0aGluZyB0aGF0J3MgYmVpbmcgdXNlZCBhcyBhIGZhbGxiYWNrLlxuICAgICAgb3B0aW9ucy5wcmVDYWNoZUl0ZW1zLnB1c2goYWJzb2x1dGVGYWxsYmFja1VybFN0cmluZyk7XG5cbiAgICAgIHJvdXRlci5nZXQoYWJzb2x1dGVPcmlnaW5hbFVybC5wYXRobmFtZSwgZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIHdoaWxlIGZldGNoaW5nICcgKyByZXF1ZXN0LnVybCArICcoJyArIHJlc3BvbnNlLnN0YXR1c1RleHQgKyAnKScpO1xuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWxsaW5nIGJhY2sgdG8nLCBhYnNvbHV0ZUZhbGxiYWNrVXJsU3RyaW5nLCAnZHVlIHRvJywgZXJyb3IpO1xuICAgICAgICAgIHJldHVybiBjYWNoZXMubWF0Y2goYWJzb2x1dGVGYWxsYmFja1VybFN0cmluZyk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdXNlOiB1c2Vcbn07XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBnbG9iYWxPcHRpb25zID0gcmVxdWlyZSgnLi9vcHRpb25zJyk7XG5cbmZ1bmN0aW9uIGRlYnVnKG1lc3NhZ2UsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBmbGFnID0gb3B0aW9ucy5kZWJ1ZyB8fCBnbG9iYWxPcHRpb25zLmRlYnVnO1xuICBpZiAoZmxhZykge1xuICAgIGNvbnNvbGUubG9nKCdbc3ctdG9vbGJveF0gJyArIG1lc3NhZ2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9wZW5DYWNoZShvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgY2FjaGVOYW1lID0gb3B0aW9ucy5jYWNoZU5hbWUgfHwgZ2xvYmFsT3B0aW9ucy5jYWNoZU5hbWU7XG4gIGRlYnVnKCdPcGVuaW5nIGNhY2hlIFwiJyArIGNhY2hlTmFtZSArICdcIicsIG9wdGlvbnMpO1xuICByZXR1cm4gY2FjaGVzLm9wZW4oY2FjaGVOYW1lKTtcbn1cblxuZnVuY3Rpb24gZmV0Y2hBbmRDYWNoZShyZXF1ZXN0LCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgc3VjY2Vzc1Jlc3BvbnNlcyA9IG9wdGlvbnMuc3VjY2Vzc1Jlc3BvbnNlcyB8fCBnbG9iYWxPcHRpb25zLnN1Y2Nlc3NSZXNwb25zZXM7XG4gIHJldHVybiBmZXRjaChyZXF1ZXN0LmNsb25lKCkpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcblxuICAgIC8vIE9ubHkgY2FjaGUgR0VUIHJlcXVlc3RzIHdpdGggc3VjY2Vzc2Z1bCByZXNwb25zZXNcbiAgICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdHRVQnICYmIHN1Y2Nlc3NSZXNwb25zZXMudGVzdChyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICBvcGVuQ2FjaGUob3B0aW9ucykudGhlbihmdW5jdGlvbihjYWNoZSkge1xuICAgICAgICBjYWNoZS5wdXQocmVxdWVzdCwgcmVzcG9uc2UpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3BvbnNlLmNsb25lKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZW5hbWVDYWNoZShzb3VyY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zKSB7XG4gIGRlYnVnKCdSZW5hbWluZyBjYWNoZTogWycgKyBzb3VyY2UgKyAnXSB0byBbJyArIGRlc3RpbmF0aW9uICsgJ10nLCBvcHRpb25zKTtcbiAgcmV0dXJuIGNhY2hlcy5kZWxldGUoZGVzdGluYXRpb24pLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgIGNhY2hlcy5vcGVuKHNvdXJjZSksXG4gICAgICBjYWNoZXMub3BlbihkZXN0aW5hdGlvbilcbiAgICBdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdHMpIHtcbiAgICAgIHZhciBzb3VyY2VDYWNoZSA9IHJlc3VsdHNbMF07XG4gICAgICB2YXIgZGVzdENhY2hlID0gcmVzdWx0c1sxXTtcblxuICAgICAgcmV0dXJuIHNvdXJjZUNhY2hlLmtleXMoKS50aGVuKGZ1bmN0aW9uKHJlcXVlc3RzKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChyZXF1ZXN0cy5tYXAoZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICAgIHJldHVybiBzb3VyY2VDYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZGVzdENhY2hlLnB1dChyZXF1ZXN0LCByZXNwb25zZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBjYWNoZXMuZGVsZXRlKHNvdXJjZSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBkZWJ1ZzogZGVidWcsXG4gIGZldGNoQW5kQ2FjaGU6IGZldGNoQW5kQ2FjaGUsXG4gIG9wZW5DYWNoZTogb3BlbkNhY2hlLFxuICByZW5hbWVDYWNoZTogcmVuYW1lQ2FjaGVcbn07XG4iLCIvKlxuXHRDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG5cdExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG5cdHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cblx0WW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cblx0ICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5cdFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcblx0ZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuXHRXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblx0U2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuXHRsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbi8vIFRPRE86IFRoaXMgaXMgbmVjZXNzYXJ5IHRvIGhhbmRsZSBkaWZmZXJlbnQgaW1wbGVtZW50YXRpb25zIGluIHRoZSB3aWxkXG4vLyBUaGUgc3BlYyBkZWZpbmVzIHNlbGYucmVnaXN0cmF0aW9uLCBidXQgaXQgd2FzIG5vdCBpbXBsZW1lbnRlZCBpbiBDaHJvbWUgNDAuXG52YXIgc2NvcGU7XG5pZiAoc2VsZi5yZWdpc3RyYXRpb24pIHtcbiAgc2NvcGUgPSBzZWxmLnJlZ2lzdHJhdGlvbi5zY29wZTtcbn0gZWxzZSB7XG4gIHNjb3BlID0gc2VsZi5zY29wZSB8fCBuZXcgVVJMKCcuLycsIHNlbGYubG9jYXRpb24pLmhyZWY7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRjYWNoZU5hbWU6ICckJCR0b29sYm94LWNhY2hlJCQkJyArIHNjb3BlICsgJyQkJCcsXG5cdGRlYnVnOiBmYWxzZSxcblx0cHJlQ2FjaGVJdGVtczogW10sXG5cdC8vIEEgcmVndWxhciBleHByZXNzaW9uIHRvIGFwcGx5IHRvIEhUVFAgcmVzcG9uc2UgY29kZXMuIENvZGVzIHRoYXQgbWF0Y2hcblx0Ly8gd2lsbCBiZSBjb25zaWRlcmVkIHN1Y2Nlc3Nlcywgd2hpbGUgb3RoZXJzIHdpbGwgbm90LCBhbmQgd2lsbCBub3QgYmVcblx0Ly8gY2FjaGVkLlxuXHRzdWNjZXNzUmVzcG9uc2VzOiAvXjB8KFsxMjNdXFxkXFxkKXwoNDBbMTQ1NjddKXw0MTAkLyxcbn07XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbi8vVE9ETzogVXNlIHNlbGYucmVnaXN0cmF0aW9uLnNjb3BlIGluc3RlYWQgb2Ygc2VsZi5sb2NhdGlvblxudmFyIHVybCA9IG5ldyBVUkwoJy4vJywgc2VsZi5sb2NhdGlvbik7XG52YXIgYmFzZVBhdGggPSB1cmwucGF0aG5hbWU7XG52YXIgcGF0aFJlZ2V4cCA9IHJlcXVpcmUoJ3BhdGgtdG8tcmVnZXhwJyk7XG5cblxudmFyIFJvdXRlID0gZnVuY3Rpb24obWV0aG9kLCBwYXRoLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gIC8vIFRoZSBVUkwoKSBjb25zdHJ1Y3RvciBjYW4ndCBwYXJzZSBleHByZXNzLXN0eWxlIHJvdXRlcyBhcyB0aGV5IGFyZSBub3RcbiAgLy8gdmFsaWQgdXJscy4gVGhpcyBtZWFucyB3ZSBoYXZlIHRvIG1hbnVhbGx5IG1hbmlwdWxhdGUgcmVsYXRpdmUgdXJscyBpbnRvXG4gIC8vIGFic29sdXRlIG9uZXMuIFRoaXMgY2hlY2sgaXMgZXh0cmVtZWx5IG5haXZlIGJ1dCBpbXBsZW1lbnRpbmcgYSB0d2Vha2VkXG4gIC8vIHZlcnNpb24gb2YgdGhlIGZ1bGwgYWxnb3JpdGhtIHNlZW1zIGxpa2Ugb3ZlcmtpbGxcbiAgLy8gKGh0dHBzOi8vdXJsLnNwZWMud2hhdHdnLm9yZy8jY29uY2VwdC1iYXNpYy11cmwtcGFyc2VyKVxuICBpZiAocGF0aC5pbmRleE9mKCcvJykgIT09IDApIHtcbiAgICBwYXRoID0gYmFzZVBhdGggKyBwYXRoO1xuICB9XG5cbiAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMua2V5cyA9IFtdO1xuICB0aGlzLnJlZ2V4cCA9IHBhdGhSZWdleHAocGF0aCwgdGhpcy5rZXlzKTtcbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgdGhpcy5oYW5kbGVyID0gaGFuZGxlcjtcbn07XG5cblJvdXRlLnByb3RvdHlwZS5tYWtlSGFuZGxlciA9IGZ1bmN0aW9uKHVybCkge1xuICB2YXIgbWF0Y2ggPSB0aGlzLnJlZ2V4cC5leGVjKHVybCk7XG4gIHZhciB2YWx1ZXMgPSB7fTtcbiAgdGhpcy5rZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5LCBpbmRleCkge1xuICAgIHZhbHVlc1trZXkubmFtZV0gPSBtYXRjaFtpbmRleCArIDFdO1xuICB9KTtcbiAgcmV0dXJuIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVyKHJlcXVlc3QsIHZhbHVlcywgdGhpcy5vcHRpb25zKTtcbiAgfS5iaW5kKHRoaXMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZTtcbiIsIi8qXG4gIENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIFJvdXRlID0gcmVxdWlyZSgnLi9yb3V0ZScpO1xuXG5mdW5jdGlvbiByZWdleEVzY2FwZShzKSB7XG4gIHJldHVybiBzLnJlcGxhY2UoL1stXFwvXFxcXF4kKis/LigpfFtcXF17fV0vZywgJ1xcXFwkJicpO1xufVxuXG52YXIga2V5TWF0Y2ggPSBmdW5jdGlvbihtYXAsIHN0cmluZykge1xuICBmb3IgKHZhciBpdGVtIG9mIG1hcCkge1xuICAgIHZhciBwYXR0ZXJuID0gbmV3IFJlZ0V4cChpdGVtWzBdKSwgdmFsdWUgPSBpdGVtWzFdO1xuICAgIGlmIChwYXR0ZXJuLnRlc3Qoc3RyaW5nKSkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5yb3V0ZXMgPSBuZXcgTWFwKCk7XG4gIHRoaXMuZGVmYXVsdCA9IG51bGw7XG59O1xuXG5bJ2dldCcsICdwb3N0JywgJ3B1dCcsICdkZWxldGUnLCAnaGVhZCcsICdhbnknXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuICBSb3V0ZXIucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbihwYXRoLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRkKG1ldGhvZCwgcGF0aCwgaGFuZGxlciwgb3B0aW9ucyk7XG4gIH07XG59KTtcblxuUm91dGVyLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihtZXRob2QsIHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBvcmlnaW4gPSBvcHRpb25zLm9yaWdpbiB8fCBzZWxmLmxvY2F0aW9uLm9yaWdpbjtcbiAgaWYgKG9yaWdpbiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgIG9yaWdpbiA9IG9yaWdpbi5zb3VyY2U7XG4gIH0gZWxzZSB7XG4gICAgb3JpZ2luID0gcmVnZXhFc2NhcGUob3JpZ2luKTtcbiAgfVxuICBtZXRob2QgPSBtZXRob2QudG9Mb3dlckNhc2UoKTtcblxuICB2YXIgcm91dGUgPSBuZXcgUm91dGUobWV0aG9kLCBwYXRoLCBoYW5kbGVyLCBvcHRpb25zKTtcblxuICBpZiAoIXRoaXMucm91dGVzLmhhcyhvcmlnaW4pKSB7XG4gICAgdGhpcy5yb3V0ZXMuc2V0KG9yaWdpbiwgbmV3IE1hcCgpKTtcbiAgfVxuXG4gIHZhciBtZXRob2RNYXAgPSB0aGlzLnJvdXRlcy5nZXQob3JpZ2luKTtcbiAgaWYgKCFtZXRob2RNYXAuaGFzKG1ldGhvZCkpIHtcbiAgICBtZXRob2RNYXAuc2V0KG1ldGhvZCwgbmV3IE1hcCgpKTtcbiAgfVxuXG4gIHZhciByb3V0ZU1hcCA9IG1ldGhvZE1hcC5nZXQobWV0aG9kKTtcbiAgcm91dGVNYXAuc2V0KHJvdXRlLnJlZ2V4cC5zb3VyY2UsIHJvdXRlKTtcbn07XG5cblJvdXRlci5wcm90b3R5cGUubWF0Y2hNZXRob2QgPSBmdW5jdGlvbihtZXRob2QsIHVybCkge1xuICB1cmwgPSBuZXcgVVJMKHVybCk7XG4gIHZhciBvcmlnaW4gPSB1cmwub3JpZ2luO1xuICB2YXIgcGF0aCA9IHVybC5wYXRobmFtZTtcbiAgbWV0aG9kID0gbWV0aG9kLnRvTG93ZXJDYXNlKCk7XG5cbiAgdmFyIG1ldGhvZHMgPSBrZXlNYXRjaCh0aGlzLnJvdXRlcywgb3JpZ2luKTtcbiAgaWYgKCFtZXRob2RzKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB2YXIgcm91dGVzID0gbWV0aG9kcy5nZXQobWV0aG9kKTtcbiAgaWYgKCFyb3V0ZXMpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHZhciByb3V0ZSA9IGtleU1hdGNoKHJvdXRlcywgcGF0aCk7XG5cbiAgaWYgKHJvdXRlKSB7XG4gICAgcmV0dXJuIHJvdXRlLm1ha2VIYW5kbGVyKHBhdGgpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG5Sb3V0ZXIucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ocmVxdWVzdCkge1xuICByZXR1cm4gdGhpcy5tYXRjaE1ldGhvZChyZXF1ZXN0Lm1ldGhvZCwgcmVxdWVzdC51cmwpIHx8IHRoaXMubWF0Y2hNZXRob2QoJ2FueScsIHJlcXVlc3QudXJsKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gbmV3IFJvdXRlcigpO1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG5cdCAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzJyk7XG5cbmZ1bmN0aW9uIGNhY2hlRmlyc3QocmVxdWVzdCwgdmFsdWVzLCBvcHRpb25zKSB7XG4gIGhlbHBlcnMuZGVidWcoJ1N0cmF0ZWd5OiBjYWNoZSBmaXJzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcbiAgcmV0dXJuIGhlbHBlcnMub3BlbkNhY2hlKG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICByZXR1cm4gY2FjaGUubWF0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBoZWxwZXJzLmZldGNoQW5kQ2FjaGUocmVxdWVzdCwgb3B0aW9ucyk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNhY2hlRmlyc3Q7IiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG5cdCAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzJyk7XG5cbmZ1bmN0aW9uIGNhY2hlT25seShyZXF1ZXN0LCB2YWx1ZXMsIG9wdGlvbnMpIHtcbiAgaGVscGVycy5kZWJ1ZygnU3RyYXRlZ3k6IGNhY2hlIG9ubHkgWycgKyByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gIHJldHVybiBoZWxwZXJzLm9wZW5DYWNoZShvcHRpb25zKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgcmV0dXJuIGNhY2hlLm1hdGNoKHJlcXVlc3QpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZU9ubHk7XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMnKTtcbnZhciBjYWNoZU9ubHkgPSByZXF1aXJlKCcuL2NhY2hlT25seScpO1xuXG5mdW5jdGlvbiBmYXN0ZXN0KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucykge1xuICBoZWxwZXJzLmRlYnVnKCdTdHJhdGVneTogZmFzdGVzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcblxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHJlamVjdGVkID0gZmFsc2U7XG4gICAgdmFyIHJlYXNvbnMgPSBbXTtcblxuICAgIHZhciBtYXliZVJlamVjdCA9IGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgcmVhc29ucy5wdXNoKHJlYXNvbi50b1N0cmluZygpKTtcbiAgICAgIGlmIChyZWplY3RlZCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdCb3RoIGNhY2hlIGFuZCBuZXR3b3JrIGZhaWxlZDogXCInICsgcmVhc29ucy5qb2luKCdcIiwgXCInKSArICdcIicpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIG1heWJlUmVzb2x2ZSA9IGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJlc3BvbnNlKSB7XG4gICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1heWJlUmVqZWN0KCdObyByZXN1bHQgcmV0dXJuZWQnKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QuY2xvbmUoKSwgb3B0aW9ucylcbiAgICAgIC50aGVuKG1heWJlUmVzb2x2ZSwgbWF5YmVSZWplY3QpO1xuXG4gICAgY2FjaGVPbmx5KHJlcXVlc3QsIG9wdGlvbnMpXG4gICAgICAudGhlbihtYXliZVJlc29sdmUsIG1heWJlUmVqZWN0KTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZmFzdGVzdDtcbiIsIi8qXG5cdENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cblx0TGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcblx0eW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuXHRZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuXHQgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cblx0VW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuXHRkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG5cdFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuXHRTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG5cdGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuICBuZXR3b3JrT25seTogcmVxdWlyZSgnLi9uZXR3b3JrT25seScpLFxuICBuZXR3b3JrRmlyc3Q6IHJlcXVpcmUoJy4vbmV0d29ya0ZpcnN0JyksXG4gIGNhY2hlT25seTogcmVxdWlyZSgnLi9jYWNoZU9ubHknKSxcbiAgY2FjaGVGaXJzdDogcmVxdWlyZSgnLi9jYWNoZUZpcnN0JyksXG4gIGZhc3Rlc3Q6IHJlcXVpcmUoJy4vZmFzdGVzdCcpXHRcbn07IiwiLypcbiAgQ29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xudmFyIGdsb2JhbE9wdGlvbnMgPSByZXF1aXJlKCcuLi9vcHRpb25zJyk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMnKTtcblxuZnVuY3Rpb24gbmV0d29ya0ZpcnN0KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIHN1Y2Nlc3NSZXNwb25zZXMgPSBvcHRpb25zLnN1Y2Nlc3NSZXNwb25zZXMgfHwgZ2xvYmFsT3B0aW9ucy5zdWNjZXNzUmVzcG9uc2VzO1xuICBoZWxwZXJzLmRlYnVnKCdTdHJhdGVneTogbmV0d29yayBmaXJzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcbiAgcmV0dXJuIGhlbHBlcnMub3BlbkNhY2hlKG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICByZXR1cm4gaGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QsIG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGlmIChzdWNjZXNzUmVzcG9uc2VzLnRlc3QocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKGNhY2hlUmVzcG9uc2UpIHtcbiAgICAgICAgaGVscGVycy5kZWJ1ZygnUmVzcG9uc2Ugd2FzIGFuIEhUVFAgZXJyb3InLCBvcHRpb25zKTtcbiAgICAgICAgaWYgKGNhY2hlUmVzcG9uc2UpIHtcbiAgICAgICAgICBoZWxwZXJzLmRlYnVnKCdSZXNvbHZpbmcgd2l0aCBjYWNoZWQgcmVzcG9uc2UgaW5zdGVhZCcsIG9wdGlvbnMpO1xuICAgICAgICAgIHJldHVybiBjYWNoZVJlc3BvbnNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIElmIHdlIGRpZG4ndCBoYXZlIGFueXRoaW5nIGluIHRoZSBjYWNoZSwgaXQncyBiZXR0ZXIgdG8gcmV0dXJuIHRoZVxuICAgICAgICAgIC8vIGVycm9yIHBhZ2UgdGhhbiB0byByZXR1cm4gbm90aGluZ1xuICAgICAgICAgIGhlbHBlcnMuZGVidWcoJ05vIGNhY2hlZCByZXN1bHQsIHJlc29sdmluZyB3aXRoIEhUVFAgZXJyb3IgcmVzcG9uc2UgZnJvbSBuZXR3b3JrJywgb3B0aW9ucyk7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuICAgICAgaGVscGVycy5kZWJ1ZygnTmV0d29yayBlcnJvciwgZmFsbGJhY2sgdG8gY2FjaGUgWycgKyByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gICAgICByZXR1cm4gY2FjaGUubWF0Y2gocmVxdWVzdCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG5ldHdvcmtGaXJzdDsiLCIvKlxuXHRDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG5cdExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG5cdHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cblx0WW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cblx0ICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5cdFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcblx0ZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuXHRXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblx0U2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuXHRsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMnKTtcblxuZnVuY3Rpb24gbmV0d29ya09ubHkocmVxdWVzdCwgdmFsdWVzLCBvcHRpb25zKSB7XG4gIGhlbHBlcnMuZGVidWcoJ1N0cmF0ZWd5OiBuZXR3b3JrIG9ubHkgWycgKyByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gIHJldHVybiBmZXRjaChyZXF1ZXN0KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBuZXR3b3JrT25seTsiLCIvLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNi4zXG4oZnVuY3Rpb24oKSB7XG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24obWFuaWZlc3QpIHtcbiAgICB2YXIgY3VycmVudFNlY3Rpb24sIGVudHJpZXMsIGZpcnN0TGluZSwgbGluZSwgbGluZXMsIG1vZGUsIHRva2VucywgX2ksIF9sZW47XG4gICAgbGluZXMgPSBtYW5pZmVzdC5zcGxpdCgvXFxyXFxufFxccnxcXG4vKTtcbiAgICBmaXJzdExpbmUgPSBsaW5lcy5zaGlmdCgpO1xuICAgIGlmIChmaXJzdExpbmUuaW5kZXhPZignQ0FDSEUgTUFOSUZFU1QnKSAhPT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBjYWNoZSBtYW5pZmVzdCBoZWFkZXI6IFwiICsgZmlyc3RMaW5lKTtcbiAgICB9XG4gICAgaWYgKGZpcnN0TGluZS5sZW5ndGggPiAnQ0FDSEUgTUFOSUZFU1QnLmxlbmd0aCAmJiBmaXJzdExpbmVbMTRdICE9PSAnICcgJiYgZmlyc3RMaW5lWzE0XSAhPT0gJ1xcdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgY2FjaGUgbWFuaWZlc3QgaGVhZGVyOiBcIiArIGZpcnN0TGluZSk7XG4gICAgfVxuICAgIGN1cnJlbnRTZWN0aW9uID0gJ0NBQ0hFJztcbiAgICBlbnRyaWVzID0ge1xuICAgICAgY2FjaGU6IFtdLFxuICAgICAgbmV0d29yazogW10sXG4gICAgICBmYWxsYmFjazoge30sXG4gICAgICBzZXR0aW5nczogW10sXG4gICAgICB0b2tlbnM6IFtdXG4gICAgfTtcbiAgICBtb2RlID0gJ0NBQ0hFJztcbiAgICBlbnRyaWVzLnRva2VucyA9IFtcbiAgICAgIHtcbiAgICAgICAgdHlwZTogJ21hZ2ljIHNpZ25hdHVyZScsXG4gICAgICAgIHZhbHVlOiAnQ0FDSEUgTUFOSUZFU1QnXG4gICAgICB9XG4gICAgXTtcbiAgICBmb3IgKF9pID0gMCwgX2xlbiA9IGxpbmVzLmxlbmd0aDsgX2kgPCBfbGVuOyBfaSsrKSB7XG4gICAgICBsaW5lID0gbGluZXNbX2ldO1xuICAgICAgbGluZSA9IGxpbmUudHJpbSgpO1xuICAgICAgaWYgKCFsaW5lLmxlbmd0aCkge1xuICAgICAgICBlbnRyaWVzLnRva2Vucy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnbmV3bGluZSdcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKGxpbmUuaW5kZXhPZignIycpID09PSAwKSB7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdjb21tZW50JyxcbiAgICAgICAgICB2YWx1ZTogbGluZS5zdWJzdHJpbmcoMSlcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKFsnQ0FDSEU6JywgJ0ZBTExCQUNLOicsICdORVRXT1JLOicsICdTRVRUSU5HUzonXS5pbmRleE9mKGxpbmUpID49IDApIHtcbiAgICAgICAgbW9kZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGxpbmUubGVuZ3RoIC0gMSk7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdtb2RlJyxcbiAgICAgICAgICB2YWx1ZTogbW9kZVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAobGluZS5pbmRleE9mKCc6JykgPT09IChsaW5lLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIG1vZGUgPSAndW5rbm93bic7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdtb2RlJyxcbiAgICAgICAgICB2YWx1ZTogbW9kZSxcbiAgICAgICAgICByYXc6IGxpbmVcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b2tlbnMgPSBsaW5lLnNwbGl0KC9bIF0rLyk7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdkYXRhJyxcbiAgICAgICAgICB0b2tlbnM6IHRva2Vuc1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdGQUxMQkFDSycpIHtcbiAgICAgICAgICBlbnRyaWVzLmZhbGxiYWNrW3Rva2Vuc1swXV0gPSB0b2tlbnNbMV07XG4gICAgICAgIH0gZWxzZSBpZiAobW9kZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgZW50cmllc1ttb2RlLnRvTG93ZXJDYXNlKCldLnB1c2gobGluZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGVudHJpZXM7XG4gIH07XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wYXJzZS1hcHBjYWNoZS1tYW5pZmVzdC5tYXBcbiovXG4iLCJ2YXIgaXNhcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKVxuXG4vKipcbiAqIEV4cG9zZSBgcGF0aFRvUmVnZXhwYC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBwYXRoVG9SZWdleHBcbm1vZHVsZS5leHBvcnRzLnBhcnNlID0gcGFyc2Vcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGUgPSBjb21waWxlXG5tb2R1bGUuZXhwb3J0cy50b2tlbnNUb0Z1bmN0aW9uID0gdG9rZW5zVG9GdW5jdGlvblxubW9kdWxlLmV4cG9ydHMudG9rZW5zVG9SZWdFeHAgPSB0b2tlbnNUb1JlZ0V4cFxuXG4vKipcbiAqIFRoZSBtYWluIHBhdGggbWF0Y2hpbmcgcmVnZXhwIHV0aWxpdHkuXG4gKlxuICogQHR5cGUge1JlZ0V4cH1cbiAqL1xudmFyIFBBVEhfUkVHRVhQID0gbmV3IFJlZ0V4cChbXG4gIC8vIE1hdGNoIGVzY2FwZWQgY2hhcmFjdGVycyB0aGF0IHdvdWxkIG90aGVyd2lzZSBhcHBlYXIgaW4gZnV0dXJlIG1hdGNoZXMuXG4gIC8vIFRoaXMgYWxsb3dzIHRoZSB1c2VyIHRvIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCB3b24ndCB0cmFuc2Zvcm0uXG4gICcoXFxcXFxcXFwuKScsXG4gIC8vIE1hdGNoIEV4cHJlc3Mtc3R5bGUgcGFyYW1ldGVycyBhbmQgdW4tbmFtZWQgcGFyYW1ldGVycyB3aXRoIGEgcHJlZml4XG4gIC8vIGFuZCBvcHRpb25hbCBzdWZmaXhlcy4gTWF0Y2hlcyBhcHBlYXIgYXM6XG4gIC8vXG4gIC8vIFwiLzp0ZXN0KFxcXFxkKyk/XCIgPT4gW1wiL1wiLCBcInRlc3RcIiwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgXCI/XCIsIHVuZGVmaW5lZF1cbiAgLy8gXCIvcm91dGUoXFxcXGQrKVwiICA9PiBbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXVxuICAvLyBcIi8qXCIgICAgICAgICAgICA9PiBbXCIvXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCIqXCJdXG4gICcoW1xcXFwvLl0pPyg/Oig/OlxcXFw6KFxcXFx3KykoPzpcXFxcKCgoPzpcXFxcXFxcXC58W14oKV0pKylcXFxcKSk/fFxcXFwoKCg/OlxcXFxcXFxcLnxbXigpXSkrKVxcXFwpKShbKyo/XSk/fChcXFxcKikpJ1xuXS5qb2luKCd8JyksICdnJylcblxuLyoqXG4gKiBQYXJzZSBhIHN0cmluZyBmb3IgdGhlIHJhdyB0b2tlbnMuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5mdW5jdGlvbiBwYXJzZSAoc3RyKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICB2YXIga2V5ID0gMFxuICB2YXIgaW5kZXggPSAwXG4gIHZhciBwYXRoID0gJydcbiAgdmFyIHJlc1xuXG4gIHdoaWxlICgocmVzID0gUEFUSF9SRUdFWFAuZXhlYyhzdHIpKSAhPSBudWxsKSB7XG4gICAgdmFyIG0gPSByZXNbMF1cbiAgICB2YXIgZXNjYXBlZCA9IHJlc1sxXVxuICAgIHZhciBvZmZzZXQgPSByZXMuaW5kZXhcbiAgICBwYXRoICs9IHN0ci5zbGljZShpbmRleCwgb2Zmc2V0KVxuICAgIGluZGV4ID0gb2Zmc2V0ICsgbS5sZW5ndGhcblxuICAgIC8vIElnbm9yZSBhbHJlYWR5IGVzY2FwZWQgc2VxdWVuY2VzLlxuICAgIGlmIChlc2NhcGVkKSB7XG4gICAgICBwYXRoICs9IGVzY2FwZWRbMV1cbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgLy8gUHVzaCB0aGUgY3VycmVudCBwYXRoIG9udG8gdGhlIHRva2Vucy5cbiAgICBpZiAocGF0aCkge1xuICAgICAgdG9rZW5zLnB1c2gocGF0aClcbiAgICAgIHBhdGggPSAnJ1xuICAgIH1cblxuICAgIHZhciBwcmVmaXggPSByZXNbMl1cbiAgICB2YXIgbmFtZSA9IHJlc1szXVxuICAgIHZhciBjYXB0dXJlID0gcmVzWzRdXG4gICAgdmFyIGdyb3VwID0gcmVzWzVdXG4gICAgdmFyIHN1ZmZpeCA9IHJlc1s2XVxuICAgIHZhciBhc3RlcmlzayA9IHJlc1s3XVxuXG4gICAgdmFyIHJlcGVhdCA9IHN1ZmZpeCA9PT0gJysnIHx8IHN1ZmZpeCA9PT0gJyonXG4gICAgdmFyIG9wdGlvbmFsID0gc3VmZml4ID09PSAnPycgfHwgc3VmZml4ID09PSAnKidcbiAgICB2YXIgZGVsaW1pdGVyID0gcHJlZml4IHx8ICcvJ1xuICAgIHZhciBwYXR0ZXJuID0gY2FwdHVyZSB8fCBncm91cCB8fCAoYXN0ZXJpc2sgPyAnLionIDogJ1teJyArIGRlbGltaXRlciArICddKz8nKVxuXG4gICAgdG9rZW5zLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSB8fCBrZXkrKyxcbiAgICAgIHByZWZpeDogcHJlZml4IHx8ICcnLFxuICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICBvcHRpb25hbDogb3B0aW9uYWwsXG4gICAgICByZXBlYXQ6IHJlcGVhdCxcbiAgICAgIHBhdHRlcm46IGVzY2FwZUdyb3VwKHBhdHRlcm4pXG4gICAgfSlcbiAgfVxuXG4gIC8vIE1hdGNoIGFueSBjaGFyYWN0ZXJzIHN0aWxsIHJlbWFpbmluZy5cbiAgaWYgKGluZGV4IDwgc3RyLmxlbmd0aCkge1xuICAgIHBhdGggKz0gc3RyLnN1YnN0cihpbmRleClcbiAgfVxuXG4gIC8vIElmIHRoZSBwYXRoIGV4aXN0cywgcHVzaCBpdCBvbnRvIHRoZSBlbmQuXG4gIGlmIChwYXRoKSB7XG4gICAgdG9rZW5zLnB1c2gocGF0aClcbiAgfVxuXG4gIHJldHVybiB0b2tlbnNcbn1cblxuLyoqXG4gKiBDb21waWxlIGEgc3RyaW5nIHRvIGEgdGVtcGxhdGUgZnVuY3Rpb24gZm9yIHRoZSBwYXRoLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gICBzdHJcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICovXG5mdW5jdGlvbiBjb21waWxlIChzdHIpIHtcbiAgcmV0dXJuIHRva2Vuc1RvRnVuY3Rpb24ocGFyc2Uoc3RyKSlcbn1cblxuLyoqXG4gKiBFeHBvc2UgYSBtZXRob2QgZm9yIHRyYW5zZm9ybWluZyB0b2tlbnMgaW50byB0aGUgcGF0aCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gdG9rZW5zVG9GdW5jdGlvbiAodG9rZW5zKSB7XG4gIC8vIENvbXBpbGUgYWxsIHRoZSB0b2tlbnMgaW50byByZWdleHBzLlxuICB2YXIgbWF0Y2hlcyA9IG5ldyBBcnJheSh0b2tlbnMubGVuZ3RoKVxuXG4gIC8vIENvbXBpbGUgYWxsIHRoZSBwYXR0ZXJucyBiZWZvcmUgY29tcGlsYXRpb24uXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gPT09ICdvYmplY3QnKSB7XG4gICAgICBtYXRjaGVzW2ldID0gbmV3IFJlZ0V4cCgnXicgKyB0b2tlbnNbaV0ucGF0dGVybiArICckJylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBwYXRoID0gJydcbiAgICB2YXIgZGF0YSA9IG9iaiB8fCB7fVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgICBwYXRoICs9IHRva2VuXG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgdmFyIHZhbHVlID0gZGF0YVt0b2tlbi5uYW1lXVxuICAgICAgdmFyIHNlZ21lbnRcblxuICAgICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIGJlIGRlZmluZWQnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc2FycmF5KHZhbHVlKSkge1xuICAgICAgICBpZiAoIXRva2VuLnJlcGVhdCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IHJlcGVhdCwgYnV0IHJlY2VpdmVkIFwiJyArIHZhbHVlICsgJ1wiJylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBpZiAodG9rZW4ub3B0aW9uYWwpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IGJlIGVtcHR5JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHZhbHVlLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgc2VnbWVudCA9IGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZVtqXSlcblxuICAgICAgICAgIGlmICghbWF0Y2hlc1tpXS50ZXN0KHNlZ21lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbGwgXCInICsgdG9rZW4ubmFtZSArICdcIiB0byBtYXRjaCBcIicgKyB0b2tlbi5wYXR0ZXJuICsgJ1wiLCBidXQgcmVjZWl2ZWQgXCInICsgc2VnbWVudCArICdcIicpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGF0aCArPSAoaiA9PT0gMCA/IHRva2VuLnByZWZpeCA6IHRva2VuLmRlbGltaXRlcikgKyBzZWdtZW50XG4gICAgICAgIH1cblxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBzZWdtZW50ID0gZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKVxuXG4gICAgICBpZiAoIW1hdGNoZXNbaV0udGVzdChzZWdtZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIG1hdGNoIFwiJyArIHRva2VuLnBhdHRlcm4gKyAnXCIsIGJ1dCByZWNlaXZlZCBcIicgKyBzZWdtZW50ICsgJ1wiJylcbiAgICAgIH1cblxuICAgICAgcGF0aCArPSB0b2tlbi5wcmVmaXggKyBzZWdtZW50XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGhcbiAgfVxufVxuXG4vKipcbiAqIEVzY2FwZSBhIHJlZ3VsYXIgZXhwcmVzc2lvbiBzdHJpbmcuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZXNjYXBlU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oWy4rKj89XiE6JHt9KClbXFxdfFxcL10pL2csICdcXFxcJDEnKVxufVxuXG4vKipcbiAqIEVzY2FwZSB0aGUgY2FwdHVyaW5nIGdyb3VwIGJ5IGVzY2FwaW5nIHNwZWNpYWwgY2hhcmFjdGVycyBhbmQgbWVhbmluZy5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGdyb3VwXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGVzY2FwZUdyb3VwIChncm91cCkge1xuICByZXR1cm4gZ3JvdXAucmVwbGFjZSgvKFs9ITokXFwvKCldKS9nLCAnXFxcXCQxJylcbn1cblxuLyoqXG4gKiBBdHRhY2ggdGhlIGtleXMgYXMgYSBwcm9wZXJ0eSBvZiB0aGUgcmVnZXhwLlxuICpcbiAqIEBwYXJhbSAge1JlZ0V4cH0gcmVcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiBhdHRhY2hLZXlzIChyZSwga2V5cykge1xuICByZS5rZXlzID0ga2V5c1xuICByZXR1cm4gcmVcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGZsYWdzIGZvciBhIHJlZ2V4cCBmcm9tIHRoZSBvcHRpb25zLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBmbGFncyAob3B0aW9ucykge1xuICByZXR1cm4gb3B0aW9ucy5zZW5zaXRpdmUgPyAnJyA6ICdpJ1xufVxuXG4vKipcbiAqIFB1bGwgb3V0IGtleXMgZnJvbSBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtSZWdFeHB9IHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiByZWdleHBUb1JlZ2V4cCAocGF0aCwga2V5cykge1xuICAvLyBVc2UgYSBuZWdhdGl2ZSBsb29rYWhlYWQgdG8gbWF0Y2ggb25seSBjYXB0dXJpbmcgZ3JvdXBzLlxuICB2YXIgZ3JvdXBzID0gcGF0aC5zb3VyY2UubWF0Y2goL1xcKCg/IVxcPykvZylcblxuICBpZiAoZ3JvdXBzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBncm91cHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGksXG4gICAgICAgIHByZWZpeDogbnVsbCxcbiAgICAgICAgZGVsaW1pdGVyOiBudWxsLFxuICAgICAgICBvcHRpb25hbDogZmFsc2UsXG4gICAgICAgIHJlcGVhdDogZmFsc2UsXG4gICAgICAgIHBhdHRlcm46IG51bGxcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocGF0aCwga2V5cylcbn1cblxuLyoqXG4gKiBUcmFuc2Zvcm0gYW4gYXJyYXkgaW50byBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIGFycmF5VG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHBhcnRzID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJ0cy5wdXNoKHBhdGhUb1JlZ2V4cChwYXRoW2ldLCBrZXlzLCBvcHRpb25zKS5zb3VyY2UpXG4gIH1cblxuICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cCgnKD86JyArIHBhcnRzLmpvaW4oJ3wnKSArICcpJywgZmxhZ3Mob3B0aW9ucykpXG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocmVnZXhwLCBrZXlzKVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHBhdGggcmVnZXhwIGZyb20gc3RyaW5nIGlucHV0LlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICBrZXlzXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gc3RyaW5nVG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHRva2VucyA9IHBhcnNlKHBhdGgpXG4gIHZhciByZSA9IHRva2Vuc1RvUmVnRXhwKHRva2Vucywgb3B0aW9ucylcblxuICAvLyBBdHRhY2gga2V5cyBiYWNrIHRvIHRoZSByZWdleHAuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gIT09ICdzdHJpbmcnKSB7XG4gICAgICBrZXlzLnB1c2godG9rZW5zW2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdHRhY2hLZXlzKHJlLCBrZXlzKVxufVxuXG4vKipcbiAqIEV4cG9zZSBhIGZ1bmN0aW9uIGZvciB0YWtpbmcgdG9rZW5zIGFuZCByZXR1cm5pbmcgYSBSZWdFeHAuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICB0b2tlbnNcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHRva2Vuc1RvUmVnRXhwICh0b2tlbnMsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cblxuICB2YXIgc3RyaWN0ID0gb3B0aW9ucy5zdHJpY3RcbiAgdmFyIGVuZCA9IG9wdGlvbnMuZW5kICE9PSBmYWxzZVxuICB2YXIgcm91dGUgPSAnJ1xuICB2YXIgbGFzdFRva2VuID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXVxuICB2YXIgZW5kc1dpdGhTbGFzaCA9IHR5cGVvZiBsYXN0VG9rZW4gPT09ICdzdHJpbmcnICYmIC9cXC8kLy50ZXN0KGxhc3RUb2tlbilcblxuICAvLyBJdGVyYXRlIG92ZXIgdGhlIHRva2VucyBhbmQgY3JlYXRlIG91ciByZWdleHAgc3RyaW5nLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJvdXRlICs9IGVzY2FwZVN0cmluZyh0b2tlbilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHByZWZpeCA9IGVzY2FwZVN0cmluZyh0b2tlbi5wcmVmaXgpXG4gICAgICB2YXIgY2FwdHVyZSA9IHRva2VuLnBhdHRlcm5cblxuICAgICAgaWYgKHRva2VuLnJlcGVhdCkge1xuICAgICAgICBjYXB0dXJlICs9ICcoPzonICsgcHJlZml4ICsgY2FwdHVyZSArICcpKidcbiAgICAgIH1cblxuICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgICBjYXB0dXJlID0gJyg/OicgKyBwcmVmaXggKyAnKCcgKyBjYXB0dXJlICsgJykpPydcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYXB0dXJlID0gJygnICsgY2FwdHVyZSArICcpPydcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FwdHVyZSA9IHByZWZpeCArICcoJyArIGNhcHR1cmUgKyAnKSdcbiAgICAgIH1cblxuICAgICAgcm91dGUgKz0gY2FwdHVyZVxuICAgIH1cbiAgfVxuXG4gIC8vIEluIG5vbi1zdHJpY3QgbW9kZSB3ZSBhbGxvdyBhIHNsYXNoIGF0IHRoZSBlbmQgb2YgbWF0Y2guIElmIHRoZSBwYXRoIHRvXG4gIC8vIG1hdGNoIGFscmVhZHkgZW5kcyB3aXRoIGEgc2xhc2gsIHdlIHJlbW92ZSBpdCBmb3IgY29uc2lzdGVuY3kuIFRoZSBzbGFzaFxuICAvLyBpcyB2YWxpZCBhdCB0aGUgZW5kIG9mIGEgcGF0aCBtYXRjaCwgbm90IGluIHRoZSBtaWRkbGUuIFRoaXMgaXMgaW1wb3J0YW50XG4gIC8vIGluIG5vbi1lbmRpbmcgbW9kZSwgd2hlcmUgXCIvdGVzdC9cIiBzaG91bGRuJ3QgbWF0Y2ggXCIvdGVzdC8vcm91dGVcIi5cbiAgaWYgKCFzdHJpY3QpIHtcbiAgICByb3V0ZSA9IChlbmRzV2l0aFNsYXNoID8gcm91dGUuc2xpY2UoMCwgLTIpIDogcm91dGUpICsgJyg/OlxcXFwvKD89JCkpPydcbiAgfVxuXG4gIGlmIChlbmQpIHtcbiAgICByb3V0ZSArPSAnJCdcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiBub24tZW5kaW5nIG1vZGUsIHdlIG5lZWQgdGhlIGNhcHR1cmluZyBncm91cHMgdG8gbWF0Y2ggYXMgbXVjaCBhc1xuICAgIC8vIHBvc3NpYmxlIGJ5IHVzaW5nIGEgcG9zaXRpdmUgbG9va2FoZWFkIHRvIHRoZSBlbmQgb3IgbmV4dCBwYXRoIHNlZ21lbnQuXG4gICAgcm91dGUgKz0gc3RyaWN0ICYmIGVuZHNXaXRoU2xhc2ggPyAnJyA6ICcoPz1cXFxcL3wkKSdcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJvdXRlLCBmbGFncyhvcHRpb25zKSlcbn1cblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLCByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgY2FuIGJlIHBhc3NlZCBpbiBmb3IgdGhlIGtleXMsIHdoaWNoIHdpbGwgaG9sZCB0aGVcbiAqIHBsYWNlaG9sZGVyIGtleSBkZXNjcmlwdGlvbnMuIEZvciBleGFtcGxlLCB1c2luZyBgL3VzZXIvOmlkYCwgYGtleXNgIHdpbGxcbiAqIGNvbnRhaW4gYFt7IG5hbWU6ICdpZCcsIGRlbGltaXRlcjogJy8nLCBvcHRpb25hbDogZmFsc2UsIHJlcGVhdDogZmFsc2UgfV1gLlxuICpcbiAqIEBwYXJhbSAgeyhTdHJpbmd8UmVnRXhwfEFycmF5KX0gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICAgICAgICAgICAgICAgICBba2V5c11cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgICAgICAgICAgW29wdGlvbnNdXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHBhdGhUb1JlZ2V4cCAocGF0aCwga2V5cywgb3B0aW9ucykge1xuICBrZXlzID0ga2V5cyB8fCBbXVxuXG4gIGlmICghaXNhcnJheShrZXlzKSkge1xuICAgIG9wdGlvbnMgPSBrZXlzXG4gICAga2V5cyA9IFtdXG4gIH0gZWxzZSBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge31cbiAgfVxuXG4gIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgcmV0dXJuIHJlZ2V4cFRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICBpZiAoaXNhcnJheShwYXRoKSkge1xuICAgIHJldHVybiBhcnJheVRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICByZXR1cm4gc3RyaW5nVG9SZWdleHAocGF0aCwga2V5cywgb3B0aW9ucylcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKlxuICovXG5cbmlmICghQ2FjaGUucHJvdG90eXBlLmFkZEFsbCkge1xuICBDYWNoZS5wcm90b3R5cGUuYWRkQWxsID0gZnVuY3Rpb24gYWRkQWxsKHJlcXVlc3RzKSB7XG4gICAgdmFyIGNhY2hlID0gdGhpcztcblxuICAgIC8vIFNpbmNlIERPTUV4Y2VwdGlvbnMgYXJlIG5vdCBjb25zdHJ1Y3RhYmxlOlxuICAgIGZ1bmN0aW9uIE5ldHdvcmtFcnJvcihtZXNzYWdlKSB7XG4gICAgICB0aGlzLm5hbWUgPSAnTmV0d29ya0Vycm9yJztcbiAgICAgIHRoaXMuY29kZSA9IDE5O1xuICAgICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB9XG4gICAgTmV0d29ya0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlKTtcblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAxKSB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHNlcXVlbmNlPChSZXF1ZXN0IG9yIFVTVlN0cmluZyk+IGJpbmRpbmc6XG4gICAgICB2YXIgc2VxdWVuY2UgPSBbXTtcblxuICAgICAgcmVxdWVzdHMgPSByZXF1ZXN0cy5tYXAoZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICBpZiAocmVxdWVzdCBpbnN0YW5jZW9mIFJlcXVlc3QpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gU3RyaW5nKHJlcXVlc3QpOyAvLyBtYXkgdGhyb3cgVHlwZUVycm9yXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHJlcXVlc3RzLm1hcChmdW5jdGlvbihyZXF1ZXN0KSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmVxdWVzdCA9IG5ldyBSZXF1ZXN0KHJlcXVlc3QpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBzY2hlbWUgPSBuZXcgVVJMKHJlcXVlc3QudXJsKS5wcm90b2NvbDtcblxuICAgICAgICAgIGlmIChzY2hlbWUgIT09ICdodHRwOicgJiYgc2NoZW1lICE9PSAnaHR0cHM6Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IE5ldHdvcmtFcnJvcihcIkludmFsaWQgc2NoZW1lXCIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0LmNsb25lKCkpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlcykge1xuICAgICAgLy8gVE9ETzogY2hlY2sgdGhhdCByZXF1ZXN0cyBkb24ndCBvdmVyd3JpdGUgb25lIGFub3RoZXJcbiAgICAgIC8vIChkb24ndCB0aGluayB0aGlzIGlzIHBvc3NpYmxlIHRvIHBvbHlmaWxsIGR1ZSB0byBvcGFxdWUgcmVzcG9uc2VzKVxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICByZXNwb25zZXMubWFwKGZ1bmN0aW9uKHJlc3BvbnNlLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlLnB1dChyZXF1ZXN0c1tpXSwgcmVzcG9uc2UpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9KTtcbiAgfTtcbn1cbiJdfQ==
