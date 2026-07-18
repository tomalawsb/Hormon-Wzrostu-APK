  function renderTodayDashboard() {
    const profiles = getAvailableProfiles();
    if (profiles.length <= 1) todayDashboardMode = 'profile';
    renderTodayProfileSwitcher(profiles);

    const showAll = todayDashboardMode === 'all' && profiles.length > 1;
    el['all-profiles-dashboard'].hidden = !showAll;
    el['single-profile-dashboard'].hidden = showAll;
    if (showAll) renderAllProfilesDashboard(profiles);
  }

  function renderTodayProfileSwitcher(profiles = getAvailableProfiles()) {
    if (!el['today-profile-switcher']) return;
    const multiple = profiles.length > 1;
    el['today-profile-switcher'].hidden = !multiple;
    el['today-profile-switcher'].classList.toggle('is-single-profile', !multiple);
    if (!multiple) {
      el['today-profile-switcher'].innerHTML = '';
      return;
    }

    const buttons = [];
    if (multiple) {
      const allActive = todayDashboardMode === 'all';
      buttons.push(`
        <button class="today-profile-tab${allActive ? ' is-active' : ''}" type="button"
          data-today-profile-mode="all" aria-pressed="${String(allActive)}">
          <span aria-hidden="true">👨‍👩‍👧‍👦</span><strong>Wszyscy</strong>
        </button>
      `);
    }
    profiles.forEach((profile) => {
      const active = todayDashboardMode === 'profile' && profile.id === data.activeProfileId;
      buttons.push(`
        <button class="today-profile-tab${active ? ' is-active' : ''}" type="button"
          data-today-profile-id="${escapeHtml(profile.id)}" aria-pressed="${String(active)}">
          <span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
        </button>
      `);
    });
    el['today-profile-switcher'].innerHTML = buttons.join('');
  }

  function handleTodayProfileSwitcherClick(event) {
    const allButton = event.target.closest('[data-today-profile-mode="all"]');
    if (allButton) {
      todayDashboardMode = 'all';
      renderToday();
      window.setTimeout(() => el['all-profiles-heading']?.focus?.({ preventScroll: true }), 0);
      return;
    }
    const profileButton = event.target.closest('[data-today-profile-id]');
    if (!profileButton) return;
    openTodayProfile(profileButton.dataset.todayProfileId);
  }

  function handleAllProfilesDashboardClick(event) {
    const button = event.target.closest('[data-open-today-profile]');
    if (!button) return;
    openTodayProfile(button.dataset.openTodayProfile);
  }

  function openTodayProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile || profile.archivedAt) return;
    todayDashboardMode = 'profile';
    if (!setActiveProfileId(profileId, { refresh: true })) {
      renderToday();
      return;
    }
    window.setTimeout(() => el['main-action-heading']?.focus?.({ preventScroll: true }), 0);
  }

  function renderAllProfilesDashboard(profiles = getAvailableProfiles()) {
    const summaries = profiles.map((profile) => getProfileTodaySummary(profile));
    const completed = summaries.filter((summary) => summary.status !== 'pending').length;
    el['all-profiles-progress'].textContent = `${completed} z ${summaries.length} zakończone`;
    el['all-profiles-progress'].dataset.complete = String(completed === summaries.length);
    el['all-profiles-list'].innerHTML = summaries.map(renderAllProfilesCard).join('');
  }

  function renderAllProfilesCard(summary) {
    const profile = summary.profile;
    const statusClass = summary.status === 'given' ? 'given' : summary.status === 'skipped' ? 'skipped' : 'pending';
    const statusText = summary.status === 'given' ? 'Podano' : summary.status === 'skipped' ? 'Pominięto' : 'Do podania';
    const mainText = summary.status === 'given'
      ? `Podano: ${capitalize(formatPlace(summary.todayEntry.side, summary.todayEntry.site))}`
      : summary.status === 'skipped'
        ? 'Dawka została pominięta'
        : summary.suggestion.side && summary.suggestion.site
          ? `Dzisiaj: ${capitalize(formatPlace(summary.suggestion.side, summary.suggestion.site))}`
          : 'Brak aktywnego miejsca wkłucia';
    const doseTime = summary.status === 'skipped'
      ? `Zapisano o ${escapeHtml(summary.todayEntry.time)}`
      : `${escapeHtml(summary.doseText)} · ${escapeHtml(summary.timeText)}`;
    const ampouleText = summary.ampoule.configured
      ? summary.status === 'skipped'
        ? `Ampułka ${summary.ampoule.number} · bez podania dzisiaj`
        : `Ampułka ${summary.ampoule.number} · dawka ${summary.ampoule.doseNumber || '—'}`
      : summary.ampoule.label;
    const remainingText = summary.ampoule.configured
      ? summary.status === 'pending'
        ? `Teraz ${formatMl(summary.ampoule.currentRemaining)} ml · po dawce ${summary.ampoule.dosesLeft} ${plural(summary.ampoule.dosesLeft, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}`
        : `Pozostało ${formatMl(summary.ampoule.currentRemaining)} ml · ${summary.ampoule.dosesLeft} ${plural(summary.ampoule.dosesLeft, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}${summary.ampoule.todayIsLast ? ' · ostatnia dawka' : ''}`
      : 'Uzupełnij ustawienia ampułki';

    return `
      <article class="all-profile-card all-profile-card--${statusClass}" data-profile-id="${escapeHtml(profile.id)}">
        <div class="all-profile-card__header">
          <span class="profile-avatar profile-avatar--large" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <div>
            <h3>${escapeHtml(profile.name)}</h3>
            <span class="status-badge status-badge--${summary.status === 'pending' ? 'neutral' : summary.status}">${statusText}</span>
          </div>
        </div>
        <div class="all-profile-card__main">
          <strong>${escapeHtml(mainText)}</strong>
          <span>${doseTime}</span>
        </div>
        <div class="all-profile-card__meta">
          <span>${escapeHtml(ampouleText)}</span>
          <span>${escapeHtml(remainingText)}</span>
        </div>
        <button class="button ${summary.status === 'pending' ? 'button--primary' : 'button--secondary'} button--small" type="button"
          data-open-today-profile="${escapeHtml(profile.id)}">
          ${summary.status === 'pending' ? 'Otwórz i przygotuj' : 'Zobacz szczegóły'}
        </button>
      </article>
    `;
  }

  function getProfileTodaySummary(profile, today = localDateISO()) {
    const entries = Array.isArray(profile?.entries) ? profile.entries : [];
    const todayEntry = entries.find((entry) => entry.date === today) || null;
    const status = todayEntry?.status === 'given' ? 'given' : todayEntry?.status === 'skipped' ? 'skipped' : 'pending';
    const suggestion = getSuggestedPlaceForProfile(profile, new Date());
    const dose = status === 'given' ? todayEntry.dose : profile.settings.defaultDose;
    const unit = status === 'given' ? todayEntry.unit : profile.settings.unit;
    const time = todayEntry?.time || profile.settings.defaultTime;
    return {
      profile,
      todayEntry,
      status,
      suggestion,
      doseText: `${formatDose(dose)} ${unit}`,
      timeText: time,
      ampoule: getProfileAmpouleDashboard(profile, todayEntry, today)
    };
  }

  function getProfileAmpouleDashboard(profile, todayEntry, today = localDateISO()) {
    const ampoules = Array.isArray(profile?.ampoules) ? profile.ampoules : [];
    const activeProfileAmpoule = ampoules.find((ampoule) => ampoule.id === profile.activeAmpouleId && ampoule.status !== 'finished') || null;
    const todayAmpoule = todayEntry?.ampouleId ? ampoules.find((ampoule) => ampoule.id === todayEntry.ampouleId) || null : null;
    const displayAmpoule = todayEntry?.status === 'given' && todayAmpoule
      ? todayAmpoule
      : (activeProfileAmpoule || todayAmpoule);
    const paused = ampoules.filter((ampoule) => ampoule.id !== profile.activeAmpouleId && getProfileAmpouleRemainingMl(profile, ampoule) > 0.000001);
    if (!displayAmpoule) {
      return {
        configured: false,
        label: paused.length ? 'Wybierz odłożoną ampułkę' : 'Ampułka nie jest rozpoczęta',
        number: 0,
        doseNumber: 0,
        dosesLeft: 0,
        currentRemaining: 0,
        remainingAfterToday: 0,
        todayIsLast: false,
        openDays: 0,
        maxOpenDays: Number(profile?.settings?.ampouleMaxOpenDays) || 0,
        tooLong: false
      };
    }

    const active = displayAmpoule;
    const doseMl = decimalToNumber(active.doseMl);
    const given = (Array.isArray(profile.entries) ? profile.entries : [])
      .filter((entry) => entry.ampouleId === active.id && entry.status === 'given')
      .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
    const todayGivenIndex = todayEntry?.status === 'given' && todayEntry.ampouleId === active.id
      ? given.findIndex((entry) => entry.id === todayEntry.id)
      : -1;
    const givenBeforeToday = given.filter((entry) => entry.date < today).length;
    const doseNumber = todayGivenIndex >= 0 ? todayGivenIndex + 1 : givenBeforeToday + 1;
    const remainingNow = getProfileAmpouleRemainingMl(profile, active);
    const projectedDose = !todayEntry ? doseMl : 0;
    const remainingAfterToday = Math.max(0, remainingNow - projectedDose);
    const dosesLeft = doseMl > 0 ? Math.floor((remainingAfterToday + 0.000001) / doseMl) : 0;
    const openDays = active.startDate && isValidIsoDate(active.startDate)
      ? Math.max(1, Math.floor((parseISODate(today).getTime() - parseISODate(active.startDate).getTime()) / 86400000) + 1)
      : 0;
    const maxOpenDays = Number(profile?.settings?.ampouleMaxOpenDays) || 0;
    const todayIsLast = statusForAmpouleDashboard(todayEntry) === 'given'
      && todayEntry.ampouleId === active.id
      && remainingAfterToday <= 0.000001;
    return {
      configured: doseMl > 0,
      label: doseMl > 0 ? `Ampułka ${active.number}` : 'Brak dawki ampułki w ml',
      number: active.number,
      doseNumber,
      dosesLeft,
      currentRemaining: remainingNow,
      remainingAfterToday,
      todayIsLast,
      openDays,
      maxOpenDays,
      tooLong: Boolean(maxOpenDays && openDays > maxOpenDays)
    };
  }

  function statusForAmpouleDashboard(entry) {
    return entry?.status === 'given' ? 'given' : entry?.status === 'skipped' ? 'skipped' : 'pending';
  }

  function getProfileAmpouleRemainingMl(profile, ampoule) {
    if (!ampoule) return 0;
    const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
    const used = (Array.isArray(profile?.entries) ? profile.entries : [])
      .filter((entry) => entry.ampouleId === ampoule.id && entry.status === 'given')
      .reduce((sum, entry) => {
        return sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl);
      }, 0);
    return Math.max(0, decimalToNumber(ampoule.volumeMl) - used);
  }

  function renderMainTodayMetrics({ todayEntry, suggestion, ampouleInfo }) {
    const profile = getActiveProfile();
    const status = todayEntry?.status === 'given' ? 'given' : todayEntry?.status === 'skipped' ? 'skipped' : 'pending';
    el['today-profile-avatar'].textContent = profile.icon;
    el['today-profile-avatar'].dataset.profileColor = profile.color;
    el['main-profile-name'].textContent = profile.name;
    el['main-action-eyebrow'].textContent = status === 'given' ? 'Dzisiejsze podanie zapisane' : status === 'skipped' ? 'Dzisiejsza dawka pominięta' : 'Dzisiejsza propozycja';
    el['main-status-badge'].className = `status-badge status-badge--${status === 'pending' ? 'neutral' : status}`;
    el['main-status-badge'].textContent = status === 'given' ? 'Podano' : status === 'skipped' ? 'Pominięto' : 'Do podania';

    if (status === 'given') {
      el['main-place-value'].textContent = capitalize(formatPlace(todayEntry.side, todayEntry.site));
      el['main-dose-value'].textContent = `${formatDose(todayEntry.dose)} ${todayEntry.unit}`;
      el['main-time-value'].textContent = `godz. ${todayEntry.time}`;
    } else if (status === 'skipped') {
      el['main-place-value'].textContent = 'Dawka pominięta';
      el['main-dose-value'].textContent = '—';
      el['main-time-value'].textContent = `zapisano o ${todayEntry.time}`;
    } else {
      el['main-place-value'].textContent = suggestion?.side && suggestion?.site ? capitalize(formatPlace(suggestion.side, suggestion.site)) : 'Brak aktywnego miejsca';
      el['main-dose-value'].textContent = `${formatDose(data.settings.defaultDose)} ${data.settings.unit}`;
      el['main-time-value'].textContent = `godz. ${data.settings.defaultTime}`;
    }

    if (ampouleInfo.configured) {
      el['main-ampoule-value'].textContent = `Nr ${ampouleInfo.ampouleNumber}`;
      el['main-dose-number-value'].textContent = ampouleInfo.todayDoseNumber
        ? status === 'pending' ? `Planowana dawka ${ampouleInfo.todayDoseNumber}` : `Dawka ${ampouleInfo.todayDoseNumber}`
        : status === 'skipped' ? 'Bez podania dzisiaj' : 'Numer dawki niedostępny';
      el['main-remaining-ml-value'].textContent = status === 'pending'
        ? `Teraz ${formatMl(ampouleInfo.currentRemaining)} ml`
        : `Pozostało ${formatMl(ampouleInfo.currentRemaining)} ml`;
      const dosesLabel = `${ampouleInfo.approximateDosesLeftAfterToday} ${plural(ampouleInfo.approximateDosesLeftAfterToday, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}`;
      el['main-doses-left-value'].textContent = ampouleInfo.todayIsLast ? `${dosesLabel} · ostatnia dawka` : dosesLabel;
      const limitText = ampouleInfo.maxOpenDays ? ` / limit ${ampouleInfo.maxOpenDays}` : '';
      el['main-ampoule-open-value'].textContent = `Start ${formatDateShort(ampouleInfo.ampouleStartDate)} · otwarta ${ampouleInfo.openDays} ${plural(ampouleInfo.openDays, 'dzień', 'dni', 'dni')}${limitText}`;
      el['main-ampoule-open-value'].classList.toggle('text-danger', Boolean(ampouleInfo.maxOpenDays && ampouleInfo.openDays > ampouleInfo.maxOpenDays));
    } else {
      const summary = ampouleSummary(ampouleInfo);
      el['main-ampoule-value'].textContent = 'Nie ustawiono';
      el['main-dose-number-value'].textContent = summary.short;
      el['main-remaining-ml-value'].textContent = 'Brak wyliczenia ml';
      el['main-doses-left-value'].textContent = 'Brak wyliczenia';
      el['main-ampoule-open-value'].textContent = 'Uzupełnij ustawienia ampułki';
      el['main-ampoule-open-value'].classList.remove('text-danger');
    }
  }
