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

// This is a test and we want descriptions to be useful, if this
// breaks the max-length, it's ok.
/* eslint-disable max-len, no-console, padded-blocks, no-multiple-empty-lines */
/* eslint-env node,mocha */

require('chai').should();
const fs = require('fs');
const webdriver = require('selenium-webdriver');
const chromeOptions = require('selenium-webdriver/chrome');
const firefoxOptions = require('selenium-webdriver/firefox');
const which = require('which');

const CHROME_PATH = which.sync('google-chrome');
const CHROME_BETA_PATH = which.sync('google-chrome-beta');
const FIREFOX_PATH = which.sync('firefox');
const FIREFOX_BETA_PATH_FOR_TRAVIS = './firefox/firefox';

// These tests make use of selenium-webdriver. You can find the relevant
// documentation here: http://selenium.googlecode.com/git/docs/api/javascript/index.html

describe('Test SW-Toolbox', () => {
  // Driver is initialised to null to handle scenarios
  // where the desired browser isn't installed / fails to load
  // Null allows afterEach a safe way to skip quiting the driver
  let globalDriverReference = null;

  afterEach(done => {
    // Suggested as fix to 'chrome not reachable'
    // http://stackoverflow.com/questions/23014220/webdriver-randomly-produces-chrome-not-reachable-on-linux-tests
    const timeoutGapCb = function() {
      setTimeout(done, 2000);
    };

    if (globalDriverReference === null) {
      return timeoutGapCb();
    }

    globalDriverReference.quit()
    .then(() => {
      globalDriverReference = null;
      timeoutGapCb();
    })
    .thenCatch(() => {
      globalDriverReference = null;
      timeoutGapCb();
    });
  });

  const performTests = (browserName, driver) => {
    // The driver methods are wrapped in a new promise because the
    // selenium-webdriver API seems to using some custom promise
    // implementation that has slight behaviour differences.
    return new Promise((resolve, reject) => {
      driver.get('http://localhost:8888/test/')
      .then(() => {
        return driver.executeScript('return window.navigator.userAgent;');
      })
      .then(userAgent => {
        // This is just to help with debugging so we can get the browser version
        console.log('    Browser User Agent [' + browserName + ']: ' + userAgent);
      })
      .then(() => {
        // We get webdriver to wait until window.swtoolbox.testResults is defined.
        // This is set in the in browser mocha tests when the tests have finished
        // successfully
        return driver.wait(function() {
          return driver.executeScript('return ((typeof window.testsuite !== \'undefined\') && window.testsuite.testResults !== \'undefined\');');
        });
      })
      .then(() => {
        // This simply retrieves the test results from the inbrowser mocha tests
        return driver.executeScript('return window.testsuite.testResults;');
      })
      .then(testResults => {
        // Resolve the outer promise to get out of the webdriver promise chain
        resolve(testResults);
      })
      .thenCatch(reject);
    })
    .then(testResults => {
      if (testResults.failed.length > 0) {
        const failedTests = testResults.failed;
        let errorMessage = 'Issues in ' + browserName + '.\n\n' + browserName + ' had ' + testResults.failed.length + ' test failures.\n';
        errorMessage += '------------------------------------------------\n';
        errorMessage += failedTests.map((failedTest, i) => {
          return `[Failed Test ${i + 1}]\n    ${failedTest.title}\n`;
        }).join('\n');
        errorMessage += '------------------------------------------------\n';
        throw new Error(errorMessage);
      }
    });
  };

  const queueUnitTest = (browserName, browserPath, seleniumBrowserID, options) => {
    if (!browserPath) {
      console.warn(`${browserName} path wasn\'t found so skipping`);
      return;
    }
    it(`should pass all tests in ${browserName}`, () => {
      globalDriverReference = new webdriver
        .Builder()
        .forBrowser(seleniumBrowserID)
        .setChromeOptions(options)
        .setFirefoxOptions(options)
        .build();

      return performTests(browserName, globalDriverReference);
    });
  };

  const chromeStableOpts = new chromeOptions.Options();
  chromeStableOpts.setChromeBinaryPath(CHROME_PATH);

  queueUnitTest('Chrome Stable', CHROME_PATH, 'chrome', chromeStableOpts);


  const chromeBetaOpts = new chromeOptions.Options();
  chromeBetaOpts.setChromeBinaryPath(CHROME_BETA_PATH);

  queueUnitTest('Chrome Beta', CHROME_BETA_PATH, 'chrome', chromeBetaOpts);


  const ffStableOpts = new firefoxOptions.Options();
  ffStableOpts.setBinary(FIREFOX_PATH);

  queueUnitTest('Firefox Stable', FIREFOX_PATH, 'firefox', ffStableOpts);


  if (process.env.TRAVIS) {
    const ffBetaOpts = new firefoxOptions.Options();
    ffBetaOpts.setBinary(FIREFOX_BETA_PATH_FOR_TRAVIS);

    queueUnitTest('Firefox Beta', FIREFOX_BETA_PATH_FOR_TRAVIS, 'firefox', ffStableOpts);
  }
});
