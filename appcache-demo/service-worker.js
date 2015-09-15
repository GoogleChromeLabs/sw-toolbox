var matches = location.href.match('manifest=([^&]+)');
if (matches) {
  importScripts('../sw-toolbox.js');
  var manifest = decodeURIComponent(matches[1]);
  toolbox.appcache.use(manifest);
}
