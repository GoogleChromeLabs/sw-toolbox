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

var cacheFirst = require('./strategies/cacheFirst');
var globalOptions = require('./options');
var networkOnly = require('./strategies/networkOnly');
var parseManifest = require('parse-appcache-manifest');
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
        router.default = networkOnly;
      } else {
        // If this isn't '*' then set up an explicit network-only handler for anything that matches
        // that URL prefix.
        var absoluteUrl = new URL(url, location.href);
        router.get(absoluteUrl.pathname + '(.*)', networkOnly);
      }
    });

    // CACHE section:
    // Cache all the items that are explicitly mentioned here.
    var urlsToCache = parsedManifest.cache;

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

      // We also need to cache anything that's being used as a fallback.
      urlsToCache.push(absoluteFallbackUrlString);

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
  }).then(function(urlsToCache) {
    return openCache().then(function(cache) {
      return cache.addAll(urlsToCache);
    });
  });
}

module.exports = {
  appCacheManifest: appCacheManifest,
  debug: debug,
  fetchAndCache: fetchAndCache,
  openCache: openCache,
  renameCache: renameCache
};
