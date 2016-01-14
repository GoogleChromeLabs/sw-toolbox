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

// This server is needed most importantly to add the Service-Worker-Allowed
// header to any service worker loaded in the tests. This allows the scope
// to be manipulated any way we want / need during testing.

var path = require('path');
var express = require('express');
var app = express();

// Set up static assets
app.use('/test/browser-tests/',
  express.static(path.join(__dirname, '..', 'browser-tests/'), {
    setHeaders: function(res) {
      res.setHeader('Service-Worker-Allowed', '/');
    }
  })
);

// Allow all assets in the project to be served (This includes sw-toolbox.js)
app.use('/', express.static(path.join(__dirname, '..', '..')));

// If the user tries to go to the root of the test server, redirect them
// to /test/
app.get('/', function(req, res) {
  res.redirect('/test/');
});

// Iframes need to have a page loaded so the service worker will have
// a page to claim and control. This is done by returning a basic
// html file for /test/iframe/<timestamp>
app.get('/test/iframe/:timestamp', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'data', 'test-iframe.html'));
});

// Start service on port 8888
var server = app.listen(8888, function() {
  console.log('Example app listening at http://localhost:%s',
    server.address().port);
});
