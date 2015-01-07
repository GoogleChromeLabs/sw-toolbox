'use strict';

var CacheWrapper = function(name) {
  this._name = name;
  this._cache = null;
};

CacheWrapper.prototype.open = function() {
  if (!this._cache) {
    return caches.open(this._name).then(function(cache) {
      this._cache = cache;
      return cache;
    }.bind(this));
  } else {
    return Promise.resolve(this._cache);
  }
};

CacheWrapper.prototype.fetch = function(request) {
  return this.open().then(function(cache) {
    return cache.match(request);
  });
};

CacheWrapper.prototype.put = function(request, response) {
  return this.open().then(function(cache) {
    cache.put(request, response);
  });
};

CacheWrapper.prototype.add = function(requests) {
  if (!Array.isArray(requests)) {
    requests = [requests];
  }
  return this.open().then(function(cache) {
    return cache.addAll(requests);
  });
};

CacheWrapper.prototype.remove = function(request) {
  return this.open().then(function(cache) {
    cache.delete(request);
  });
};

module.exports = CacheWrapper;