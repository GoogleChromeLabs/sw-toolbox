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

var fs = require('fs');
var webdriver = require('selenium-webdriver');
var chrome = require('selenium-webdriver/chrome');
var firefox = require('selenium-webdriver/firefox');
require('chai').should();

// These tests make use of selenium-webdriver. You can find the relevant
// documentation here: http://selenium.googlecode.com/git/docs/api/javascript/index.html

describe('Test SW-Toolbox', () => {
  // Driver is initialised to null to handle scenarios
  // where the desired browser isn't installed / fails to load
  // Null allows afterEach a safe way to skip quiting the driver
  let driver = null;

  afterEach(done => {
    // Suggested as fix to 'chrome not reachable'
    // http://stackoverflow.com/questions/23014220/webdriver-randomly-produces-chrome-not-reachable-on-linux-tests
    var timeoutGapCb = function() {
      setTimeout(done, 2000);
    };

    if (driver === null) {
      return timeoutGapCb();
    }

    driver.quit()
    .then(() => {
      driver = null;
      timeoutGapCb();
    })
    .thenCatch(() => {
      driver = null;
      timeoutGapCb();
    });
  });

  let checkFileExists = path => {
    return new Promise((resolve, reject) => {
      fs.stat(path, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  let performTests = (browserName, driver) => {
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
          return driver.executeScript('return ((typeof window.swtoolbox !== \'undefined\') && window.swtoolbox.testResults !== \'undefined\');');
        });
      })
      .then(() => {
        // This simply retrieves the test results from the inbrowser mocha tests
        return driver.executeScript('return window.swtoolbox.testResults;');
      })
      .then(testResults => {
        // Resolve the outer promise to get out of the webdriver promise chain
        resolve(testResults);
      })
      .thenCatch(reject);
    })
    .then(testResults => {
      if (testResults.failed.length > 0) {
        var failedTests = testResults.failed;
        var errorMessage = 'Issues in ' + browserName + '.\n\n' + browserName + ' had ' + testResults.failed.length + ' test failures.\n';
        errorMessage += '------------------------------------------------\n';
        errorMessage += failedTests.map((failedTest, i) => {
          return `[Failed Test ${i + 1}]\n    ${failedTest.title}\n`;
        }).join('\n');
        errorMessage += '------------------------------------------------\n';
        throw new Error(errorMessage);
      }
    });
  };

  it('should pass all tests in Chrome Stable', done => {
    checkFileExists('/usr/bin/google-chrome-stable')
    .then(() => {
      // This will only work on linux. It's here
      // to primarily work with Travis. Would be good to enable support
      // on other platforms at a later stage.
      var options = new chrome.Options();
      options.setChromeBinaryPath('/usr/bin/google-chrome-stable');

      driver = new webdriver
        .Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      return performTests('chrome-stable', driver)
        .then(() => {
          done();
        })
        .catch(done);
    })
    .catch(() => {
      done(new Error('Executable for Chrome Stable not found'));
    });
  });

  it('should pass all tests in Chrome Beta', done => {
    checkFileExists('/usr/bin/google-chrome-beta')
    .then(() => {
      // This will only work on linux. It's here
      // to primarily work with Travis. Would be good to enable support
      // on other platforms at a later stage.
      var options = new chrome.Options();
      options.setChromeBinaryPath('/usr/bin/google-chrome-beta');

      driver = new webdriver
        .Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      performTests('chrome-beta', driver)
        .then(() => {
          done();
        })
        .catch(done);
    })
    .catch(() => {
      done(new Error('Executable for Chrome Beta not found'));
    });
  });

  it('should pass all tests in Firefox', done => {
    driver = new webdriver
      .Builder()
      .forBrowser('firefox')
      .build();

    performTests('Firefox Stable', driver)
    .then(() => {
      done();
    })
    .catch(done);
  });

  it('should pass all tests in Firefox Beta', done => {
    checkFileExists('./firefox/firefox')
    .then(() => {
      // This will only work on linux. It's here
      // to primarily work with Travis. Would be good to enable support
      // on other platforms at a later stage.
      var options = new firefox.Options();
      options.setBinary('./firefox/firefox');

      driver = new webdriver
        .Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

      return performTests('Firefox Beta', driver)
      .then(() => {
        done();
      })
      .catch(done);
    })
    .catch(() => {
      done(new Error('Executable for Firefox Beta not found'));
    });
  });
});
