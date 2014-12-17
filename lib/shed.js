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

    return networkFetch(request);
  });
}

function fastest(request) {
  var rejected = false;
  var reasons = [];

  var maybeReject = function(reason) {
    reasons.push(reason);
    if (rejected) {
      return Promise.reject(reasons);
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
