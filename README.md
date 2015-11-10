# Service Worker Toolbox

> A collection of tools for [service workers](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/)

Service Worker Toolbox provides some simple helpers for use in creating your own service workers. If you're not sure what service workers are or what they are for, start with [the explainer doc](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md).

## Install

Service Worker Toolbox is available through Bower, npm or direct from github:

`bower install --save sw-toolbox`

`npm install --save sw-toolbox`

`git clone https://github.com/GoogleChrome/sw-toolbox.git`

### Register your service worker

From your registering page, register your service worker in the normal way. For example:

```javascript
navigator.serviceWorker.register('my-service-worker.js');
```

For even lower friction, especiall if you don't do anything more fancy than registering with a default scope, you can instead include the Service Worker Toolbox companion script in your HTML:

```html
<script src="/path/to/sw-toolbox/companion.js" data-service-worker="my-service-worker.js"></script>
```

As implemented in Chrome 40 or later, a service worker must exist at the root of the scope that you intend it to control, or higher. So if you want all of the pages under `/myapp/` to be controlled by the worker, the worker script itself must be served from either `/` or `/myapp/`. The default scope is the containing path of the service worker script.

### Add Service Worker Toolbox to your service worker script

In your service worker you just need to use `importScripts` to load Service Worker Toolbox

```javascript
importScripts('bower_components/sw-toolbox/sw-toolbox.js'); // Update path to match your own setup
```

## Usage

### Defining Routes

A _route_ is a combination of a URL and an HTTP request method and a request handler. For example, to send `GET` requests for the URL `'/myapp/index.html'` to a handler called `mainHandler()` you would write the following in your service worker file: 

`toolbox.router.get('/myapp/index.html', mainHandler);`

Some other examples follow.

```javascript
// For some common cases Service Worker Toolbox provides a built-in handler
toolbox.router.get('/', toolbox.networkFirst);

// URL patterns are the same syntax as ExpressJS routes
// (http://expressjs.com/guide/routing.html)
toolbox.router.get(':foo/index.html', function(request, values) {
  return new Response('Handled a request for ' + request.url +
      ', where foo is "' + values.foo + '"');
});

// For requests to other origins, specify the origin as an option
toolbox.router.post('/(.*)', apiHandler, {origin: 'https://api.example.com'});

// Provide a default handler for GET requests
toolbox.router.default = myDefaultRequestHandler;
```

### Precaching

You can provide a list of resources which will be cached at service worker install time

```javascript
toolbox.precache(['/index.html', '/site.css', '/images/logo.png']);
```

### Defining Request Handlers
A request handler takes three arguments.

```javascript
var myHandler = function(request, values, options) {
  // ...
}
```

