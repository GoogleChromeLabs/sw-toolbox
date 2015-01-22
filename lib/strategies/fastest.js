'use strict';
var helpers = require('../helpers');
var cacheOnly = require('./cacheOnly');

function fastest(request, values, options) {
  helpers.debug('Strategy: fastest [' + request.url + ']', options);
  var rejected = false;
  var reasons = [];

  var maybeReject = function(reason) {
    reasons.push(reason.toString());
    if (rejected) {
      return Promise.reject(new Error('Both cache and network failed: "' + reasons.join('", "') + '"'));
    }
    rejected = true;
  };

  return new Promise(function(resolve, reject) {
    helpers.fetchAndCache(request.clone(), options).then(resolve, maybeReject);
    cacheOnly(request, options).then(resolve, maybeReject);
  });
}

module.exports = fastest;