'use strict';

// TODO: This is necessary to handle different implementations in the wild
// The spec defines self.registration, but it was not implemented in Chrome 40.
var scope;
if (self.registration) {
  scope = self.registration.scope;
} else {
  scope = self.scope || new URL('./', self.location).href;
}

module.exports = {
	cacheName: '$$$shed-cache$$$' + scope + '$$$',
	debug: false,
	preCacheItems: [],
	// A regular expression to apply to HTTP response codes. Codes that match
	// will be considered successes, while others will not, and will not be
	// cached.
	successResponses: /^0|([123]\d\d)|(40[14567])|410$/,
};
