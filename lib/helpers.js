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

function getCacheName(options) {
  var cacheName;
  if (options && options.cache) {
    cacheName = options.cache.name;
  }
  return cacheName || globalOptions.cache.name;
}

function openCache(options) {
  var cacheName = getCacheName(options);
  return caches.open(cacheName);
}

function fetchAndCache(request, options) {
  options = options || {};
  var successResponses = options.successResponses ||
      globalOptions.successResponses;

  return fetch(request.clone()).then(function(response) {
    var clonedResponse = response.clone();

    // Only cache GET requests with successful responses.
    // Since this is not part of the promise chain, it will be done
    // asynchronously and will not block the response from being returned to the
    // page.
    if (request.method === 'GET' && successResponses.test(response.status)) {
      openCache(options).then(function(cache) {
        // If any of the options are provided in options.cache then use them.
        // Do not fallback to the global options for any that are missing
        // unless they are all missing.
        var cacheOptions = options.cache || globalOptions.cache;

        var readyForCacheUpdate = Promise.resolve();
        var shouldNotify = false;
        if (cacheOptions.notifyOnCacheUpdate) {
          // The readyForCacheUpdate promise will resolve once we've read in
          // the previously cached entry.
          readyForCacheUpdate = cache.match(request)
            .then(function(cachedResponse) {
              if (cachedResponse && !sameResponses(cachedResponse, response)) {
                debug('sameResponses was false.');
                shouldNotify = true;
              } else {
                debug('sameResponses was true.');
              }
            });
        }

        // To ensure that notifyOnCacheUpdate works, wait to update the cache
        // until after we've had a chance to read the previously cached entry.
        readyForCacheUpdate.then(function() {
          cache.put(request, response).then(function() {
            // Only run the cache expiration logic if at least one of the
            // maximums is set, and if we have a name for the cache that the
            // options are being applied to.
            if ((cacheOptions.maxEntries || cacheOptions.maxAgeSeconds) &&
              cacheOptions.name) {
              queueCacheExpiration(request, cache, cacheOptions);
            }
          }).then(function() {
            if (shouldNotify) {
              notifyClientsOfUpdate(request.url, getCacheName(options));
            }
          });
        });
      });
    }

    return clonedResponse;
  });
}

function sameResponses(responseA, responseB) {
  // If the responses are both same-origin, then we'll have the full set of
  // headers available to check.
  // See https://fetch.spec.whatwg.org/#cors-safelisted-response-header-name for
  // a list of headers that are exposed for CORS requests. Only last-modified
  // is present in that list, so if we're dealing with CORS resources, hopefully
  // last-modified is being set by the remote server.
  return ['content-length', 'last-modified', 'etag'].every(function(header) {
    return (responseA.headers.has(header) === responseB.headers.has(header)) &&
      (responseA.headers.get(header) === responseB.headers.get(header));
  });
}

function notifyClientsOfUpdate(url, cacheName) {
  self.clients.matchAll().then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({
        type: 'cache-updated',
        source: 'sw-toolbox',
        cacheName: cacheName,
        url: url
      });
    });
  });
}

var cleanupQueue;
function queueCacheExpiration(request, cache, cacheOptions) {
  var cleanup = cleanupCache.bind(null, request, cache, cacheOptions);

  if (cleanupQueue) {
    cleanupQueue = cleanupQueue.then(cleanup);
  } else {
    cleanupQueue = cleanup();
  }
}

function cleanupCache(request, cache, cacheOptions) {
  var requestUrl = request.url;
  var maxAgeSeconds = cacheOptions.maxAgeSeconds;
  var maxEntries = cacheOptions.maxEntries;
  var cacheName = cacheOptions.name;

  var now = Date.now();
  debug('Updating LRU order for ' + requestUrl + '. Max entries is ' +
    maxEntries + ', max age is ' + maxAgeSeconds);

  return idbCacheExpiration.getDb(cacheName).then(function(db) {
    return idbCacheExpiration.setTimestampForUrl(db, requestUrl, now);
  }).then(function(db) {
    return idbCacheExpiration.expireEntries(db, maxEntries, maxAgeSeconds, now);
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
