const CACHE_VERSION = 'pregnancy-weight-tracker-v1';
const APP_SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const CACHEABLE_DESTINATIONS = new Set(['document', 'script', 'style', 'image', 'font', 'manifest']);

const isHttpRequest = (request) => request.url.startsWith('http://') || request.url.startsWith('https://');

const isSameOrigin = (url) => url.origin === self.location.origin;

const isCacheableRequest = (request) => {
  if (request.method !== 'GET' || !isHttpRequest(request)) {
    return false;
  }

  const url = new URL(request.url);

  if (!isSameOrigin(url)) {
    return false;
  }

  if (url.pathname.endsWith('.csv')) {
    return false;
  }

  return CACHEABLE_DESTINATIONS.has(request.destination) || url.pathname.startsWith('/assets/');
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_VERSION)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const fetchAndCache = async (request) => {
  const response = await fetch(request);

  if (response && response.ok && isCacheableRequest(request)) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  }

  return response;
};

const handleNavigationRequest = async (request) => {
  try {
    const response = await fetchAndCache(request);
    const cache = await caches.open(CACHE_VERSION);
    await cache.put('/index.html', response.clone());

    return response;
  } catch {
    const cachedResponse = await caches.match('/index.html');

    return cachedResponse ?? Response.error();
  }
};

const handleAssetRequest = async (request) => {
  const cachedResponse = await caches.match(request);
  const networkResponsePromise = fetchAndCache(request).catch(() => cachedResponse);

  return cachedResponse ?? networkResponsePromise;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isCacheableRequest(request)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  event.respondWith(handleAssetRequest(request));
});