  const GITHUB_RELEASE_API = 'https://api.github.com/repos/tomalawsb/Hormon-Wzrostu-APK/releases/latest';

  function parseVersionParts(value) {
    return String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  }

  function compareVersions(left, right) {
    const a = parseVersionParts(left);
    const b = parseVersionParts(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] > b[index]) return 1;
      if (a[index] < b[index]) return -1;
    }
    return 0;
  }

  function setUpdateStatus(message, kind = '') {
    if (!el['update-status']) return;
    el['update-status'].textContent = message;
    el['update-status'].classList.toggle('text-success', kind === 'success');
    el['update-status'].classList.toggle('text-danger', kind === 'error');
  }

  async function checkForUpdates({ autoDownload = false } = {}) {
    const button = el['check-update-button'];
    latestUpdateUrl = '';
    latestUpdateVersion = '';
    el['download-update-button'].classList.add('is-hidden');
    button.disabled = true;
    setUpdateStatus('Sprawdzanie najnowszego wydania…');
    try {
      const localVersionResponse = await fetch('./app-version.json', { cache: 'no-store' });
      if (localVersionResponse.ok) {
        const localVersion = await localVersionResponse.json();
        currentAppVersion = String(localVersion.version || currentAppVersion).replace(/^v/i, '');
      }
      const response = await fetch(GITHUB_RELEASE_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (response.status === 404) {
        setUpdateStatus('Na GitHubie nie ma jeszcze opublikowanego wydania APK.');
        return;
      }
      if (!response.ok) throw new Error(`GitHub odpowiedział kodem ${response.status}`);
      const release = await response.json();
      const releaseVersion = String(release.tag_name || '').replace(/^v/i, '');
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const apk = assets.find((asset) => /Dzienniczek.*\.apk$/i.test(asset.name || ''))
        || assets.find((asset) => /\.apk$/i.test(asset.name || ''));

      if (!releaseVersion || compareVersions(releaseVersion, currentAppVersion) <= 0) {
        setUpdateStatus(`Masz najnowszą wersję ${currentAppVersion}.`, 'success');
        return;
      }
      if (!apk?.browser_download_url) {
        latestUpdateUrl = String(release.html_url || '');
        latestUpdateVersion = releaseVersion;
        setUpdateStatus(`Jest wersja ${releaseVersion}, ale wydanie nie zawiera pliku APK.`, 'error');
        if (latestUpdateUrl) {
          el['download-update-button'].textContent = 'Otwórz wydanie na GitHubie';
          el['download-update-button'].classList.remove('is-hidden');
        }
        return;
      }

      latestUpdateUrl = apk.browser_download_url;
      latestUpdateVersion = releaseVersion;
      el['download-update-button'].textContent = `Pobierz wersję ${releaseVersion}`;
      el['download-update-button'].classList.remove('is-hidden');
      setUpdateStatus(`Dostępna jest nowsza wersja ${releaseVersion}. Rozpoczynam pobieranie APK…`, 'success');
      if (autoDownload) await downloadAvailableUpdate({ skipCheck: true });
    } catch (error) {
      console.warn('Nie udało się sprawdzić aktualizacji:', error);
      setUpdateStatus('Nie udało się sprawdzić aktualizacji. Sprawdź internet i spróbuj ponownie.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function downloadAvailableUpdate({ skipCheck = false } = {}) {
    if (!latestUpdateUrl) {
      if (skipCheck) return;
      await checkForUpdates({ autoDownload: false });
      return;
    }
    let opened = false;
    if (typeof window.NativeBridge?.openExternal === 'function') {
      opened = await window.NativeBridge.openExternal(latestUpdateUrl);
    } else {
      opened = Boolean(window.open(latestUpdateUrl, '_blank', 'noopener,noreferrer'));
    }
    if (!opened) {
      showToast('Nie udało się otworzyć pliku aktualizacji.', 'error');
      return;
    }
    showToast(`Pobieranie wersji ${latestUpdateVersion} rozpoczęte. Po pobraniu zatwierdź instalację.`, 'success');
  }



  // Wersja 1.0.9: czytelny ekran główny na telefonie
  const renderMainRecommendationBeforeMobilePolish = renderMainRecommendation;
  renderMainRecommendation = function renderMainRecommendationMobilePolish(options) {
    renderMainRecommendationBeforeMobilePolish(options);
    const todayEntry = options?.todayEntry;
    const suggestion = options?.suggestion;
    const ampouleInfo = options?.ampouleInfo;

    if (!todayEntry && suggestion?.side && suggestion?.site) {
      const place = capitalize(formatPlace(suggestion.side, suggestion.site));
      el['main-action-eyebrow'].textContent = 'Dzisiaj do podania';
      el['main-action-heading'].innerHTML =
        `<span class="recommendation-heading-label">Proponowane miejsce</span>` +
        `<span class="recommendation-heading-place">${escapeHtml(place)}</span>`;
      el['main-action-text'].textContent = `Dawka ${formatDose(data.settings.defaultDose)} ${data.settings.unit} o ${data.settings.defaultTime}.`;
    }

    if (ampouleInfo?.configured && !todayEntry) {
      const left = ampouleInfo.approximateDosesLeftAfterToday;
      el['ampoule-alert-text'].textContent = `Po dawce zostanie około ${formatMl(ampouleInfo.remainingAfterToday)} ml, czyli ${left} ${plural(left, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}.`;
    }
  };

  const mobilePolishStyle = document.createElement('style');
  mobilePolishStyle.textContent = `
    @media (max-width: 820px) {
      .action-card {
        padding: 22px 20px 26px;
      }
      .today-profile-heading {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        text-align: center;
      }
      .today-profile-heading > div {
        min-width: 0;
        text-align: center;
      }
      .today-profile-heading #main-status-badge {
        grid-column: 1 / -1;
        justify-self: center;
        margin-top: 6px;
      }
      #main-action-eyebrow {
        font-size: .94rem;
        line-height: 1.25;
        text-align: center;
      }
      #main-action-heading {
        width: 100%;
        text-align: center;
      }
      #main-action-heading .recommendation-heading-label {
        margin-bottom: 9px;
        font-size: .58em;
        line-height: 1.15;
        text-align: center;
      }
      #main-action-heading .recommendation-heading-place {
        font-size: 1.28em;
        line-height: 1.02;
        text-align: center;
      }
      .today-profile-name {
        font-size: 1.08rem;
        text-align: center;
      }
      .today-key-metrics {
        gap: 12px;
      }
      .today-key-metric {
        padding: 16px 14px;
      }
      .today-key-metric > span {
        font-size: .94rem;
        line-height: 1.25;
      }
      .today-key-metric > strong {
        font-size: 1.18rem;
        line-height: 1.2;
      }
      .today-key-metric > small {
        font-size: 1rem;
        line-height: 1.35;
      }
      #main-action-text {
        margin: 2px 0 0;
        color: var(--text);
        font-size: 1.08rem;
        line-height: 1.45;
        text-align: center;
      }
      .ampoule-alert {
        padding: 15px 16px;
        gap: 5px;
      }
      .ampoule-alert strong {
        font-size: 1.08rem;
      }
      .ampoule-alert span {
        font-size: 1rem;
        line-height: 1.4;
      }
      .action-card__actions .button {
        min-height: 52px;
        font-size: 1rem;
      }
      .mobile-nav-button {
        font-size: .92rem;
      }
    }
  `;
  document.head.appendChild(mobilePolishStyle);
