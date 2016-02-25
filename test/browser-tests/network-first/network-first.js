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

describe('Test networkFirst Routing', function() {
  const serviceWorkersFolder = '/test/browser-tests/network-first/serviceworkers';


  it('should handle redirects correctly', done => {
    testHelper.activateSW(serviceWorkersFolder + '/redirects.js')
    .then(() => {
      const redirectTest = () => {
        return testHelper.getIframe()
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
            console.log(response);
            if (!response.redirect) {
              throw new Error('Unexpected response from server');
            } else {
              return testHelper.getIframe()
              .then(iframe => {
                // Call the iframes fetch event so it goes through the service worker
                return iframe.contentWindow.fetch(response.redirect, {
                  credentials: 'same-origin'
                });
              });
            }
          })
          .then(response => {
            response.status.should.equal(200);
            return response.json();
          })
          .then(response => {
            console.log(response);
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
      })
    })
    .then(() => done())
    .catch(done);
  });
});
