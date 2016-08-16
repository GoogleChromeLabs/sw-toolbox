/*
  Copyright 2014 Google Inc. All Rights Reserved.

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

require('serviceworker-cache-polyfill');

var Toolbox = require('./toolbox')

var toolboxes = [];

// Fetch
// Bail after the first match
self.addEventListener('fetch', function(event) {
  toolboxes.some(function (toolbox) {
    var handler = toolbox.router.match(event.request);

    if (handler) {
      event.respondWith(handler(event.request));
    } else if (toolbox.router.default && event.request.method === 'GET') {
      event.respondWith(toolbox.router.default(event.request));
    } else {
      return false;
    }
    return true;
  })

});

function factory () {
  var toolbox = Toolbox();
  toolboxes.push[toolbox];
  return toolbox;
}

// Backwards compatible
const defaultToolbox = factory();

module.exports = defaultToolbox;
module.exports.factory = factory;
