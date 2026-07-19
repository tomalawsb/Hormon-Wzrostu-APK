// APK nie przyznaje WebView dostępu do sieci. Wersję pakietu i odpowiedź
// GitHub Release przekazuje ograniczony most Java, a PWA używa zwykłego fetch().
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

  if (
    isNativeAndroidApp() &&
    absoluteUrl === GITHUB_RELEASE_API &&
    typeof window.AndroidNative?.latestReleaseJson === 'function'
  ) {
    const payload = String(window.AndroidNative.latestReleaseJson() || '').trim();
    if (!payload) return new Response('', { status: 503 });
    try {
      JSON.parse(payload);
      return new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch {
      return new Response('', { status: 502 });
    }
  }

  return browserFetchBeforeNativeFix(input, options);
};

// Czytelniejsza propozycja: etykieta i samo miejsce w osobnych wierszach.
const renderMainRecommendationBeforeEmphasis = renderMainRecommendation;
renderMainRecommendation = function renderMainRecommendationWithEmphasis(options) {
  renderMainRecommendationBeforeEmphasis(options);
  const todayEntry = options?.todayEntry;
  const suggestion = options?.suggestion;
  if (!todayEntry && suggestion?.side && suggestion?.site) {
    const place = capitalize(formatPlace(suggestion.side, suggestion.site));
    el['main-action-eyebrow'].textContent = 'Dzisiaj do podania';
    el['main-action-heading'].innerHTML =
      `<span class="recommendation-heading-label">Proponowane miejsce</span>` +
      `<span class="recommendation-heading-place">${escapeHtml(place)}</span>`;
  }
};

const recommendationStyle = document.createElement('style');
recommendationStyle.textContent = `
    #main-action-heading .recommendation-heading-label {
      display: block;
      margin-bottom: 7px;
      color: #0b8e80;
      font-size: .46em;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: .055em;
      text-transform: uppercase;
    }
    #main-action-heading .recommendation-heading-place {
      display: block;
      color: #082f55;
      font-size: 1.18em;
      font-weight: 900;
      line-height: 1.04;
      letter-spacing: -.035em;
    }
    @media (max-width: 820px) {
      #main-action-heading .recommendation-heading-label { font-size: .48em; }
      #main-action-heading .recommendation-heading-place { font-size: 1.15em; }
    }
  `;
document.head.appendChild(recommendationStyle);

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
