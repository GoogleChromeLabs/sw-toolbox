var matches = location.href.match('manifest=([^&]+)');
if (matches) {
  importScripts('../sw-toolbox.js');
  var manifest = decodeURIComponent(matches[1]);
  toolbox.options.debug = true;
  toolbox.appCacheManifest(manifest);
}
