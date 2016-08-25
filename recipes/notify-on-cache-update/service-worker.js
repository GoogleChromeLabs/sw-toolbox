(global => {
  'use strict';

  // Load the sw-toolbox library.
  importScripts('../../build/sw-toolbox.js');

  // Turn on debug logging, visible in the Developer Tools' console.
  global.toolbox.options.debug = true;

  // Set up a handler for HTTP GET requests for /data/ URLs:
  global.toolbox.router.get(/\/data\//, global.toolbox.fastest, {
    // Use a dedicated cache for the responses, separate from the default cache.
    // Enable notifyOnCacheUpdate to get message events if the response changes.
    cache: {
      name: 'data-cache',
      notifyOnCacheUpdate: true
    },
  });

  // By default, all requests that don't match our custom handler will use the
  // toolbox.networkFirst cache strategy, and their responses will be stored in
  // the default cache.
  global.toolbox.router.default = global.toolbox.networkFirst;

  // Boilerplate to ensure our service worker takes control of the page as soon
  // as possible.
  global.addEventListener('install', () => global.skipWaiting());
  global.addEventListener('activate', () => global.clients.claim());
})(self);
