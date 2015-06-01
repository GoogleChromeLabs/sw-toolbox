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

require('serviceworker-cache-polyfill');
var options = require('./options');
var router = require('./router');
var helpers = require('./helpers');
var strategies = require('./strategies');

helpers.debug('Service Worker Toolbox is loading');

// Install

self.addEventListener('install', function(event) {
  var inactiveCache = options.cacheName + '$$$inactive$$$';
  helpers.debug('install event fired');
  helpers.debug('creating cache [' + inactiveCache + ']');
  helpers.debug('preCache list: ' + (options.preCacheItems.join(', ') || '(none)'));
  event.waitUntil(
    helpers.openCache({cacheName: inactiveCache}).then(function(cache) {
      return Promise.all(options.preCacheItems).then(cache.addAll.bind(cache));
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
  cache: helpers.cache,
  uncache: helpers.uncache,
  precache: precache
};
