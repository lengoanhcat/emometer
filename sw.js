/* Google basic config */

// `/index.html?timestamp=${timeStamp}`,
// `/styles/main.css?timestamp=${timeStamp}`,
// `/scripts/main.min.js?timestamp=${timeStamp}`,
// `/scripts/comlink.global.js?timestamp=${timeStamp}`,
// `/scripts/messagechanneladapter.global.js?timestamp=${timeStamp}`,
// `/sounds/airhorn.mp3?timestamp=${timeStamp}`

// const version = "0.0.0";
// const cacheName = `eyeq-${version}`;
// self.addEventListener('install', e => {
//   const timeStamp = Date.now();
//   e.waitUntil(
//     caches.open(cacheName).then(cache => {
//       return cache.addAll([
//         `/`,
//         `https://download.affectiva.com/js/3.2/adapter-1.4.0.js`
//       ])
//           .then(() => self.skipWaiting());
//     })
//     .then( () => alert( 'content is now available offline' ) )
//     .catch( () => alert( 'oh noes! something went wrong' ) )    
//   );
// });

// self.addEventListener('activate', event => {
//   event.waitUntil(self.clients.claim());
// });

// self.addEventListener('fetch', event => {
//   console.log(event.request.url);
//   event.respondWith(
//     caches.open(cacheName)
//       .then(cache => cache.match(event.request, {ignoreSearch: true}))
//       .then(response => {
//       return response || fetch(event.request);
//     })
//   );
// });

/* Network or cache */
var CACHE = 'network-or-cache';

// On install, cache some resource.
self.addEventListener('install', function(evt) {
  console.log('The service worker is being installed.');

  // Ask the service worker to keep installing until the returning promise
  // resolves.
  evt.waitUntil(precache());
});

// On fetch, use cache but update the entry with the latest contents
// from the server.
self.addEventListener('fetch', function(evt) {
  console.log('The service worker is serving the asset.');
  // Try network and if it fails, go for the cached copy.
  evt.respondWith(fromNetwork(evt.request, 400).catch(function () {
    return fromCache(evt.request);
  }));
});

// Open a cache and use `addAll()` with an array of assets to add all of them
// to the cache. Return a promise resolving when all the assets are added.
function precache() {
  return caches.open(CACHE).then(function (cache) {
    return cache.addAll([
      './',
      './demo',
      './demo/css',
      './demo/css/lato',
      './demo/js',
      './demo/js/vendor'
    ]);
  });
}

// Time limited network request. If the network fails or the response is not
// served before timeout, the promise is rejected.
function fromNetwork(request, timeout) {
  return new Promise(function (fulfill, reject) {
    // Reject in case of timeout.
    var timeoutId = setTimeout(reject, timeout);
    // Fulfill in case of success.
    fetch(request).then(function (response) {
      clearTimeout(timeoutId);
      fulfill(response);
    // Reject also if network fetch rejects.
    }, reject);
  });
}

// Open the cache where the assets were stored and search for the requested
// resource. Notice that in case of no matching, the promise still resolves
// but it does with `undefined` as value.
function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (matching) {
      return matching || Promise.reject('no-match');
    });
  });
}