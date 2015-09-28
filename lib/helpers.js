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
var idbCacheExpiration = require('./idb-cache-expiration');

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
    // Only cache GET requests with successful responses.
    // Since this is not part of the promise chain, it will be done asynchronously and will not
    // block the response from being returned to the page.
    if (request.method === 'GET' && successResponses.test(response.status)) {
      openCache(options).then(function(cache) {
        cache.put(request, response).then(function() {
          // This will be false-y if maxCacheEntries is set to 0, but that should be fine.
          // Using a maximum cache size of 0 is incompatible with caching.
          if (options.maxCacheEntries || globalOptions.maxCacheEntries ||
              options.maxCacheAgeSeconds || globalOptions.maxCacheAgeSeconds) {
            queueCacheExpiration(request, cache, options);
          }
        });
      });
    }

    return response.clone();
  });
}

var cacheExpirationPromiseChain;
function queueCacheExpiration(request, cache, options) {
  var cacheExpiration = cacheExpirationPromiseFactory.bind(null, request, cache, options);

  if (cacheExpirationPromiseChain) {
    cacheExpirationPromiseChain = cacheExpirationPromiseChain.then(cacheExpiration);
  } else {
    cacheExpirationPromiseChain = cacheExpiration();
  }
}

function cacheExpirationPromiseFactory(request, cache, options) {
  var cacheName = options.cacheName || globalOptions.cacheName;
  var maxCacheEntries = options.maxCacheEntries || globalOptions.maxCacheEntries;
  var maxCacheAgeSeconds = options.maxCacheAgeSeconds || globalOptions.maxCacheAgeSeconds;
  var requestUrl = request.url;

  var now = Date.now();
  debug('Updating LRU order for ' + requestUrl + '. Max entries is ' + maxCacheEntries +
    ', max age is ' + maxCacheAgeSeconds, options);

  return idbCacheExpiration.getDb(cacheName).then(function(db) {
    return idbCacheExpiration.setTimestampForUrl(db, requestUrl, now);
  }).then(function(db) {
    return idbCacheExpiration.expireEntries(db, maxCacheEntries, maxCacheAgeSeconds, now);
  }).then(function(urlsToDelete) {
    debug('Successfully updated IDB.', options);

    var deletionPromises = urlsToDelete.map(function(urlToDelete) {
      return cache.delete(urlToDelete);
    });

    return Promise.all(deletionPromises).then(function() {
      debug('Done with cache cleanup.', options);
    });
  }).catch(function(error) {
    debug(error, options);
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
