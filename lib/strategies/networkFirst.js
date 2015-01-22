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