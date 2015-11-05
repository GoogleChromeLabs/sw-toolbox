/*
 Copyright 2015 Google Inc. All Rights Reserved.

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

var helpers = require('./helpers');
var parseManifest = require('parse-appcache-manifest');
var router = require('./router');
var strategies = require('./strategies');

var CACHE_NAME = 'appcache-manifest';

function getPathAndOptions(url) {
  var absoluteUrl = new URL(url, location.href);
  return {
    pathname: absoluteUrl.pathname,
    options: {
      origin: absoluteUrl.origin,
      cache: {
        name: CACHE_NAME
      }
    }
  };
}

module.exports = function(manifestUrl) {
  helpers.debug('Configuring service worker based on AppCache Manifest file: ' + manifestUrl);
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
      helpers.debug('Using cache-only strategy by default.');
      router.default = function(request) {
        return strategies.cacheOnly(request, {}, {cache: {name: CACHE_NAME}});
      };
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
        }).catch(function() {
          helpers.debug('Falling back to cached entry for ' + absoluteFallbackUrlString);
          return strategies.cacheOnly(absoluteFallbackUrlString, {}, options);
        });
      }, originalUrlPathAndOptions.options);
    });

    return urlsToCache;
  }).then(function(urlsToCache) {
    helpers.debug('URLs to cache: ' + JSON.stringify(urlsToCache));
    // cache.addAll() is currently partially implemented and buggy in Chrome 48.
    // Once it's stable, that can be used instead.
    return Promise.all(urlsToCache.map(function(url) {
      return helpers.openCache({cache: {name: CACHE_NAME}}).then(function(cache) {
        return cache.add(url);
      });
    }));
  }).catch(function(error) {
    helpers.debug('Failed to use AppCache Manifest: ' + error);
  });
};
