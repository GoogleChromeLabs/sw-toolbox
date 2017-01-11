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

describe('Test toolbox.cacheOnly', function() {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/cache-only/serviceworkers';

  it('should return nothing from the empty cache', function() {
    return swUtils.activateSW(serviceWorkersFolder + '/cache-only.js')
    .then(iframe => {
      return iframe.contentWindow.fetch('/get-cache-value');
    })
    .then(() => {
      throw new Error('This shouldn\'t have returned a value');
    }, () => {
      // NOOP
    });
  });

  it('should return value from the cache', function() {
    const date = String(Date.now());
    let iframe;
    return swUtils.activateSW(serviceWorkersFolder + '/cache-only.js')
    .then(newIframe => {
      iframe = newIframe;
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.put('/get-cache-value', new Response(date));
    })
    .then(() => {
      return iframe.contentWindow.fetch('/get-cache-value');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(response => {
      response.should.equal(String(date));
    });
  });

  it('should return value from the cache', function() {
    const date = String(Date.now());
    let iframe;
    return swUtils.activateSW(serviceWorkersFolder + '/cache-only.js')
    .then(newIframe => {
      iframe = newIframe;
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.put('/get-cache-value', new Response(date));
    })
    .then(() => {
      return iframe.contentWindow.fetch('/get-cache-value');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(response => {
      response.should.equal(String(date));
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.delete('/get-cache-value');
    })
    .then(() => {
      return iframe.contentWindow.fetch('/get-cache-value');
    })
    .then(() => {
      throw new Error('This should have rejected');
    }, () => {
      // NOOP - Error is valid here
    });
  });
});
