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
importScripts('/test/data/skip-and-claim.js');
importScripts('/test/data/router-methods-helper.js');

const method = self.getMethodToTest();
const domainName = 'progress-web-app-sw-toolbox-domain.com';

// Testing the origin option
self.toolbox.router[method]('/origin-option-regex', function() {
  return new Response('/origin-option-regex');
}, {origin: /progress-web-app-sw-toolbox-domain\.com/});

self.toolbox.router[method]('/origin-option-string', function() {
  return new Response('/origin-option-string');
}, {origin: `${domainName}`});

self.toolbox.router[method]('/https-only-string',
  function() {
    return new Response('/https-only-string');
  }, {origin: `https://${domainName}`});

// Testing the regex route approach
self.toolbox.router[method](/progress-web-app-sw-toolbox-domain\.com\/soft-origin-regex-route/,
  function() {
    return new Response('/soft-origin-regex-route');
  }
);

self.toolbox.router[method](
  /http(s)?:\/\/progress-web-app-sw-toolbox-domain\.com\/hard-origin-regex-route/,
  function() {
    return new Response('/hard-origin-regex-route');
  }
);

self.toolbox.router[method](/https:\/\/progress-web-app-sw-toolbox-domain\.com\/https-only-regex/,
  function() {
    return new Response('/https-only-regex');
  }
);

// This is simply here so no actual requests are made
// to developers.google.com
// default route doesn't work for post requests, this should
// work for all methods
self.toolbox.router[method](/.*\/progress-web-app-sw-toolbox-domain\.com\/.*/,
  function() {
    return new Response('/default');
  }
);
