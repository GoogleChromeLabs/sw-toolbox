'use strict';

navigator.serviceWorker.register('service-worker.js');

// We want to delay the start of our tests until the page is controlled by
// the service worker, since only at that point will the service worker
// intercept network requests.
// We can't use navigator.serviceWorker.ready, since that promise resolves once
// the service worker is activated (but before it takes control of the page),
// so we need to create our own equivalent promise.
// See https://github.com/slightlyoff/ServiceWorker/issues/799
var controlledPromise = new Promise(function(resolve) {
  if (navigator.serviceWorker.controller) {
    resolve();
  } else {
    navigator.serviceWorker.addEventListener('controllerchange', resolve);
  }
});

var checkValue = function(url, value, assert, method) {
  var done = assert.async();
  method = method || 'get';
  return fetch(url, {method: method}).then(function(response) {
    return response.text();
  }).then(function(text) {
    assert.equal(text, value);
    done();
  }).catch(function(reason) {
    assert.ok(false, reason);
  });
};

var checkCache = function(cache, url, isExpected, assert) {
  var done = assert.async();
  setTimeout(function() {
    cache.match(url).then(function(response) {
      assert.equal(!!response, isExpected, url + ' is in the cache');
      done();
    });
  }, 500);
};

var executeInSeries = function(promises) {
  return promises.reduce(function(previous, current) {
    return previous = previous.then(current);
  }, Promise.resolve());
};

var pausePromise = function(timeout) {
  return new Promise(function(resolve) {
    setTimeout(resolve, timeout);
  });
};

controlledPromise.then(function() {
  QUnit.test('Default route', function(assert) {
    checkValue('not/real/path', 'Default', assert);
  });

  QUnit.test('Absolute route', function(assert) {
    checkValue(new URL('absolute/route', self.location).pathname, 'OK', assert);
  });

  QUnit.test('Relative route', function(assert) {
    checkValue('relative/route', 'OK', assert);
  });

  QUnit.test('Pattern matching', function(assert) {
    checkValue('matching/any/patterns', 'any', assert);
    checkValue('matching/all/patterns', 'all', assert);
  });

  QUnit.test('Origin option', function(assert) {
    checkValue('https://originexample.com/shouldOK', 'OK', assert);
  });

  QUnit.test('Regex routing', function(assert) {
    checkValue('https://regexexample.com/shouldOK', 'OK', assert);
  });

  QUnit.test('Method-based matching', function(assert) {
    checkValue('matches/any/method', 'OK', assert, 'get');
    checkValue('matches/any/method', 'OK', assert, 'put');
    checkValue('matches/any/method', 'OK', assert, 'post');
    checkValue('matches/any/method', 'OK', assert, 'delete');
    checkValue('matches/any/method', 'OK', assert, 'head');
    checkValue('matches/any/method', 'OK', assert, 'x-custom');

    checkValue('matches/only/head', 'OK', assert, 'head');
    checkValue('matches/only/head', 'Default', assert, 'get');
  });

  QUnit.test('First declared route wins', function(assert) {
    // Matches both routes
    checkValue('multiple/match/anything.html', '1', assert);

    // Only matches second route
    checkValue('multiple/match/anything', '2', assert);
  });

  // Testing the cache/uncache methods
  QUnit.test('Caching', function(assert) {
    // Construct a URL for a resource that should not already exist
    var date = Date.now();
    var url = 'cache/' + date;

    var done = assert.async();

    // Confirm that the URL cannot be fetched
    fetch(url).then(function(response) {
      // If the fetch succeeds then we have a problem
      assert.ok(false, 'Succeeded fetching file that shouldn\'t exist');
      done();
    }).catch(function(reason) {
      // Otherwise, move on to the next check
      // Add to the cache
      return fetch(url, {method: 'post', body: date + ''}).then(function(response) {
        // Check that retrieving from the cache now succeeds
        return checkValue(url, date, assert);
      }).then(function() {
        // Tidy up after ourselves
        return fetch(url, {method: 'delete'});
      }).catch(function(reason) {
        // Catch-all error handler
        assert.ok(false, 'Failed: ' + reason);
      }).then(done);
    });
  });

  QUnit.test('Precaching', function(assert) {
    checkValue('fixtures/a', 'a', assert);
    checkValue('fixtures/b', 'b', assert);
    checkValue('fixtures/c', 'c', assert);
    checkValue('fixtures/d', 'd', assert);
    checkValue('fixtures/e', 'e', assert);
    checkValue('fixtures/f', 'f', assert);
    checkValue('fixtures/g', 'g', assert);
    checkValue('fixtures/h', 'h', assert);
    checkValue('fixtures/i', 'i', assert);
    checkValue('fixtures/j', 'j', assert);
    checkValue('fixtures/k', 'k', assert);
    checkValue('fixtures/l', 'l', assert);
    checkValue('fixtures/m', 'm', assert);
    checkValue('fixtures/n', 'n', assert);
  });

  QUnit.test('Max Cache Entires', function(assert) {
    assert.expect(3);

    var urls = ['a', 'b', 'c'].map(function(letter) {
      return 'fixtures/max-cache-entries/' + letter;
    });

    var fetchPromises = urls.map(function(url) {
      return function() {
        return fetch(url).then(pausePromise.bind(null, 500));
      };
    });

    return caches.open('max-cache-entries').then(function(cache) {
      return executeInSeries(fetchPromises).then(function() {
        checkCache(cache, urls[0], false, assert);
        checkCache(cache, urls[1], true, assert);
        checkCache(cache, urls[2], true, assert);
      });
    });
  });

  QUnit.test('Max Cache Age', function(assert) {
    assert.expect(3);

    var urls = ['a', 'b', 'c'].map(function(letter) {
      return 'fixtures/max-cache-age/' + letter;
    });

    var fetchPromises = urls.map(function(url) {
      return fetch.bind(this, url);
    });
    fetchPromises.splice(1, 0, pausePromise.bind(null, 1500));

    return caches.open('max-cache-age').then(function(cache) {
      return executeInSeries(fetchPromises).then(function() {
        checkCache(cache, urls[0], false, assert);
        checkCache(cache, urls[1], true, assert);
        checkCache(cache, urls[2], true, assert);
      });
    });
  });

  QUnit.test('Max Cache Age + Entries', function(assert) {
    assert.expect(6);

    var urls = ['a', 'b', 'c'].map(function(letter) {
      return 'fixtures/max-cache-age-entries/' + letter;
    });

    var fetchPromises = urls.map(function(url) {
      return fetch.bind(this, url);
    });
    fetchPromises.splice(1, 0, pausePromise.bind(null, 1500));

    return caches.open('max-cache-age-entries').then(function(cache) {
      return executeInSeries(fetchPromises).then(function() {
        checkCache(cache, urls[0], false, assert);
        checkCache(cache, urls[1], true, assert);
        checkCache(cache, urls[2], true, assert);
      }).then(pausePromise.bind(null, 1500)).then(function() {
        var url = 'fixtures/max-cache-age-entries/d';
        return fetch(url).then(function() {
          checkCache(cache, urls[1], false, assert);
          checkCache(cache, urls[2], false, assert);
          checkCache(cache, url, true, assert);
        });
      });
    });
  });
});
