// ========================================
// Service Worker for PWA
// ========================================

const CACHE_NAME = 'task-manager-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.json'
];

// インストール時にキャッシュを作成
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワークリクエストの処理
self.addEventListener('fetch', (event) => {
  // Firebase関連のリクエストはキャッシュしない
  if (event.request.url.includes('firebasestorage.googleapis.com') ||
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュがあればそれを返す、なければネットワークから取得
        return response || fetch(event.request).then((fetchResponse) => {
          // 有効なレスポンスの場合のみキャッシュに追加
          if (fetchResponse && fetchResponse.status === 200 && fetchResponse.type === 'basic') {
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return fetchResponse;
        });
      })
      .catch(() => {
        // オフライン時でキャッシュもない場合
        console.log('[Service Worker] Fetch failed; returning offline page');
      })
  );
});
