'use strict';

require('serviceworker-cache-polyfill/lib/caches');
var globalOptions = require('./options');
var savedState = require('./savedState');
var router = require('./router');
var helpers = require('./helpers');
var strategies = require('./strategies');

helpers.debug('Shed is loading');

// Install

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || self.location;
}
var cachePrefix = '$$$shed-cache$$$' + scope + '$$$';

function createCache() {
  helpers.debug('creating new cache');
  return savedState.get('lastInstalledVersion').then(function(lastVersion) {
    var version = lastVersion + 1;
    var name = cachePrefix + version;
    helpers.debug('creating cache [' + name + ']');

    return Promise.all([
      savedState.set('lastInstalledVersion', version),
      savedState.set('lastInstalledCache', name)
    ]).then(function() {
      return helpers.openCache({cacheName: name});
    });
  });
}

function initializeCache(cache) {
  helpers.debug('preCache list: ' + (globalOptions.preCacheItems.join(', ') || '(none)'));
  return cache.addAll(globalOptions.preCacheItems);
}

self.addEventListener('install', function(event) {
  helpers.debug('install event fired');
  event.waitUntil(createCache().then(initializeCache));
});

// Activate

function filterCacheNames(currentCacheName, names) {
  helpers.debug('Filtering caches: ' + currentCacheName + '[' + names.join(', ') + ']');
  return names.filter(function(name) {
    return (name.indexOf(cachePrefix) === 0 && name !== currentCacheName);
  });
}

function deleteCache(name) {
  helpers.debug('Deleting an old cache: [' + name + ']');
  return caches.delete(name);
}

function deleteCaches(names) {
  return Promise.all(names.map(deleteCache));
}

function deleteOldCaches() {
  helpers.debug('removing old caches');
  return Promise.all([
    savedState.get('lastInstalledCache'),
    caches.keys()
  ]).then(function(results) {
    return filterCacheNames(results[0], results[1]);
  }).then(deleteCaches);
}

function setActiveCache() {
  helpers.debug('Making last installed cache active');
  return savedState.get('lastInstalledCache').then(function(name) {
    return savedState.set('lastActivatedCache', name);
  });
}

self.addEventListener('activate', function(event) {
  helpers.debug('activate event fired');
  event.waitUntil(deleteOldCaches().then(setActiveCache));
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
  globalOptions.preCacheItems = globalOptions.preCacheItems.concat(items);
}

module.exports = {
  networkOnly: strategies.networkOnly,
  networkFirst: strategies.networkFirst,
  cacheOnly: strategies.cacheOnly,
  cacheFirst: strategies.cacheFirst,
  fastest: strategies.fastest,
  router: router,
  options: globalOptions,
  cache: cache,
  uncache: uncache,
  precache: precache
};
