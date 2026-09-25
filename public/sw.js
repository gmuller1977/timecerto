// Service worker do TimeCerto — SÓ avisos no celular (migração 016).
//
// Não guarda cache nem intercepta requisição nenhuma, de propósito: um
// service worker com cache prenderia o app numa versão velha depois de cada
// publicação. Ele existe porque o navegador só entrega notificação a quem
// tem um.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    aviso = { corpo: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || 'TimeCerto', {
      body: aviso.corpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Mesmo tipo substitui o anterior: dois "jogo marcado" não empilham
      tag: aviso.tag || 'timecerto',
      renotify: aviso.tag === 'vaga',
      data: { url: aviso.url || '/' },
    }),
  );
});

// Tocar no aviso abre o link dele — numa aba do app que já esteja aberta, se houver
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const aba of abertas) {
        if (new URL(aba.url).origin === self.location.origin && 'focus' in aba) {
          await aba.navigate(destino).catch(() => null);
          return aba.focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
