/* ============================================================
   Service Worker — مدیریت هزینه‌های ساختمان
   دامنه: https://mehradkhaliliparsa6490-max.github.io/amu/
   ============================================================ */

const CACHE_VERSION = 'v1';                 // ⬅️ با هر آپدیت index.html این عدد را بالا ببرید
const CACHE_NAME    = 'amu-cache-' + CACHE_VERSION;

/* فایل‌های پایه اپلیکیشن (مسیرها نسبی به پوشه /amu/ هستند) */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* فایل‌های CDN که برای کار آفلاین PDF لازم‌اند */
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

/* ---------- نصب ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // فایل‌های اصلی — اگر یکی نبود نصب شکست می‌خورد (خوب است برای اطمینان)
    await cache.addAll(APP_SHELL);

    // CDN — خطا در آن نباید مانع نصب شود
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(url, res.clone());
        }
      } catch (e) {
        // آفلاین هستیم یا CDN در دسترس نیست — بعداً در fetch کش می‌شود
      }
    }));

    await self.skipWaiting();
  })());
});

/* ---------- فعال‌سازی ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- پیام‌ها (به‌روزرسانی دستی) ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------- واکشی ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // فقط GET
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // فقط http/https — blob، data، chrome-extension و... رد می‌شوند
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* --- ۱) درخواست‌های ناوبری (باز شدن صفحه) --- */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // network first → همیشه آخرین نسخه
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        // آفلاین → از کش
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html'))
            || (await cache.match('./'))
            || new Response('آفلاین هستید و نسخه ذخیره‌شده‌ای یافت نشد.', {
                 status: 503,
                 headers: { 'Content-Type': 'text/html; charset=utf-8' }
               });
      }
    })());
    return;
  }

  /* --- ۲) بقیه منابع: cache first + به‌روزرسانی پس‌زمینه --- */
  event.respondWith((async () => {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: false });

    if (cached) {
      // نسخه جدید را بی‌صدا در پس‌زمینه بگیر
      fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
          }
        })
        .catch(() => {});
      return cached;
    }

    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      // در نهایت اگر index خواسته شد
      return (await cache.match('./index.html')) || Response.error();
    }
  })());
});