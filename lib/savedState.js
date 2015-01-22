'use strict';

var store = require('./store');

var _state;
var savePromise = Promise.resolve();

var getState = function() {
  if (_state) {
    return Promise.resolve(_state);
  }

  return store.get('shedState').then(function(state) {
    return state || {
      lastInstalledVersion: 0,
      lastInstalledCache: null,
      lastActivatedCache: null
    };
  }).then(function(state) {
    _state = state;
    return _state;
  });
};

var save = function(state) {
  savePromise = savePromise.then(function() {
    return store.set('shedState', state);
  });

  return savePromise;
};

module.exports = {
  get: function(name) {
    return getState().then(function(state) {
      return state[name];
    });
  },
  set: function(name, value) {
    return getState().then(function(state) {
      state[name] = value;
      return save(state);
    });    
  }
};