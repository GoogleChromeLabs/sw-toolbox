/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/* eslint-env browser */

var testCounter = 0;

// Each service worker that is registered should be given a unique
// scope. To achieve this we register it with a scope the same as
// an iframe's src that is unique for each test.
// Service workers will then be made to claim pages on this scope -
// i.e. the iframe
var getIframe = function() {
  return new Promise(resolve => {
    var existingIframe = document.querySelector('.js-test-iframe');
    if (existingIframe) {
      return resolve(existingIframe);
    }

    // This will be used as a unique service worker scope
    testCounter++;

    var newIframe = document.createElement('iframe');
    newIframe.classList.add('js-test-iframe');
    newIframe.src = '/test/iframe/' + testCounter;
    newIframe.addEventListener('load', () => {
      resolve(newIframe);
    });
    document.body.appendChild(newIframe);
  });
};

window.testHelper = {
  unregisterAllRegistrations: function() {
    return navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        return Promise.all(registrations.map(registration => {
          registration.unregister();
        }));
      });
  },

  clearAllCaches: function() {
    return window.caches.keys()
      .then(cacheNames => {
        return Promise.all(cacheNames.map(cacheName => {
          window.caches.delete(cacheName);
        }));
      });
  },

  // Waiting for a service worker to install is handy if you only care
  // about testing events that have occured in the install event
  installSW: function(swUrl) {
    return new Promise((resolve, reject) => {
      var iframe;
      getIframe()
      .then(newIframe => {
        var options = null;
        if (newIframe) {
          options = {scope: iframe.contentWindow.location.pathname};
          iframe = newIframe;
        }

        return navigator.serviceWorker.register(swUrl, options);
      })
      .then(registration => {
        if (registration.installing === null) {
          throw new Error(swUrl + ' already installed.');
        }

        // We unregister all service workers after each test - this should
        // always trigger an install state change
        registration.installing.onstatechange = function() {
          if (this.state !== 'installed') {
            return;
          }

          resolve(iframe);
        };
      })
      .catch(err => {
        reject(err);
      });
    });
  },

  // To test fetch event behaviour in a service worker you will need to wait
  // for the service worker to activate
  activateSW: function(swUrl) {
    return new Promise((resolve, reject) => {
      var iframe;
      getIframe()
      .then(newIframe => {
        var options = null;
        if (newIframe) {
          options = {scope: newIframe.contentWindow.location.pathname};
          iframe = newIframe;
        }
        return navigator.serviceWorker.register(swUrl, options);
      })
      .then(registration => {
        if (registration.installing === null) {
          throw new Error(swUrl + ' already installed.');
        }

        // We unregister all service workers after each test - so this should
        // always have an activate event if the service worker calls
        // self.clients.claim()
        registration.installing.onstatechange = function() {
          if (this.state !== 'activated') {
            return;
          }

          resolve(iframe);
        };
      })
      .catch(err => {
        reject(err);
      });
    });
  },

  // This is a helper method that checks the cache exists before
  // getting all the cached responses.
  // This is limited to text at the moment.
  getAllCachedAssets: function(cacheName) {
    var cache = null;
    return window.caches.has(cacheName)
      .then(hasCache => {
        if (!hasCache) {
          throw new Error('Cache doesn\'t exist.');
        }

        return window.caches.open(cacheName);
      })
      .then(openedCache => {
        cache = openedCache;
        return cache.keys();
      })
      .then(cacheKeys => {
        return Promise.all(cacheKeys.map(cacheKey => {
          return cache.match(cacheKey);
        }));
      })
      .then(cacheResponses => {
        // This method extracts the response streams and pairs
        // them with a url.
        var output = {};
        cacheResponses.map(response => {
          output[response.url] = response;
        });
        return output;
      });
  },

  // Helper to unregister all service workers and clean all caches
  // This should be called before each test
  cleanState: function() {
    return Promise.all([
      this.unregisterAllRegistrations(),
      this.clearAllCaches()
    ])
    .then(() => {
      var iframeList = document.querySelectorAll('.js-test-iframe');
      for (var i = 0; i < iframeList.length; i++) {
        iframeList[i].parentElement.removeChild(iframeList[i]);
      }
    });
  }
};
