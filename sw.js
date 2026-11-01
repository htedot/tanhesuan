/* 碳核算刷题 Service Worker — 离线可用 */
const CACHE = 'ths-eb147ccf';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './data/questions.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './exam.html', './exam.js', './exam_core.js', './kaoshi.html', './kaoshi.js', './kaoshi_calc.js', './chai.html', './chai.js', './data/chai.json', './data/exam.json', './ziliao.html', './ziliao.js', './data/ziliao.json',
  './beisong.html', './beisong.js', './data/beisong.json', './data/beisong_sc.json',
  './biaozhun.html', './biaozhun.js', './data/biaozhun.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
