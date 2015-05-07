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
    return toolbox.router.match(req)(req, values, options);
  }
};

/*
This section is actually just ensuring that the test infrastructure is fine
*/
toolbox.router.get('', rewrite(/\/$/, '/index.html'));
toolbox.router.get('index.html', toolbox.fastest);
toolbox.router.get('tests.js', toolbox.networkOnly);
toolbox.router.get('/(.*)', toolbox.fastest, {origin: /\/\/code.jquery.com/});

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


toolbox.router.get('cache/:name', toolbox.cacheOnly);
toolbox.router.post('cache/:name', function(request) {
  return Promise.all([request.text(), caches.open(toolbox.options.cacheName)]).then(function(params) {
    var text = params[0], cache = params[1];
    return cache.put(request.url, new Response(text));
  }).then(respondOK, respondError);
});
toolbox.router.delete('cache/:name', function(request) {
  return toolbox.uncache(request.url).then(respondOK, respondError);
});
