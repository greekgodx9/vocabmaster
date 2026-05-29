// VocabMaster Service Worker — enables offline access & PWA install
const CACHE_NAME = 'vocabmaster-v3';
const ASSETS = [
  './',
  'index.html',
  'guide.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/api.js',
  'js/sync.js',
  'js/sm2.js',
  'js/storage.js',
  'js/tts.js',
];

// Install: cache all core app assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core assets');
      return cache.addAll(ASSETS);
    })
  );
  // Activate immediately — don't wait for old SW to die
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for app assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls — network only (don't cache API responses)
  if (
    url.hostname.includes('api.anthropic.com') ||
    url.hostname.includes('api.openai.com') ||
    url.hostname.includes('api.deepseek.com') ||
    url.hostname.includes('ark.cn-beijing.volces.com') ||
    url.hostname.includes('dashscope.aliyuncs.com') ||
    url.hostname.includes('open.bigmodel.cn') ||
    url.hostname.includes('api.moonshot.cn') ||
    url.hostname.includes('api.dictionaryapi.dev')
  ) {
    return; // browser handles normally
  }

  // App assets — cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cached, but also fetch fresh in background
      const fetched = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // fallback to cache if network fails
      return cached || fetched;
    })
  );
});
