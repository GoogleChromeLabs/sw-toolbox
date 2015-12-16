/* eslint-env browser */
// If we're running on a real web server (as opposed to localhost, which is whitelisted),
// then change the protocol to HTTPS.
// See https://goo.gl/lq4gCo for an explanation as to why this is needed for some features.
(function() {
  var isLocalhost = Boolean(window.location.hostname === 'localhost' ||
    // [::1] is the IPv6 localhost address.
  window.location.hostname === '[::1]' ||
    // 127.0.0.1/8 is considered localhost for IPv4.
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/));
  if (window.location.protocol === 'http:' && !isLocalhost) {
    // Redirect to https: if we're currently using http: and we're not on localhost.
    window.location.protocol = 'https:';
  }
})();
