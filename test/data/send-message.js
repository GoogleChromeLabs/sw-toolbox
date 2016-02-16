self.sendMessage = function(object) {
  var jsonString = JSON.stringify(object);

  // Send message to all client pages (one of which will be
  // the test page)
  self.clients.matchAll({
    includeUncontrolled: true
  })
  .then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage(jsonString);
    });
  });
};
