(global => {
  'use strict';

  var matches = location.href.match('manifest=([^&]+)');
  if (matches) {
    var manifest = decodeURIComponent(matches[1]);

    // Load the sw-tookbox library.
    importScripts('../../sw-toolbox.js');

    // Turn on debug logging, visible in the Developer Tools' console.
    global.toolbox.options.debug = true;

    // Pass in the location of the manifest file to sw-toolbox, which will in turn set up the
    // corresponding service worker based on the configuration.
    global.toolbox.appCacheManifest(manifest);
  } else {
    console.warn('Please provide the AppCache Manifest file in the manifest= URL query parameter.');
  }
})(self);
