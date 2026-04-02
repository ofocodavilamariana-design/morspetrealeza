// =====================================================
//  MORS PET REALEZA — Firebase Messaging Service Worker
//  Versão: 1.0.0
// =====================================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ⚠️ IMPORTANTE: Esses valores devem ser IDÊNTICOS aos do index.html
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
//  NOTIFICAÇÃO EM BACKGROUND (app fechado / minimizado)
// =====================================================
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Mors Pet Realeza';
  const body  = payload.notification?.body  || 'Você tem um agendamento.';
  const icon  = payload.notification?.icon  || '/icons/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge:            '/icons/icon-96.png',
    tag:              'agendamento-lembrete',
    requireInteraction: true,   // notificação fica visível até o usuário interagir
    vibrate:          [200, 100, 200],
    data: {
      url: payload.fcmOptions?.link || 'https://morspetrealeza.vercel.app/#agendamento'
    },
    actions: [
      { action: 'ver',    title: '📅 Ver agendamento' },
      { action: 'fechar', title: 'Fechar'             }
    ]
  });
});

// =====================================================
//  CLIQUE NA NOTIFICAÇÃO
// =====================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'fechar') return;

  const targetUrl = event.notification.data?.url
    || 'https://morspetrealeza.vercel.app/#agendamento';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já há uma aba aberta, foca ela
      for (const client of clientList) {
        if (client.url.includes('morspetrealeza') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Caso contrário, abre nova aba
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// =====================================================
//  CACHE BÁSICO (offline shell)
// =====================================================
const CACHE_NAME = 'mors-pet-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET e Firebase/APIs externas
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firebaseio') ||
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic')    ||
      event.request.url.includes('fonts.')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Armazena em cache somente respostas válidas e mesma origem
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback para index.html quando offline
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
