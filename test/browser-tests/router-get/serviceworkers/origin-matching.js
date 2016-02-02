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

importScripts('/sw-toolbox.js');

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// This is simply here so no actual requests are made
// to developers.google.com
self.toolbox.router.default = () => {
  return new Response('/default');
};

// Testing the origin option
self.toolbox.router.get('/origin-option-regex', function() {
  return new Response('/origin-option-regex');
}, {origin: /developers\.google\.com/});

self.toolbox.router.get('/origin-option-string', function() {
  return new Response('/origin-option-string');
}, {origin: 'developers.google.com'});

self.toolbox.router.get('/https-only-string',
  function() {
    return new Response('/https-only-string');
  }, {origin: 'https://developers.google.com'});

// Testing the regex route approach
self.toolbox.router.get(/developers\.google\.com\/soft-origin-regex-route/,
  function() {
    return new Response('/soft-origin-regex-route');
  }
);

self.toolbox.router.get(
  /http(s)?:\/\/developers\.google\.com\/hard-origin-regex-route/,
  function() {
    return new Response('/hard-origin-regex-route');
  }
);

self.toolbox.router.get(/https:\/\/developers\.google\.com\/https-only-regex/,
  function() {
    return new Response('/https-only-regex');
  }
);
