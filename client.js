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

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),o.toolbox=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";var options=require("./options"),helpers=require("./helpers"),registrationReady=function(e,r){if(e.active)return helpers.debug("Service worker already active",r),Promise.resolve();var t=e.installing||e.waiting;return new Promise(function(e,a){"activated"===t.state&&(helpers.debug("Service worker activated",r),e());var i=function(n){if(helpers.debug("Worker state is now "+t.state,r),"activated"===t.state)e();else{if("redundant"!==t.state)return;a(new Error("Worker became redundant"))}t.removeEventListener("statechange",i)};t.addEventListener("statechange",i)})};module.exports={registrationReady:registrationReady,options:options,cache:helpers.addToCache,uncache:helpers.removeFromCache};
},{"./helpers":2,"./options":3}],2:[function(require,module,exports){
"use strict";function debug(e,n){n=n||{};var c=n.debug||globalOptions.debug;c&&console.log("[sw-toolbox] "+e)}function openCache(e){e=e||{};var n=e.cacheName||globalOptions.cacheName;return debug('Opening cache "'+n+'"',e),caches.open(n)}function fetchAndCache(e,n){n=n||{};var c=n.successResponses||globalOptions.successResponses;return fetch(e.clone()).then(function(t){return c.test(t.status)&&openCache(n).then(function(n){n.put(e,t)}),t.clone()})}function renameCache(e,n,c){return debug("Renaming cache: ["+e+"] to ["+n+"]",c),caches["delete"](n).then(function(){return Promise.all([caches.open(e),caches.open(n)]).then(function(n){var c=n[0],t=n[1];return c.keys().then(function(e){return Promise.all(e.map(function(e){return c.match(e).then(function(n){return t.put(e,n)})}))}).then(function(){return caches["delete"](e)})})})}function addToCache(e,n){return openCache(n).then(function(n){return n.add(e)})}function removeFromCache(e,n){return openCache(n).then(function(n){return n["delete"](e)})}var globalOptions=require("./options");module.exports={debug:debug,fetchAndCache:fetchAndCache,openCache:openCache,renameCache:renameCache,addToCache:addToCache,removeFromCache:removeFromCache};
},{"./options":3}],3:[function(require,module,exports){
"use strict";var scope;scope=self.registration?self.registration.scope:self.scope||new URL("./",self.location).href,module.exports={cacheName:"$$$toolbox-cache$$$"+scope+"$$$",debug:!1,preCacheItems:[],successResponses:/^0|([123]\d\d)|(40[14567])|410$/};
},{}]},{},[1])(1)
});


//# sourceMappingURL=client.map.json