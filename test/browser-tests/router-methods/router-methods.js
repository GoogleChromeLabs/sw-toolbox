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

const availableMethods = ['get', 'post', 'put', 'delete', 'head'];
const domainName = 'progress-web-app-sw-toolbox-domain.com';

describe('Test router.{' + availableMethods.join(',') + '} methods', () => {
  const swUtils = window.goog.swUtils;
  const serviceWorkersFolder = '/test/browser-tests/router-methods/serviceworkers';

  const performFetch = (method, fetchUrl, expectedString) => {
    return swUtils.getIframe()
      .then(iframe => {
        // Call the iframes fetch event so it goes through the service worker
        return iframe.contentWindow.fetch(fetchUrl, {
          method: method
        });
      })
      .then(response => {
        response.status.should.equal(200);
        return response.text();
      })
      .then(responseText => {
        responseText.should.equal(expectedString);
      });
  };

  const performTest = (method, swUrl, fetchUrl, expectedString) => {
    return swUtils.activateSW(swUrl + '?method=' + method)
    .then(() => {
      if (method === 'any') {
        return Promise.all(
          availableMethods.map(fetchMethod => {
            return performFetch(fetchMethod, fetchUrl, expectedString);
          })
        );
      }

      return performFetch(method, fetchUrl, expectedString);
    });
  };

  const addMochaTests = method => {
    describe('Testing router.' + method, function() {
      it('should return response for absolute url', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/relative.js',
          '/test/relative-url-test',
          '/test/relative-url-test'
        );
      });

      it('should return response for relative url', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/relative.js',
          serviceWorkersFolder + '/test/relative-url-test-2',
          'test/relative-url-test-2'
        );
      });

      it('should return the variable from a pattern', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/variable-match.js',
          '/test/match/echo-this/pattern',
          'echo-this'
        );
      });

     // TODO: Find out correct behaviour https://github.com/GoogleChrome/sw-toolbox/issues/86
      it.skip('should throw an error for route with an origin defined in sw testing request for full url', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/full-url.js',
          location.origin + '/test/absolute-url-test',
          '/test/absolute-url-test'
        );
      });

      // TODO: Find out correct behaviour https://github.com/GoogleChrome/sw-toolbox/issues/86
      it.skip('should throw an error for route with an origin defined in sw testing request for relative url', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/full-url.js',
          '/test/absolute-url-test',
          '/test/absolute-url-test'
        );
      });

      it('should return a response from the first defined match then second based on specificity', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/definition-order.js',
          '/multiple/match/something.html',
          'multiple-match-1'
        )
        .then(() => {
          return performFetch(
            method,
            '/multiple/match/something',
            'multiple-match-2'
          );
        });
      });

      // Firefox version 47+ support fetch requests to other origins going through
      // service workers. This check will skip tests for older version of
      // firefox and reenable the tests when appropriate.
      // 46 doesn't work with HTTPS domains
      // 45 doesn't work with other origins
      const firefoxVersion = /Firefox\/(\d+).\d+/.exec(navigator.userAgent);
      if (firefoxVersion) {
        console.warn('Tests skipped due to version of Firefox not supporting ' +
          'cross origin requests via fetch().');
        return;
      }

      it('should not match relative path starting with the origin defined in toolbox route. Origin option as regex.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/origin-option-regex`,
          '/default'
        );
      });

      it('should return response for request to a different origin defined in toolbox route. HTTP + Origin option as regex.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/origin-option-regex`,
          '/origin-option-regex'
        );
      });

      it('should return response for request to a different origin defined in toolbox route. HTTPS + Origin option as regex.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/origin-option-regex`,
          '/origin-option-regex'
        );
      });

      it('should not match relative path starting with origin defined in toolbox route. Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/origin-option-string`,
          '/default'
        );
      });

      it('should return response for request to a different origin defined in toolbox route. HTTP + Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/origin-option-string`,
          '/origin-option-string'
        );
      });

      it('should return response for request to a different origin defined in toolbox route. HTTPS + Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/origin-option-string`,
          '/origin-option-string'
        );
      });

      it('should not match relative path starting with origin defined in toolbox route specifying HTTPS. Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/https-only-string`,
          '/default'
        );
      });

      it('should not match a HTTP request to a different origin for route specifying HTTPS. HTTP + Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/https-only-string`,
          '/default'
        );
      });

      it('should return response for HTTPS request to a different origin for route specifying HTTPS. HTTPS + Origin option as string.', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/https-only-string`,
          '/https-only-string'
        );
      });

      // Note the behaviour of this is different to previous tests with this relative path
      it('should match regex for relative request defining an origin in regex route. (Soft origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/soft-origin-regex-route`,
          '/soft-origin-regex-route'
        );
      });

      it('should match regex HTTP request defining an origin in regex route. (Soft origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/soft-origin-regex-route`,
          '/soft-origin-regex-route'
        );
      });

      it('should match regex HTTPS request defining an origin in regex route. (Soft origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/soft-origin-regex-route`,
          '/soft-origin-regex-route'
        );
      });

      it('should not match regex for relative request defining an origin in regex route. (Hard origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/hard-origin-regex-route`,
          '/default'
        );
      });

      it('should match regex HTTP request defining an origin in regex route. (Hard origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/hard-origin-regex-route`,
          '/hard-origin-regex-route'
        );
      });

      it('should match regex HTTPS request defining an origin in regex route. (Hard origin check)', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/hard-origin-regex-route`,
          '/hard-origin-regex-route'
        );
      });

      it('should not match regex for relative request defining an HTTPS origin in regex route', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `${domainName}/https-only-regex`,
          '/default'
        );
      });

      it('should not match regex for HTTP request defining an HTTPS origin in regex route', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `http://${domainName}/https-only-regex`,
          '/default'
        );
      });

      it('should match regex for HTTPS request defining an HTTPS origin in regex route', () => {
        return performTest(
          method,
          serviceWorkersFolder + '/origin-matching.js',
          `https://${domainName}/https-only-regex`,
          '/https-only-regex'
        );
      });
    });
  };

  availableMethods.forEach(method => {
    addMochaTests(method);
  });

  addMochaTests('any');
});
