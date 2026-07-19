
function installPwa() {
  if (!deferredInstallPrompt) {
    showToast(
      'Opcja instalacji pojawi się w obsługiwanej przeglądarce po otwarciu aplikacji przez HTTPS.'
    );
    return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    updateOnlineInstallState();
    refreshPwaRuntimeStatus();
  });
}

function updateOnlineInstallState() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const visible = Boolean(deferredInstallPrompt) && !standalone;
  [
    el['header-install-button'],
    el['desktop-install-button'],
    el['settings-install-button'],
  ].forEach((button) => {
    button.classList.toggle('is-hidden', !visible);
  });
  if (el['pwa-maintenance-controls']) refreshPwaRuntimeStatus();
}
