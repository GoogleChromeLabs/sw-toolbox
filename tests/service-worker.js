'use strict';

/* Setup */
importScripts('../sw-toolbox.js');

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

toolbox.options.debug = true;

/* Helpers */
var respondString = function(string) {
  return function() {
    return new Response(string);
  };
};

var respondOK = respondString('OK');
var respondError = function(reason) {
  return new Response(`Error: ${reason}`, {status: 500});
};

var rewrite = function(find, replace) {
  return function(request, values, options) {
    var req = new Request(request.url.replace(find, replace), request);
    var route = toolbox.router.match(req);
    if (!route) {
      return toolbox.router.default;
    }
    return route(req, values, options);
  }
};

/*
This section is actually just ensuring that the test infrastructure is fine
*/
toolbox.router.get('', rewrite(/\/$/, '/index.html'));
toolbox.router.get('index.html', toolbox.fastest);
toolbox.router.get('tests.js', toolbox.networkFirst);
toolbox.router.get('/(.*)/qunit/(.*)', toolbox.fastest);
toolbox.precache(['index.html', 'test.js', '../node_modules/qunitjs/qunit/qunit.css', '../node_modules/qunitjs/qunit/qunit.js']);

/* Routes needed for tests */
toolbox.router.default = respondString('Default');
toolbox.router.get(new URL('absolute/route', self.location).pathname, respondOK);
toolbox.router.get('relative/route', respondOK);
toolbox.router.get('matching/:string/patterns', function(request, values) {
  return new Response(values.string);
});

toolbox.router.any('matches/any/method', respondOK);
toolbox.router.head('matches/only/head', respondOK);

toolbox.router.get('multiple/match/:foo.html', respondString('1'));
toolbox.router.get('multiple/match/:foo', respondString('2'));

// Needed for 'Origin option'
toolbox.router.get('/shouldOK', respondOK, {origin: /originexample\.com$/});

// Needed for 'Regex routing'
toolbox.router.get(/regexexample\.com\/shouldOK/, respondOK);

toolbox.router.get('cache/:name', toolbox.cacheOnly);
toolbox.router.post('cache/:name', function(request) {
  return Promise.all([request.text(), caches.open(toolbox.options.cache.name)]).then(function(params) {
    var text = params[0], cache = params[1];
    return cache.put(request.url, new Response(text));
  }).then(respondOK, respondError);
});
toolbox.router.delete('cache/:name', function(request) {
  return toolbox.uncache(request.url).then(respondOK, respondError);
});

// Handler with a dedicated cache and maxCacheEntries set.
toolbox.router.get('fixtures/max-cache-entries/:foo', toolbox.networkFirst, {
  cache: {
    name: 'max-cache-entries',
    maxEntries: 2
  }
});

// Handler with a dedicated cache and maxCacheAgeSeconds set.
toolbox.router.get('fixtures/max-cache-age/:foo', toolbox.networkFirst, {
  cache: {
    name: 'max-cache-age',
    maxAgeSeconds: 1
  }
});

// Handler with a dedicated cache and maxCacheAgeSeconds and maxCacheEntries set.
toolbox.router.get('fixtures/max-cache-age-entries/:foo', toolbox.networkFirst, {
  cache: {
    name: 'max-cache-age-entries',
    maxAgeSeconds: 1,
    maxEntries: 2
  }
});

toolbox.router.get('fixtures/:foo', toolbox.cacheOnly);
// Single item
toolbox.precache('fixtures/a');
// Array of items
toolbox.precache(['fixtures/b', 'fixtures/c']);
// Array of Promises
toolbox.precache([Promise.resolve('fixtures/d'), Promise.resolve('fixtures/e')]);
// Array of Arrays
toolbox.precache(['fixtures/f', ['fixtures/g', 'fixtures/h'], ['fixtures/i', 'fixtures/j']]);
// Array of Promises for Arrays
toolbox.precache([Promise.resolve(['fixtures/k', 'fixtures/l']), Promise.resolve(['fixtures/m', 'fixtures/n'])]);
