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

describe('Test toolbox.networkFirst', function() {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/network-first/serviceworkers';

  it('should retrieve the first value from the network', function() {
    let iframe;
    const TEST_INPUT = 'hello';
    return swUtils.activateSW(serviceWorkersFolder + '/network-first.js')
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
      return new Promise(resolve => {
        // Give the networkFirst step time to respond to request and
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

  it.skip('should retrieve the value from the cache for a bad network request', function() {
    let iframe;
    const TEST_INPUT = 'hello';
    return swUtils.activateSW(serviceWorkersFolder + '/network-first.js')
    .then(newIframe => {
      iframe = newIframe;
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.put('/test/browser-tests/network-first/doesnt-exist', new Response(TEST_INPUT));
    })
    .then(() => {
      // Call the iframes fetch event so it goes through the service worker
      return iframe.contentWindow.fetch('/test/browser-tests/network-first/doesnt-exist');
    })
    .then(response => {
      response.status.should.equal(200);
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal(TEST_INPUT);
    })
    .then(() => {
      return window.caches.open('test-cache-name');
    })
    .then(cache => {
      return cache.match('/test/browser-tests/network-first/doesnt-exist');
    })
    .then(response => {
      return response.text();
    })
    .then(responseText => {
      responseText.trim().should.equal(TEST_INPUT);
    });
  });

  it('should handle redirects correctly', () => {
    return swUtils.activateSW(serviceWorkersFolder + '/redirects.js')
    .then(() => {
      const redirectTest = () => {
        return swUtils.getIframe()
          .then(iframe => {
            // Call the iframes fetch event so it goes through the service worker
            return iframe.contentWindow.fetch('/test/helper/redirect', {
              credentials: 'same-origin'
            });
          })
          .then(response => {
            response.status.should.equal(200);
            return response.json();
          })
          .then(response => {
            if (!response.redirect) {
              throw new Error('Unexpected response from server');
            }

            return swUtils.getIframe()
            .then(iframe => {
              // Call the iframes fetch event so it goes through the service worker
              return iframe.contentWindow.fetch(response.redirect, {
                credentials: 'same-origin'
              });
            });
          })
          .then(response => {
            response.status.should.equal(200);
            return response.json();
          })
          .then(response => {
            if (!response.success) {
              throw new Error('Unexpected response from server');
            }
          });
      };

      // Imagine a user coming to a site multiple times.
      // This should catch caching states
      return redirectTest()
      .then(() => {
        return redirectTest();
      });
    });
  });
});
