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

describe('Test Options Parameters', function() {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/options/serviceworkers';

  const pausePromise = timeout => {
    return new Promise(function(resolve) {
      setTimeout(resolve, timeout);
    });
  };

  const cleanUpIDB = () => {
    return new Promise(resolve => {
      const req = indexedDB.deleteDatabase('sw-toolbox-options-test');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  };

  beforeEach(function() {
    // Clear IndexDB - Used for max age / max Entries
    return cleanUpIDB();
  });

  after(function() {
    // Clear IndexDB - Used for max age / max Entries
    return cleanUpIDB();
  });

  describe('options.cache.maxEntries', function() {
    it('should cache according to global maxEntries option', function() {
      const urls = [
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];

      return swUtils.activateSW(serviceWorkersFolder + '/max-entries-global.js')
      .then(iframe => {
        return urls.reduce((promiseChain, url) => {
          return promiseChain
          .then(() => {
            // Pause is to ensure the cache has had time to finish.
            return iframe.contentWindow.fetch(url)
            .then(pausePromise.bind(null, 500));
          });
        }, Promise.resolve());
      })
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(2);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-2.txt').should.not.equal(-1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-3.txt').should.not.equal(-1);
      });
    });

    it('should cache according to route specific maxEntries option', function() {
      const urls = [
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];

      return swUtils.activateSW(serviceWorkersFolder + '/max-entries-route.js')
      .then(iframe => {
        return urls.reduce((promiseChain, url) => {
          return promiseChain
          .then(() => {
            // Pause is to ensure the cache has had time to finish.
            return iframe.contentWindow.fetch(url)
            .then(pausePromise.bind(null, 500));
          });
        }, Promise.resolve());
      })
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(2);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-2.txt').should.not.equal(-1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-3.txt').should.not.equal(-1);
      });
    });
  });

  describe('options.cache.maxAgeSeconds', function() {
    it('should cache according to global maxAgeSeconds option', function() {
      const urls = [
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];

      return swUtils.activateSW(serviceWorkersFolder + '/max-cache-age-global.js')
      .then(iframe => {
        return urls.reduce((promiseChain, url, index) => {
          return promiseChain
          .then(() => {
            return iframe.contentWindow.fetch(url)
            .then(() => {
              if (index === 0) {
                return pausePromise(1500);
              }
            });
          });
        }, Promise.resolve());
      })
      .then(() => {
        // Give cache time to settle
        return pausePromise(500);
      })
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(2);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-2.txt').should.not.equal(-1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-3.txt').should.not.equal(-1);
      });
    });

    it('should cache according to route specific maxAgeSeconds option', function() {
      const urls = [
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];

      return swUtils.activateSW(serviceWorkersFolder + '/max-cache-age-route.js')
      .then(iframe => {
        return urls.reduce((promiseChain, url, index) => {
          return promiseChain
          .then(() => {
            // Pause is to ensure the cache has had time to finish.
            return iframe.contentWindow.fetch(url)
            .then(() => {
              if (index === 0) {
                return pausePromise(1500);
              }
            });
          });
        }, Promise.resolve());
      })
      .then(() => {
        // Give cache time to settle
        return pausePromise(500);
      })
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(2);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-2.txt').should.not.equal(-1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-3.txt').should.not.equal(-1);
      });
    });
  });

  describe('options.cache.maxEntries && options.cache.maxAgeSeconds', function() {
    it('should cache according to global maxEntries & maxAgeSeconds option', function() {
      this.timeout(8000);
      const urls = [
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];

      let iframe;
      return swUtils.activateSW(serviceWorkersFolder + '/max-cache-age-global.js')
      .then(newIframe => {
        iframe = newIframe;
        return urls.reduce((promiseChain, url, index) => {
          return promiseChain
          .then(() => {
            return iframe.contentWindow.fetch(url)
            .then(() => {
              if (index === 0) {
                return pausePromise(1500);
              }
            });
          });
        }, Promise.resolve());
      })
      .then(() => pausePromise(500))
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(2);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-2.txt').should.not.equal(-1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-3.txt').should.not.equal(-1);
      })
      .then(() => pausePromise(1500))
      .then(() => {
        return iframe.contentWindow.fetch('/test/data/files/text-4.txt');
      })
      .then(() => pausePromise(500))
      .then(() => {
        return swUtils.getAllCachedAssets('options-test');
      })
      .then(cachedAssets => {
        Object.keys(cachedAssets).length.should.equal(1);
        Object.keys(cachedAssets).indexOf(location.origin + '/test/data/files/text-4.txt').should.not.equal(-1);
      });
    });
  });
});
