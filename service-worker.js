const CACHE_NAME = "rakaez-fingerprint-v9-approval-notifications";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=20261005-rkbasma-notifications",
  "./notifications.css?v=20261005-approval-notifications",
  "./login-phone.css?v=20260725-bilingual-phone-login",
  "./attendance-ui.css?v=20260725-attendance-result",
  "./app.js?v=20261005-approval-notifications",
  "./config.js",
  "./fingerprint-icon-192.png",
  "./fingerprint-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const notificationUrl = new URL("./?view=notifications", self.location.href).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const existing = windows[0];
      if (existing) return existing.focus().then(() => existing.navigate(notificationUrl));
      return clients.openWindow(notificationUrl);
    })
  );
});
