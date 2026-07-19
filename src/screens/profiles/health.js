function renderProfileHealthDashboard() {
  if (!el['profile-health-name']) return;
  const profile = getActiveProfile();
  const profileChanged = el['profile-health-name'].dataset.profileId !== profile.id;
  const latestMeasurements = getLatestProfileMeasurements(profile);
  const regularity = buildProfileRegularityStats(profile, 30);
  const ampouleStats = buildProfileAmpouleUsageStats(profile);

  el['profile-health-name'].dataset.profileId = profile.id;
  el['profile-health-name'].textContent = profile.name;
  el['profile-health-avatar'].textContent = profile.icon;
  el['profile-health-avatar'].dataset.profileColor = profile.color;
  el['profile-current-dose'].textContent =
    `${formatDose(profile.settings.defaultDose)} ${profile.settings.unit}`;
  el['profile-latest-height'].textContent = latestMeasurements.height
    ? `${formatDose(latestMeasurements.height.heightCm)} cm`
    : 'Brak pomiaru';
  el['profile-latest-height'].title = latestMeasurements.height
    ? `Pomiar z ${formatDateLong(latestMeasurements.height.date)}`
    : '';
  el['profile-latest-weight'].textContent = latestMeasurements.weight
    ? `${formatDose(latestMeasurements.weight.weightKg)} kg`
    : 'Brak pomiaru';
  el['profile-latest-weight'].title = latestMeasurements.weight
    ? `Pomiar z ${formatDateLong(latestMeasurements.weight.date)}`
    : '';
  el['profile-regularity-rate'].textContent = `${regularity.regularityPercent}%`;

  renderProfileMedicalForm(profile);
  renderProfileRegularity(regularity);
  renderProfileMeasurements(profile, profileChanged);
  renderProfileDoseHistory(profile, profileChanged);
  renderProfileAmpouleStats(ampouleStats);

  if (profileChanged || !el['settings-dose-effective-date'].value) {
    el['settings-dose-effective-date'].value = localDateISO();
    el['settings-dose-change-note'].value = '';
  }
}

function renderProfileMedicalForm(profile) {
  const medical = profile.medical;
  el['profile-birth-date'].value = medical.birthDate;
  el['profile-doctor-name'].value = medical.doctorName;
  el['profile-clinic-name'].value = medical.clinicName;
  el['profile-medication-name'].value = medical.medicationName;
  el['profile-diagnosis'].value = medical.diagnosis;
  el['profile-medical-notes'].value = medical.notes;
}

function renderProfileRegularity(stats) {
  el['profile-regularity-summary'].textContent = `${stats.given}/${stats.totalDays} dni`;
  el['profile-regularity-details'].textContent =
    `Podano: ${stats.given} · Pominięto: ${stats.skipped} · Brak wpisu: ${stats.missing} · Udokumentowano: ${stats.documentedPercent}% dni.`;
  el['profile-regularity-chart'].innerHTML = stats.days
    .map((day) => {
      const label =
        day.status === 'given'
          ? 'podano'
          : day.status === 'skipped'
            ? 'pominięto'
            : 'brak wpisu';
      return `
        <span class="regularity-day regularity-day--${day.status}" role="listitem" title="${escapeHtml(formatDateLong(day.date))}: ${label}">
          <span aria-hidden="true">${parseISODate(day.date).getDate()}</span>
          <span class="sr-only">${escapeHtml(formatDateLong(day.date))}: ${label}</span>
        </span>`;
    })
    .join('');
}

function renderProfileMeasurements(profile, profileChanged) {
  if (profileChanged || !el['profile-measurement-date'].value) {
    el['profile-measurement-date'].value = localDateISO();
    el['profile-height-cm'].value = '';
    el['profile-weight-kg'].value = '';
    el['profile-measurement-note'].value = '';
  }
  const measurements = profile.measurements;
  if (!measurements.length) {
    el['profile-measurement-list'].innerHTML =
      '<div class="empty-state empty-state--compact"><strong>Brak pomiarów</strong><span>Dodaj pierwszy pomiar wzrostu lub masy.</span></div>';
    return;
  }
  el['profile-measurement-list'].innerHTML = measurements
    .slice(0, 12)
    .map((measurement, index) => {
      const previous = measurements[index + 1] || null;
      return `
        <article class="profile-record-item">
          <div class="profile-record-item__date"><strong>${escapeHtml(formatDateShort(measurement.date))}</strong><span>${escapeHtml(formatProfileMeasurementDelta(measurement, previous))}</span></div>
          <div class="profile-record-item__values">
            ${measurement.heightCm ? `<span><strong>${escapeHtml(formatDose(measurement.heightCm))}</strong> cm</span>` : ''}
            ${measurement.weightKg ? `<span><strong>${escapeHtml(formatDose(measurement.weightKg))}</strong> kg</span>` : ''}
          </div>
          ${measurement.note ? `<p>${escapeHtml(measurement.note)}</p>` : ''}
          <button class="table-action table-action--danger" type="button" data-measurement-delete="${measurement.id}">${iconSvg('trash')} Usuń</button>
        </article>`;
    })
    .join('');
}

