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

describe('Test precache method', function() {
  const swUtils = window.goog.swUtils;

  let compareCachedAssets = (assetList, cachedAssets) => {
    // We make a set to ensure duplicates are removed from the asset list
    let assetSet = new Set(assetList);

    return new Promise((resolve, reject) => {
      let cachedAssetsKeys = Object.keys(cachedAssets);
      cachedAssetsKeys.should.have.length(assetSet.size);

      for (let assetPath of assetSet) {
        let key = location.origin + assetPath;
        if (typeof cachedAssets[key] === 'undefined') {
          reject(new Error('Cache doesn\'t have a cache item for: ' + key));
        }

        cachedAssets[key].status.should.equal(200);
      }

      resolve();
    });
  };

  const serviceWorkersFolder = '/test/browser-tests/precache/serviceworkers';

  describe('Test precache(<Array>)', function() {
    it('should precache all desired assets from an array of strings', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-strings.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from an array of requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-requests.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from an array of strings and requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-mix.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });
  });

  describe('Test precache(<Promise>)', function() {
    it('should precache all desired assets from a promise that results in an array of strings', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/promise-to-strings.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from a promise that results in an array of requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/promise-to-requests.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from a promise that results in an array of requests and strings', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/promise-to-mix.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });
  });

  describe('Test Multiple precache() Calls', function() {
    it('should precache all desired assets from multiple precache calls passing in an array of strings', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt',
        '/test/data/files/text-4.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/multiple-calls-strings.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from multiple precache calls passing in an array of requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt',
        '/test/data/files/text-4.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/multiple-calls-requests.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from multiple precache calls passing in a promise', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt',
        '/test/data/files/text-4.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/multiple-calls-promises.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from multiple precache calls passing in arrays or promises', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt',
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt',
        '/test/data/files/text-4.txt',
        '/test/data/files/text-5.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/multiple-calls-mix.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });
  });

  describe('Test precaching Edge Cases', function() {
    it('should precache all assets from precache and custom install listeners', () => {
      let toolboxAssetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      let additionalInstallAssets = [
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/edgecase-custom-install.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-custom-install-toolbox');
        })
        .then(cachedAssets => {
          return compareCachedAssets(toolboxAssetList, cachedAssets);
        })
        .then(() => {
          return swUtils.getAllCachedAssets('precache-custom-install');
        })
        .then(cachedAssets => {
          return compareCachedAssets(additionalInstallAssets, cachedAssets);
        });
    });
  });

  describe('Test precaching Error Cases', function() {
    it('should throw an error when caching a single string', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-single-item.js')
      .should.be.rejected;
    });

    it('should throw an error when precaching an array of promises', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-array-of-promises.js')
      .should.be.rejected;
    });

    it('should throw an error when attmpting to precache nested arrays', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-nested-arrays.js')
      .should.be.rejected;
    });

    it('should throw an error when attempting to precache nested promises', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-nested-promises.js')
      .should.be.rejected;
    });

    it('should throw an error when precaching a mix of strings, promises and arrays', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-mix.js')
      .should.be.rejected;
    });

    it('should failt to install service worker due to Promise resolving to a javascript object, not an array.', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-non-array-promise.js')
      .should.be.rejected;
    });

    // This behaviour is undefined - discussed here:
    // https://github.com/GoogleChrome/sw-toolbox/issues/75
    it.skip('should not precache paths that do no exist', () => {
      let testId = 'precache-non-existant-files';
      let validAssetsList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/error-non-existant-files.js')
        .then(() => {
          return swUtils.getAllCachedAssets(testId);
        })
        .then(cachedAssets => {
          return compareCachedAssets(validAssetsList, cachedAssets);
        });
    });
  });
});
