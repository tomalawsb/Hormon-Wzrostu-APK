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

  async function checkForUpdates() {
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
      setUpdateStatus(`Dostępna jest nowsza wersja ${releaseVersion}.`, 'success');
    } catch (error) {
      console.warn('Nie udało się sprawdzić aktualizacji:', error);
      setUpdateStatus('Nie udało się sprawdzić aktualizacji. Sprawdź internet i spróbuj ponownie.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function downloadAvailableUpdate() {
    if (!latestUpdateUrl) {
      await checkForUpdates();
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

