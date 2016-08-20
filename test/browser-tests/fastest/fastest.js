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

describe('Test toolbox.fastest', function() {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/fastest/serviceworkers';

  it('should return network value and add it to the cache', function() {
    return swUtils.activateSW(serviceWorkersFolder + '/fastest.js')
    .then(iframe => {
      return iframe.contentWindow.fetch('/test/data/files/text.txt');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal('Hello, World!');
      return new Promise(resolve => {
        // Give the fastest step time to respond to request and
        // update the cache
        setTimeout(resolve, 500);
      });
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.match('/test/data/files/text.txt');
    })
    .then(response => {
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal('Hello, World!');
    });
  });

  it('should return cache or network value and update the cache with the network value', function() {
    let iframe;
    const TEST_INPUT = 'hello';
    return swUtils.activateSW(serviceWorkersFolder + '/fastest.js')
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
      return iframe.contentWindow.fetch('/test/data/files/text.txt');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(responseText => {
      if (responseText.trim() !== 'Hello, World!' &&
        responseText !== TEST_INPUT) {
        throw new Error('Reponse is neither the cache or response.');
      }
      return new Promise(resolve => {
        // Give the fastest step time to respond to request and
        // update the cache
        setTimeout(resolve, 500);
      });
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.match('/test/data/files/text.txt');
    })
    .then(response => {
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal('Hello, World!');
    });
  });
});
