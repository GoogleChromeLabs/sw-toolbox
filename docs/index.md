---
layout: index
title: "SW Toolbox"
navigation_weight: 0
---

# Why

Service Worker Toolbox (or SW-Toolbox) provides some simple helpers for use
in creating your own service workers. Specifically, it provides common caching
patterns and an [expressive approach]({{ project_root_url }}/api#expressive-approach)
to using those strategies for runtime requests. If you're not sure what
service workers are or what they are for, start with
[the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).

# Install

Service Worker Toolbox is available through Bower, npm or direct from GitHub:

`bower install --save sw-toolbox`

`npm install --save sw-toolbox`

`git clone https://github.com/GoogleChrome/sw-toolbox.git`

# Usage

### Register your service worker

From your registering page, register your service worker in the normal way.
For example:

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
the [usage]({{ project_root_url }}/usage) and [api]({{ project_root_url }}/api) documentation.