function formatProfileMeasurementDelta(measurement, previous) {
  if (!previous) return 'pierwszy zapisany pomiar';
  const changes = [];
  const heightChange = decimalToSignedHealthChange(measurement.heightCm, previous.heightCm);
  const weightChange = decimalToSignedHealthChange(measurement.weightKg, previous.weightKg);
  if (heightChange) changes.push(`${heightChange} cm`);
  if (weightChange) changes.push(`${weightChange} kg`);
  return changes.length ? `zmiana: ${changes.join(' · ')}` : 'bez porównywalnej zmiany';
}

function decimalToSignedHealthChange(current, previous) {
  if (!current || !previous) return '';
  const difference = decimalToNumber(current) - decimalToNumber(previous);
  if (Math.abs(difference) < 0.005) return '0';
  const formatted = Math.round(difference * 100) / 100;
  return `${formatted > 0 ? '+' : ''}${String(formatted).replace('.', ',')}`;
}

function renderProfileDoseHistory(profile, profileChanged) {
  if (profileChanged || !el['profile-dose-history-date'].value) {
    el['profile-dose-history-date'].value = localDateISO();
    el['profile-dose-history-value'].value = profile.settings.defaultDose;
    el['profile-dose-history-unit'].value = profile.settings.unit;
    el['profile-dose-history-note'].value = '';
  }
  if (!profile.doseHistory.length) {
    el['profile-dose-history-list'].innerHTML =
      '<div class="empty-state empty-state--compact"><strong>Brak zapisanych zmian</strong><span>Kolejna zmiana aktualnej dawki zostanie dodana automatycznie.</span></div>';
    return;
  }
  el['profile-dose-history-list'].innerHTML = profile.doseHistory
    .slice(0, 12)
    .map(
      (change) => `
        <article class="profile-record-item profile-dose-change-item">
          <div class="profile-record-item__date"><strong>${escapeHtml(formatDateShort(change.date))}</strong><span>obowiązuje od tej daty</span></div>
          <div class="profile-record-item__values"><span><strong>${escapeHtml(formatDose(change.dose))}</strong> ${escapeHtml(change.unit)}</span></div>
          ${change.note ? `<p>${escapeHtml(change.note)}</p>` : ''}
          <button class="table-action table-action--danger" type="button" data-dose-change-delete="${change.id}">${iconSvg('trash')} Usuń</button>
        </article>`
    )
    .join('');
}

function renderProfileAmpouleStats(stats) {
  el['profile-ampoules-opened'].textContent = String(stats.opened);
  el['profile-ampoules-finished'].textContent = String(stats.finished);
  el['profile-ampoules-used'].textContent = `${formatMl(stats.registeredUsedMl)} ml`;
  el['profile-ampoule-active-remaining'].textContent = stats.hasActiveAmpoule
    ? `${formatMl(stats.activeRemainingMl)} ml`
    : 'Brak aktywnej';
  el['profile-ampoule-stats-note'].textContent = stats.measuredDoses
    ? `Zużycie obliczono z ${stats.measuredDoses} ${plural(stats.measuredDoses, 'podania', 'podań', 'podań')} z zapisaną wartością ml.`
    : 'Brak podań z zapisaną wartością zużycia w ml.';
}

function saveProfileMedical(event) {
  event.preventDefault();
  const birthDate = el['profile-birth-date'].value;
  if (birthDate && (!isValidIsoDate(birthDate) || birthDate > localDateISO())) {
    showToast('Podaj prawidłową datę urodzenia, nie późniejszą niż dzisiaj.', 'error');
    return;
  }
  const profile = getActiveProfile();
  const previous = structuredCloneSafe(profile.medical);
  const previousUpdatedAt = profile.updatedAt;
  profile.medical = sanitizeProfileMedical({
    birthDate,
    doctorName: el['profile-doctor-name'].value,
    clinicName: el['profile-clinic-name'].value,
    medicationName: el['profile-medication-name'].value,
    diagnosis: el['profile-diagnosis'].value,
    notes: el['profile-medical-notes'].value,
  });
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.medical = previous;
    profile.updatedAt = previousUpdatedAt;
    return;
  }
  renderAll();
  showToast('Informacje medyczne zostały zapisane.', 'success');
}

