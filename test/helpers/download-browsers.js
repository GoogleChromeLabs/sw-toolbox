const seleniumAssistant = require('selenium-assistant');

const promises = [
  seleniumAssistant.downloadBrowser('chrome', 'stable', true),
  seleniumAssistant.downloadBrowser('chrome', 'beta', true),
  seleniumAssistant.downloadBrowser('chrome', 'unstable', true),
  seleniumAssistant.downloadBrowser('firefox', 'stable', true),
  seleniumAssistant.downloadBrowser('firefox', 'beta', true),
  seleniumAssistant.downloadBrowser('firefox', 'unstable', true)
];

Promise.all(promises)
.then(() => {
  console.log('Browser download complete.');
})
.catch(() => {
  console.log('Unable to download browsers.');
});
