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
