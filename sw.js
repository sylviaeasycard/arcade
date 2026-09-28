/* ==========================================================================
   Service Worker
   策略：網路優先（永遠拿最新版），連不上或超過 3 秒才用快取 → 離線也能玩
   ‧ 一般改程式：直接推上 GitHub 就好，不用改版本號
   ‧ 有「新增 / 刪除檔案」時：更新下面的 PRECACHE 清單，並把 VERSION 加 1
   ========================================================================== */
const VERSION = 'v2.2.0';
const CACHE = `arcade-${VERSION}`;
const NETWORK_TIMEOUT = 3000;

const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/core.js',
    './js/games/whack.js',
    './js/games/memory.js',
    './js/games/spot.js',
    './js/games/mahjong.js',
    './js/games/mines.js',
    './js/games/wheel.js',
    './js/games/pinball.js',
    './js/games/pong.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(cache => Promise.all(PRECACHE.map(url =>
                // 單一檔案失敗不會讓整個安裝失敗，只在 console 提醒
                cache.add(new Request(url, { cache: 'reload' }))
                    .catch(err => console.warn('[SW] 無法快取', url, err))
            )))
            .then(() => self.skipWaiting()) // 新版立刻接手，不用等所有分頁關掉
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(k => k.startsWith('arcade-') && k !== CACHE)
                .map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return; // 外部資源交給瀏覽器
    e.respondWith(networkFirst(req));
});

function fromCache(req) {
    return caches.match(req, { ignoreSearch: true })
        .then(res => res || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
}

function networkFirst(req) {
    return new Promise(resolve => {
        let settled = false;
        const done = res => { if (!settled && res) { settled = true; resolve(res); } };

        // 網路太慢時先用快取頂著
        const timer = setTimeout(() => fromCache(req).then(done), NETWORK_TIMEOUT);

        // no-cache：向伺服器確認是否有新版（沒變只回 304，很省流量）
        const netReq = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
        fetch(netReq)
            .then(res => {
                clearTimeout(timer);
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(req, copy));
                }
                done(res);
            })
            .catch(() => {
                clearTimeout(timer);
                fromCache(req).then(res => {
                    if (!settled) { settled = true; resolve(res || Response.error()); }
                });
            });
    });
}
