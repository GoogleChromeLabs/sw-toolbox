# Shed

A collection of tools for Workers

## Service Worker helpers

Shed provides some simple helpers for use in creating your own service workers. If you're not sure what service workers are or what they are for, start with [the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).

### Installing Shed

Shed is available through Bower, npm or direct from github:

`bower install --save shed`

`npm install --save shed`

`git clone https://github.com/wibblymat/shed.git`

### Registering your service worker

From your registering page, register your service worker in the normal way. For example:

```javascript
navigator.serviceWorker.register('my-service-worker.js', {scope: '/'});
```

For even lower friction, if you don't intend to doing anything more fancy than just registering with a default scope, you can instead include the Shed companion script in your HTML:

```html
<script src="/path/to/shed/companion.js" data-service-worker="my-service-worker.js"></script>
```

As currently implemented in Chrome 40, a service worker must exist at the root of the scope that you intend it to control, or higher. So if you want all of the pages under `/myapp/` to be controlled by the worker, the worker script itself must be served from either `/` or `/myapp/`. The default scope is the containing path of the service worker script.

### Using Shed in your worker script

In your service worker you just need to use `importScripts` to load Shed

```javascript
importScripts('bower_components/shed/shed.js'); // Update path to match your own setup
```

## API

```javascript
// shed.router has get, put, post, delete, head and any methods, matching HTTP
// verbs. It uses ExpressJS style route syntax
shed.router.get('/myapp/index.html', function(request, keys) {
  return new Response('Handled a request for /myapp/index.html');
});

// The built-in handlers are networkFirst, networkOnly, cacheFirst, cacheOnly
// and fastest. The networkFirst, cacheFirst and fastest handlers will update
// the cached version if a response is fetched from the network.
shed.router.get('/myapp/index.html', shed.networkFirst); // Try the network, fallback to cache
shed.router.get('/myapp/index.html', shed.networkOnly); // Try the network, fail if not available
shed.router.get('/myapp/index.html', shed.cacheFirst); // Try the cache, fallback to network if not in the cache
shed.router.get('/myapp/index.html', shed.cacheOnly); // Try the cache, fail if not cached
shed.router.get('/myapp/index.html', shed.fastest); // Request from the cache and the network, return which ever comes back first

// You can use relative URLs, which are relative to the scope of the worker
shed.router.get(':foo/:bar', shed.networkOnly);

// For requests to other origins, pass the origin in the parameters to the route
shed.router.post('/(.*)', shed.networkFirst, {origin: 'https://api.example.com'});

// Origins can be specified as a RegExp
shed.router.post('/(.*)', shed.networkFirst, {origin: /https:\/\/.*\.example\.com/});

// At the moment, if the fetch is for a URL that doesn't match a route, you get
// some default behaviour. The 'default default' is networkOnly, but you can
// change it like so:
shed.router.default = shed.cacheFirst;

// If you want some resources to be cached during the install event, specify
// them with the precache method
shed.precache(['/index.html', '/site.css', '/images/logo.png']);

// You can manually add or remove things from the cache
shed.cache('/data/2014/posts.json');
shed.uncache('/data/2013/posts.json');

// You can pass options to most methods
// The `debug` option turns on verbose console logging
shed.router.get('/example/route/', shed.cacheFirst, {debug: true});

// The `cache` option tells shed to use an alternative cache. Provide the string name of the cache, not a Cache object.
shed.cache('/images/foo.png', {cache: 'my other cache'});

// These can also be set globally
shed.options.debug = true;
shed.options.cache = 'main cache';

```
