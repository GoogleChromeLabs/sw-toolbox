---
layout: index
title: "Usage"
navigation_weight: 2
---

## Basic Routes

A _route_ is a URL pattern and request method associated with a handler.
It defines the behaviour for a section of the site.
_Routing_ is the process of matching an incoming request with the most
appropriate route. To define a route you call the appropriate method on
`toolbox.router`.

For example, to send `GET` requests for the URL `'/myapp/index.html'` to the
built-in `toolbox.networkFirst` handler, you would write the following in your
service worker file:

`toolbox.router.get('/myapp/index.html', toolbox.networkFirst);`

If you don't need wildcards in your route, and your route applies to the same
domain as your main site, then you can use a string like `'/myapp/index.html'`.
However, if you need wildcards (e.g. match _any_ URL that begins with
`/myapp/`), or if you need to match URLs that belong to different domains (e.g.
match `https://othersite.com/api/`), `sw-toolbox` has two options for
configuring your routes.

## Express-style Routes

For developers familiar with [Express routing](http://expressjs.com/en/guide/routing.html),
`sw-toolbox` offers support for similar named wildcards, via the
[`path-to-regexp`](https://github.com/pillarjs/path-to-regexp) library.

If you use a `String` to define your route, it's assumed you're using
Express-style routes.

By default, a route will only match URLs on the same origin as the service
worker. If you'd like your Express-style routes to match URLs on different
origins, you need to pass in a value for the `origin` option. The value could be
either a `String` (which is checked for an exact match) or a `RegExp` object.
In both cases, it's matched against the full origin of the URL
(e.g. `'https://example.com'`).

Some examples of using Express-style routing include:

```javascript
// URL patterns are the same syntax as Express routes
// (http://expressjs.com/guide/routing.html)
toolbox.router.get(':foo/index.html', function(request, values) {
  return new Response('Handled a request for ' + request.url +
      ', where foo is "' + values.foo + '"');
});

// For requests to other origins, specify the origin as an option
toolbox.router.post('/(.*)', apiHandler, {origin: 'https://api.example.com'});
```

## Regular Expression Routes

Developers who are more comfortable using [regular expressions](https://regex101.com/)
can use an alternative syntax to define routes, passing in a
[`RegExp`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
object as the first parameter. This `RegExp` will be matched against the full
request URL when determining whether the route applies, including the origin and
path. This can lead to simpler cross-origin routing vs. Express-style routes,
since both the origin and the path are matched simultaneously, without having
to specify a separate `origin` option.

Note that while Express-style routes allow you to name path fragment
parameters that will be passed to your handler (see `values.foo` in the previous
example), that functionality is not supported while using regular expression
routes.

Some examples of using Regular Expression routing include:

```javascript
// Match URLs that end in index.html
toolbox.router.get(/index.html$/, function(request) {
  return new Response('Handled a request for ' + request.url);
});

// Match URLs that begin with https://api.example.com
toolbox.router.post(/^https:\/\/api.example.com\//, apiHandler);
```

## The Default Route

`sw-toolbox` supports defining an optional "default" route via
`toolbox.router.default` that is used whenever there is no alternative route for
a given URL. If `toolbox.router.default` is not set, then `sw-toolbox` will
just ignore requests for URLs that don't match any alternative routes, and the
requests will potentially be handled by the browser as if there were no
service worker involvement.

```javascript
// Provide a default handler for GET requests
toolbox.router.default = myDefaultRequestHandler;
```

## Precaching

You can provide a list of resources which will be cached at service worker install time

```javascript
toolbox.precache(['/index.html', '/site.css', '/images/logo.png']);
```

## Defining Request Handlers
A request handler takes three arguments.

```javascript
var myHandler = function(request, values, options) {
  // ...
}
```

- `request` - The [Request](https://fetch.spec.whatwg.org/#request) object that
triggered the `fetch` event
- `values` - When using Express-style routing paths, this will be an object
whose keys are the placeholder names in the URL pattern, with the values being
the corresponding part of the request URL. For example, with a URL pattern of
`'/images/:size/:name.jpg'` and an actual URL of `'/images/large/unicorns.jpg'`,
`values` would be `{size: 'large', name: 'unicorns'}`.
When using a RegExp for the path, `values` will not be set.
- `options` - the [options](#options) passed to one of the [router methods](#methods).

The return value should be a [Response](https://fetch.spec.whatwg.org/#response),
or a [Promise](http://www.html5rocks.com/en/tutorials/es6/promises/) that
resolves with a Response. If another value is returned, or if the returned
Promise is rejected, the Request will fail which will appear to be a
[NetworkError](https://developer.mozilla.org/en-US/docs/Web/API/DOMException#exception-NetworkError)
to the page that made the request.
