// Kin Care service worker — handles Web Push delivery only. No offline
// caching/Workbox: this app isn't trying to be a full offline PWA, it just
// needs a push + notificationclick handler to receive reminders sent by
// supabase/functions/send-reminders.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Kin Care', body: 'You have a reminder.', url: '/senior/checkin' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Not JSON — fall back to defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.jpg',
      badge: '/logo.jpg',
      data: { url: data.url },
      tag: data.tag || 'kincare-reminder',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/senior/checkin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
