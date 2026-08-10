function setUpdateStatus(message, kind = '') {
  if (!el['update-status']) return;
  el['update-status'].textContent = message;
  el['update-status'].classList.toggle('text-success', kind === 'success');
  el['update-status'].classList.toggle('text-danger', kind === 'error');
}

async function checkForUpdates() {
  if (!isNativeAndroidApp()) return checkPwaUpdate({ announce: true });
  const button = el['check-update-button'];
  button.disabled = true;
  setUpdateStatus('Sprawdzanie wersji aplikacji…');
  try {
    const localVersionResponse = await fetch('./app-version.json', { cache: 'no-store' });
    if (localVersionResponse.ok) {
      const localVersion = await localVersionResponse.json();
      currentAppVersion = String(localVersion.version || currentAppVersion).replace(/^v/i, '');
    }
    setUpdateStatus(
      `Wersja ${currentAppVersion}. Aktualizacje są instalowane bezpiecznie przez Google Play.`,
      'success'
    );
  } catch (error) {
    console.warn('Nie udało się odczytać wersji aplikacji:', error);
    setUpdateStatus('Aktualizacje są instalowane bezpiecznie przez Google Play.');
  } finally {
    button.disabled = false;
  }
}
