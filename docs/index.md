---
layout: index
title: "SW Toolbox"
navigation_weight: 0
left_column: |
  # Why

  Service Worker Toolbox (or SW-Toolbox) provides some simple helpers for use
  in creating your own service workers. Specifically, it provides common caching
  patterns and an [expressive approach](./api#expressive-approach)
  to using those strategies for runtime requests. If you're not sure what
  service workers are or what they are for, start with
  [the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).
right_column: |
  # Install

  Service Worker Toolbox is available through NPM, Bower or direct from GitHub:

      npm install --save sw-toolbox

      bower install --save sw-toolbox

      git clone https://github.com/GoogleChrome/sw-toolbox.git
---

# Getting Started

Once you've installed sw-toolbox, you'll need to create a service worker file,
let's call in `my-service-worker.js`. It's in this file that we'll be using
sw-toolbox. But first we need to register our service worker.

From your web page, register your service worker file like so:

```javascript
navigator.serviceWorker.register('my-service-worker.js');
```

As implemented in Chrome 40 or later, a service worker must exist at the root
of the scope that you intend it to control, or higher. So if you want all of
the pages under `/myapp/` to be controlled by the worker, the worker script
itself must be served from either `/` or `/myapp/`. The default scope is the
containing path of the service worker script.

For even lower friction you can instead include the Service Worker Toolbox
companion script in your HTML as shown below. Be aware that this is not
customizable. If you need to do anything fancier than registering with a
default scope, you'll need to use the standard registration.

```html
<script src="/path/to/sw-toolbox/companion.js" data-service-worker="my-service-worker.js"></script>
```

### Add Service Worker Toolbox to your service worker script

In your service worker you just need to use `importScripts` to load Service Worker Toolbox

```javascript
importScripts('bower_components/sw-toolbox/sw-toolbox.js'); // Update path to match your own setup
```

For more information on how to use the toolbox read
the [usage](usage) and [api](api) documentation.
