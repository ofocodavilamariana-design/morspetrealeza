// =====================================================
//  MORS PET REALEZA — Firebase Messaging Service Worker
//  Versão: 2.0 (corrigida)
// =====================================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// 🔥 CONFIG FIREBASE (igual ao index.html)
firebase.initializeApp({
  apiKey:            "AIzaSyC01CzbeROn2pA9htfnGzQ-wXYI8_YOd-s",
  authDomain:        "mors-pet.firebaseapp.com",
  projectId:         "mors-pet",
  storageBucket:     "mors-pet.firebasestorage.app",
  messagingSenderId: "871317088909",
  appId:             "1:871317088909:web:02843b8f40e2c23ecc50c4"
});

const messaging = firebase.messaging();

// =====================================================
// 🔔 NOTIFICAÇÃO EM BACKGROUND (APP FECHADO)
// =====================================================
messaging.onBackgroundMessage((payload) => {
  console.log('📩 Background message:', payload);

  const title = payload.notification?.title || '🐾 Mors Pet Realeza';
  const body  = payload.notification?.body  || 'Você tem um agendamento hoje!';
  const icon  = payload.notification?.icon  || '/icons/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icons/icon-96.png',
    tag: 'agendamento-lembrete',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.fcmOptions?.link || 'https://morspetrealeza.com.br/#agendamento'
    },
    actions: [
      { action: 'ver', title: '📅 Ver agendamento' },
      { action: 'fechar', title: 'Fechar' }
    ]
  });
});

// =====================================================
// 📲 CLIQUE NA NOTIFICAÇÃO
// =====================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'fechar') return;

  const targetUrl =
    event.notification.data?.url ||
    'https://morspetrealeza.com.br/#agendamento';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('morspetrealeza') && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// =====================================================
// 💾 CACHE OFFLINE (PWA)
// =====================================================
const CACHE_NAME = 'mors-pet-v2';

const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// =====================================================
// 🌐 FETCH (CORRIGIDO — NÃO QUEBRA MAIS)
// =====================================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // ignora APIs externas
  if (
    url.includes('firebaseio') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('fonts.') ||
    url.includes('firestore')
  ) return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) return cached;

        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }

            const clone = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));

            return response;
          })
          .catch(() => {
            // 🔥 SEMPRE retorna algo válido
            return caches.match('/index.html');
          });
      })
  );
});
