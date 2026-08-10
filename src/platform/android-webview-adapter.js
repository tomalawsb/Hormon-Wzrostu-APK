// Wersja Android działa wyłącznie na zasobach dołączonych do aplikacji.
const browserFetchBeforeNativeFix = window.fetch.bind(window);
window.fetch = async function nativeAwareFetch(input, options) {
  const rawUrl =
    typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input || '');
  let absoluteUrl = rawUrl;
  try {
    absoluteUrl = new URL(rawUrl, window.location.href).href;
  } catch {}

  if (
    isNativeAndroidApp() &&
    /\/app-version\.json(?:[?#]|$)/i.test(absoluteUrl) &&
    typeof window.AndroidNative?.appVersion === 'function'
  ) {
    const version = String(window.AndroidNative.appVersion() || '').trim();
    if (version) {
      return new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }

  return browserFetchBeforeNativeFix(input, options);
};

function applyRuntimeLayoutFixes() {
  if (typeof document.querySelector !== 'function') return;
  const updateBox = document.querySelector('.settings-update-box');
  const infoPanel = document.querySelector('[data-settings-panel="about"]');
  if (updateBox && infoPanel && !infoPanel.contains(updateBox)) infoPanel.prepend(updateBox);

  const ampouleCard = document.querySelector('[data-settings-panel="ampoules"] .settings-card');
  const ampouleButton = document.getElementById('ampoule-new-button');
  const formGrid = ampouleCard?.querySelector('.form-grid');
  if (
    ampouleCard &&
    ampouleButton &&
    formGrid &&
    !document.querySelector('.ampoule-primary-action')
  ) {
    const box = document.createElement('div');
    box.className = 'ampoule-primary-action';
    box.innerHTML =
      '<div><strong>Odłóż obecną ampułkę</strong><span>Zachowasz pozostałą ilość leku i później będzie można wrócić do tej ampułki.</span></div>';
    ampouleButton.className = 'button button--primary';
    box.appendChild(ampouleButton);
    ampouleCard.insertBefore(box, formGrid);

    const heading = document.createElement('div');
    heading.className = 'ampoule-settings-heading';
    heading.innerHTML =
      '<strong>Ustawienia bieżącej ampułki</strong><span>Data otwarcia, numer, pojemność i zużycie na jedno podanie.</span>';
    ampouleCard.insertBefore(heading, formGrid);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyRuntimeLayoutFixes, { once: true });
} else {
  applyRuntimeLayoutFixes();
}
