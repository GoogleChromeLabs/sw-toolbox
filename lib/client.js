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
'use strict';

/*
 * TODOs:
 * - options.scope? Single client can have multiple workers
 * - stale-while-revalidate: a way to ping back to the page as new versions
 *   come in?
 * - Possible idea for client config: Have one global method that gets you a
 *   toolbox object for a registration, and one for getting a registration. Then
 *   all other methods know which scope they are for.
 */

var options = require('./options');
var helpers = require('./helpers');

/**
 * Returns a promise that will resolve when the given registration becomes
 * active. `navigator.serviceWorker.ready` only works for the controlling
 * worker, while this method can be used with service workers that have other
 * scopes.
 *
 * @param registration {ServiceWorkerRegistration}
 * @param options {Object}
 * @return {Promise<undefined>}
 */
var registrationReady = function(registration, options) {
  if (registration.active) {
    helpers.debug('Service worker already active', options);
    return Promise.resolve();
  }

  var serviceWorker = registration.installing || registration.waiting;

  return new Promise(function(resolve, reject) {
    // Because the Promise function is called on next tick there is a
    // small chance that the worker became active already.
    if (serviceWorker.state === 'activated') {
      helpers.debug('Service worker activated', options);
      resolve();
    }
    var listener = function(event) {
      helpers.debug('Worker state is now ' + serviceWorker.state + '', options);
      if (serviceWorker.state === 'activated') {
        resolve();
      } else if (serviceWorker.state === 'redundant') {
        reject(new Error('Worker became redundant'));
      } else {
        return;
      }
      serviceWorker.removeEventListener('statechange', listener);
    };
    serviceWorker.addEventListener('statechange', listener);
  });
};

module.exports = {
  registrationReady: registrationReady,
  options: options,
  cache: helpers.addToCache,
  uncache: helpers.removeFromCache,
};
