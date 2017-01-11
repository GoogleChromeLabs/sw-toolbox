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

const path = require('path');
const seleniumAssistant = require('selenium-assistant');
const mochaUtils = require('sw-testing-helpers').mochaUtils;

require('geckodriver');
require('chromedriver');
require('operadriver');

require('chai').should();

const testServer = require('./server/index.js');

describe('Test SW-Toolbox', function() {
  // Browser tests can be slow
  this.timeout(100000);

  if (process.env.TRAVIS || process.env.RELEASE_SCRIPT) {
    // Selenium Tests are Flakey
    this.retries(3);
  }

  // Driver is initialised to `null` to handle scenarios
  // where the desired browser isn't installed / fails to load
  // `null` allows afterEach a safe way to skip quiting the driver
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

    return seleniumAssistant.killWebDriver(globalDriverReference)
    .then(() => {
      globalDriverReference = null;
    });
  });

  const queueUnitTest = browserInfo => {
    it(`should pass all tests in ${browserInfo.getPrettyName()}`, () => {
      return browserInfo.getSeleniumDriver()
      .then(driver => {
        globalDriverReference = driver;
        return mochaUtils.startWebDriverMochaTests(
          browserInfo.getPrettyName(),
          globalDriverReference,
          `${testServerURL}/test/browser-tests/`
        );
      })
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

  seleniumAssistant.printAvailableBrowserInfo();

  const automatedBrowsers = seleniumAssistant.getLocalBrowsers();
  automatedBrowsers.forEach(browserInfo => {
    if (process.env.TRAVIS || process.env.RELEASE_SCRIPT) {
      // Firefox before version 50 have issues that can't be duplicated outside
      // of the selenium test runner.
      if (browserInfo.getSeleniumBrowserId() === 'firefox' &&
        browserInfo.getVersionNumber() <= 50) {
        console.log('Skipping ' + browserInfo.getRawVersionString());
        return;
      }

      if (browserInfo.getSeleniumBrowserId() === 'opera' &&
        browserInfo.getVersionNumber() <= 39) {
        console.log('Skipping ' + browserInfo.getRawVersionString());
        return;
      }

      // Chrome 54 is having some issues with the selenium :(
      if (browserInfo.getSeleniumBrowserId() === 'chrome' &&
        browserInfo.getVersionNumber() >= 54) {
        console.log('Skipping ' + browserInfo.getRawVersionString());
        return;
      }

      // Block browsers w/o Service Worker support from being included in the
      // tests on Travis
      if (browserInfo.getSeleniumBrowserId() !== 'firefox' &&
        browserInfo.getSeleniumBrowserId() !== 'chrome' &&
        browserInfo.getSeleniumBrowserId() !== 'opera') {
        console.log('Not running tests on: ' + browserInfo.getPrettyName());
        return;
      }
    }

    queueUnitTest(browserInfo);
  });
});
