const PWA_INSTALL_QUESTION_KEY = 'dzienniczek-hormonu-pwa-install-question-v1';
let pwaInstallQuestionPending = false;

function isPwaInstallQuestionCompleted() {
  try {
    return localStorage.getItem(PWA_INSTALL_QUESTION_KEY) === 'done';
  } catch {
    return false;
  }
}

function markPwaInstallQuestionCompleted() {
  try {
    localStorage.setItem(PWA_INSTALL_QUESTION_KEY, 'done');
  } catch {}
}

function canOfferPwaInstallation() {
  return !isNativeAndroidApp() && !isStandalonePwa();
}

function showFirstRunPwaInstallQuestion() {
  if (!canOfferPwaInstallation() || isPwaInstallQuestionCompleted()) return;
  pwaInstallQuestionPending = true;
  window.setTimeout(() => {
    if (el['permissions-dialog']?.open) return;
    pwaInstallQuestionPending = false;
    el['pwa-install-dialog-note']?.classList.toggle('is-hidden', Boolean(deferredInstallPrompt));
    if (!el['pwa-install-dialog']?.open) el['pwa-install-dialog']?.showModal();
  }, 220);
}

function finishFirstRunAndOfferPwaInstall() {
  if (!canOfferPwaInstallation() || isPwaInstallQuestionCompleted()) return;
  showFirstRunPwaInstallQuestion();
}

async function confirmFirstRunPwaInstall() {
  markPwaInstallQuestionCompleted();
  if (el['pwa-install-dialog']?.open) el['pwa-install-dialog'].close();
  await installPwa();
}

function postponeFirstRunPwaInstall() {
  markPwaInstallQuestionCompleted();
  if (el['pwa-install-dialog']?.open) el['pwa-install-dialog'].close();
  showToast('Aplikację możesz zainstalować później w Ustawieniach → Informacje o aplikacji.', 'success');
}

async function installPwa() {
  if (!canOfferPwaInstallation()) {
    showToast('Aplikacja jest już zainstalowana.', 'success');
    return false;
  }
  if (!deferredInstallPrompt) {
    showToast('Otwórz menu przeglądarki i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.');
    return false;
  }
  deferredInstallPrompt.prompt();
  try {
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') markPwaInstallQuestionCompleted();
  } finally {
    deferredInstallPrompt = null;
    updateOnlineInstallState();
    refreshPwaRuntimeStatus();
  }
  return true;
}

function updateOnlineInstallState() {
  const standalone = isStandalonePwa();
  const native = isNativeAndroidApp();
  const browserPwa = !native && !standalone;
  [el['header-install-button'], el['desktop-install-button']].forEach((button) => {
    button?.classList.toggle('is-hidden', !browserPwa || !deferredInstallPrompt);
  });
  if (el['settings-install-button']) {
    el['settings-install-button'].classList.toggle('is-hidden', !browserPwa);
    el['settings-install-button'].disabled = false;
    el['settings-install-button'].textContent = deferredInstallPrompt
      ? 'Zainstaluj aplikację teraz'
      : 'Jak zainstalować aplikację';
  }
  if (el['pwa-install-dialog-note']) {
    el['pwa-install-dialog-note'].classList.toggle('is-hidden', Boolean(deferredInstallPrompt));
  }
  if (pwaInstallQuestionPending && deferredInstallPrompt) showFirstRunPwaInstallQuestion();
  if (el['pwa-maintenance-controls']) refreshPwaRuntimeStatus();
}
