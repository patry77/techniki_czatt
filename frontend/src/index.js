import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Importuj style Tailwind CSS
import './App.css';

// Utwórz root element dla React 18
const root = ReactDOM.createRoot(document.getElementById('root'));

// Renderuj aplikację
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Funkcja do raportowania wydajności
// Możesz przekazać funkcję do logowania wyników (na przykład: reportWebVitals(console.log))
// lub wysłać do analytics endpoint. Dowiedz się więcej: https://bit.ly/CRA-vitals
reportWebVitals();

// Hot Module Replacement (HMR) dla rozwoju
if (module.hot) {
  module.hot.accept('./App', () => {
    const NextApp = require('./App').default;
    root.render(
      <React.StrictMode>
        <NextApp />
      </React.StrictMode>
    );
  });
}

// Rejestracja Service Worker dla powiadomień push i offline caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('SW registration successful with scope: ', registration.scope);
        
        // Sprawdź aktualizacje
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nowy Service Worker jest dostępny
              console.log('Nowa wersja aplikacji jest dostępna. Odśwież stronę aby zaktualizować.');
              
              // Możesz pokazać powiadomienie użytkownikowi
              if (window.confirm('Dostępna jest nowa wersja aplikacji. Czy chcesz odświeżyć?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch(function(error) {
        console.log('SW registration failed: ', error);
      });
  });
}

// Obsługa offline/online statusu
window.addEventListener('online', function() {
  console.log('Aplikacja jest online');
  // Możesz dodać logikę dla przywrócenia połączenia
  document.body.classList.remove('offline');
  
  // Wyślij zdarzenie do aplikacji
  window.dispatchEvent(new CustomEvent('app-online'));
});

window.addEventListener('offline', function() {
  console.log('Aplikacja jest offline');
  // Możesz dodać logikę dla pracy offline
  document.body.classList.add('offline');
  
  // Wyślij zdarzenie do aplikacji
  window.dispatchEvent(new CustomEvent('app-offline'));
});

// Obsługa błędów JavaScript
window.addEventListener('error', function(event) {
  console.error('JavaScript error:', event.error);
  
  // Możesz wysłać błędy do systemu monitorowania
  // np. Sentry, LogRocket, itp.
});

// Obsługa błędów Promise
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Zapobiegnij wyświetlaniu błędu w konsoli
  event.preventDefault();
});

// Inicjalizacja PWA Install Banner
let deferredPrompt;
window.addEventListener('beforeinstallprompt', function(e) {
  // Zapobiegnij automatycznemu wyświetlaniu banera
  e.preventDefault();
  
  // Zapisz event aby móc go użyć później
  deferredPrompt = e;
  
  // Pokaż własny przycisk instalacji
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
    
    installButton.addEventListener('click', function() {
      // Ukryj przycisk
      installButton.style.display = 'none';
      
      // Pokaż prompt instalacji
      deferredPrompt.prompt();
      
      // Poczekaj na wybór użytkownika
      deferredPrompt.userChoice.then(function(choiceResult) {
        if (choiceResult.outcome === 'accepted') {
          console.log('Użytkownik zaakceptował instalację PWA');
        } else {
          console.log('Użytkownik odrzucił instalację PWA');
        }
        deferredPrompt = null;
      });
    });
  }
  
  // Wyślij zdarzenie do aplikacji
  window.dispatchEvent(new CustomEvent('pwa-installable'));
});

// Obsługa sukcesu instalacji PWA
window.addEventListener('appinstalled', function(event) {
  console.log('PWA została zainstalowana');
  
  // Ukryj przycisk instalacji jeśli istnieje
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'none';
  }
  
  // Wyślij zdarzenie do aplikacji
  window.dispatchEvent(new CustomEvent('pwa-installed'));
});

// Funkcja globalna do instalacji PWA (można wywołać z React)
window.installPWA = function() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        console.log('Użytkownik zainstalował PWA');
      }
      deferredPrompt = null;
    });
  }
};

// Wykrywanie czy aplikacja działa w trybie standalone (zainstalowana)
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  console.log('Aplikacja działa w trybie standalone');
  document.body.classList.add('standalone');
}

// Obsługa powiadomień push - sprawdź uprawnienia
if ('Notification' in window) {
  console.log('Powiadomienia są obsługiwane');
  
  if (Notification.permission === 'default') {
    // Automatycznie nie proś o uprawnienia - lepiej to zrobić w kontekście
    console.log('Uprawnienia do powiadomień nie zostały jeszcze udzielone');
  } else if (Notification.permission === 'granted') {
    console.log('Uprawnienia do powiadomień zostały udzielone');
  } else if (Notification.permission === 'denied') {
    console.log('Uprawnienia do powiadomień zostały odrzucone');
  }
}

// Monitorowanie wydajności
if ('performance' in window) {
  // Mierz czas ładowania aplikacji
  window.addEventListener('load', function() {
    setTimeout(function() {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      
      console.log('Czas ładowania aplikacji:', loadTime + 'ms');
      
      // Wyślij metryki do analytics jeśli potrzebne
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'timing_complete', {
          name: 'load',
          value: loadTime
        });
      }
      
      // Zmierz również First Contentful Paint i inne metryki
      if ('getEntriesByType' in performance) {
        const paintEntries = performance.getEntriesByType('paint');
        paintEntries.forEach(function(entry) {
          console.log(entry.name + ':', entry.startTime + 'ms');
        });
      }
    }, 0);
  });
}

// Dodaj globalne style dla offline stanu
const offlineStyles = `
  .offline {
    filter: grayscale(0.5);
  }
  
  .offline::before {
    content: 'Brak połączenia z internetem';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #f59e0b;
    color: white;
    text-align: center;
    padding: 8px;
    z-index: 9999;
    font-size: 14px;
  }
  
  .standalone {
    /* Style dla aplikacji zainstalowanej */
  }
`;

// Dodaj style do head
const styleElement = document.createElement('style');
styleElement.textContent = offlineStyles;
document.head.appendChild(styleElement);

// Eksportuj funkcje pomocnicze dla komponentów React
export const utils = {
  // Sprawdź czy aplikacja jest online
  isOnline: () => navigator.onLine,
  
  // Sprawdź czy aplikacja jest zainstalowana
  isInstalled: () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
  
  // Sprawdź czy powiadomienia są dostępne
  areNotificationsSupported: () => 'Notification' in window,
  
  // Sprawdź status uprawnień powiadomień
  getNotificationPermission: () => Notification.permission,
  
  // Poproś o uprawnienia do powiadomień
  requestNotificationPermission: async () => {
    if ('Notification' in window) {
      return await Notification.requestPermission();
    }
    return 'denied';
  },
  
  // Pokaż lokalne powiadomienie
  showNotification: (title, options = {}) => {
    if (Notification.permission === 'granted') {
      return new Notification(title, {
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        ...options
      });
    }
  },
  
  // Sprawdź czy Service Worker jest zarejestrowany
  isServiceWorkerRegistered: () => 'serviceWorker' in navigator && navigator.serviceWorker.controller,
  
  // Zaktualizuj Service Worker
  updateServiceWorker: async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        return registration.update();
      }
    }
  }
};