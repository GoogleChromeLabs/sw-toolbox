'use strict';

require('serviceworker-cache-polyfill/lib/caches');
var router = require('./router');

var version = 1;
var cachePrefix = 'shed-' + self.scope + '-';
var cacheName = cachePrefix + version;
var preCacheItems = [];
var DEBUG = false;

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
    openCache().then(function(cache) {
      cache.put(request, response);
    });

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
  return fetchAndCache(request).catch(function(error) {
    debug('Cache fallback');
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
