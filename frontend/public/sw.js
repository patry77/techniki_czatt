// Service Worker dla powiadomień push i offline cache
const CACHE_NAME = 'chat-app-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/favicon.ico'
];

// Instalacja Service Workera
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Cache opened');
        return cache.addAll(urlsToCache.filter(url => url !== '/static/css/main.css' && url !== '/static/js/main.js'));
      })
      .catch(function(error) {
        console.log('Service Worker: Cache failed', error);
      })
  );
  self.skipWaiting();
});

// Aktywacja Service Workera
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Przechwytywanie żądań
self.addEventListener('fetch', function(event) {
  // Tylko dla żądań GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Zwróć z cache lub pobierz z sieci
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(function(response) {
          // Sprawdź czy odpowiedź jest prawidłowa
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Klonuj odpowiedź
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(function() {
        // Jeśli jesteś offline i nie ma w cache, pokaż stronę offline
        if (event.request.destination === 'document') {
          return new Response(
            '<html><body><h1>Brak połączenia</h1><p>Sprawdź połączenie internetowe</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      })
  );
});

// Nasłuchuj na zdarzenie push
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push received');
  
  let notificationData = {
    title: 'ChatApp',
    body: 'Otrzymałeś nową wiadomość',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Otwórz'
      },
      {
        action: 'close',
        title: 'Zamknij'
      }
    ],
    requireInteraction: true,
    silent: false
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        data: {
          ...notificationData.data,
          ...data.data,
          url: data.url || notificationData.data.url
        }
      };
    } catch (error) {
      console.error('Service Worker: Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
      .then(() => {
        console.log('Service Worker: Notification shown');
        
        // Odtwórz dźwięk powiadomienia za pomocą Web Audio API
        try {
          // Stwórz prosty dźwięk powiadomienia
          if (self.AudioContext || self.webkitAudioContext) {
            const audioContext = new (self.AudioContext || self.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
          }
        } catch (audioError) {
          console.log('Service Worker: Audio notification failed:', audioError);
        }
      })
      .catch(error => {
        console.error('Service Worker: Error showing notification:', error);
      })
  );
});

// Obsługa kliknięcia w powiadomienie
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Otwórz aplikację lub przekieruj do konkretnego miejsca
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Sprawdź czy aplikacja jest już otwarta
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Jeśli aplikacja nie jest otwarta, otwórz nową kartę
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .catch(function(error) {
        console.error('Service Worker: Error handling notification click:', error);
      })
  );
});

// Obsługa zamknięcia powiadomienia
self.addEventListener('notificationclose', function(event) {
  console.log('Service Worker: Notification closed');
});

// Obsługa błędów
self.addEventListener('error', function(event) {
  console.error('Service Worker: Error occurred:', event.error);
});

// Obsługa komunikatów z głównego wątku
self.addEventListener('message', function(event) {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Funkcja pomocnicza do wysyłania wiadomości do klientów
function sendMessageToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

// Okresowe sprawdzanie aktualizacji
setInterval(() => {
  sendMessageToClients({ type: 'HEARTBEAT', timestamp: Date.now() });
}, 30000); // Co 30 sekund

console.log('Service Worker: Loaded and ready');