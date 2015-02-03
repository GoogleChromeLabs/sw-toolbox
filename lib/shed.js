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