- `request` - The [Request](https://fetch.spec.whatwg.org/#request) object that triggered the `fetch` event
- `values` - Object whose keys are the placeholder names in the URL pattern, with the values being the corresponding part of the request URL. For example, with a URL pattern of `'/images/:size/:name.jpg'` and an actual URL of `'/images/large/unicorns.jpg'`, `values` would be `{size: 'large', name: 'unicorns'}`
- `options` - the [options](#options) passed to one of the [router methods](#methods).

The return value should be a [Response](https://fetch.spec.whatwg.org/#response), or a [Promise](http://www.html5rocks.com/en/tutorials/es6/promises/) that resolves with a Response. If another value is returned, or if the returned Promise is rejected, the Request will fail which will appear to be a [NetworkError](https://developer.mozilla.org/en-US/docs/Web/API/DOMException#exception-NetworkError) to the page that made the request.

## API

### Options

All options can be specified globally via properties of `toolbox.options`.
Any individual options can be configured on a per-handler basis, via the `Object` passed as the
third parameter to `toolbox.router` methods.

#### debug [Boolean]
Determines whether extra information is logged to the browser's console.

_Default_: `false`

#### networkTimeoutSeconds [Number]
A timeout that applies to the `toolbox.networkFirst` built-in handler.
If `networkTimeoutSeconds` is set, then any network requests that take longer than that amount of time
will automatically fall back to the cached response if one exists. When
`networkTimeoutSeconds` is not set, the browser's native networking timeout logic applies.

_Default_: `null`

#### cache [Object]
Various properties of `cache` control the behavior of the default cache when set via
`toolbox.options.cache`, or the cache used by a specific request handler.

#### cache.name [String]
The name of the [`Cache`](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#cache)
used to store [`Response`](https://fetch.spec.whatwg.org/#response-class) objects. Using a unique name
allows you to customize the cache's maximum size and age of entries.

_Default_: Generated at runtime based on the service worker's `registration.scope` value.

#### cache.maxEntries [Number]
Imposes a least-recently used cache expiration policy
on entries cached via the various built-in handlers. You can use this with a cache that's dedicated
to storing entries for a dynamic set of resources with no natural limit. Setting `cache.maxEntries` to, e.g.,
`10` would mean that after the 11th entry is cached, the least-recently used entry would be
automatically deleted. The cache should never end up growing beyond `cache.maxEntries` entries.
This option will only take effect if `cache.name` is also set.
It can be used alone or in conjunction with `cache.maxAgeSeconds`.

_Default_: `null`

#### cache.maxAgeSeconds [Number]
Imposes a maximum age for cache entries, in seconds.
You can use this with a cache that's dedicated to storing entries for a dynamic set of resources
with no natural limit. Setting `cache.maxAgeSeconds` to, e.g., `60 * 60 * 24` would mean that any
entries older than a day would automatically be deleted.
This option will only take effect if `cache.name` is also set.
It can be used alone or in conjunction with `cache.maxEntries`.

_Default_: `null`

### Built-in handlers

There are five built-in handlers to cover the most common network strategies. For more information about offline strategies see the [Offline Cookbook](http://jakearchibald.com/2014/offline-cookbook/).

#### `toolbox.networkFirst`
Try to handle the request by fetching from the network. If it succeeds, store the response in the cache. Otherwise, try to fulfill the request from the cache. This is the strategy to use for basic read-through caching. It's also good for API requests where you always want the freshest data when it is available but would rather have stale data than no data.

#### `toolbox.cacheFirst`
If the request matches a cache entry, respond with that. Otherwise try to fetch the resource from the network. If the network request succeeds, update the cache. This option is good for resources that don't change, or have some other update mechanism.

#### `toolbox.fastest`
Request the resource from both the cache and the network in parallel. Respond with whichever returns first. Usually this will be the cached version, if there is one. On the one hand this strategy will always make a network request, even if the resource is cached. On the other hand, if/when the network request completes the cache is updated, so that future cache reads will be more up-to-date.

#### `toolbox.cacheOnly`
Resolve the request from the cache, or fail. This option is good for when you need to guarantee that no network request will be made, for example saving battery on mobile.

#### `toolbox.networkOnly`
Handle the request by trying to fetch the URL from the network. If the fetch fails, fail the request. Essentially the same as not creating a route for the URL at all.

###Methods

#### `toolbox.router.get(urlPattern, handler, options)`
#### `toolbox.router.post(urlPattern, handler, options)`
#### `toolbox.router.put(urlPattern, handler, options)`
#### `toolbox.router.delete(urlPattern, handler, options)`
#### `toolbox.router.head(urlPattern, handler, options)`
Create a route that causes requests for URLs matching `urlPattern` to be resolved by calling `handler`. Matches requests using the GET, POST, PUT, DELETE or HEAD HTTP methods respectively.

- `urlPattern` - an Express style route. See the docs for the [path-to-regexp](https://github.com/pillarjs/path-to-regexp) module for the full syntax
- `handler` - a request handler, as [described above](#using-request-handlers)
- `options` - an object containing options for the router. This options object will be passed to the request handler. The `origin` option is specific to the router methods, and can be either an exact string or a Regexp against which the origin of the Request must match for the router to be used.

#### `toolbox.router.any(urlPattern, handler, options)`
Like `toolbox.router.get`, etc., but matches any HTTP method.

#### `toolbox.router.default`
Takes a function to use as the request handler for any GET request that does not match a route.

#### `toolbox.precache(arrayOfURLs)`
Add each URL in arrayOfURLs to the list of resources that should be cached during the service worker install step. Note that this needs to be called before the install event is triggered, so you should do it on the first run of your script.

#### `toolbox.cache(url, options)`
Causes the resource at `url` to be added to the cache and returns a Promise that resolves with void. The `options` parameter supports the `debug` and `cache` [global options](#global-options).

#### `toolbox.uncache(url, options)`
Causes the resource at `url` to be removed from the cache and returns a Promise that resolves to true if the cache entry is deleted. The `options` parameter supports  the `debug` and `cache` [global options](#global-options).

## Support

If you’ve found an error in this library, please file an issue at: https://github.com/GoogleChrome/sw-toolbox/issues.

Patches are encouraged, and may be submitted by forking this project and submitting a pull request through GitHub.

## License

Copyright 2015 Google, Inc.

Licensed under the [Apache License, Version 2.0](LICENSE) (the "License"); 
you may not use this file except in compliance with the License. You may 
obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
