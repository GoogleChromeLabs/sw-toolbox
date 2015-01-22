'use strict';

var globalOptions = require('./options');
var savedState = require('./savedState');

function debug(message, options) {
  options = options || {};
  var flag = options.debug || globalOptions.debug;  
  if (flag) {
    console.log('[shed] ' + message);
  }
}

function openCache(options) {
  options = options || {};
  var name = options.cacheName || globalOptions.cacheName;
  var namePromise;
  if (name)
  {
    namePromise = Promise.resolve(name);
  } else {
    namePromise = savedState.get('lastActivatedCache');
  }
  return namePromise.then(function(cacheName) {
    debug('Opening cache "' + cacheName + '"');
    return caches.open(cacheName);
  });
}

function fetchAndCache(request, options) {
  options = options || {};
  var successResponses = options.successResponses || globalOptions.successResponses;  
  return fetch(request.clone()).then(function(response) {

    // Only cache successful responses
    if (successResponses.test(response.status)) {
      openCache(options).then(function(cache) {
        cache.put(request, response);
      });
    }

    return response.clone();
  });
}

module.exports = {
  debug: debug,
  fetchAndCache: fetchAndCache,
  openCache: openCache,
};