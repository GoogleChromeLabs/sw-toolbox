/**
* Copyright 2015 Google Inc. All rights reserved.
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
*/

/* eslint-disable new-cap */
// From https://gist.github.com/inexorabletash/c8069c042b734519680c (Joshua Bell)
'use strict';

var SECRET = Object.create(null);
var DB_PREFIX = '$SimpleDB$';
var STORE = 'store';

function SimpleDBFactory(secret) {
  if (secret !== SECRET) {
    throw TypeError('Invalid constructor');
  }
}

SimpleDBFactory.prototype = {
  open: function(name) {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_PREFIX + name);
      request.onupgradeneeded = function() {
        var db = request.result;
        db.createObjectStore(STORE);
      };
      request.onsuccess = function() {
        var db = request.result;
        resolve(new SimpleDB(SECRET, name, db));
      };
      request.onerror = function() {
        reject(request.error);
      };
    });
  },
  delete: function(name) {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.deleteDatabase(DB_PREFIX + name);
      request.onsuccess = function() {
        resolve(undefined);
      };
      request.onerror = function() {
        reject(request.error);
      };
    });
  }
};

function SimpleDB(secret, name, db) {
  if (secret !== SECRET) {
    throw TypeError('Invalid constructor');
  }
  this._name = name;
  this._db = db;
}
SimpleDB.cmp = indexedDB.cmp;
SimpleDB.prototype = {
  get name() {
    return this._name;
  },
  get: function(key) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      var req = store.get(key);
      // NOTE: Could also use req.onsuccess/onerror
      tx.oncomplete = function() {
        resolve(req.result);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  set: function(key, value) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      store.put(value, key);
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  delete: function(key) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      store.delete(key);
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  clear: function() {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      store.clear();
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  forEach: function(callback, options) {
    var that = this;
    return new Promise(function(resolve, reject) {
      options = options || {};
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      var request = store.openCursor(
        options.range,
        options.direction === 'reverse' ? 'prev' : 'next');
      request.onsuccess = function() {
        var cursor = request.result;
        if (!cursor) {
          return;
        }
        try {
          var terminate = callback(cursor.key, cursor.value);
          if (!terminate) {
            cursor.continue();
          }
        } catch (ex) {
          tx.abort(); // ???
        }
      };
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  getMany: function(keys) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      var results = [];
      keys.forEach(function(key) {
        store.get(key).onsuccess(function(result) {
          results.push(result);
        });
      });
      tx.oncomplete = function() {
        resolve(results);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  setMany: function(entries) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      entries.forEach(function(entry) {
        store.put(entry.value, entry.key);
      });
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  },
  deleteMany: function(keys) {
    var that = this;
    return new Promise(function(resolve, reject) {
      var tx = that._db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      keys.forEach(function(key) {
        store.delete(key);
      });
      tx.oncomplete = function() {
        resolve(undefined);
      };
      tx.onabort = function() {
        reject(tx.error);
      };
    });
  }
};

module.exports = new SimpleDBFactory(SECRET);
