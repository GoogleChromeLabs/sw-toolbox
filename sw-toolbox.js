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

var parseManifest = require('parse-appcache-manifest');
require('serviceworker-cache-polyfill');
var options = require('./options');
var router = require('./router');
var helpers = require('./helpers');
var strategies = require('./strategies');

helpers.debug('Service Worker Toolbox is loading');

// Install

var flatten = function(items) {
  return items.reduce(function(a, b) {
    return a.concat(b);
  }, []);
};

self.addEventListener('install', function(event) {
  var inactiveCache = options.cache.name + '$$$inactive$$$';
  helpers.debug('install event fired');
  helpers.debug('creating cache [' + inactiveCache + ']');
  event.waitUntil(
    helpers.openCache({cache: {name: inactiveCache}}).then(function(cache) {
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
  var inactiveCache = options.cache.name + '$$$inactive$$$';
  event.waitUntil(helpers.renameCache(inactiveCache, options.cache.name));
});

// Fetch

self.addEventListener('fetch', function(event) {
  var handler = router.match(event.request);

  if (handler) {
    event.respondWith(handler(event.request));
  } else if (router.default && event.request.method === 'GET') {
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

function getPathAndOptions(url) {
  var absoluteUrl = new URL(url, location.href);
  return {
    pathname: absoluteUrl.pathname,
    options: {
      origin: absoluteUrl.origin,
      cache: {
        name: 'appcache-helper'
      }
    }
  }
}

function appCacheManifest(manifestUrl) {
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
        helpers.debug('Using network-only strategy by default, due to "*" in NETWORK.');
        router.default = strategies.networkOnly;
      } else {
        // If this isn't '*' then set up an explicit network-only handler for anything that matches
        // that URL prefix.
        helpers.debug('Using network-only strategy for ' + url);
        var pathAndOptions = getPathAndOptions(url);
        router.get(pathAndOptions.pathname + '(.*)', strategies.networkOnly, pathAndOptions.options);
      }
    });

    // CACHE section:
    // Cache all the items that are explicitly mentioned here.
    var urlsToCache = parsedManifest.cache;

    if (router.default) {
      // If the default strategy is already set, then we need to explicitly establish
      // cache-first strategies for all the URLs in the CACHE section.
      parsedManifest.cache.forEach(function(url) {
        helpers.debug('Using cache-only strategy for ' + url);
        var pathAndOptions = getPathAndOptions(url);
        router.get(pathAndOptions.pathname, strategies.cacheOnly, pathAndOptions.options);
      });
    } else {
      // Use cache-first as the default strategy if it's not already set to network-first due to '*'
      // being in the NETWORK section.
      helpers.deug('Using cache-only strategy by default.');
      router.default = function(request) {
        return strategies.cacheOnly(request, {}, {cache: {name: 'appcache-helper'}});
      }
    }

    // FALLBACK section:
    Object.keys(parsedManifest.fallback).forEach(function(originalUrl) {
      var originalUrlPathAndOptions = getPathAndOptions(originalUrl);
      var absoluteFallbackUrlString = new URL(parsedManifest.fallback[originalUrl],
        location.href).toString();

      // We need to cache anything that's being used as a fallback.
      urlsToCache.push(absoluteFallbackUrlString);

      helpers.debug('Using ' + absoluteFallbackUrlString + ' as a fallback for ' + originalUrl);
      router.get(originalUrlPathAndOptions.pathname, function(request, values, options) {
        return fetch(request).then(function(response) {
          if (response.ok) {
            return response;
          }
          throw new Error('Error while fetching ' + request.url + '(' + response.statusText + ')');
        }).catch(function(error) {
          helpers.debug('Falling back to cached entry for ' + absoluteFallbackUrlString);
          return strategies.cacheOnly(absoluteFallbackUrlString, {}, options);
        });
      }, originalUrlPathAndOptions.options);
    });

    return urlsToCache;
  }).then(function(urlsToCache) {
    helpers.debug('URLs to cache: ' + JSON.stringify(urlsToCache));
    return Promise.all(urlsToCache.map(function(url) {
      return cache(url, {cache: {name: 'appcache-helper'}});
    }));
  }).catch(function(error) {
    helpers.debug('Failed to use AppCache Manifest: ' + error);
  });
}

module.exports = {
  appCacheManifest: appCacheManifest,
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

},{"./helpers":2,"./options":4,"./router":6,"./strategies":10,"parse-appcache-manifest":13,"serviceworker-cache-polyfill":16}],2:[function(require,module,exports){
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
var router = require('./router');
var idbCacheExpiration = require('./idb-cache-expiration');

function debug(message, options) {
  options = options || {};
  var flag = options.debug || globalOptions.debug;
  if (flag) {
    console.log('[sw-toolbox] ' + message);
  }
}

function openCache(options) {
  var cacheName;
  if (options && options.cache) {
    cacheName = options.cache.name;
  }
  cacheName = cacheName || globalOptions.cache.name;

  debug('Opening cache "' + cacheName + '"', options);
  return caches.open(cacheName);
}

function fetchAndCache(request, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;

  return fetch(request.clone()).then(function(response) {
    // Only cache GET requests with successful responses.
    // Since this is not part of the promise chain, it will be done asynchronously and will not
    // block the response from being returned to the page.
    if (request.method === 'GET' && successResponses.test(response.status)) {
      openCache(options).then(function(cache) {
        cache.put(request, response).then(function() {
          var maxCacheEntries;
          var maxCacheAgeSeconds;
          var cacheName;

          if (options.cache) {
            // If someone explicitly sets options.cache, then read all three settings from there.
            // Don't fall back on globalOptions.
            maxCacheEntries = options.cache.maxEntries;
            maxCacheAgeSeconds = options.cache.maxAgeSeconds;
            cacheName = options.cache.name;
          } else {
            maxCacheEntries = globalOptions.cache.maxEntries;
            maxCacheAgeSeconds = globalOptions.cache.maxAgeSeconds;
            cacheName = globalOptions.cache.name;
          }

          // Only run the cache expiration logic if at least one of the maximums is set, and if
          // we have a name for the cache that the options are being applied to.
          if ((maxCacheEntries || maxCacheAgeSeconds) && cacheName) {
            queueCacheExpiration(request, cache, cacheName, maxCacheEntries, maxCacheAgeSeconds);
          }
        });
      });
    }

    return response.clone();
  });
}

var cacheExpirationPromiseChain;
function queueCacheExpiration(request, cache, cacheName, maxCacheEntries, maxCacheAgeSeconds) {
  var cacheExpiration = cacheExpirationPromiseFactory.bind(null, request, cache, cacheName, maxCacheEntries,
    maxCacheAgeSeconds);

  if (cacheExpirationPromiseChain) {
    cacheExpirationPromiseChain = cacheExpirationPromiseChain.then(cacheExpiration);
  } else {
    cacheExpirationPromiseChain = cacheExpiration();
  }
}

function cacheExpirationPromiseFactory(request, cache, cacheName, maxCacheEntries, maxCacheAgeSeconds) {
  var requestUrl = request.url;

  var now = Date.now();
  debug('Updating LRU order for ' + requestUrl + '. Max entries is ' + maxCacheEntries +
    ', max age is ' + maxCacheAgeSeconds);

  return idbCacheExpiration.getDb(cacheName).then(function(db) {
    return idbCacheExpiration.setTimestampForUrl(db, requestUrl, now);
  }).then(function(db) {
    return idbCacheExpiration.expireEntries(db, maxCacheEntries, maxCacheAgeSeconds, now);
  }).then(function(urlsToDelete) {
    debug('Successfully updated IDB.');

    var deletionPromises = urlsToDelete.map(function(urlToDelete) {
      return cache.delete(urlToDelete);
    });

    return Promise.all(deletionPromises).then(function() {
      debug('Done with cache cleanup.');
    });
  }).catch(function(error) {
    debug(error);
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

},{"./idb-cache-expiration":3,"./options":4,"./router":6}],3:[function(require,module,exports){
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

var DB_PREFIX = 'sw-toolbox-';
var DB_VERSION = 1;
var STORE_NAME = 'store';
var URL_PROPERTY = 'url';
var TIMESTAMP_PROPERTY = 'timestamp';
var cacheNameToDbPromise = {};

function openDb(cacheName) {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_PREFIX + cacheName, DB_VERSION);

    request.onupgradeneeded = function() {
      var objectStore = request.result.createObjectStore(STORE_NAME, {keyPath: URL_PROPERTY});
      objectStore.createIndex(TIMESTAMP_PROPERTY, TIMESTAMP_PROPERTY, {unique: false});
    };

    request.onsuccess = function() {
      resolve(request.result);
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}

function getDb(cacheName) {
  if (!(cacheName in cacheNameToDbPromise)) {
    cacheNameToDbPromise[cacheName] = openDb(cacheName);
  }

  return cacheNameToDbPromise[cacheName];
}

function setTimestampForUrl(db, url, now) {
  return new Promise(function(resolve, reject) {
    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    objectStore.put({url: url, timestamp: now});

    transaction.oncomplete = function() {
      resolve(db);
    };

    transaction.onabort = function() {
      reject(transaction.error);
    };
  });
}

function expireOldEntries(db, maxAgeSeconds, now) {
  // Bail out early by resolving with an empty array if we're not using maxAgeSeconds.
  if (!maxAgeSeconds) {
    return Promise.resolve([]);
  }

  return new Promise(function(resolve, reject) {
    var maxAgeMillis = maxAgeSeconds * 1000;
    var urls = [];

    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    var index = objectStore.index(TIMESTAMP_PROPERTY);

    index.openCursor().onsuccess = function(cursorEvent) {
      var cursor = cursorEvent.target.result;
      if (cursor) {
        if (now - maxAgeMillis > cursor.value[TIMESTAMP_PROPERTY]) {
          var url = cursor.value[URL_PROPERTY];
          urls.push(url);
          objectStore.delete(url);
          cursor.continue();
        }
      }
    };

    transaction.oncomplete = function() {
      resolve(urls);
    };

    transaction.onabort = reject;
  });
}

function expireExtraEntries(db, maxEntries) {
  // Bail out early by resolving with an empty array if we're not using maxEntries.
  if (!maxEntries) {
    return Promise.resolve([]);
  }

  return new Promise(function(resolve, reject) {
    var urls = [];

    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    var index = objectStore.index(TIMESTAMP_PROPERTY);

    var countRequest = index.count();
    index.count().onsuccess = function() {
      var initialCount = countRequest.result;

      if (initialCount > maxEntries) {
        index.openCursor().onsuccess = function(cursorEvent) {
          var cursor = cursorEvent.target.result;
          if (cursor) {
            var url = cursor.value[URL_PROPERTY];
            urls.push(url);
            objectStore.delete(url);
            if (initialCount - urls.length > maxEntries) {
              cursor.continue();
            }
          }
        };
      }
    };

    transaction.oncomplete = function() {
      resolve(urls);
    };

    transaction.onabort = reject;
  });
}

function expireEntries(db, maxEntries, maxAgeSeconds, now) {
  return expireOldEntries(db, maxAgeSeconds, now).then(function(oldExpiredUrls) {
    return expireExtraEntries(db, maxEntries).then(function(extraExpiredUrls) {
      return oldExpiredUrls.concat(extraExpiredUrls);
    });
  });
}

module.exports = {
  getDb: getDb,
  setTimestampForUrl: setTimestampForUrl,
  expireEntries: expireEntries
};

},{}],4:[function(require,module,exports){
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

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration, but it was not implemented in Chrome 40.
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || new URL('./', self.location).href;
}

module.exports = {
  cache: {
    name: '$$$toolbox-cache$$$' + scope + '$$$',
    maxAgeSeconds: null,
    maxEntries: null
  },
  debug: false,
  networkTimeoutSeconds: null,
  preCacheItems: [],
  // A regular expression to apply to HTTP response codes. Codes that match
  // will be considered successes, while others will not, and will not be
  // cached.
  successResponses: /^0|([123]\d\d)|(40[14567])|410$/
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

// TODO: Use self.registration.scope instead of self.location
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
    return cache.match(request).then(function(response) {
      if (response) {
        return response;
      }

      return helpers.fetchAndCache(request, options);
    });
  });
}

module.exports = cacheFirst;

},{"../helpers":2}],8:[function(require,module,exports){
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

},{"../helpers":2}],9:[function(require,module,exports){
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

    cacheOnly(request, values, options)
      .then(maybeResolve, maybeReject);
  });
}

