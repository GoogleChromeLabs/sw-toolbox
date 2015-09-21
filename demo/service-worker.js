importScripts('../sw-toolbox.js');

(global => {
  'use strict';

  global.toolbox.options.debug = true;
  global.toolbox.options.networkTimeoutSeconds = 10;
  global.toolbox.router.default = global.toolbox.networkFirst;
})(self);
