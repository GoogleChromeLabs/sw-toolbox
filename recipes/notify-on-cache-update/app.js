/* eslint-env browser */
'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'cache-updated') {
      var url = event.data.url;
      document.querySelector('#test').textContent +=
        ` (there is an update to ${url})`;
    }
  });
}

document.querySelector('#fetch').addEventListener('click', () => {
  fetch('data/test.txt').then(response => response.text()).then(text => {
    document.querySelector('#test').textContent = text;
  });
});
