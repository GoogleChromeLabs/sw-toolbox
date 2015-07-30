'use strict';

navigator.serviceWorker.register('service-worker.js', { scope: './' });

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

navigator.serviceWorker.ready.then(function() {

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

  QUnit.test('Method-based matching', function(assert) {
    checkValue('matches/any/method', 'OK', assert, 'get');
    checkValue('matches/any/method', 'OK', assert, 'put');
    checkValue('matches/any/method', 'OK', assert, 'post');
    checkValue('matches/any/method', 'OK', assert, 'delete');
    checkValue('matches/any/method', 'OK', assert, 'head');
    checkValue('matches/any/method', 'OK', assert, 'x-custom');

    checkValue('matches/only/head', 'OK', assert, 'head');
    checkValue('matches/only/head', 'Default', assert, 'get');
    checkValue('matches/only/head', 'Default', assert, 'put');
    checkValue('matches/only/head', 'Default', assert, 'post');
    checkValue('matches/only/head', 'Default', assert, 'delete');
    checkValue('matches/only/head', 'Default', assert, 'x-custom');
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
    var step1 = fetch(url);
    // If the fetch succeeds then we have a problem
    step1.then(function(response) {
      assert.ok(false, 'Succeeded fetching file that shouldn\'t exist');
      done();
    });

    // Otherwise, move on to the next check
    step1.catch(function(reason) {
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
      }).then(done);;
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
});
