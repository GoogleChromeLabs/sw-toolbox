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

describe('Test precache method', () => {
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

  it('should precache all desired assets from an array in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/simple.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from a promise in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/simple-promise.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from an array of requests in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/simple-request.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from a mixed array of strings and requests in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/mix-of-strings-requests.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all assets from each install step', () => {
    let toolboxAssetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    let additionalInstallAssets = [
      '/test/data/files/text-2.txt',
      '/test/data/files/text-3.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/custom-install.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-custom-install-toolbox');
      })
      .then(cachedAssets => {
        return compareCachedAssets(toolboxAssetList, cachedAssets);
      })
      .then(() => {
        return testHelper.getAllCachedAssets('precache-custom-install');
      })
      .then(cachedAssets => {
        return compareCachedAssets(additionalInstallAssets, cachedAssets);
      });
  });

  // This behaviour is undefined - discussed here:
  // https://github.com/GoogleChrome/sw-toolbox/issues/75
  it.skip('should not precache paths that do no exist', () => {
    let testId = 'precache-non-existant-files';
    let validAssetsList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/non-existant-files.js')
      .then(() => {
        return testHelper.getAllCachedAssets(testId);
      })
      .then(cachedAssets => {
        return compareCachedAssets(validAssetsList, cachedAssets);
      });
  });

  it('should throw an error when caching a single string', done => {
    testHelper.addMessageListener(function(result) {
      if (result.testPass) {
        done();
      } else {
        done('Test Failed - See console for info.');
      }
    });

    testHelper.activateSW(serviceWorkersFolder + '/single-item.js');
  });

  it('should throw an error when precaching an array of promises', done => {
    testHelper.addMessageListener(function(result) {
      if (result.testPass) {
        done();
      } else {
        done('Test Failed - See console for info.');
      }
    });

    testHelper.activateSW(serviceWorkersFolder + '/promises.js');
  });

  it('should throw an error when attmpting to precache nested arrays', done => {
    testHelper.addMessageListener(function(result) {
      if (result.testPass) {
        done();
      } else {
        done('Test Failed - See console for info.');
      }
    });

    testHelper.activateSW(serviceWorkersFolder + '/arrays.js');
  });

  it('should throw an error when attempting to precache nested promises', done => {
    testHelper.addMessageListener(function(result) {
      if (result.testPass) {
        done();
      } else {
        done('Test Failed - See console for info.');
      }
    });

    testHelper.activateSW(serviceWorkersFolder + '/promise-arrays.js');
  });

  it('should throw an error when precaching a mix of strings, promises and arrays', done => {
    testHelper.addMessageListener(function(result) {
      if (result.testPass) {
        done();
      } else {
        done('Test Failed - See console for info.');
      }
    });

    testHelper.activateSW(serviceWorkersFolder + '/mix.js');
  });

  it('should cause an error since precache resolves promise to a javascript object, not an array.', () => {
    return testHelper.activateSW(serviceWorkersFolder + '/unexpected-promise-resolve.js')
    .then(function() {
      throw new Error('Expected service to fail install step but it hasn\'t.');
    })
    .catch(function(err) {
      err.message.should.equal('Installing servier worker became redundant');
    });
  });
});
