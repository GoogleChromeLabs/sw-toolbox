/* eslint-env browser */
'use strict';

// Please register for your own YouTube API key!
// https://developers.google.com/youtube/v3/getting-started#before-you-start
const API_KEY = 'AIzaSyC4trKMxwT42TUFHmikCc4xxQTWWxq5S0g';
const API_URL = 'https://www.googleapis.com/youtube/v3/search';

function serializeUrlParams(params) {
  return Object.keys(params).map(key => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

function youtubeSearch(searchTerm, maxResults) {
  let params = {
    part: 'snippet',
    maxResults: maxResults,
    order: 'date',
    key: API_KEY,
    q: searchTerm
  };

  let url = new URL(API_URL);
  url.search = serializeUrlParams(params);

  return fetch(url).then(response => {
    if (response.ok) {
      return response.json();
    }
    throw new Error(`${response.status}: ${response.statusText}`);
  }).then(function(json) {
    return json.items;
  });
}

document.querySelector('#search').addEventListener('submit', event => {
  event.preventDefault();

  var results = document.querySelector('#results');
  while (results.firstChild) {
    results.removeChild(results.firstChild);
  }

  let searchTerm = document.querySelector('#searchTerm').value;
  let maxResults = document.querySelector('#maxResults').value;

  youtubeSearch(searchTerm, maxResults).then(videos => {
    videos.forEach(video => {
      let img = document.createElement('img');
      img.src = video.snippet.thumbnails.medium.url;
      results.appendChild(img);
    });
  }).catch(error => console.warn('YouTube search failed due to', error));
});
