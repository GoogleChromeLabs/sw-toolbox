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
var globalOptions = require('../options');
var helpers = require('../helpers');

function networkFirst(request, values, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;
  helpers.debug('Strategy: network first [' + request.url + ']', options);
  return helpers.openCache(options).then(function(cache) {
    return helpers.fetchAndCache(request, options).then(function(response) {
      if (successResponses.test(response.status)) {
        return response;
      }

      return cache.match(request).then(function(cacheResponse) {
        helpers.debug('Response was an HTTP error', options);
        if (cacheResponse) {
          helpers.debug('Resolving with cached response instead', options);
          return cacheResponse;
        } else {
          // If we didn't have anything in the cache, it's better to return the
          // error page than to return nothing
          helpers.debug('No cached result, resolving with HTTP error response from network', options);
          return response;
        }
      });
    }).catch(function(error) {
      helpers.debug('Network error, fallback to cache [' + request.url + ']', options);
      return cache.match(request);
    });
  });
}

module.exports = networkFirst;