# ⚠️ sw-toolbox ⚠️

`sw-toolbox` and `sw-precache` are deprecated in favor of Workbox.
Please read [this migration guide](https://developers.google.com/web/tools/workbox/guides/migrations/migrate-from-sw)
for information on upgrading.

## About

> A collection of tools for [service workers](https://w3c.github.io/ServiceWorker/)

Service Worker Toolbox provides some simple helpers for use in creating your own service workers. Specifically, it provides common caching strategies for dynamic content, such as API calls, third-party resources, and large or infrequently used local resources that you don't want precached.

Service Worker Toolbox provides an [expressive approach](https://googlechromelabs.github.io/sw-toolbox/usage.html#express-style-routes) to using those strategies for runtime requests. If you're not sure what service workers are or what they are for, start with [the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).

## What if I need precaching as well?

Then you should go check out [`sw-precache`](https://github.com/GoogleChrome/sw-precache) before doing anything else. In addition to precaching static resources, `sw-precache` supports optional [runtime caching](https://github.com/GoogleChrome/sw-precache#runtime-caching) through a simple, declarative configuration that incorporates Service Worker Toolbox under the hood.

## Install

Service Worker Toolbox is available through Bower, npm or direct from GitHub:

`bower install --save sw-toolbox`

`npm install --save sw-toolbox`

`git clone https://github.com/GoogleChrome/sw-toolbox.git`

### Register your service worker

From your registering page, register your service worker in the normal way. For example:

```javascript
navigator.serviceWorker.register('my-service-worker.js');
```

As implemented in Chrome 40 or later, a service worker must exist at the root of the scope that you intend it to control, or higher. So if you want all of the pages under `/myapp/` to be controlled by the worker, the worker script itself must be served from either `/` or `/myapp/`. The default scope is the containing path of the service worker script.

For even lower friction, you can instead include the Service Worker Toolbox companion script in your HTML as shown below. Be aware that this is not customizable. If you need to do anything fancier than register with a default scope, you'll need to use the standard registration.

```html
<script src="/path/to/sw-toolbox/companion.js" data-service-worker="my-service-worker.js"></script>
```

### Add Service Worker Toolbox to your service worker script

In your service worker you just need to use `importScripts` to load Service Worker Toolbox:

```javascript
importScripts('bower_components/sw-toolbox/sw-toolbox.js');  // Update path to match your own setup.
```

### Use the toolbox

To understand how to use the toolbox read the [Usage](https://googlechromelabs.github.io/sw-toolbox/usage.html#main) and [API](https://googlechromelabs.github.io/sw-toolbox/api.html#main) documentation.

## License

Copyright 2015-2016 Google, Inc.

Licensed under the [Apache License, Version 2.0](LICENSE) (the "License");
you may not use this file except in compliance with the License. You may
obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
