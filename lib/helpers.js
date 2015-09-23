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
var simpleDB = require('./simple-db');

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
          if (options.maxCacheEntries || globalOptions.maxCacheEntries) {
            queueCacheExpiration(request, cache, options);
          }
        });
      });
    }

    return response.clone();
  });
}

var staticIdb;
function idbPromise() {
  if (staticIdb) {
    return Promise.resolve(staticIdb);
  }

  return simpleDB.open('sw-toolbox-lru-order').then(function(idb) {
    staticIdb = idb;
    return staticIdb;
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

  debug('Updating LRU order for ' + request.url + '. Max entries is ' + maxCacheEntries);
  return idbPromise().then(function(idb) {
    return idb.get(cacheName).then(function(lruOrder) {
      if (!Array.isArray(lruOrder)) {
        lruOrder = [];
      }

      var url = request.url;
      var oldIndex = lruOrder.indexOf(url);
      if (oldIndex > 0) {
        // If url already is in the array, and it's not in the first position, remove it.
        lruOrder.splice(oldIndex, 1);
      }
      if (oldIndex !== 0) {
        // If url isn't already in the first position, add it there.
        lruOrder.unshift(url);
      }

      if (lruOrder.length > maxCacheEntries) {
        // If we're over the cap, remove the last entry from the array (representing the least-used
        // item) from the cache and then resolve with lruOrder.
        var urlToRemove = lruOrder.pop();
        debug('Expiring the least-recently used resource, ' + urlToRemove);
        return cache.delete(urlToRemove).then(function() {
          debug(urlToRemove + ' was successfully deleted.');
          return lruOrder;
        });
      }

      // If we're under the cap, then just resolve with the new lruOrder.
      return lruOrder;
    }).then(function(lruOrder) {
      return idb.set(cacheName, lruOrder).then(function() {
        debug('Successfully updated IDB with the new LRU order.');
      });
    });
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
