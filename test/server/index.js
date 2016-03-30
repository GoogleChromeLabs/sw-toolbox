/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

'use strict';

/* eslint-env node */

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();

// If the user tries to go to the root of the server, redirect them
// to the browser test path
app.get('/', function(req, res) {
  res.redirect('/test/browser-tests/');
});

let _server;

function startServer(staticAssetsPath, portNumber) {
  if (_server) {
    _server.close();
  }

  // 0 will pick a random port number
  if (typeof portNumber === 'undefined') {
    portNumber = 0;
  }

  // Allow all assets in the project to be served, including any
  // required js code from the project
  //
  // Add service worker allowed header to avoid any scope restrictions
  // NOTE: NOT SAFE FOR PRODUCTION!!!
  app.use('/', express.static(staticAssetsPath, {
    setHeaders: function(res) {
      res.setHeader('Service-Worker-Allowed', '/');
    }
  }));
  app.use(cookieParser());

  // If the user tries to go to the root of the test server, redirect them
  // to /test/
  app.get('/', function(req, res) {
    res.redirect('/test/browser-tests/');
  });

  // Iframes need to have a page loaded so the service worker will have
  // a page to claim and control. This is done by returning a basic
  // html file for /test/iframe/<timestamp>
  app.get('/test/iframe/:timestamp', function(req, res) {
    res.sendFile(path.join(__dirname, '..', 'data', 'test-iframe.html'));
  });

  app.get('/test/helper/redirect', function(req, res) {
    if (req.cookies.bouncedRedirect === 'true') {
      res.clearCookie('bouncedRedirect');
      res.json({success: true});
    } else {
      res.redirect('/test/helper/redirect/bounce');
    }
  });

  app.get('/test/helper/redirect/bounce', function(req, res) {
    res.cookie('bouncedRedirect', true);
    res.json({
      redirect: '/test/helper/redirect'
    });
  });

  return new Promise(resolve => {
    // Start service on desired port
    _server = app.listen(portNumber, function() {
      resolve(_server.address().port);
    });
  });
}

function killServer() {
  if (_server) {
    _server.close();
    _server = null;
  }
}

module.exports = {
  startServer: startServer,
  killServer: killServer
};
