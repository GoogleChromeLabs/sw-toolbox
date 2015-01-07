'use strict';

var version = 1;
var cachePrefix = 'shed-' + self.scope + '-';

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
