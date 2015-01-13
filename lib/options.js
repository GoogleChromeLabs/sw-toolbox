'use strict';

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || self.location;
}
var version = 1;
var cachePrefix = 'shed-' + scope + '-';


module.exports = {
	cacheName: cachePrefix + version,
	cachePrefix: cachePrefix,
	debug: false,
	preCacheItems: [],
	// A regular expression to apply to HTTP response codes. Codes that match will
	// be considered successes, while others will not, and will not be cached.
	successResponses: /^0|([123]\d\d)|(40[14567])|410$/,
	version: version,
};
