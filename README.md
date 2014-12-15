# Shed

A collection of tools for Workers

## Service Worker helpers

Shed provides some simple helpers for use in creating your own service workers. If you're not sure what service workers are or what they are for, start with [the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).

From your registering page, register your service worker in the normal way:

```javascript
navigator.serviceWorker.register('/service-worker.js', {scope: '/'});
```

As currently implemented in Chrome 40, a service worker must exist at the root of the scope that you intend it to control, or higher. So if you want all of the pages under `/myapp/` to be controlled by the worker, the worker script itself must be served from either `/` or `/myapp/`.

In your service worker you just need to use `importScripts` to load Shed

```javascript
importScripts('../shed/dist/shed.js');
```

## API

```javascript
// shed.router has get, put, post, delete, head and any methods, matching HTTP
// verbs. It uses ExpressJS style route syntax, extended to allow absolute URLs
// on other domains
shed.router.get('http://example.com/:page', function(request, keys) {
  return new Response('Handled a request for http://example.com/' + keys.page);
});

// The built-in handlers are networkFirst, networkOnly, cacheFirst, cacheOnly
// and fastest
shed.router.get('/shed-demo/:foo/:bar', shed.networkOnly);

// You can use relative URLs, which are relative to the scope of the worker
shed.router.get(':foo/:bar', shed.networkOnly);

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
```