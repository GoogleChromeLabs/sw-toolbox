/*
  Copyright 2016 Google Inc. All Rights Reserved.

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

/* eslint-env worker, serviceworker */

// This test looks at what would happen with multiple install events.
// This should cache all assets in both the install and precache steps

importScripts('/sw-toolbox.js');

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('precache-custom-install')
    .then(function(cache) {
      return cache.add('/test/data/files/text-2.txt');
    })
  );
});

self.toolbox.options.cache = {
  name: 'precache-custom-install-toolbox'
};

self.toolbox.precache([
  '/test/data/files/text.txt',
  '/test/data/files/text-1.txt'
]);

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('precache-custom-install')
    .then(function(cache) {
      return cache.add('/test/data/files/text-3.txt');
    })
  );
});
