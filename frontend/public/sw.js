/* PharmaFlow service worker: the web app opens, refreshes and signs in with no network.
 *
 * - Shell ("/") and every script/style it references are cached on install.
 * - Content-hashed files (/_expo/static, /assets) are cache-first.
 * - Everything else on this origin (including the un-hashed dev bundle) is network-first
 *   with the cached copy as fallback, so you always get fresh code when online.
 * - Navigations fall back to the cached shell, so any URL (/dashboard, /superadmin/...) opens.
 * - API and cross-origin traffic (backend, Supabase) is never touched: the app's own
 *   local database handles data.
 */
const VERSION = "pharmaflow-v4";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = "/";
const NAV_TIMEOUT_MS = 4000;
const PRECACHE_EXT = /\.(js|css|png|jpg|ico|json|woff2?|ttf|bundle)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const shell = await caches.open(SHELL_CACHE);
        const res = await fetch(SHELL_URL, { cache: "reload" });
        if (res.ok) {
          await shell.put(SHELL_URL, res.clone());

          // Pre-cache what the shell references so the very first offline reload works.
          const html = await res.text();
          const urls = new Set(["/manifest.json", "/icon.png", "/favicon.ico"]);
          const re = /(?:src|href)=["']([^"']+)["']/g;
          let m;
          while ((m = re.exec(html))) {
            const u = new URL(m[1], self.location.origin);
            if (u.origin === self.location.origin && PRECACHE_EXT.test(u.pathname)) {
              urls.add(u.pathname + u.search);
            }
          }
          const assets = await caches.open(ASSET_CACHE);
          await Promise.all([...urls].map((u) => assets.add(u).catch(() => {})));
        }
      } catch (e) {
        // Installing offline-ready is best effort; never block the worker.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  if (!ms) return promise; // no timeout: a dead connection fails fast on its own
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function networkFirst(req, cacheName, cacheKey, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await withTimeout(fetch(req), timeoutMs);
    if (fresh.ok) {
      if (fresh.type === "basic") cache.put(cacheKey || req, fresh.clone());
      return fresh;
    }
    const cached = await cache.match(cacheKey || req);
    if (cached) return cached;
    return fresh;
  } catch (e) {
    const cached = await cache.match(cacheKey || req);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;
  // Dev-server live reload / HMR plumbing
  if (url.pathname.startsWith("/hot") || url.pathname.startsWith("/message")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      networkFirst(req, SHELL_CACHE, SHELL_URL, NAV_TIMEOUT_MS).catch(
        () =>
          new Response("Offline, and the app has not been cached yet. Open it once while online.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );
    return;
  }

  // Content-hashed build output never changes for a given URL: cache first.
  if (url.pathname.startsWith("/_expo/static/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        } catch (e) {
          return new Response("", { status: 504 });
        }
      })(),
    );
    return;
  }

  // Un-hashed same-origin files (dev bundle, manifest, icons): fresh when online, cached offline.
  // No timeout here: the dev bundle can take many seconds to build, and giving up early
  // would serve a stale copy of the code.
  event.respondWith(
    networkFirst(req, ASSET_CACHE, undefined, 0).catch(() => new Response("", { status: 504 })),
  );
});
