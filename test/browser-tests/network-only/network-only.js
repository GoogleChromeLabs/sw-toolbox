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

/* eslint-env browser, mocha */

'use strict';

describe('Test toolbox.networkOnly', function() {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/network-only/serviceworkers';

  it('should retrieve the first value from the network and not put anything in the cache', function() {
    let iframe;
    return swUtils.activateSW(serviceWorkersFolder + '/network-only.js')
    .then(newIframe => {
      iframe = newIframe;
      // Call the iframes fetch event so it goes through the service worker
      return iframe.contentWindow.fetch('/test/data/files/text.txt');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal('Hello, World!');
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.match('/test/data/files/text.txt');
    })
    .then(response => {
      console.log(response);
      (typeof response).should.equal('undefined');
    });
  });

  it('should retrieve the first value from the network and not update teh cache', function() {
    let iframe;
    const TEST_INPUT = 'hello';
    return swUtils.activateSW(serviceWorkersFolder + '/network-only.js')
    .then(newIframe => {
      iframe = newIframe;
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.put('/test/data/files/text.txt', new Response(TEST_INPUT));
    })
    .then(() => {
      // Call the iframes fetch event so it goes through the service worker
      return iframe.contentWindow.fetch('/test/data/files/text.txt');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal('Hello, World!');
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.match('/test/data/files/text.txt');
    })
    .then(response => {
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal(TEST_INPUT);
    });
  });
});
