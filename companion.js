/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	    http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/
(function() {
  'use strict';
  var swScript = document.currentScript.dataset.serviceWorker;

  if (swScript && 'serviceWorker' in navigator) {
    var swUrl = new URL(swScript, document.baseURI);

    var manifest = document.firstChild.getAttribute('manifest');
    if (manifest) {
      var absoluteManifestUrl = new URL(manifest, document.baseURI);
      swUrl.search += (swUrl.search ? '&' : '') + 'manifest=' +
        absoluteManifestUrl;
    }

    var swUrlString = swUrl.toString();

    if (manifest && 'caches' in window) {
      window.caches.open(swUrlString).then(function(cache) {
        console.log('Adding %s to cache %s to match AppCache behavior.',
          window.location.href, swUrlString);
        cache.add(window.location.href);
      })
    }

    navigator.serviceWorker.register(swUrlString);
  }
})();
