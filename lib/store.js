'use strict';

var cacheName = '$$$shed-store$$$';
var baseUrl = 'https://shed.store.local/';

var Store = function() {
};

Store.prototype.get = function(key) {
	return caches.open(cacheName).then(function(cache) {
		return cache.match(baseUrl + key);
	}).then(function(response) {
		if (response) {
			return response.json();
		}
		return undefined;
	});
};

Store.prototype.set = function(key, value) {
	return caches.open(cacheName).then(function(cache) {
		return cache.put(baseUrl + key, new Response(JSON.stringify(value)));
	});
};

module.exports = new Store();