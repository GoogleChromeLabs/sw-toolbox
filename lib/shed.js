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
