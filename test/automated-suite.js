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
// documentation here: https://github.com/SeleniumHQ/selenium

const path = require('path');
const seleniumAssistant = require('selenium-assistant');
const mochaUtils = require('sw-testing-helpers').mochaUtils;

require('geckodriver');
require('chromedriver');

require('chai').should();

const testServer = require('./server/index.js');

describe('Test SW-Toolbox', function() {
  // Browser tests can be slow
  this.timeout(100000);

  // Selenium Tests are Flakey
  this.retries(3);

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
    this.timeout(2 * 60 * 1000);

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
        mochaUtils.prettyPrintResults(testResults);
        if (testResults.failed.length > 0) {
          throw new Error('Tests Failed');
        }
      });
    });
  };

  const automatedBrowsers = seleniumAssistant.getLocalBrowsers();
  automatedBrowsers.forEach(browserInfo => {
    // Firefox before version 50 have issues that can't be duplicated outside
    // of the selenium test runner.
    if (browserInfo.getId() === 'firefox' &&
      browserInfo.getVersionNumber() < 50) {
      console.log(`Skipping ${browserInfo.getId()}: ${browserInfo.getRawVersionString()}`);
      return;
    }

    // Opera has bad unregister API and it's driver is far from happy
    // with latest builds.
    if (browserInfo.getId() === 'opera') {
      console.log(`Skipping ${browserInfo.getId()}: ${browserInfo.getRawVersionString()}`);
      return;
    }

    // Block browsers w/o Service Worker support from being included in the
    // tests on Travis
    if (browserInfo.getId() !== 'firefox' &&
      browserInfo.getId() !== 'chrome') {
      console.log(`Skipping ${browserInfo.getId()}: ${browserInfo.getRawVersionString()}`);
      return;
    }

    queueUnitTest(browserInfo);
  });
});
