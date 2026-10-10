import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

registerRootComponent(App);

// Web / PWA: register the service worker so the app opens and refreshes with no network.
// (The worker serves un-hashed dev files network-first, so development still sees fresh code.)
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Make the app installable
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.json';
      document.head.appendChild(link);
    }
  } catch (e) {}

  // When a newer service worker takes over, reload once so the page runs the latest code
  // instead of an older cached bundle.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    try {
      if (window.sessionStorage.getItem('sw_reloaded') === '1') return;
      window.sessionStorage.setItem('sw_reloaded', '1');
    } catch (e) {}
    window.location.reload();
  });

  const register = () =>
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch((e) => {
        console.warn('Service worker registration failed:', e?.message);
      });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
