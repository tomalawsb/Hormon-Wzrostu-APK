(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('dzienniczek-hormonu-v'))
          .map((name) => caches.delete(name))
      );
    }
  } catch {
    // Start aplikacji nie może zależeć od obsługi cache w danej wersji WebView.
  } finally {
    window.location.replace('./web/index.html');
  }
})();
