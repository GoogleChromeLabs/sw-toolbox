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
  const serviceWorkersFolder = '/test/browser-tests/options/serviceworkers/';

  /**
   * @param {Number} timeout The number of milliseconds to pause for.
   * @return {Promise} A promise that resolves after a specified delay.
   */
  const pause = timeout => {
    return new Promise(resolve => setTimeout(resolve, timeout));
  };

  /**
   * Performs a series of fetch() calls on an iframe, then pauses.
   * @param {iframe} iframe The iframe whose contentWindow will be used to fetch().
   * @param {Array.<String>} urls The URLs to fetch.
   * @return {Promise} A promise that resolves following the fetches and a delay.
   */
  const sequentialFetch = (iframe, urls) => {
    return urls.reduce((chain, url) => {
      return chain.then(() => iframe.contentWindow.fetch(url));
    }, Promise.resolve()).then(() => pause(500));
  };

  /**
   * Prepends a common prefix to several partial URLs, and returns the absolute URLs.
   * @param {Array.<String>} urls The partial URLs.
   * @return {Array.<String>} The absolute URLs.
   */
  const absoluteTestDataFileUrls = urls => urls.map(url => {
    return String(new URL(url, `${location.origin}/test/data/files/`));
  });

  /**
   * Asserts that the keys in cachedAssets match exactly the list of expected URLs.
   * @param {Object} cachedAssets The result from a call to swUtils.getAllCachedAssets().
   * @param {Array.<String>} expectedUrls The expected cache contents.
   */
  const assertCacheContents = (cachedAssets, expectedUrls) => {
    const expectedLength = expectedUrls.length;
    const cachedUrls = Object.keys(cachedAssets);
    const filteredUrls = cachedUrls.filter(url => expectedUrls.includes(url));
    filteredUrls.should.have.lengthOf(expectedLength);
    cachedUrls.should.have.lengthOf(expectedLength);
  };

  describe('options.cache.maxEntries', function() {
    it('should cache according to global maxEntries option', function() {
      const urls = absoluteTestDataFileUrls([
        'text-1.txt', 'text-2.txt', 'text-3.txt']);

      const swFile = `${serviceWorkersFolder}max-entries-global.js`;
      return swUtils.activateSW(swFile).then(iframe => {
        return sequentialFetch(iframe, urls)
          .then(() => swUtils.getAllCachedAssets(iframe.src));
      }).then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(1)));
    });

    it('should cache according to route specific maxEntries option', function() {
      const urls = absoluteTestDataFileUrls([
        'text-1.txt', 'text-2.txt', 'text-3.txt']);

      const swFile = `${serviceWorkersFolder}max-entries-route.js`;
      return swUtils.activateSW(swFile).then(iframe => {
        return sequentialFetch(iframe, urls)
          .then(() => swUtils.getAllCachedAssets(iframe.src));
      }).then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(1)));
    });
  });

  describe('options.cache.maxAgeSeconds', function() {
    it('should cache according to global maxAgeSeconds option', function() {
      const urls = absoluteTestDataFileUrls([
        'text-1.txt', 'text-2.txt', 'text-3.txt']);

      const swFile = `${serviceWorkersFolder}max-cache-age-global.js`;
      return swUtils.activateSW(swFile).then(iframe => {
        return iframe.contentWindow.fetch(urls[0])
          .then(() => pause(1500))
          .then(() => sequentialFetch(iframe, urls.slice(1)))
          .then(() => swUtils.getAllCachedAssets(iframe.src));
      }).then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(1)));
    });

    it('should cache according to route specific maxAgeSeconds option', function() {
      const urls = absoluteTestDataFileUrls([
        'text-1.txt', 'text-2.txt', 'text-3.txt']);

      const swFile = `${serviceWorkersFolder}max-cache-age-route.js`;
      return swUtils.activateSW(swFile).then(iframe => {
        return iframe.contentWindow.fetch(urls[0])
          .then(() => pause(1500))
          .then(() => sequentialFetch(iframe, urls.slice(1)))
          .then(() => swUtils.getAllCachedAssets(iframe.src));
      }).then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(1)));
    });
  });

  describe('options.cache.maxEntries && options.cache.maxAgeSeconds', function() {
    it('should cache according to global maxEntries & maxAgeSeconds option', function() {
      const urls = absoluteTestDataFileUrls([
        'text-1.txt', 'text-2.txt', 'text-3.txt', 'text-4.txt']);

      const swFile = `${serviceWorkersFolder}max-entries-cache-age-global.js`;
      return swUtils.activateSW(swFile).then(iframe => {
        return iframe.contentWindow.fetch(urls[0])
          .then(() => pause(1500))
          .then(() => sequentialFetch(iframe, urls.slice(1, 3)))
          .then(() => swUtils.getAllCachedAssets(iframe.src))
          .then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(1, 3)))
          .then(() => sequentialFetch(iframe, urls.slice(2, 4)))
          .then(() => swUtils.getAllCachedAssets(iframe.src))
          .then(cachedAssets => assertCacheContents(cachedAssets, urls.slice(2, 4)));
      });
    });
  });
});
