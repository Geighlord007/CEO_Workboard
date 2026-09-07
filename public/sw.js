/* WTC · PWA Service Worker
 * 策略：
 *  - 预缓存：首页 / manifest / 图标
 *  - 导航请求(页面)：网络优先，失败回退缓存首页 → 弱网也能打开 App
 *  - 静态资源(assets)：缓存优先 + 后台更新（Vite 产物带内容哈希，天然版本化）
 *  - /api 一律直连，绝不缓存（含鉴权 Cookie）
 */
const VERSION = "wtc-v2";
const PRECACHE = `${VERSION}-pre`;
const NAVCACHE = `${VERSION}-nav`;
const RT_CACHE = `${VERSION}-rt`;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // 后台静默更新（哈希资源一般不变，变了就刷新缓存）
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(RT_CACHE).then((c) => c.put(req, copy));
        }
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(RT_CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

async function networkFirstNav(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copy = res.clone();
      const cache = await caches.open(NAVCACHE);
      cache.put(req, copy);
      cache.put("/index.html", copy);
    }
    return res;
  } catch (err) {
    const cached = (await caches.match(req)) || (await caches.match("/index.html"));
    if (cached) return cached;
    return new Response("离线且无缓存", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstNav(req));
    return;
  }
  // 静态资源：缓存优先
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // manifest / icons 等：直接查预缓存
  event.respondWith(cacheFirst(req));
});