function saveProfileMeasurement(event) {
  event.preventDefault();
  const date = el['profile-measurement-date'].value;
  const heightCm = normalizeHealthDecimal(el['profile-height-cm'].value, 30, 250);
  const weightKg = normalizeHealthDecimal(el['profile-weight-kg'].value, 1, 300);
  if (!isValidIsoDate(date) || date > localDateISO()) {
    showToast('Podaj prawidłową datę pomiaru, nie późniejszą niż dzisiaj.', 'error');
    return;
  }
  if (!heightCm && !weightKg) {
    showToast('Podaj prawidłowy wzrost lub masę.', 'error');
    return;
  }
  const profile = getActiveProfile();
  const previous = structuredCloneSafe(profile.measurements);
  const previousUpdatedAt = profile.updatedAt;
  const saved = upsertProfileMeasurement(profile, {
    date,
    heightCm,
    weightKg,
    note: el['profile-measurement-note'].value,
  });
  if (!saved) {
    showToast('Nie udało się zapisać pomiaru.', 'error');
    return;
  }
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.measurements = previous;
    profile.updatedAt = previousUpdatedAt;
    return;
  }
  el['profile-height-cm'].value = '';
  el['profile-weight-kg'].value = '';
  el['profile-measurement-note'].value = '';
  renderAll();
  showToast('Pomiar został zapisany.', 'success');
}

function handleProfileMeasurementAction(event) {
  const button = event.target.closest('[data-measurement-delete]');
  if (!button) return;
  const profile = getActiveProfile();
  const measurement = profile.measurements.find((item) => item.id === button.dataset.measurementDelete);
  if (!measurement || !window.confirm(`Usunąć pomiar z ${formatDateShort(measurement.date)}?`)) return;
  const previous = profile.measurements;
  const previousUpdatedAt = profile.updatedAt;
  profile.measurements = profile.measurements.filter((item) => item.id !== measurement.id);
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.measurements = previous;
    profile.updatedAt = previousUpdatedAt;
    return;
  }
  renderAll();
  showToast('Pomiar został usunięty.', 'success');
}

function saveProfileDoseHistoryEntry(event) {
  event.preventDefault();
  const date = el['profile-dose-history-date'].value;
  const dose = normalizeDose(el['profile-dose-history-value'].value);
  const unit = el['profile-dose-history-unit'].value;
  if (!isValidIsoDate(date) || date > localDateISO() || !dose || !ALLOWED_UNITS.has(unit)) {
    showToast('Podaj prawidłową datę, dawkę i jednostkę.', 'error');
    return;
  }
  const profile = getActiveProfile();
  const previous = structuredCloneSafe(profile.doseHistory);
  const previousUpdatedAt = profile.updatedAt;
  const saved = upsertProfileDoseChange(profile, {
    date,
    dose,
    unit,
    note: el['profile-dose-history-note'].value,
  });
  if (!saved) {
    showToast('Nie udało się zapisać zmiany dawki.', 'error');
    return;
  }
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.doseHistory = previous;
    profile.updatedAt = previousUpdatedAt;
    return;
  }
  el['profile-dose-history-note'].value = '';
  renderAll();
  showToast('Zmiana dawki została dodana do historii.', 'success');
}

function handleProfileDoseHistoryAction(event) {
  const button = event.target.closest('[data-dose-change-delete]');
  if (!button) return;
  const profile = getActiveProfile();
  const change = profile.doseHistory.find((item) => item.id === button.dataset.doseChangeDelete);
  if (!change || !window.confirm(`Usunąć zmianę dawki z ${formatDateShort(change.date)}?`)) return;
  const previous = profile.doseHistory;
  const previousUpdatedAt = profile.updatedAt;
  profile.doseHistory = profile.doseHistory.filter((item) => item.id !== change.id);
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.doseHistory = previous;
    profile.updatedAt = previousUpdatedAt;
    return;
  }
  renderAll();
  showToast('Zmiana dawki została usunięta z historii.', 'success');
}

function prepareProfileDoctorReport(mode = 'preview') {
  const profile = getActiveProfile();
  reportProfileScope = profile.id;
  renderReportConfiguration();
  el['report-profile-filter'].value = profile.id;
  el['report-date-from'].value = '';
  el['report-date-to'].value = '';
  el['report-include-ampoules'].checked = true;
  handleReportConfigurationChange();
  if (mode === 'export') openExportReportPanel(el['profile-doctor-export-button']);
  else openReportPreview(el['profile-doctor-report-button']);
}
