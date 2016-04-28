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

'use strict';

/* eslint-disable max-len, no-console, padded-blocks, no-multiple-empty-lines */
/* eslint-env node,mocha */

// These tests make use of selenium-webdriver. You can find the relevant
// documentation here: http://selenium.googlecode.com/git/docs/api/javascript/index.html

require('chai').should();
const path = require('path');
const mochaUtils = require('sw-testing-helpers').mochaUtils;
const automatedBrowserTesting = require('sw-testing-helpers').automatedBrowserTesting;

const testServer = require('./server/index.js');

describe('Test SW-Toolbox', function() {
  // Browser tests can be slow
  // 2016-03-29 FF v45 keeps exceeding timeouts of 60000,
  // so bumped up the limit
  this.timeout(100000);

  // Driver is initialised to null to handle scenarios
  // where the desired browser isn't installed / fails to load
  // Null allows afterEach a safe way to skip quiting the driver
  let globalDriverReference = null;
  let testServerURL;

  before(function() {
    return testServer.startServer(path.join(__dirname, '..'))
    .then(portNumber => {
      testServerURL = `http://localhost:${portNumber}`;
    });
  });

  after(function() {
    testServer.killServer();
  });

  afterEach(function() {
    this.timeout(10000);

    return automatedBrowserTesting.killWebDriver(globalDriverReference);
  });

  const queueUnitTest = browserInfo => {
    it(`should pass all tests in ${browserInfo.getPrettyName()}`, () => {
      globalDriverReference = browserInfo.getSeleniumDriver();

      return mochaUtils.startWebDriverMochaTests(
        browserInfo.getPrettyName(),
        globalDriverReference,
        `${testServerURL}/test/browser-tests/`
      )
      .then(testResults => {
        if (testResults.failed.length > 0) {
          const errorMessage = mochaUtils.prettyPrintErrors(
            browserInfo.prettyName,
            testResults
          );

          throw new Error(errorMessage);
        }
      });
    });
  };

  const automatedBrowsers = automatedBrowserTesting.getDiscoverableBrowsers();
  automatedBrowsers.forEach(browserInfo => {
    queueUnitTest(browserInfo);
  });
});
