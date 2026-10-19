// Registers the service worker, so the app can install and work offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker did not register:', error))
}
