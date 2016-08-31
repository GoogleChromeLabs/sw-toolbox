/* eslint-env browser */
'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'cache-updated') {
      caches.open(event.data.cacheName)
        .then(cache => cache.match(event.data.url))
        .then(response => response.text())
        .then(text => document.querySelector('#test').textContent =
          `${text} (updated via message handler)`);
    }
  });
}

document.querySelector('#fetch').addEventListener('click', () => {
  fetch('data/test.txt').then(response => response.text()).then(text => {
    document.querySelector('#test').textContent = text;
  });
});
