/* فلوسي — Service Worker: التطبيق يشتغل أوفلاين من على الموبايل */
const CACHE = 'floosy-v3';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'tw.css', 'styles.css', 'app.js', 'api.js',
  'vendor/chart.umd.min.js',
  'fonts/cairo-face.css',
  'fonts/cairo-400-arabic.woff2', 'fonts/cairo-400-latin.woff2',
  'fonts/cairo-500-arabic.woff2', 'fonts/cairo-500-latin.woff2',
  'fonts/cairo-600-arabic.woff2', 'fonts/cairo-600-latin.woff2',
  'fonts/cairo-700-arabic.woff2', 'fonts/cairo-700-latin.woff2',
  'fonts/cairo-800-arabic.woff2', 'fonts/cairo-800-latin.woff2',
  'fonts/cairo-900-arabic.woff2', 'fonts/cairo-900-latin.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(SHELL.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // الـ API دائمًا من الشبكة (الطابور في الواجهة مسؤول عن الأوفلاين)
  if (url.pathname.startsWith('/api')) return;
  // التنقل (HTML): الشبكة أولًا عشان الصفحة طازة بعد كل نشر — والكاش احتياطي أوفلاين
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((h) => h || caches.match('index.html')))
    );
    return;
  }
  // باقي ملفات الواجهة: الكاش أولًا للسرعة + تحديث في الخلفية (stale-while-revalidate)
  // كده أي نشر جديد يوصل تلقائيًا من غير تحديث يدوي
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