module.exports = fastest;

},{"../helpers":2,"./cacheOnly":8}],10:[function(require,module,exports){
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
var globalOptions = require('../options');
var helpers = require('../helpers');

function networkFirst(request, values, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;
  // This will bypass options.networkTimeout if it's set to a false-y value like 0, but that's the
  // sane thing to do anyway.
  var networkTimeoutSeconds = options.networkTimeoutSeconds || globalOptions.networkTimeoutSeconds;
  helpers.debug('Strategy: network first [' + request.url + ']', options);

  return helpers.openCache(options).then(function(cache) {
    var timeoutId;
    var promises = [];
    var originalResponse;

    if (networkTimeoutSeconds) {
      var cacheWhenTimedOutPromise = new Promise(function(resolve) {
        timeoutId = setTimeout(function() {
          cache.match(request).then(function(response) {
            if (response) {
              // Only resolve this promise if there's a valid response in the cache.
              // This ensures that we won't time out a network request unless there's a cached entry
              // to fallback on, which is arguably the preferable behavior.
              resolve(response);
            }
          });
        }, networkTimeoutSeconds * 1000);
      });
      promises.push(cacheWhenTimedOutPromise);
    }

    var networkPromise = helpers.fetchAndCache(request, options).then(function(response) {
      // We've got a response, so clear the network timeout if there is one.
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (successResponses.test(response.status)) {
        return response;
      }

      helpers.debug('Response was an HTTP error: ' + response.statusText, options);
      originalResponse = response;
      throw new Error('Bad response');
    }).catch(function() {
      helpers.debug('Network or response error, fallback to cache [' + request.url + ']', options);
      return cache.match(request).then(function(response) {
        return response || originalResponse;
      });
    });
    promises.push(networkPromise);

    return Promise.race(promises);
  });
}

module.exports = networkFirst;

},{"../helpers":2,"../options":4}],12:[function(require,module,exports){
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

},{"../helpers":2}],13:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc3ctdG9vbGJveC5qcyIsImxpYi9oZWxwZXJzLmpzIiwibGliL2lkYi1jYWNoZS1leHBpcmF0aW9uLmpzIiwibGliL29wdGlvbnMuanMiLCJsaWIvcm91dGUuanMiLCJsaWIvcm91dGVyLmpzIiwibGliL3N0cmF0ZWdpZXMvY2FjaGVGaXJzdC5qcyIsImxpYi9zdHJhdGVnaWVzL2NhY2hlT25seS5qcyIsImxpYi9zdHJhdGVnaWVzL2Zhc3Rlc3QuanMiLCJsaWIvc3RyYXRlZ2llcy9pbmRleC5qcyIsImxpYi9zdHJhdGVnaWVzL25ldHdvcmtGaXJzdC5qcyIsImxpYi9zdHJhdGVnaWVzL25ldHdvcmtPbmx5LmpzIiwibm9kZV9tb2R1bGVzL3BhcnNlLWFwcGNhY2hlLW1hbmlmZXN0L2xpYi9wYXJzZS1hcHBjYWNoZS1tYW5pZmVzdC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9ub2RlX21vZHVsZXMvaXNhcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zZXJ2aWNld29ya2VyLWNhY2hlLXBvbHlmaWxsL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RZQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBwYXJzZU1hbmlmZXN0ID0gcmVxdWlyZSgncGFyc2UtYXBwY2FjaGUtbWFuaWZlc3QnKTtcbnJlcXVpcmUoJ3NlcnZpY2V3b3JrZXItY2FjaGUtcG9seWZpbGwnKTtcbnZhciBvcHRpb25zID0gcmVxdWlyZSgnLi9vcHRpb25zJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgc3RyYXRlZ2llcyA9IHJlcXVpcmUoJy4vc3RyYXRlZ2llcycpO1xuXG5oZWxwZXJzLmRlYnVnKCdTZXJ2aWNlIFdvcmtlciBUb29sYm94IGlzIGxvYWRpbmcnKTtcblxuLy8gSW5zdGFsbFxuXG52YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGl0ZW1zKSB7XG4gIHJldHVybiBpdGVtcy5yZWR1Y2UoZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBhLmNvbmNhdChiKTtcbiAgfSwgW10pO1xufTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgdmFyIGluYWN0aXZlQ2FjaGUgPSBvcHRpb25zLmNhY2hlLm5hbWUgKyAnJCQkaW5hY3RpdmUkJCQnO1xuICBoZWxwZXJzLmRlYnVnKCdpbnN0YWxsIGV2ZW50IGZpcmVkJyk7XG4gIGhlbHBlcnMuZGVidWcoJ2NyZWF0aW5nIGNhY2hlIFsnICsgaW5hY3RpdmVDYWNoZSArICddJyk7XG4gIGV2ZW50LndhaXRVbnRpbChcbiAgICBoZWxwZXJzLm9wZW5DYWNoZSh7Y2FjaGU6IHtuYW1lOiBpbmFjdGl2ZUNhY2hlfX0pLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChvcHRpb25zLnByZUNhY2hlSXRlbXMpXG4gICAgICAgIC50aGVuKGZsYXR0ZW4pXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKHByZUNhY2hlSXRlbXMpIHtcbiAgICAgICAgICBoZWxwZXJzLmRlYnVnKCdwcmVDYWNoZSBsaXN0OiAnICsgKHByZUNhY2hlSXRlbXMuam9pbignLCAnKSB8fCAnKG5vbmUpJykpO1xuICAgICAgICAgIHJldHVybiBjYWNoZS5hZGRBbGwocHJlQ2FjaGVJdGVtcyk7XG4gICAgICAgIH0pO1xuICAgIH0pXG4gICk7XG59KTtcblxuLy8gQWN0aXZhdGVcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gIGhlbHBlcnMuZGVidWcoJ2FjdGl2YXRlIGV2ZW50IGZpcmVkJyk7XG4gIHZhciBpbmFjdGl2ZUNhY2hlID0gb3B0aW9ucy5jYWNoZS5uYW1lICsgJyQkJGluYWN0aXZlJCQkJztcbiAgZXZlbnQud2FpdFVudGlsKGhlbHBlcnMucmVuYW1lQ2FjaGUoaW5hY3RpdmVDYWNoZSwgb3B0aW9ucy5jYWNoZS5uYW1lKSk7XG59KTtcblxuLy8gRmV0Y2hcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdmZXRjaCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gIHZhciBoYW5kbGVyID0gcm91dGVyLm1hdGNoKGV2ZW50LnJlcXVlc3QpO1xuXG4gIGlmIChoYW5kbGVyKSB7XG4gICAgZXZlbnQucmVzcG9uZFdpdGgoaGFuZGxlcihldmVudC5yZXF1ZXN0KSk7XG4gIH0gZWxzZSBpZiAocm91dGVyLmRlZmF1bHQgJiYgZXZlbnQucmVxdWVzdC5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgZXZlbnQucmVzcG9uZFdpdGgocm91dGVyLmRlZmF1bHQoZXZlbnQucmVxdWVzdCkpO1xuICB9XG59KTtcblxuLy8gQ2FjaGluZ1xuXG5mdW5jdGlvbiBjYWNoZSh1cmwsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGhlbHBlcnMub3BlbkNhY2hlKG9wdGlvbnMpLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICByZXR1cm4gY2FjaGUuYWRkKHVybCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiB1bmNhY2hlKHVybCwgb3B0aW9ucykge1xuICByZXR1cm4gaGVscGVycy5vcGVuQ2FjaGUob3B0aW9ucykudGhlbihmdW5jdGlvbihjYWNoZSkge1xuICAgIHJldHVybiBjYWNoZS5kZWxldGUodXJsKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHByZWNhY2hlKGl0ZW1zKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcbiAgICBpdGVtcyA9IFtpdGVtc107XG4gIH1cbiAgb3B0aW9ucy5wcmVDYWNoZUl0ZW1zID0gb3B0aW9ucy5wcmVDYWNoZUl0ZW1zLmNvbmNhdChpdGVtcyk7XG59XG5cbmZ1bmN0aW9uIGdldFBhdGhBbmRPcHRpb25zKHVybCkge1xuICB2YXIgYWJzb2x1dGVVcmwgPSBuZXcgVVJMKHVybCwgbG9jYXRpb24uaHJlZik7XG4gIHJldHVybiB7XG4gICAgcGF0aG5hbWU6IGFic29sdXRlVXJsLnBhdGhuYW1lLFxuICAgIG9wdGlvbnM6IHtcbiAgICAgIG9yaWdpbjogYWJzb2x1dGVVcmwub3JpZ2luLFxuICAgICAgY2FjaGU6IHtcbiAgICAgICAgbmFtZTogJ2FwcGNhY2hlLWhlbHBlcidcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYXBwQ2FjaGVNYW5pZmVzdChtYW5pZmVzdFVybCkge1xuICByZXR1cm4gZmV0Y2gobWFuaWZlc3RVcmwpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBmZXRjaCAnICsgbWFuaWZlc3RVcmwgKyAnIGR1ZSB0byAnICsgcmVzcG9uc2Uuc3RhdHVzVGV4dCk7XG4gICAgfVxuICAgIHJldHVybiByZXNwb25zZS50ZXh0KCk7XG4gIH0pLnRoZW4oZnVuY3Rpb24obWFuaWZlc3QpIHtcbiAgICByZXR1cm4gcGFyc2VNYW5pZmVzdChtYW5pZmVzdCk7XG4gIH0pLnRoZW4oZnVuY3Rpb24ocGFyc2VkTWFuaWZlc3QpIHtcbiAgICAvLyBORVRXT1JLIHNlY3Rpb246XG4gICAgcGFyc2VkTWFuaWZlc3QubmV0d29yay5mb3JFYWNoKGZ1bmN0aW9uKHVybCkge1xuICAgICAgaWYgKHVybCA9PT0gJyonKSB7XG4gICAgICAgIC8vIElmICcqJyBpcyBwcmVzZW50LCB0aGVuIGRlZmF1bHQgdG8gbmV0d29yay1vbmx5IGZvciBhbGwgcmVxdWVzdHMgdGhhdCBkb24ndCBtYXRjaCBhbnlcbiAgICAgICAgLy8gb3RoZXIgaGFuZGxlcnMuXG4gICAgICAgIGhlbHBlcnMuZGVidWcoJ1VzaW5nIG5ldHdvcmstb25seSBzdHJhdGVneSBieSBkZWZhdWx0LCBkdWUgdG8gXCIqXCIgaW4gTkVUV09SSy4nKTtcbiAgICAgICAgcm91dGVyLmRlZmF1bHQgPSBzdHJhdGVnaWVzLm5ldHdvcmtPbmx5O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgdGhpcyBpc24ndCAnKicgdGhlbiBzZXQgdXAgYW4gZXhwbGljaXQgbmV0d29yay1vbmx5IGhhbmRsZXIgZm9yIGFueXRoaW5nIHRoYXQgbWF0Y2hlc1xuICAgICAgICAvLyB0aGF0IFVSTCBwcmVmaXguXG4gICAgICAgIGhlbHBlcnMuZGVidWcoJ1VzaW5nIG5ldHdvcmstb25seSBzdHJhdGVneSBmb3IgJyArIHVybCk7XG4gICAgICAgIHZhciBwYXRoQW5kT3B0aW9ucyA9IGdldFBhdGhBbmRPcHRpb25zKHVybCk7XG4gICAgICAgIHJvdXRlci5nZXQocGF0aEFuZE9wdGlvbnMucGF0aG5hbWUgKyAnKC4qKScsIHN0cmF0ZWdpZXMubmV0d29ya09ubHksIHBhdGhBbmRPcHRpb25zLm9wdGlvbnMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ0FDSEUgc2VjdGlvbjpcbiAgICAvLyBDYWNoZSBhbGwgdGhlIGl0ZW1zIHRoYXQgYXJlIGV4cGxpY2l0bHkgbWVudGlvbmVkIGhlcmUuXG4gICAgdmFyIHVybHNUb0NhY2hlID0gcGFyc2VkTWFuaWZlc3QuY2FjaGU7XG5cbiAgICBpZiAocm91dGVyLmRlZmF1bHQpIHtcbiAgICAgIC8vIElmIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IGlzIGFscmVhZHkgc2V0LCB0aGVuIHdlIG5lZWQgdG8gZXhwbGljaXRseSBlc3RhYmxpc2hcbiAgICAgIC8vIGNhY2hlLWZpcnN0IHN0cmF0ZWdpZXMgZm9yIGFsbCB0aGUgVVJMcyBpbiB0aGUgQ0FDSEUgc2VjdGlvbi5cbiAgICAgIHBhcnNlZE1hbmlmZXN0LmNhY2hlLmZvckVhY2goZnVuY3Rpb24odXJsKSB7XG4gICAgICAgIGhlbHBlcnMuZGVidWcoJ1VzaW5nIGNhY2hlLW9ubHkgc3RyYXRlZ3kgZm9yICcgKyB1cmwpO1xuICAgICAgICB2YXIgcGF0aEFuZE9wdGlvbnMgPSBnZXRQYXRoQW5kT3B0aW9ucyh1cmwpO1xuICAgICAgICByb3V0ZXIuZ2V0KHBhdGhBbmRPcHRpb25zLnBhdGhuYW1lLCBzdHJhdGVnaWVzLmNhY2hlT25seSwgcGF0aEFuZE9wdGlvbnMub3B0aW9ucyk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIGNhY2hlLWZpcnN0IGFzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IGlmIGl0J3Mgbm90IGFscmVhZHkgc2V0IHRvIG5ldHdvcmstZmlyc3QgZHVlIHRvICcqJ1xuICAgICAgLy8gYmVpbmcgaW4gdGhlIE5FVFdPUksgc2VjdGlvbi5cbiAgICAgIGhlbHBlcnMuZGV1ZygnVXNpbmcgY2FjaGUtb25seSBzdHJhdGVneSBieSBkZWZhdWx0LicpO1xuICAgICAgcm91dGVyLmRlZmF1bHQgPSBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gICAgICAgIHJldHVybiBzdHJhdGVnaWVzLmNhY2hlT25seShyZXF1ZXN0LCB7fSwge2NhY2hlOiB7bmFtZTogJ2FwcGNhY2hlLWhlbHBlcid9fSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRkFMTEJBQ0sgc2VjdGlvbjpcbiAgICBPYmplY3Qua2V5cyhwYXJzZWRNYW5pZmVzdC5mYWxsYmFjaykuZm9yRWFjaChmdW5jdGlvbihvcmlnaW5hbFVybCkge1xuICAgICAgdmFyIG9yaWdpbmFsVXJsUGF0aEFuZE9wdGlvbnMgPSBnZXRQYXRoQW5kT3B0aW9ucyhvcmlnaW5hbFVybCk7XG4gICAgICB2YXIgYWJzb2x1dGVGYWxsYmFja1VybFN0cmluZyA9IG5ldyBVUkwocGFyc2VkTWFuaWZlc3QuZmFsbGJhY2tbb3JpZ2luYWxVcmxdLFxuICAgICAgICBsb2NhdGlvbi5ocmVmKS50b1N0cmluZygpO1xuXG4gICAgICAvLyBXZSBuZWVkIHRvIGNhY2hlIGFueXRoaW5nIHRoYXQncyBiZWluZyB1c2VkIGFzIGEgZmFsbGJhY2suXG4gICAgICB1cmxzVG9DYWNoZS5wdXNoKGFic29sdXRlRmFsbGJhY2tVcmxTdHJpbmcpO1xuXG4gICAgICBoZWxwZXJzLmRlYnVnKCdVc2luZyAnICsgYWJzb2x1dGVGYWxsYmFja1VybFN0cmluZyArICcgYXMgYSBmYWxsYmFjayBmb3IgJyArIG9yaWdpbmFsVXJsKTtcbiAgICAgIHJvdXRlci5nZXQob3JpZ2luYWxVcmxQYXRoQW5kT3B0aW9ucy5wYXRobmFtZSwgZnVuY3Rpb24ocmVxdWVzdCwgdmFsdWVzLCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXJyb3Igd2hpbGUgZmV0Y2hpbmcgJyArIHJlcXVlc3QudXJsICsgJygnICsgcmVzcG9uc2Uuc3RhdHVzVGV4dCArICcpJyk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgICAgaGVscGVycy5kZWJ1ZygnRmFsbGluZyBiYWNrIHRvIGNhY2hlZCBlbnRyeSBmb3IgJyArIGFic29sdXRlRmFsbGJhY2tVcmxTdHJpbmcpO1xuICAgICAgICAgIHJldHVybiBzdHJhdGVnaWVzLmNhY2hlT25seShhYnNvbHV0ZUZhbGxiYWNrVXJsU3RyaW5nLCB7fSwgb3B0aW9ucyk7XG4gICAgICAgIH0pO1xuICAgICAgfSwgb3JpZ2luYWxVcmxQYXRoQW5kT3B0aW9ucy5vcHRpb25zKTtcbiAgICB9KTtcblxuICAgIHJldHVybiB1cmxzVG9DYWNoZTtcbiAgfSkudGhlbihmdW5jdGlvbih1cmxzVG9DYWNoZSkge1xuICAgIGhlbHBlcnMuZGVidWcoJ1VSTHMgdG8gY2FjaGU6ICcgKyBKU09OLnN0cmluZ2lmeSh1cmxzVG9DYWNoZSkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbCh1cmxzVG9DYWNoZS5tYXAoZnVuY3Rpb24odXJsKSB7XG4gICAgICByZXR1cm4gY2FjaGUodXJsLCB7Y2FjaGU6IHtuYW1lOiAnYXBwY2FjaGUtaGVscGVyJ319KTtcbiAgICB9KSk7XG4gIH0pLmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgaGVscGVycy5kZWJ1ZygnRmFpbGVkIHRvIHVzZSBBcHBDYWNoZSBNYW5pZmVzdDogJyArIGVycm9yKTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhcHBDYWNoZU1hbmlmZXN0OiBhcHBDYWNoZU1hbmlmZXN0LFxuICBjYWNoZTogY2FjaGUsXG4gIGNhY2hlRmlyc3Q6IHN0cmF0ZWdpZXMuY2FjaGVGaXJzdCxcbiAgY2FjaGVPbmx5OiBzdHJhdGVnaWVzLmNhY2hlT25seSxcbiAgZmFzdGVzdDogc3RyYXRlZ2llcy5mYXN0ZXN0LFxuICBuZXR3b3JrRmlyc3Q6IHN0cmF0ZWdpZXMubmV0d29ya0ZpcnN0LFxuICBuZXR3b3JrT25seTogc3RyYXRlZ2llcy5uZXR3b3JrT25seSxcbiAgb3B0aW9uczogb3B0aW9ucyxcbiAgcHJlY2FjaGU6IHByZWNhY2hlLFxuICByb3V0ZXI6IHJvdXRlcixcbiAgdW5jYWNoZTogdW5jYWNoZVxufTtcbiIsIi8qXG4gIENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGdsb2JhbE9wdGlvbnMgPSByZXF1aXJlKCcuL29wdGlvbnMnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGlkYkNhY2hlRXhwaXJhdGlvbiA9IHJlcXVpcmUoJy4vaWRiLWNhY2hlLWV4cGlyYXRpb24nKTtcblxuZnVuY3Rpb24gZGVidWcobWVzc2FnZSwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGZsYWcgPSBvcHRpb25zLmRlYnVnIHx8IGdsb2JhbE9wdGlvbnMuZGVidWc7XG4gIGlmIChmbGFnKSB7XG4gICAgY29uc29sZS5sb2coJ1tzdy10b29sYm94XSAnICsgbWVzc2FnZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbkNhY2hlKG9wdGlvbnMpIHtcbiAgdmFyIGNhY2hlTmFtZTtcbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5jYWNoZSkge1xuICAgIGNhY2hlTmFtZSA9IG9wdGlvbnMuY2FjaGUubmFtZTtcbiAgfVxuICBjYWNoZU5hbWUgPSBjYWNoZU5hbWUgfHwgZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lO1xuXG4gIGRlYnVnKCdPcGVuaW5nIGNhY2hlIFwiJyArIGNhY2hlTmFtZSArICdcIicsIG9wdGlvbnMpO1xuICByZXR1cm4gY2FjaGVzLm9wZW4oY2FjaGVOYW1lKTtcbn1cblxuZnVuY3Rpb24gZmV0Y2hBbmRDYWNoZShyZXF1ZXN0LCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgc3VjY2Vzc1Jlc3BvbnNlcyA9IG9wdGlvbnMuc3VjY2Vzc1Jlc3BvbnNlcyB8fCBnbG9iYWxPcHRpb25zLnN1Y2Nlc3NSZXNwb25zZXM7XG5cbiAgcmV0dXJuIGZldGNoKHJlcXVlc3QuY2xvbmUoKSkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgIC8vIE9ubHkgY2FjaGUgR0VUIHJlcXVlc3RzIHdpdGggc3VjY2Vzc2Z1bCByZXNwb25zZXMuXG4gICAgLy8gU2luY2UgdGhpcyBpcyBub3QgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiwgaXQgd2lsbCBiZSBkb25lIGFzeW5jaHJvbm91c2x5IGFuZCB3aWxsIG5vdFxuICAgIC8vIGJsb2NrIHRoZSByZXNwb25zZSBmcm9tIGJlaW5nIHJldHVybmVkIHRvIHRoZSBwYWdlLlxuICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcgJiYgc3VjY2Vzc1Jlc3BvbnNlcy50ZXN0KHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgIG9wZW5DYWNoZShvcHRpb25zKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgICAgIGNhY2hlLnB1dChyZXF1ZXN0LCByZXNwb25zZSkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICB2YXIgbWF4Q2FjaGVFbnRyaWVzO1xuICAgICAgICAgIHZhciBtYXhDYWNoZUFnZVNlY29uZHM7XG4gICAgICAgICAgdmFyIGNhY2hlTmFtZTtcblxuICAgICAgICAgIGlmIChvcHRpb25zLmNhY2hlKSB7XG4gICAgICAgICAgICAvLyBJZiBzb21lb25lIGV4cGxpY2l0bHkgc2V0cyBvcHRpb25zLmNhY2hlLCB0aGVuIHJlYWQgYWxsIHRocmVlIHNldHRpbmdzIGZyb20gdGhlcmUuXG4gICAgICAgICAgICAvLyBEb24ndCBmYWxsIGJhY2sgb24gZ2xvYmFsT3B0aW9ucy5cbiAgICAgICAgICAgIG1heENhY2hlRW50cmllcyA9IG9wdGlvbnMuY2FjaGUubWF4RW50cmllcztcbiAgICAgICAgICAgIG1heENhY2hlQWdlU2Vjb25kcyA9IG9wdGlvbnMuY2FjaGUubWF4QWdlU2Vjb25kcztcbiAgICAgICAgICAgIGNhY2hlTmFtZSA9IG9wdGlvbnMuY2FjaGUubmFtZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbWF4Q2FjaGVFbnRyaWVzID0gZ2xvYmFsT3B0aW9ucy5jYWNoZS5tYXhFbnRyaWVzO1xuICAgICAgICAgICAgbWF4Q2FjaGVBZ2VTZWNvbmRzID0gZ2xvYmFsT3B0aW9ucy5jYWNoZS5tYXhBZ2VTZWNvbmRzO1xuICAgICAgICAgICAgY2FjaGVOYW1lID0gZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIE9ubHkgcnVuIHRoZSBjYWNoZSBleHBpcmF0aW9uIGxvZ2ljIGlmIGF0IGxlYXN0IG9uZSBvZiB0aGUgbWF4aW11bXMgaXMgc2V0LCBhbmQgaWZcbiAgICAgICAgICAvLyB3ZSBoYXZlIGEgbmFtZSBmb3IgdGhlIGNhY2hlIHRoYXQgdGhlIG9wdGlvbnMgYXJlIGJlaW5nIGFwcGxpZWQgdG8uXG4gICAgICAgICAgaWYgKChtYXhDYWNoZUVudHJpZXMgfHwgbWF4Q2FjaGVBZ2VTZWNvbmRzKSAmJiBjYWNoZU5hbWUpIHtcbiAgICAgICAgICAgIHF1ZXVlQ2FjaGVFeHBpcmF0aW9uKHJlcXVlc3QsIGNhY2hlLCBjYWNoZU5hbWUsIG1heENhY2hlRW50cmllcywgbWF4Q2FjaGVBZ2VTZWNvbmRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3BvbnNlLmNsb25lKCk7XG4gIH0pO1xufVxuXG52YXIgY2FjaGVFeHBpcmF0aW9uUHJvbWlzZUNoYWluO1xuZnVuY3Rpb24gcXVldWVDYWNoZUV4cGlyYXRpb24ocmVxdWVzdCwgY2FjaGUsIGNhY2hlTmFtZSwgbWF4Q2FjaGVFbnRyaWVzLCBtYXhDYWNoZUFnZVNlY29uZHMpIHtcbiAgdmFyIGNhY2hlRXhwaXJhdGlvbiA9IGNhY2hlRXhwaXJhdGlvblByb21pc2VGYWN0b3J5LmJpbmQobnVsbCwgcmVxdWVzdCwgY2FjaGUsIGNhY2hlTmFtZSwgbWF4Q2FjaGVFbnRyaWVzLFxuICAgIG1heENhY2hlQWdlU2Vjb25kcyk7XG5cbiAgaWYgKGNhY2hlRXhwaXJhdGlvblByb21pc2VDaGFpbikge1xuICAgIGNhY2hlRXhwaXJhdGlvblByb21pc2VDaGFpbiA9IGNhY2hlRXhwaXJhdGlvblByb21pc2VDaGFpbi50aGVuKGNhY2hlRXhwaXJhdGlvbik7XG4gIH0gZWxzZSB7XG4gICAgY2FjaGVFeHBpcmF0aW9uUHJvbWlzZUNoYWluID0gY2FjaGVFeHBpcmF0aW9uKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2FjaGVFeHBpcmF0aW9uUHJvbWlzZUZhY3RvcnkocmVxdWVzdCwgY2FjaGUsIGNhY2hlTmFtZSwgbWF4Q2FjaGVFbnRyaWVzLCBtYXhDYWNoZUFnZVNlY29uZHMpIHtcbiAgdmFyIHJlcXVlc3RVcmwgPSByZXF1ZXN0LnVybDtcblxuICB2YXIgbm93ID0gRGF0ZS5ub3coKTtcbiAgZGVidWcoJ1VwZGF0aW5nIExSVSBvcmRlciBmb3IgJyArIHJlcXVlc3RVcmwgKyAnLiBNYXggZW50cmllcyBpcyAnICsgbWF4Q2FjaGVFbnRyaWVzICtcbiAgICAnLCBtYXggYWdlIGlzICcgKyBtYXhDYWNoZUFnZVNlY29uZHMpO1xuXG4gIHJldHVybiBpZGJDYWNoZUV4cGlyYXRpb24uZ2V0RGIoY2FjaGVOYW1lKS50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgcmV0dXJuIGlkYkNhY2hlRXhwaXJhdGlvbi5zZXRUaW1lc3RhbXBGb3JVcmwoZGIsIHJlcXVlc3RVcmwsIG5vdyk7XG4gIH0pLnRoZW4oZnVuY3Rpb24oZGIpIHtcbiAgICByZXR1cm4gaWRiQ2FjaGVFeHBpcmF0aW9uLmV4cGlyZUVudHJpZXMoZGIsIG1heENhY2hlRW50cmllcywgbWF4Q2FjaGVBZ2VTZWNvbmRzLCBub3cpO1xuICB9KS50aGVuKGZ1bmN0aW9uKHVybHNUb0RlbGV0ZSkge1xuICAgIGRlYnVnKCdTdWNjZXNzZnVsbHkgdXBkYXRlZCBJREIuJyk7XG5cbiAgICB2YXIgZGVsZXRpb25Qcm9taXNlcyA9IHVybHNUb0RlbGV0ZS5tYXAoZnVuY3Rpb24odXJsVG9EZWxldGUpIHtcbiAgICAgIHJldHVybiBjYWNoZS5kZWxldGUodXJsVG9EZWxldGUpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKGRlbGV0aW9uUHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICBkZWJ1ZygnRG9uZSB3aXRoIGNhY2hlIGNsZWFudXAuJyk7XG4gICAgfSk7XG4gIH0pLmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgZGVidWcoZXJyb3IpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuYW1lQ2FjaGUoc291cmNlLCBkZXN0aW5hdGlvbiwgb3B0aW9ucykge1xuICBkZWJ1ZygnUmVuYW1pbmcgY2FjaGU6IFsnICsgc291cmNlICsgJ10gdG8gWycgKyBkZXN0aW5hdGlvbiArICddJywgb3B0aW9ucyk7XG4gIHJldHVybiBjYWNoZXMuZGVsZXRlKGRlc3RpbmF0aW9uKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICBjYWNoZXMub3Blbihzb3VyY2UpLFxuICAgICAgY2FjaGVzLm9wZW4oZGVzdGluYXRpb24pXG4gICAgXSkudGhlbihmdW5jdGlvbihyZXN1bHRzKSB7XG4gICAgICB2YXIgc291cmNlQ2FjaGUgPSByZXN1bHRzWzBdO1xuICAgICAgdmFyIGRlc3RDYWNoZSA9IHJlc3VsdHNbMV07XG5cbiAgICAgIHJldHVybiBzb3VyY2VDYWNoZS5rZXlzKCkudGhlbihmdW5jdGlvbihyZXF1ZXN0cykge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocmVxdWVzdHMubWFwKGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAgICAgICAgICByZXR1cm4gc291cmNlQ2FjaGUubWF0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIGRlc3RDYWNoZS5wdXQocmVxdWVzdCwgcmVzcG9uc2UpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KSk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gY2FjaGVzLmRlbGV0ZShzb3VyY2UpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVidWc6IGRlYnVnLFxuICBmZXRjaEFuZENhY2hlOiBmZXRjaEFuZENhY2hlLFxuICBvcGVuQ2FjaGU6IG9wZW5DYWNoZSxcbiAgcmVuYW1lQ2FjaGU6IHJlbmFtZUNhY2hlXG59O1xuIiwiLypcbiBDb3B5cmlnaHQgMjAxNSBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBEQl9QUkVGSVggPSAnc3ctdG9vbGJveC0nO1xudmFyIERCX1ZFUlNJT04gPSAxO1xudmFyIFNUT1JFX05BTUUgPSAnc3RvcmUnO1xudmFyIFVSTF9QUk9QRVJUWSA9ICd1cmwnO1xudmFyIFRJTUVTVEFNUF9QUk9QRVJUWSA9ICd0aW1lc3RhbXAnO1xudmFyIGNhY2hlTmFtZVRvRGJQcm9taXNlID0ge307XG5cbmZ1bmN0aW9uIG9wZW5EYihjYWNoZU5hbWUpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciByZXF1ZXN0ID0gaW5kZXhlZERCLm9wZW4oREJfUFJFRklYICsgY2FjaGVOYW1lLCBEQl9WRVJTSU9OKTtcblxuICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqZWN0U3RvcmUgPSByZXF1ZXN0LnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9OQU1FLCB7a2V5UGF0aDogVVJMX1BST1BFUlRZfSk7XG4gICAgICBvYmplY3RTdG9yZS5jcmVhdGVJbmRleChUSU1FU1RBTVBfUFJPUEVSVFksIFRJTUVTVEFNUF9QUk9QRVJUWSwge3VuaXF1ZTogZmFsc2V9KTtcbiAgICB9O1xuXG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgIH07XG5cbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgICB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0RGIoY2FjaGVOYW1lKSB7XG4gIGlmICghKGNhY2hlTmFtZSBpbiBjYWNoZU5hbWVUb0RiUHJvbWlzZSkpIHtcbiAgICBjYWNoZU5hbWVUb0RiUHJvbWlzZVtjYWNoZU5hbWVdID0gb3BlbkRiKGNhY2hlTmFtZSk7XG4gIH1cblxuICByZXR1cm4gY2FjaGVOYW1lVG9EYlByb21pc2VbY2FjaGVOYW1lXTtcbn1cblxuZnVuY3Rpb24gc2V0VGltZXN0YW1wRm9yVXJsKGRiLCB1cmwsIG5vdykge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyYW5zYWN0aW9uID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgJ3JlYWR3cml0ZScpO1xuICAgIHZhciBvYmplY3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIG9iamVjdFN0b3JlLnB1dCh7dXJsOiB1cmwsIHRpbWVzdGFtcDogbm93fSk7XG5cbiAgICB0cmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXNvbHZlKGRiKTtcbiAgICB9O1xuXG4gICAgdHJhbnNhY3Rpb24ub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmVqZWN0KHRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZXhwaXJlT2xkRW50cmllcyhkYiwgbWF4QWdlU2Vjb25kcywgbm93KSB7XG4gIC8vIEJhaWwgb3V0IGVhcmx5IGJ5IHJlc29sdmluZyB3aXRoIGFuIGVtcHR5IGFycmF5IGlmIHdlJ3JlIG5vdCB1c2luZyBtYXhBZ2VTZWNvbmRzLlxuICBpZiAoIW1heEFnZVNlY29uZHMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuXG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgbWF4QWdlTWlsbGlzID0gbWF4QWdlU2Vjb25kcyAqIDEwMDA7XG4gICAgdmFyIHVybHMgPSBbXTtcblxuICAgIHZhciB0cmFuc2FjdGlvbiA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsICdyZWFkd3JpdGUnKTtcbiAgICB2YXIgb2JqZWN0U3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICB2YXIgaW5kZXggPSBvYmplY3RTdG9yZS5pbmRleChUSU1FU1RBTVBfUFJPUEVSVFkpO1xuXG4gICAgaW5kZXgub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IGZ1bmN0aW9uKGN1cnNvckV2ZW50KSB7XG4gICAgICB2YXIgY3Vyc29yID0gY3Vyc29yRXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgIGlmIChjdXJzb3IpIHtcbiAgICAgICAgaWYgKG5vdyAtIG1heEFnZU1pbGxpcyA+IGN1cnNvci52YWx1ZVtUSU1FU1RBTVBfUFJPUEVSVFldKSB7XG4gICAgICAgICAgdmFyIHVybCA9IGN1cnNvci52YWx1ZVtVUkxfUFJPUEVSVFldO1xuICAgICAgICAgIHVybHMucHVzaCh1cmwpO1xuICAgICAgICAgIG9iamVjdFN0b3JlLmRlbGV0ZSh1cmwpO1xuICAgICAgICAgIGN1cnNvci5jb250aW51ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlc29sdmUodXJscyk7XG4gICAgfTtcblxuICAgIHRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBleHBpcmVFeHRyYUVudHJpZXMoZGIsIG1heEVudHJpZXMpIHtcbiAgLy8gQmFpbCBvdXQgZWFybHkgYnkgcmVzb2x2aW5nIHdpdGggYW4gZW1wdHkgYXJyYXkgaWYgd2UncmUgbm90IHVzaW5nIG1heEVudHJpZXMuXG4gIGlmICghbWF4RW50cmllcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB1cmxzID0gW107XG5cbiAgICB2YXIgdHJhbnNhY3Rpb24gPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCAncmVhZHdyaXRlJyk7XG4gICAgdmFyIG9iamVjdFN0b3JlID0gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgdmFyIGluZGV4ID0gb2JqZWN0U3RvcmUuaW5kZXgoVElNRVNUQU1QX1BST1BFUlRZKTtcblxuICAgIHZhciBjb3VudFJlcXVlc3QgPSBpbmRleC5jb3VudCgpO1xuICAgIGluZGV4LmNvdW50KCkub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaW5pdGlhbENvdW50ID0gY291bnRSZXF1ZXN0LnJlc3VsdDtcblxuICAgICAgaWYgKGluaXRpYWxDb3VudCA+IG1heEVudHJpZXMpIHtcbiAgICAgICAgaW5kZXgub3BlbkN1cnNvcigpLm9uc3VjY2VzcyA9IGZ1bmN0aW9uKGN1cnNvckV2ZW50KSB7XG4gICAgICAgICAgdmFyIGN1cnNvciA9IGN1cnNvckV2ZW50LnRhcmdldC5yZXN1bHQ7XG4gICAgICAgICAgaWYgKGN1cnNvcikge1xuICAgICAgICAgICAgdmFyIHVybCA9IGN1cnNvci52YWx1ZVtVUkxfUFJPUEVSVFldO1xuICAgICAgICAgICAgdXJscy5wdXNoKHVybCk7XG4gICAgICAgICAgICBvYmplY3RTdG9yZS5kZWxldGUodXJsKTtcbiAgICAgICAgICAgIGlmIChpbml0aWFsQ291bnQgLSB1cmxzLmxlbmd0aCA+IG1heEVudHJpZXMpIHtcbiAgICAgICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0cmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXNvbHZlKHVybHMpO1xuICAgIH07XG5cbiAgICB0cmFuc2FjdGlvbi5vbmFib3J0ID0gcmVqZWN0O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZXhwaXJlRW50cmllcyhkYiwgbWF4RW50cmllcywgbWF4QWdlU2Vjb25kcywgbm93KSB7XG4gIHJldHVybiBleHBpcmVPbGRFbnRyaWVzKGRiLCBtYXhBZ2VTZWNvbmRzLCBub3cpLnRoZW4oZnVuY3Rpb24ob2xkRXhwaXJlZFVybHMpIHtcbiAgICByZXR1cm4gZXhwaXJlRXh0cmFFbnRyaWVzKGRiLCBtYXhFbnRyaWVzKS50aGVuKGZ1bmN0aW9uKGV4dHJhRXhwaXJlZFVybHMpIHtcbiAgICAgIHJldHVybiBvbGRFeHBpcmVkVXJscy5jb25jYXQoZXh0cmFFeHBpcmVkVXJscyk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0RGI6IGdldERiLFxuICBzZXRUaW1lc3RhbXBGb3JVcmw6IHNldFRpbWVzdGFtcEZvclVybCxcbiAgZXhwaXJlRW50cmllczogZXhwaXJlRW50cmllc1xufTtcbiIsIi8qXG5cdENvcHlyaWdodCAyMDE1IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cblx0TGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcblx0eW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuXHRZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cblx0VW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuXHRkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG5cdFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuXHRTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG5cdGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcblxuLy8gVE9ETzogVGhpcyBpcyBuZWNlc3NhcnkgdG8gaGFuZGxlIGRpZmZlcmVudCBpbXBsZW1lbnRhdGlvbnMgaW4gdGhlIHdpbGRcbi8vIFRoZSBzcGVjIGRlZmluZXMgc2VsZi5yZWdpc3RyYXRpb24sIGJ1dCBpdCB3YXMgbm90IGltcGxlbWVudGVkIGluIENocm9tZSA0MC5cbnZhciBzY29wZTtcbmlmIChzZWxmLnJlZ2lzdHJhdGlvbikge1xuICBzY29wZSA9IHNlbGYucmVnaXN0cmF0aW9uLnNjb3BlO1xufSBlbHNlIHtcbiAgc2NvcGUgPSBzZWxmLnNjb3BlIHx8IG5ldyBVUkwoJy4vJywgc2VsZi5sb2NhdGlvbikuaHJlZjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNhY2hlOiB7XG4gICAgbmFtZTogJyQkJHRvb2xib3gtY2FjaGUkJCQnICsgc2NvcGUgKyAnJCQkJyxcbiAgICBtYXhBZ2VTZWNvbmRzOiBudWxsLFxuICAgIG1heEVudHJpZXM6IG51bGxcbiAgfSxcbiAgZGVidWc6IGZhbHNlLFxuICBuZXR3b3JrVGltZW91dFNlY29uZHM6IG51bGwsXG4gIHByZUNhY2hlSXRlbXM6IFtdLFxuICAvLyBBIHJlZ3VsYXIgZXhwcmVzc2lvbiB0byBhcHBseSB0byBIVFRQIHJlc3BvbnNlIGNvZGVzLiBDb2RlcyB0aGF0IG1hdGNoXG4gIC8vIHdpbGwgYmUgY29uc2lkZXJlZCBzdWNjZXNzZXMsIHdoaWxlIG90aGVycyB3aWxsIG5vdCwgYW5kIHdpbGwgbm90IGJlXG4gIC8vIGNhY2hlZC5cbiAgc3VjY2Vzc1Jlc3BvbnNlczogL14wfChbMTIzXVxcZFxcZCl8KDQwWzE0NTY3XSl8NDEwJC9cbn07XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbi8vIFRPRE86IFVzZSBzZWxmLnJlZ2lzdHJhdGlvbi5zY29wZSBpbnN0ZWFkIG9mIHNlbGYubG9jYXRpb25cbnZhciB1cmwgPSBuZXcgVVJMKCcuLycsIHNlbGYubG9jYXRpb24pO1xudmFyIGJhc2VQYXRoID0gdXJsLnBhdGhuYW1lO1xudmFyIHBhdGhSZWdleHAgPSByZXF1aXJlKCdwYXRoLXRvLXJlZ2V4cCcpO1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihtZXRob2QsIHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgLy8gVGhlIFVSTCgpIGNvbnN0cnVjdG9yIGNhbid0IHBhcnNlIGV4cHJlc3Mtc3R5bGUgcm91dGVzIGFzIHRoZXkgYXJlIG5vdFxuICAvLyB2YWxpZCB1cmxzLiBUaGlzIG1lYW5zIHdlIGhhdmUgdG8gbWFudWFsbHkgbWFuaXB1bGF0ZSByZWxhdGl2ZSB1cmxzIGludG9cbiAgLy8gYWJzb2x1dGUgb25lcy4gVGhpcyBjaGVjayBpcyBleHRyZW1lbHkgbmFpdmUgYnV0IGltcGxlbWVudGluZyBhIHR3ZWFrZWRcbiAgLy8gdmVyc2lvbiBvZiB0aGUgZnVsbCBhbGdvcml0aG0gc2VlbXMgbGlrZSBvdmVya2lsbFxuICAvLyAoaHR0cHM6Ly91cmwuc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LWJhc2ljLXVybC1wYXJzZXIpXG4gIGlmIChwYXRoLmluZGV4T2YoJy8nKSAhPT0gMCkge1xuICAgIHBhdGggPSBiYXNlUGF0aCArIHBhdGg7XG4gIH1cblxuICB0aGlzLm1ldGhvZCA9IG1ldGhvZDtcbiAgdGhpcy5rZXlzID0gW107XG4gIHRoaXMucmVnZXhwID0gcGF0aFJlZ2V4cChwYXRoLCB0aGlzLmtleXMpO1xuICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB0aGlzLmhhbmRsZXIgPSBoYW5kbGVyO1xufTtcblxuUm91dGUucHJvdG90eXBlLm1ha2VIYW5kbGVyID0gZnVuY3Rpb24odXJsKSB7XG4gIHZhciBtYXRjaCA9IHRoaXMucmVnZXhwLmV4ZWModXJsKTtcbiAgdmFyIHZhbHVlcyA9IHt9O1xuICB0aGlzLmtleXMuZm9yRWFjaChmdW5jdGlvbihrZXksIGluZGV4KSB7XG4gICAgdmFsdWVzW2tleS5uYW1lXSA9IG1hdGNoW2luZGV4ICsgMV07XG4gIH0pO1xuICByZXR1cm4gZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgIHJldHVybiB0aGlzLmhhbmRsZXIocmVxdWVzdCwgdmFsdWVzLCB0aGlzLm9wdGlvbnMpO1xuICB9LmJpbmQodGhpcyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFJvdXRlO1xuIiwiLypcbiAgQ29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUm91dGUgPSByZXF1aXJlKCcuL3JvdXRlJyk7XG5cbmZ1bmN0aW9uIHJlZ2V4RXNjYXBlKHMpIHtcbiAgcmV0dXJuIHMucmVwbGFjZSgvWy1cXC9cXFxcXiQqKz8uKCl8W1xcXXt9XS9nLCAnXFxcXCQmJyk7XG59XG5cbnZhciBrZXlNYXRjaCA9IGZ1bmN0aW9uKG1hcCwgc3RyaW5nKSB7XG4gIC8vIFRoaXMgd291bGQgYmUgYmV0dGVyIHdyaXR0ZW4gYXMgYSBmb3IuLm9mIGxvb3AsIGJ1dCB0aGF0IHdvdWxkIGJyZWFrIHRoZSBtaW5pZnlpZnkgcHJvY2Vzc1xuICAvLyBpbiB0aGUgYnVpbGQuXG4gIHZhciBlbnRyaWVzSXRlcmF0b3IgPSBtYXAuZW50cmllcygpO1xuICB2YXIgaXRlbSA9IGVudHJpZXNJdGVyYXRvci5uZXh0KCk7XG4gIHdoaWxlICghaXRlbS5kb25lKSB7XG4gICAgdmFyIHBhdHRlcm4gPSBuZXcgUmVnRXhwKGl0ZW0udmFsdWVbMF0pO1xuICAgIGlmIChwYXR0ZXJuLnRlc3Qoc3RyaW5nKSkge1xuICAgICAgcmV0dXJuIGl0ZW0udmFsdWVbMV07XG4gICAgfVxuICAgIGl0ZW0gPSBlbnRyaWVzSXRlcmF0b3IubmV4dCgpO1xuICB9XG4gIHJldHVybiBudWxsO1xufTtcblxudmFyIFJvdXRlciA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnJvdXRlcyA9IG5ldyBNYXAoKTtcbiAgdGhpcy5kZWZhdWx0ID0gbnVsbDtcbn07XG5cblsnZ2V0JywgJ3Bvc3QnLCAncHV0JywgJ2RlbGV0ZScsICdoZWFkJywgJ2FueSddLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG4gIFJvdXRlci5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdGhpcy5hZGQobWV0aG9kLCBwYXRoLCBoYW5kbGVyLCBvcHRpb25zKTtcbiAgfTtcbn0pO1xuXG5Sb3V0ZXIucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKG1ldGhvZCwgcGF0aCwgaGFuZGxlciwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIG9yaWdpbiA9IG9wdGlvbnMub3JpZ2luIHx8IHNlbGYubG9jYXRpb24ub3JpZ2luO1xuICBpZiAob3JpZ2luIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgb3JpZ2luID0gb3JpZ2luLnNvdXJjZTtcbiAgfSBlbHNlIHtcbiAgICBvcmlnaW4gPSByZWdleEVzY2FwZShvcmlnaW4pO1xuICB9XG4gIG1ldGhvZCA9IG1ldGhvZC50b0xvd2VyQ2FzZSgpO1xuXG4gIHZhciByb3V0ZSA9IG5ldyBSb3V0ZShtZXRob2QsIHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpO1xuXG4gIGlmICghdGhpcy5yb3V0ZXMuaGFzKG9yaWdpbikpIHtcbiAgICB0aGlzLnJvdXRlcy5zZXQob3JpZ2luLCBuZXcgTWFwKCkpO1xuICB9XG5cbiAgdmFyIG1ldGhvZE1hcCA9IHRoaXMucm91dGVzLmdldChvcmlnaW4pO1xuICBpZiAoIW1ldGhvZE1hcC5oYXMobWV0aG9kKSkge1xuICAgIG1ldGhvZE1hcC5zZXQobWV0aG9kLCBuZXcgTWFwKCkpO1xuICB9XG5cbiAgdmFyIHJvdXRlTWFwID0gbWV0aG9kTWFwLmdldChtZXRob2QpO1xuICByb3V0ZU1hcC5zZXQocm91dGUucmVnZXhwLnNvdXJjZSwgcm91dGUpO1xufTtcblxuUm91dGVyLnByb3RvdHlwZS5tYXRjaE1ldGhvZCA9IGZ1bmN0aW9uKG1ldGhvZCwgdXJsKSB7XG4gIHVybCA9IG5ldyBVUkwodXJsKTtcbiAgdmFyIG9yaWdpbiA9IHVybC5vcmlnaW47XG4gIHZhciBwYXRoID0gdXJsLnBhdGhuYW1lO1xuICBtZXRob2QgPSBtZXRob2QudG9Mb3dlckNhc2UoKTtcblxuICB2YXIgbWV0aG9kcyA9IGtleU1hdGNoKHRoaXMucm91dGVzLCBvcmlnaW4pO1xuICBpZiAoIW1ldGhvZHMpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHZhciByb3V0ZXMgPSBtZXRob2RzLmdldChtZXRob2QpO1xuICBpZiAoIXJvdXRlcykge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdmFyIHJvdXRlID0ga2V5TWF0Y2gocm91dGVzLCBwYXRoKTtcblxuICBpZiAocm91dGUpIHtcbiAgICByZXR1cm4gcm91dGUubWFrZUhhbmRsZXIocGF0aCk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn07XG5cblJvdXRlci5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gIHJldHVybiB0aGlzLm1hdGNoTWV0aG9kKHJlcXVlc3QubWV0aG9kLCByZXF1ZXN0LnVybCkgfHwgdGhpcy5tYXRjaE1ldGhvZCgnYW55JywgcmVxdWVzdC51cmwpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBuZXcgUm91dGVyKCk7XG4iLCIvKlxuXHRDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG5cdExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG5cdHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cblx0WW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5cdFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcblx0ZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuXHRXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblx0U2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuXHRsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMnKTtcblxuZnVuY3Rpb24gY2FjaGVGaXJzdChyZXF1ZXN0LCB2YWx1ZXMsIG9wdGlvbnMpIHtcbiAgaGVscGVycy5kZWJ1ZygnU3RyYXRlZ3k6IGNhY2hlIGZpcnN0IFsnICsgcmVxdWVzdC51cmwgKyAnXScsIG9wdGlvbnMpO1xuICByZXR1cm4gaGVscGVycy5vcGVuQ2FjaGUob3B0aW9ucykudGhlbihmdW5jdGlvbihjYWNoZSkge1xuICAgIHJldHVybiBjYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVzcG9uc2UpIHtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QsIG9wdGlvbnMpO1xuICAgIH0pO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZUZpcnN0O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzJyk7XG5cbmZ1bmN0aW9uIGNhY2hlT25seShyZXF1ZXN0LCB2YWx1ZXMsIG9wdGlvbnMpIHtcbiAgaGVscGVycy5kZWJ1ZygnU3RyYXRlZ3k6IGNhY2hlIG9ubHkgWycgKyByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gIHJldHVybiBoZWxwZXJzLm9wZW5DYWNoZShvcHRpb25zKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgcmV0dXJuIGNhY2hlLm1hdGNoKHJlcXVlc3QpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZU9ubHk7XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMnKTtcbnZhciBjYWNoZU9ubHkgPSByZXF1aXJlKCcuL2NhY2hlT25seScpO1xuXG5mdW5jdGlvbiBmYXN0ZXN0KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucykge1xuICBoZWxwZXJzLmRlYnVnKCdTdHJhdGVneTogZmFzdGVzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcblxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHJlamVjdGVkID0gZmFsc2U7XG4gICAgdmFyIHJlYXNvbnMgPSBbXTtcblxuICAgIHZhciBtYXliZVJlamVjdCA9IGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgcmVhc29ucy5wdXNoKHJlYXNvbi50b1N0cmluZygpKTtcbiAgICAgIGlmIChyZWplY3RlZCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdCb3RoIGNhY2hlIGFuZCBuZXR3b3JrIGZhaWxlZDogXCInICsgcmVhc29ucy5qb2luKCdcIiwgXCInKSArICdcIicpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIG1heWJlUmVzb2x2ZSA9IGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJlc3BvbnNlKSB7XG4gICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1heWJlUmVqZWN0KCdObyByZXN1bHQgcmV0dXJuZWQnKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QuY2xvbmUoKSwgb3B0aW9ucylcbiAgICAgIC50aGVuKG1heWJlUmVzb2x2ZSwgbWF5YmVSZWplY3QpO1xuXG4gICAgY2FjaGVPbmx5KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucylcbiAgICAgIC50aGVuKG1heWJlUmVzb2x2ZSwgbWF5YmVSZWplY3QpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmYXN0ZXN0O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5ldHdvcmtPbmx5OiByZXF1aXJlKCcuL25ldHdvcmtPbmx5JyksXG4gIG5ldHdvcmtGaXJzdDogcmVxdWlyZSgnLi9uZXR3b3JrRmlyc3QnKSxcbiAgY2FjaGVPbmx5OiByZXF1aXJlKCcuL2NhY2hlT25seScpLFxuICBjYWNoZUZpcnN0OiByZXF1aXJlKCcuL2NhY2hlRmlyc3QnKSxcbiAgZmFzdGVzdDogcmVxdWlyZSgnLi9mYXN0ZXN0Jylcbn07XG4iLCIvKlxuIENvcHlyaWdodCAyMDE1IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcbnZhciBnbG9iYWxPcHRpb25zID0gcmVxdWlyZSgnLi4vb3B0aW9ucycpO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzJyk7XG5cbmZ1bmN0aW9uIG5ldHdvcmtGaXJzdChyZXF1ZXN0LCB2YWx1ZXMsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBzdWNjZXNzUmVzcG9uc2VzID0gb3B0aW9ucy5zdWNjZXNzUmVzcG9uc2VzIHx8IGdsb2JhbE9wdGlvbnMuc3VjY2Vzc1Jlc3BvbnNlcztcbiAgLy8gVGhpcyB3aWxsIGJ5cGFzcyBvcHRpb25zLm5ldHdvcmtUaW1lb3V0IGlmIGl0J3Mgc2V0IHRvIGEgZmFsc2UteSB2YWx1ZSBsaWtlIDAsIGJ1dCB0aGF0J3MgdGhlXG4gIC8vIHNhbmUgdGhpbmcgdG8gZG8gYW55d2F5LlxuICB2YXIgbmV0d29ya1RpbWVvdXRTZWNvbmRzID0gb3B0aW9ucy5uZXR3b3JrVGltZW91dFNlY29uZHMgfHwgZ2xvYmFsT3B0aW9ucy5uZXR3b3JrVGltZW91dFNlY29uZHM7XG4gIGhlbHBlcnMuZGVidWcoJ1N0cmF0ZWd5OiBuZXR3b3JrIGZpcnN0IFsnICsgcmVxdWVzdC51cmwgKyAnXScsIG9wdGlvbnMpO1xuXG4gIHJldHVybiBoZWxwZXJzLm9wZW5DYWNoZShvcHRpb25zKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgdmFyIHRpbWVvdXRJZDtcbiAgICB2YXIgcHJvbWlzZXMgPSBbXTtcbiAgICB2YXIgb3JpZ2luYWxSZXNwb25zZTtcblxuICAgIGlmIChuZXR3b3JrVGltZW91dFNlY29uZHMpIHtcbiAgICAgIHZhciBjYWNoZVdoZW5UaW1lZE91dFByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FjaGUubWF0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgIC8vIE9ubHkgcmVzb2x2ZSB0aGlzIHByb21pc2UgaWYgdGhlcmUncyBhIHZhbGlkIHJlc3BvbnNlIGluIHRoZSBjYWNoZS5cbiAgICAgICAgICAgICAgLy8gVGhpcyBlbnN1cmVzIHRoYXQgd2Ugd29uJ3QgdGltZSBvdXQgYSBuZXR3b3JrIHJlcXVlc3QgdW5sZXNzIHRoZXJlJ3MgYSBjYWNoZWQgZW50cnlcbiAgICAgICAgICAgICAgLy8gdG8gZmFsbGJhY2sgb24sIHdoaWNoIGlzIGFyZ3VhYmx5IHRoZSBwcmVmZXJhYmxlIGJlaGF2aW9yLlxuICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwgbmV0d29ya1RpbWVvdXRTZWNvbmRzICogMTAwMCk7XG4gICAgICB9KTtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVXaGVuVGltZWRPdXRQcm9taXNlKTtcbiAgICB9XG5cbiAgICB2YXIgbmV0d29ya1Byb21pc2UgPSBoZWxwZXJzLmZldGNoQW5kQ2FjaGUocmVxdWVzdCwgb3B0aW9ucykudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgLy8gV2UndmUgZ290IGEgcmVzcG9uc2UsIHNvIGNsZWFyIHRoZSBuZXR3b3JrIHRpbWVvdXQgaWYgdGhlcmUgaXMgb25lLlxuICAgICAgaWYgKHRpbWVvdXRJZCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN1Y2Nlc3NSZXNwb25zZXMudGVzdChyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgaGVscGVycy5kZWJ1ZygnUmVzcG9uc2Ugd2FzIGFuIEhUVFAgZXJyb3I6ICcgKyByZXNwb25zZS5zdGF0dXNUZXh0LCBvcHRpb25zKTtcbiAgICAgIG9yaWdpbmFsUmVzcG9uc2UgPSByZXNwb25zZTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQmFkIHJlc3BvbnNlJyk7XG4gICAgfSkuY2F0Y2goZnVuY3Rpb24oKSB7XG4gICAgICBoZWxwZXJzLmRlYnVnKCdOZXR3b3JrIG9yIHJlc3BvbnNlIGVycm9yLCBmYWxsYmFjayB0byBjYWNoZSBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcbiAgICAgIHJldHVybiBjYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIHJldHVybiByZXNwb25zZSB8fCBvcmlnaW5hbFJlc3BvbnNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgcHJvbWlzZXMucHVzaChuZXR3b3JrUHJvbWlzZSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yYWNlKHByb21pc2VzKTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbmV0d29ya0ZpcnN0O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzJyk7XG5cbmZ1bmN0aW9uIG5ldHdvcmtPbmx5KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucykge1xuICBoZWxwZXJzLmRlYnVnKCdTdHJhdGVneTogbmV0d29yayBvbmx5IFsnICsgcmVxdWVzdC51cmwgKyAnXScsIG9wdGlvbnMpO1xuICByZXR1cm4gZmV0Y2gocmVxdWVzdCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbmV0d29ya09ubHk7XG4iLCIvLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNi4zXG4oZnVuY3Rpb24oKSB7XG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24obWFuaWZlc3QpIHtcbiAgICB2YXIgY3VycmVudFNlY3Rpb24sIGVudHJpZXMsIGZpcnN0TGluZSwgbGluZSwgbGluZXMsIG1vZGUsIHRva2VucywgX2ksIF9sZW47XG4gICAgbGluZXMgPSBtYW5pZmVzdC5zcGxpdCgvXFxyXFxufFxccnxcXG4vKTtcbiAgICBmaXJzdExpbmUgPSBsaW5lcy5zaGlmdCgpO1xuICAgIGlmIChmaXJzdExpbmUuaW5kZXhPZignQ0FDSEUgTUFOSUZFU1QnKSAhPT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBjYWNoZSBtYW5pZmVzdCBoZWFkZXI6IFwiICsgZmlyc3RMaW5lKTtcbiAgICB9XG4gICAgaWYgKGZpcnN0TGluZS5sZW5ndGggPiAnQ0FDSEUgTUFOSUZFU1QnLmxlbmd0aCAmJiBmaXJzdExpbmVbMTRdICE9PSAnICcgJiYgZmlyc3RMaW5lWzE0XSAhPT0gJ1xcdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgY2FjaGUgbWFuaWZlc3QgaGVhZGVyOiBcIiArIGZpcnN0TGluZSk7XG4gICAgfVxuICAgIGN1cnJlbnRTZWN0aW9uID0gJ0NBQ0hFJztcbiAgICBlbnRyaWVzID0ge1xuICAgICAgY2FjaGU6IFtdLFxuICAgICAgbmV0d29yazogW10sXG4gICAgICBmYWxsYmFjazoge30sXG4gICAgICBzZXR0aW5nczogW10sXG4gICAgICB0b2tlbnM6IFtdXG4gICAgfTtcbiAgICBtb2RlID0gJ0NBQ0hFJztcbiAgICBlbnRyaWVzLnRva2VucyA9IFtcbiAgICAgIHtcbiAgICAgICAgdHlwZTogJ21hZ2ljIHNpZ25hdHVyZScsXG4gICAgICAgIHZhbHVlOiAnQ0FDSEUgTUFOSUZFU1QnXG4gICAgICB9XG4gICAgXTtcbiAgICBmb3IgKF9pID0gMCwgX2xlbiA9IGxpbmVzLmxlbmd0aDsgX2kgPCBfbGVuOyBfaSsrKSB7XG4gICAgICBsaW5lID0gbGluZXNbX2ldO1xuICAgICAgbGluZSA9IGxpbmUudHJpbSgpO1xuICAgICAgaWYgKCFsaW5lLmxlbmd0aCkge1xuICAgICAgICBlbnRyaWVzLnRva2Vucy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnbmV3bGluZSdcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKGxpbmUuaW5kZXhPZignIycpID09PSAwKSB7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdjb21tZW50JyxcbiAgICAgICAgICB2YWx1ZTogbGluZS5zdWJzdHJpbmcoMSlcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKFsnQ0FDSEU6JywgJ0ZBTExCQUNLOicsICdORVRXT1JLOicsICdTRVRUSU5HUzonXS5pbmRleE9mKGxpbmUpID49IDApIHtcbiAgICAgICAgbW9kZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGxpbmUubGVuZ3RoIC0gMSk7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdtb2RlJyxcbiAgICAgICAgICB2YWx1ZTogbW9kZVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAobGluZS5pbmRleE9mKCc6JykgPT09IChsaW5lLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgIG1vZGUgPSAndW5rbm93bic7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdtb2RlJyxcbiAgICAgICAgICB2YWx1ZTogbW9kZSxcbiAgICAgICAgICByYXc6IGxpbmVcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b2tlbnMgPSBsaW5lLnNwbGl0KC9bIF0rLyk7XG4gICAgICAgIGVudHJpZXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdkYXRhJyxcbiAgICAgICAgICB0b2tlbnM6IHRva2Vuc1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdGQUxMQkFDSycpIHtcbiAgICAgICAgICBlbnRyaWVzLmZhbGxiYWNrW3Rva2Vuc1swXV0gPSB0b2tlbnNbMV07XG4gICAgICAgIH0gZWxzZSBpZiAobW9kZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgZW50cmllc1ttb2RlLnRvTG93ZXJDYXNlKCldLnB1c2gobGluZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGVudHJpZXM7XG4gIH07XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wYXJzZS1hcHBjYWNoZS1tYW5pZmVzdC5tYXBcbiovXG4iLCJ2YXIgaXNhcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKVxuXG4vKipcbiAqIEV4cG9zZSBgcGF0aFRvUmVnZXhwYC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBwYXRoVG9SZWdleHBcbm1vZHVsZS5leHBvcnRzLnBhcnNlID0gcGFyc2Vcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGUgPSBjb21waWxlXG5tb2R1bGUuZXhwb3J0cy50b2tlbnNUb0Z1bmN0aW9uID0gdG9rZW5zVG9GdW5jdGlvblxubW9kdWxlLmV4cG9ydHMudG9rZW5zVG9SZWdFeHAgPSB0b2tlbnNUb1JlZ0V4cFxuXG4vKipcbiAqIFRoZSBtYWluIHBhdGggbWF0Y2hpbmcgcmVnZXhwIHV0aWxpdHkuXG4gKlxuICogQHR5cGUge1JlZ0V4cH1cbiAqL1xudmFyIFBBVEhfUkVHRVhQID0gbmV3IFJlZ0V4cChbXG4gIC8vIE1hdGNoIGVzY2FwZWQgY2hhcmFjdGVycyB0aGF0IHdvdWxkIG90aGVyd2lzZSBhcHBlYXIgaW4gZnV0dXJlIG1hdGNoZXMuXG4gIC8vIFRoaXMgYWxsb3dzIHRoZSB1c2VyIHRvIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCB3b24ndCB0cmFuc2Zvcm0uXG4gICcoXFxcXFxcXFwuKScsXG4gIC8vIE1hdGNoIEV4cHJlc3Mtc3R5bGUgcGFyYW1ldGVycyBhbmQgdW4tbmFtZWQgcGFyYW1ldGVycyB3aXRoIGEgcHJlZml4XG4gIC8vIGFuZCBvcHRpb25hbCBzdWZmaXhlcy4gTWF0Y2hlcyBhcHBlYXIgYXM6XG4gIC8vXG4gIC8vIFwiLzp0ZXN0KFxcXFxkKyk/XCIgPT4gW1wiL1wiLCBcInRlc3RcIiwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgXCI/XCIsIHVuZGVmaW5lZF1cbiAgLy8gXCIvcm91dGUoXFxcXGQrKVwiICA9PiBbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXVxuICAvLyBcIi8qXCIgICAgICAgICAgICA9PiBbXCIvXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCIqXCJdXG4gICcoW1xcXFwvLl0pPyg/Oig/OlxcXFw6KFxcXFx3KykoPzpcXFxcKCgoPzpcXFxcXFxcXC58W14oKV0pKylcXFxcKSk/fFxcXFwoKCg/OlxcXFxcXFxcLnxbXigpXSkrKVxcXFwpKShbKyo/XSk/fChcXFxcKikpJ1xuXS5qb2luKCd8JyksICdnJylcblxuLyoqXG4gKiBQYXJzZSBhIHN0cmluZyBmb3IgdGhlIHJhdyB0b2tlbnMuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5mdW5jdGlvbiBwYXJzZSAoc3RyKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICB2YXIga2V5ID0gMFxuICB2YXIgaW5kZXggPSAwXG4gIHZhciBwYXRoID0gJydcbiAgdmFyIHJlc1xuXG4gIHdoaWxlICgocmVzID0gUEFUSF9SRUdFWFAuZXhlYyhzdHIpKSAhPSBudWxsKSB7XG4gICAgdmFyIG0gPSByZXNbMF1cbiAgICB2YXIgZXNjYXBlZCA9IHJlc1sxXVxuICAgIHZhciBvZmZzZXQgPSByZXMuaW5kZXhcbiAgICBwYXRoICs9IHN0ci5zbGljZShpbmRleCwgb2Zmc2V0KVxuICAgIGluZGV4ID0gb2Zmc2V0ICsgbS5sZW5ndGhcblxuICAgIC8vIElnbm9yZSBhbHJlYWR5IGVzY2FwZWQgc2VxdWVuY2VzLlxuICAgIGlmIChlc2NhcGVkKSB7XG4gICAgICBwYXRoICs9IGVzY2FwZWRbMV1cbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgLy8gUHVzaCB0aGUgY3VycmVudCBwYXRoIG9udG8gdGhlIHRva2Vucy5cbiAgICBpZiAocGF0aCkge1xuICAgICAgdG9rZW5zLnB1c2gocGF0aClcbiAgICAgIHBhdGggPSAnJ1xuICAgIH1cblxuICAgIHZhciBwcmVmaXggPSByZXNbMl1cbiAgICB2YXIgbmFtZSA9IHJlc1szXVxuICAgIHZhciBjYXB0dXJlID0gcmVzWzRdXG4gICAgdmFyIGdyb3VwID0gcmVzWzVdXG4gICAgdmFyIHN1ZmZpeCA9IHJlc1s2XVxuICAgIHZhciBhc3RlcmlzayA9IHJlc1s3XVxuXG4gICAgdmFyIHJlcGVhdCA9IHN1ZmZpeCA9PT0gJysnIHx8IHN1ZmZpeCA9PT0gJyonXG4gICAgdmFyIG9wdGlvbmFsID0gc3VmZml4ID09PSAnPycgfHwgc3VmZml4ID09PSAnKidcbiAgICB2YXIgZGVsaW1pdGVyID0gcHJlZml4IHx8ICcvJ1xuICAgIHZhciBwYXR0ZXJuID0gY2FwdHVyZSB8fCBncm91cCB8fCAoYXN0ZXJpc2sgPyAnLionIDogJ1teJyArIGRlbGltaXRlciArICddKz8nKVxuXG4gICAgdG9rZW5zLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSB8fCBrZXkrKyxcbiAgICAgIHByZWZpeDogcHJlZml4IHx8ICcnLFxuICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICBvcHRpb25hbDogb3B0aW9uYWwsXG4gICAgICByZXBlYXQ6IHJlcGVhdCxcbiAgICAgIHBhdHRlcm46IGVzY2FwZUdyb3VwKHBhdHRlcm4pXG4gICAgfSlcbiAgfVxuXG4gIC8vIE1hdGNoIGFueSBjaGFyYWN0ZXJzIHN0aWxsIHJlbWFpbmluZy5cbiAgaWYgKGluZGV4IDwgc3RyLmxlbmd0aCkge1xuICAgIHBhdGggKz0gc3RyLnN1YnN0cihpbmRleClcbiAgfVxuXG4gIC8vIElmIHRoZSBwYXRoIGV4aXN0cywgcHVzaCBpdCBvbnRvIHRoZSBlbmQuXG4gIGlmIChwYXRoKSB7XG4gICAgdG9rZW5zLnB1c2gocGF0aClcbiAgfVxuXG4gIHJldHVybiB0b2tlbnNcbn1cblxuLyoqXG4gKiBDb21waWxlIGEgc3RyaW5nIHRvIGEgdGVtcGxhdGUgZnVuY3Rpb24gZm9yIHRoZSBwYXRoLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gICBzdHJcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICovXG5mdW5jdGlvbiBjb21waWxlIChzdHIpIHtcbiAgcmV0dXJuIHRva2Vuc1RvRnVuY3Rpb24ocGFyc2Uoc3RyKSlcbn1cblxuLyoqXG4gKiBFeHBvc2UgYSBtZXRob2QgZm9yIHRyYW5zZm9ybWluZyB0b2tlbnMgaW50byB0aGUgcGF0aCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gdG9rZW5zVG9GdW5jdGlvbiAodG9rZW5zKSB7XG4gIC8vIENvbXBpbGUgYWxsIHRoZSB0b2tlbnMgaW50byByZWdleHBzLlxuICB2YXIgbWF0Y2hlcyA9IG5ldyBBcnJheSh0b2tlbnMubGVuZ3RoKVxuXG4gIC8vIENvbXBpbGUgYWxsIHRoZSBwYXR0ZXJucyBiZWZvcmUgY29tcGlsYXRpb24uXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gPT09ICdvYmplY3QnKSB7XG4gICAgICBtYXRjaGVzW2ldID0gbmV3IFJlZ0V4cCgnXicgKyB0b2tlbnNbaV0ucGF0dGVybiArICckJylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBwYXRoID0gJydcbiAgICB2YXIgZGF0YSA9IG9iaiB8fCB7fVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgICBwYXRoICs9IHRva2VuXG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgdmFyIHZhbHVlID0gZGF0YVt0b2tlbi5uYW1lXVxuICAgICAgdmFyIHNlZ21lbnRcblxuICAgICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIGJlIGRlZmluZWQnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc2FycmF5KHZhbHVlKSkge1xuICAgICAgICBpZiAoIXRva2VuLnJlcGVhdCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IHJlcGVhdCwgYnV0IHJlY2VpdmVkIFwiJyArIHZhbHVlICsgJ1wiJylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBpZiAodG9rZW4ub3B0aW9uYWwpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IGJlIGVtcHR5JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHZhbHVlLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgc2VnbWVudCA9IGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZVtqXSlcblxuICAgICAgICAgIGlmICghbWF0Y2hlc1tpXS50ZXN0KHNlZ21lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbGwgXCInICsgdG9rZW4ubmFtZSArICdcIiB0byBtYXRjaCBcIicgKyB0b2tlbi5wYXR0ZXJuICsgJ1wiLCBidXQgcmVjZWl2ZWQgXCInICsgc2VnbWVudCArICdcIicpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGF0aCArPSAoaiA9PT0gMCA/IHRva2VuLnByZWZpeCA6IHRva2VuLmRlbGltaXRlcikgKyBzZWdtZW50XG4gICAgICAgIH1cblxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBzZWdtZW50ID0gZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKVxuXG4gICAgICBpZiAoIW1hdGNoZXNbaV0udGVzdChzZWdtZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIG1hdGNoIFwiJyArIHRva2VuLnBhdHRlcm4gKyAnXCIsIGJ1dCByZWNlaXZlZCBcIicgKyBzZWdtZW50ICsgJ1wiJylcbiAgICAgIH1cblxuICAgICAgcGF0aCArPSB0b2tlbi5wcmVmaXggKyBzZWdtZW50XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGhcbiAgfVxufVxuXG4vKipcbiAqIEVzY2FwZSBhIHJlZ3VsYXIgZXhwcmVzc2lvbiBzdHJpbmcuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZXNjYXBlU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oWy4rKj89XiE6JHt9KClbXFxdfFxcL10pL2csICdcXFxcJDEnKVxufVxuXG4vKipcbiAqIEVzY2FwZSB0aGUgY2FwdHVyaW5nIGdyb3VwIGJ5IGVzY2FwaW5nIHNwZWNpYWwgY2hhcmFjdGVycyBhbmQgbWVhbmluZy5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGdyb3VwXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGVzY2FwZUdyb3VwIChncm91cCkge1xuICByZXR1cm4gZ3JvdXAucmVwbGFjZSgvKFs9ITokXFwvKCldKS9nLCAnXFxcXCQxJylcbn1cblxuLyoqXG4gKiBBdHRhY2ggdGhlIGtleXMgYXMgYSBwcm9wZXJ0eSBvZiB0aGUgcmVnZXhwLlxuICpcbiAqIEBwYXJhbSAge1JlZ0V4cH0gcmVcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiBhdHRhY2hLZXlzIChyZSwga2V5cykge1xuICByZS5rZXlzID0ga2V5c1xuICByZXR1cm4gcmVcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGZsYWdzIGZvciBhIHJlZ2V4cCBmcm9tIHRoZSBvcHRpb25zLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBmbGFncyAob3B0aW9ucykge1xuICByZXR1cm4gb3B0aW9ucy5zZW5zaXRpdmUgPyAnJyA6ICdpJ1xufVxuXG4vKipcbiAqIFB1bGwgb3V0IGtleXMgZnJvbSBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtSZWdFeHB9IHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiByZWdleHBUb1JlZ2V4cCAocGF0aCwga2V5cykge1xuICAvLyBVc2UgYSBuZWdhdGl2ZSBsb29rYWhlYWQgdG8gbWF0Y2ggb25seSBjYXB0dXJpbmcgZ3JvdXBzLlxuICB2YXIgZ3JvdXBzID0gcGF0aC5zb3VyY2UubWF0Y2goL1xcKCg/IVxcPykvZylcblxuICBpZiAoZ3JvdXBzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBncm91cHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGksXG4gICAgICAgIHByZWZpeDogbnVsbCxcbiAgICAgICAgZGVsaW1pdGVyOiBudWxsLFxuICAgICAgICBvcHRpb25hbDogZmFsc2UsXG4gICAgICAgIHJlcGVhdDogZmFsc2UsXG4gICAgICAgIHBhdHRlcm46IG51bGxcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocGF0aCwga2V5cylcbn1cblxuLyoqXG4gKiBUcmFuc2Zvcm0gYW4gYXJyYXkgaW50byBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIGFycmF5VG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHBhcnRzID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJ0cy5wdXNoKHBhdGhUb1JlZ2V4cChwYXRoW2ldLCBrZXlzLCBvcHRpb25zKS5zb3VyY2UpXG4gIH1cblxuICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cCgnKD86JyArIHBhcnRzLmpvaW4oJ3wnKSArICcpJywgZmxhZ3Mob3B0aW9ucykpXG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocmVnZXhwLCBrZXlzKVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHBhdGggcmVnZXhwIGZyb20gc3RyaW5nIGlucHV0LlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICBrZXlzXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gc3RyaW5nVG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHRva2VucyA9IHBhcnNlKHBhdGgpXG4gIHZhciByZSA9IHRva2Vuc1RvUmVnRXhwKHRva2Vucywgb3B0aW9ucylcblxuICAvLyBBdHRhY2gga2V5cyBiYWNrIHRvIHRoZSByZWdleHAuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gIT09ICdzdHJpbmcnKSB7XG4gICAgICBrZXlzLnB1c2godG9rZW5zW2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdHRhY2hLZXlzKHJlLCBrZXlzKVxufVxuXG4vKipcbiAqIEV4cG9zZSBhIGZ1bmN0aW9uIGZvciB0YWtpbmcgdG9rZW5zIGFuZCByZXR1cm5pbmcgYSBSZWdFeHAuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICB0b2tlbnNcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHRva2Vuc1RvUmVnRXhwICh0b2tlbnMsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cblxuICB2YXIgc3RyaWN0ID0gb3B0aW9ucy5zdHJpY3RcbiAgdmFyIGVuZCA9IG9wdGlvbnMuZW5kICE9PSBmYWxzZVxuICB2YXIgcm91dGUgPSAnJ1xuICB2YXIgbGFzdFRva2VuID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXVxuICB2YXIgZW5kc1dpdGhTbGFzaCA9IHR5cGVvZiBsYXN0VG9rZW4gPT09ICdzdHJpbmcnICYmIC9cXC8kLy50ZXN0KGxhc3RUb2tlbilcblxuICAvLyBJdGVyYXRlIG92ZXIgdGhlIHRva2VucyBhbmQgY3JlYXRlIG91ciByZWdleHAgc3RyaW5nLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJvdXRlICs9IGVzY2FwZVN0cmluZyh0b2tlbilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHByZWZpeCA9IGVzY2FwZVN0cmluZyh0b2tlbi5wcmVmaXgpXG4gICAgICB2YXIgY2FwdHVyZSA9IHRva2VuLnBhdHRlcm5cblxuICAgICAgaWYgKHRva2VuLnJlcGVhdCkge1xuICAgICAgICBjYXB0dXJlICs9ICcoPzonICsgcHJlZml4ICsgY2FwdHVyZSArICcpKidcbiAgICAgIH1cblxuICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgICBjYXB0dXJlID0gJyg/OicgKyBwcmVmaXggKyAnKCcgKyBjYXB0dXJlICsgJykpPydcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYXB0dXJlID0gJygnICsgY2FwdHVyZSArICcpPydcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FwdHVyZSA9IHByZWZpeCArICcoJyArIGNhcHR1cmUgKyAnKSdcbiAgICAgIH1cblxuICAgICAgcm91dGUgKz0gY2FwdHVyZVxuICAgIH1cbiAgfVxuXG4gIC8vIEluIG5vbi1zdHJpY3QgbW9kZSB3ZSBhbGxvdyBhIHNsYXNoIGF0IHRoZSBlbmQgb2YgbWF0Y2guIElmIHRoZSBwYXRoIHRvXG4gIC8vIG1hdGNoIGFscmVhZHkgZW5kcyB3aXRoIGEgc2xhc2gsIHdlIHJlbW92ZSBpdCBmb3IgY29uc2lzdGVuY3kuIFRoZSBzbGFzaFxuICAvLyBpcyB2YWxpZCBhdCB0aGUgZW5kIG9mIGEgcGF0aCBtYXRjaCwgbm90IGluIHRoZSBtaWRkbGUuIFRoaXMgaXMgaW1wb3J0YW50XG4gIC8vIGluIG5vbi1lbmRpbmcgbW9kZSwgd2hlcmUgXCIvdGVzdC9cIiBzaG91bGRuJ3QgbWF0Y2ggXCIvdGVzdC8vcm91dGVcIi5cbiAgaWYgKCFzdHJpY3QpIHtcbiAgICByb3V0ZSA9IChlbmRzV2l0aFNsYXNoID8gcm91dGUuc2xpY2UoMCwgLTIpIDogcm91dGUpICsgJyg/OlxcXFwvKD89JCkpPydcbiAgfVxuXG4gIGlmIChlbmQpIHtcbiAgICByb3V0ZSArPSAnJCdcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiBub24tZW5kaW5nIG1vZGUsIHdlIG5lZWQgdGhlIGNhcHR1cmluZyBncm91cHMgdG8gbWF0Y2ggYXMgbXVjaCBhc1xuICAgIC8vIHBvc3NpYmxlIGJ5IHVzaW5nIGEgcG9zaXRpdmUgbG9va2FoZWFkIHRvIHRoZSBlbmQgb3IgbmV4dCBwYXRoIHNlZ21lbnQuXG4gICAgcm91dGUgKz0gc3RyaWN0ICYmIGVuZHNXaXRoU2xhc2ggPyAnJyA6ICcoPz1cXFxcL3wkKSdcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJvdXRlLCBmbGFncyhvcHRpb25zKSlcbn1cblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLCByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgY2FuIGJlIHBhc3NlZCBpbiBmb3IgdGhlIGtleXMsIHdoaWNoIHdpbGwgaG9sZCB0aGVcbiAqIHBsYWNlaG9sZGVyIGtleSBkZXNjcmlwdGlvbnMuIEZvciBleGFtcGxlLCB1c2luZyBgL3VzZXIvOmlkYCwgYGtleXNgIHdpbGxcbiAqIGNvbnRhaW4gYFt7IG5hbWU6ICdpZCcsIGRlbGltaXRlcjogJy8nLCBvcHRpb25hbDogZmFsc2UsIHJlcGVhdDogZmFsc2UgfV1gLlxuICpcbiAqIEBwYXJhbSAgeyhTdHJpbmd8UmVnRXhwfEFycmF5KX0gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICAgICAgICAgICAgICAgICBba2V5c11cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgICAgICAgICAgW29wdGlvbnNdXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHBhdGhUb1JlZ2V4cCAocGF0aCwga2V5cywgb3B0aW9ucykge1xuICBrZXlzID0ga2V5cyB8fCBbXVxuXG4gIGlmICghaXNhcnJheShrZXlzKSkge1xuICAgIG9wdGlvbnMgPSBrZXlzXG4gICAga2V5cyA9IFtdXG4gIH0gZWxzZSBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge31cbiAgfVxuXG4gIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgcmV0dXJuIHJlZ2V4cFRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICBpZiAoaXNhcnJheShwYXRoKSkge1xuICAgIHJldHVybiBhcnJheVRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICByZXR1cm4gc3RyaW5nVG9SZWdleHAocGF0aCwga2V5cywgb3B0aW9ucylcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKlxuICovXG5cbmlmICghQ2FjaGUucHJvdG90eXBlLmFkZEFsbCkge1xuICBDYWNoZS5wcm90b3R5cGUuYWRkQWxsID0gZnVuY3Rpb24gYWRkQWxsKHJlcXVlc3RzKSB7XG4gICAgdmFyIGNhY2hlID0gdGhpcztcblxuICAgIC8vIFNpbmNlIERPTUV4Y2VwdGlvbnMgYXJlIG5vdCBjb25zdHJ1Y3RhYmxlOlxuICAgIGZ1bmN0aW9uIE5ldHdvcmtFcnJvcihtZXNzYWdlKSB7XG4gICAgICB0aGlzLm5hbWUgPSAnTmV0d29ya0Vycm9yJztcbiAgICAgIHRoaXMuY29kZSA9IDE5O1xuICAgICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB9XG4gICAgTmV0d29ya0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlKTtcblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAxKSB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHNlcXVlbmNlPChSZXF1ZXN0IG9yIFVTVlN0cmluZyk+IGJpbmRpbmc6XG4gICAgICB2YXIgc2VxdWVuY2UgPSBbXTtcblxuICAgICAgcmVxdWVzdHMgPSByZXF1ZXN0cy5tYXAoZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICBpZiAocmVxdWVzdCBpbnN0YW5jZW9mIFJlcXVlc3QpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gU3RyaW5nKHJlcXVlc3QpOyAvLyBtYXkgdGhyb3cgVHlwZUVycm9yXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHJlcXVlc3RzLm1hcChmdW5jdGlvbihyZXF1ZXN0KSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmVxdWVzdCA9IG5ldyBSZXF1ZXN0KHJlcXVlc3QpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBzY2hlbWUgPSBuZXcgVVJMKHJlcXVlc3QudXJsKS5wcm90b2NvbDtcblxuICAgICAgICAgIGlmIChzY2hlbWUgIT09ICdodHRwOicgJiYgc2NoZW1lICE9PSAnaHR0cHM6Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IE5ldHdvcmtFcnJvcihcIkludmFsaWQgc2NoZW1lXCIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBmZXRjaChyZXF1ZXN0LmNsb25lKCkpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlcykge1xuICAgICAgLy8gVE9ETzogY2hlY2sgdGhhdCByZXF1ZXN0cyBkb24ndCBvdmVyd3JpdGUgb25lIGFub3RoZXJcbiAgICAgIC8vIChkb24ndCB0aGluayB0aGlzIGlzIHBvc3NpYmxlIHRvIHBvbHlmaWxsIGR1ZSB0byBvcGFxdWUgcmVzcG9uc2VzKVxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICByZXNwb25zZXMubWFwKGZ1bmN0aW9uKHJlc3BvbnNlLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlLnB1dChyZXF1ZXN0c1tpXSwgcmVzcG9uc2UpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9KTtcbiAgfTtcbn1cbiJdfQ==
