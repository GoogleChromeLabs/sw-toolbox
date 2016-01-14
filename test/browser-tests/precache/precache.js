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

// This is a test and we want descriptions to be useful, if this
// breaks the max-length, it's ok.

/* eslint-disable max-len */
/* eslint-env browser, mocha */
/* global testHelper */

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

  it('should precache all desired assets in precache-valid', () => {
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

  it('should precache a single item in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/single-item.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from promises in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/promises.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from arrays of arrays in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt',
      '/test/data/files/text-2.txt',
      '/test/data/files/text-3.txt',
      '/test/data/files/text-4.txt',
      '/test/data/files/text-5.txt',
      '/test/data/files/text-6.txt',
      '/test/data/files/text-7.txt',
      '/test/data/files/text-8.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/arrays.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should precache all desired assets from arrays of arrays of promises in precache-valid', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt',
      '/test/data/files/text-2.txt',
      '/test/data/files/text-3.txt',
      '/test/data/files/text-4.txt',
      '/test/data/files/text-5.txt',
      '/test/data/files/text-6.txt',
      '/test/data/files/text-7.txt',
      '/test/data/files/text-8.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/promise-arrays.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-valid');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });

  it('should not precache paths that do no exist', () => {
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

  it('should precache all desired assets from a mix of strings, promises and arrays', () => {
    let assetList = [
      '/test/data/files/text.txt',
      '/test/data/files/text-1.txt',
      '/test/data/files/text-2.txt',
      '/test/data/files/text-3.txt',
      '/test/data/files/text-4.txt',
      '/test/data/files/text-5.txt'
    ];
    return testHelper.activateSW(serviceWorkersFolder + '/mix.js')
      .then(() => {
        return testHelper.getAllCachedAssets('precache-mix');
      })
      .then(cachedAssets => {
        return compareCachedAssets(assetList, cachedAssets);
      });
  });
});
