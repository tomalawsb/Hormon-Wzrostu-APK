let reportJobBusy = false;
function setReportJobBusy(busy) {
  reportJobBusy = busy;
  ['export-pdf-button', 'export-word-button', 'report-print-button'].forEach(id => {
    if (el[id]) el[id].disabled = busy;
  });
}

function createReportModel(config) {
  if (config.model) return config.model;
  const profile = getDoctorReportProfile(config);
  const fourth = getReportFourthSummary(config);
  config.fourth = fourth;
  const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const lines = [`Raport dla: ${config.scopeLabel}`, `Raport wygenerowano: ${generated}`, `Zakres wpisów: ${config.periodText}`];
  if (profile) {
    lines.push('Dane profilu i leczenia', ...getDoctorReportLines(profile), 'Ostatnie pomiary');
    lines.push(...(profile.measurements.length ? profile.measurements.slice(0, 10).map(m => `${formatDateShort(m.date)} — ${m.heightCm ? formatDose(m.heightCm) + ' cm' : 'wzrost —'}, ${m.weightKg ? formatDose(m.weightKg) + ' kg' : 'masa —'}${m.note ? ' — ' + m.note : ''}`) : ['Brak pomiarów.']));
    lines.push('Historia zmian dawki');
    lines.push(...(profile.doseHistory.length ? profile.doseHistory.slice(0, 10).map(d => `${formatDateShort(d.date)} — ${formatDose(d.dose)} ${d.unit}${d.note ? ' — ' + d.note : ''}`) : ['Brak zapisanych zmian dawki.']));
  }
  lines.push(`Liczba wpisów: ${config.records.length}. Podano: ${config.records.filter(r => r.entry.status === 'given').length}. Pominięto: ${config.records.filter(r => r.entry.status === 'skipped').length}.`, `${fourth.number} — ${fourth.text}`);
  config.model = { scopeLabel: config.scopeLabel, periodText: config.periodText, columns: getReportColumns(config), rows: getReportRowsForCanvas(config), lines, footer: 'Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.' };
  return config.model;
}

function withProfileContext(profileId, callback) {
  const previousProfileId = data.activeProfileId;
  data.activeProfileId = profileId;
  try {
    return callback();
  } finally {
    data.activeProfileId = previousProfileId;
  }
}

function getAmpouleRowsByEntryId(profileId = data.activeProfileId) {
  return withProfileContext(profileId, () => {
    const timeline = buildAmpouleTimeline({ includePlannedToday: false });
    const rowsById = new Map();
    timeline.rows.forEach((row) => {
      if (row.entry?.id && !row.planned) rowsById.set(row.entry.id, row);
    });
    return { timeline, rowsById };
  });
}

function formatReportAmpouleCell(row) {
  if (!row) return '—';
  const suffixes = [];
  if (row.startsNewAmpoule) suffixes.push('rozpoczęcie');
  if (row.isLastDose) suffixes.push('koniec');
  return suffixes.length
    ? `${row.ampouleNumber} — ${suffixes.join(', ')}`
    : String(row.ampouleNumber);
}

function formatReportRemainingCell(row) {
  if (!row) return '—';
  if (row.entry.status !== 'given') return `bez zmian, ${formatMl(row.remainingAfter)} ml`;
  return `${formatMl(row.remainingAfter)} ml`;
}

function ampouleReportSummary(info) {
  if (!info.configured) {
    if (info.reason === 'paused')
      return {
        number: '—',
        text: 'brak aktywnej ampułki; dostępna jest odłożona ampułka do wznowienia',
      };
    if (info.reason === 'finished')
      return { number: '—', text: 'poprzednia ampułka została zużyta' };
    return {
      number: '—',
      text: info.reason === 'dose' ? 'brak dawki w ml do obliczeń' : 'brak daty startu ampułki',
    };
  }
  if (info.todayIsLast)
    return {
      number: String(info.ampouleNumber),
      text: `start ${formatDateShort(info.ampouleStartDate)}, dzisiaj ostatni zastrzyk`,
    };
  if (info.todayStartsNewAmpoule)
    return {
      number: String(info.ampouleNumber),
      text: `nowa ampułka od ${formatDateShort(info.ampouleStartDate)}, około ${formatMl(info.remainingAfterToday)} ml po dzisiejszej dawce`,
    };
  return {
    number: String(info.ampouleNumber),
    text: `start ${formatDateShort(info.ampouleStartDate)}, około ${formatMl(info.remainingAfterToday)} ml po dzisiejszej dawce`,
  };
}

function renderReportConfiguration() {
  reportProfileScope = populateProfileScopeSelect(
    el['report-profile-filter'],
    reportProfileScope,
    'Wszystkie profile'
  );
  if (el['report-include-ampoules'].checked === undefined)
    el['report-include-ampoules'].checked = true;
  renderReportConfigurationSummary();
}

function handleReportConfigurationChange() {
  reportProfileScope = normalizeProfileScope(el['report-profile-filter'].value);
  renderReportConfigurationSummary();
}

function renderReportConfigurationSummary() {
  const config = getReportConfiguration({ notify: false, summaryOnly: true });
  if (!config) {
    el['report-scope-summary'].textContent = 'Nieprawidłowy zakres dat';
    return;
  }
  const ampoules = config.includeAmpoules ? 'z ampułkami' : 'bez ampułek';
  el['report-scope-summary'].textContent =
    `${config.scopeLabel} · ${config.periodText} · ${ampoules}`;
}

function getReportConfiguration({ notify = true, summaryOnly = false } = {}) {
  const scope = normalizeProfileScope(
    el['report-profile-filter']?.value || reportProfileScope || data.activeProfileId
  );
  const from = isValidIsoDate(el['report-date-from']?.value) ? el['report-date-from'].value : '';
  const to = isValidIsoDate(el['report-date-to']?.value) ? el['report-date-to'].value : '';
  if (from && to && from > to) {
    if (notify) showToast('Data „od” nie może być późniejsza niż data „do”.', 'error');
    return null;
  }
  const profiles = getProfilesForScope(scope);
  const includeAmpoules = el['report-include-ampoules']
    ? Boolean(el['report-include-ampoules'].checked)
    : true;
  const records = summaryOnly ? [] : getScopedEntryRecords(scope, { from, to }).map(({ profile, entry }) => ({
    profile,
    entry,
    ampouleRow: null,
  }));
  if (includeAmpoules && !summaryOnly) {
    const rowsByProfile = new Map(
      profiles.map((profile) => [profile.id, getAmpouleRowsByEntryId(profile.id).rowsById])
    );
    records.forEach((record) => {
      record.ampouleRow = rowsByProfile.get(record.profile.id)?.get(record.entry.id) || null;
    });
  }
  const scopeLabel =
    scope === 'all' ? 'Wszystkie profile' : profiles[0]?.name || getActiveProfile().name;
  const periodText =
    from || to
      ? `${from ? formatDateShort(from) : 'początek'} – ${to ? formatDateShort(to) : 'dzisiaj'}`
      : getReportPeriodText(summaryOnly ? profiles.flatMap(profile => profile.entries) : records.map(record => record.entry));
  return { scope, profiles, records, includeAmpoules, from, to, scopeLabel, periodText };
}

function getReportPeriodText(entries) {
  if (!entries.length) return 'brak wpisów';
  let first = entries[0].date, last = first;
  for (const entry of entries) { if (entry.date < first) first = entry.date; if (entry.date > last) last = entry.date; }
  return `${formatDateShort(first)} – ${formatDateShort(last)}`;
}

function getReportColumns(config) {
  const columns = [];
  if (config.profiles.length > 1) columns.push({ key: 'profile', label: 'Profil', weight: 125 });
  columns.push(
    { key: 'date', label: 'Data podania', weight: 120 },
    { key: 'time', label: 'Godzina', weight: 80 },
    { key: 'dose', label: 'Dawka', weight: 100 },
    { key: 'place', label: 'Miejsce', weight: 165 },
    { key: 'status', label: 'Status', weight: 95 }
  );
  if (config.includeAmpoules)
    columns.push(
      { key: 'ampoule', label: 'Ampułka', weight: 115 },
      { key: 'remaining', label: 'Pozostało po wpisie', weight: 170 }
    );
  columns.push({ key: 'note', label: 'Uwagi', weight: 240 });
  return columns;
}

function getReportRecordValue(record, key) {
  if (record.reportValues) return record.reportValues[key] ?? '—';
  const { profile, entry, ampouleRow } = record;
  const values = {
    profile: profile.name,
    date: formatDateShort(entry.date),
    time: entry.time || '—',
    dose: entry.status === 'given' ? `${formatDose(entry.dose)} ${entry.unit}` : '—',
    place: entry.status === 'given' ? formatPlace(entry.side, entry.site) : '—',
    status: entry.status === 'given' ? 'Podano' : 'Pominięto',
    ampoule: formatReportAmpouleCell(ampouleRow),
    remaining: formatReportRemainingCell(ampouleRow),
    note: entry.note || '—',
  };
  record.reportValues = values;
  return values[key] ?? '—';
}

function getReportFilenameScope(config) {
  return config.scope === 'all' ? 'wszystkie-profile' : safeFilenamePart(config.scopeLabel);
}

function getReportFourthSummary(config) {
  if (config.fourth) return config.fourth;
  if (config.profiles.length > 1)
    return { number: String(config.profiles.length), text: 'profile w raporcie' };
  if (!config.includeAmpoules)
    return { number: String(config.profiles.length), text: 'profil w raporcie' };
  return withProfileContext(config.profiles[0].id, () => ampouleReportSummary(getAmpouleInfo()));
}

function getDoctorReportProfile(config) {
  return config?.profiles?.length === 1 ? config.profiles[0] : null;
}

function getDoctorReportLines(profile) {
  if (!profile) return [];
  const medical = profile.medical;
  const latest = getLatestProfileMeasurements(profile);
  const regularity = buildProfileRegularityStats(profile, 30);
  const ampouleStats = buildProfileAmpouleUsageStats(profile);
  const doseChanges = profile.doseHistory
    .slice(0, 3)
    .map((change) => `${formatDateShort(change.date)}: ${formatDose(change.dose)} ${change.unit}`)
    .join('; ');
  const lines = [
    `Aktualna dawka: ${formatDose(profile.settings.defaultDose)} ${profile.settings.unit}. Preparat: ${medical.medicationName || '—'}.`,
    `Data urodzenia: ${medical.birthDate ? formatDateShort(medical.birthDate) : '—'}. Lekarz: ${medical.doctorName || '—'}. Poradnia: ${medical.clinicName || '—'}.`,
    `Ostatnie pomiary: wzrost ${latest.height ? `${formatDose(latest.height.heightCm)} cm (${formatDateShort(latest.height.date)})` : '—'}, masa ${latest.weight ? `${formatDose(latest.weight.weightKg)} kg (${formatDateShort(latest.weight.date)})` : '—'}.`,
    `Regularność: ${regularity.given}/${regularity.totalDays} monitorowanych dni (${regularity.regularityPercent}%), pominięto ${regularity.skipped}, brak wpisu ${regularity.missing}.`,
    `Ampułki: rozpoczęto ${ampouleStats.opened}, zakończono ${ampouleStats.finished}, zapisane zużycie ${formatMl(ampouleStats.registeredUsedMl)} ml.`,
  ];
  if (doseChanges) lines.push(`Ostatnie zmiany dawki: ${doseChanges}.`);
  if (medical.diagnosis) lines.push(`Rozpoznanie / ważne informacje: ${medical.diagnosis}`);
  if (medical.notes) lines.push(`Dodatkowe uwagi medyczne: ${medical.notes}`);
  return lines;
}

function buildDoctorReportProfileHtml(config) {
  const profile = getDoctorReportProfile(config);
  if (!profile) return '';
  const medical = profile.medical;
  const latest = getLatestProfileMeasurements(profile);
  const regularity = buildProfileRegularityStats(profile, 30);
  const ampouleStats = buildProfileAmpouleUsageStats(profile);
  const definition = (label, value) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '—')}</dd></div>`;
  const measurements = profile.measurements
    .slice(0, 10)
    .map(
      (measurement) => `
        <tr><td>${escapeHtml(formatDateShort(measurement.date))}</td><td>${measurement.heightCm ? `${escapeHtml(formatDose(measurement.heightCm))} cm` : '—'}</td><td>${measurement.weightKg ? `${escapeHtml(formatDose(measurement.weightKg))} kg` : '—'}</td><td>${escapeHtml(measurement.note || '—')}</td></tr>`
    )
    .join('');
  const doseHistory = profile.doseHistory
    .slice(0, 10)
    .map(
      (change) => `
        <tr><td>${escapeHtml(formatDateShort(change.date))}</td><td>${escapeHtml(formatDose(change.dose))} ${escapeHtml(change.unit)}</td><td>${escapeHtml(change.note || '—')}</td></tr>`
    )
    .join('');
  return `
    <section class="doctor-profile-summary">
      <h2>Dane profilu i leczenia</h2>
      <dl class="doctor-profile-grid">
        ${definition('Profil', profile.name)}
        ${definition('Data urodzenia', medical.birthDate ? formatDateShort(medical.birthDate) : '—')}
        ${definition('Lekarz prowadzący', medical.doctorName)}
        ${definition('Poradnia / placówka', medical.clinicName)}
        ${definition('Preparat', medical.medicationName)}
        ${definition('Aktualna dawka', `${formatDose(profile.settings.defaultDose)} ${profile.settings.unit}`)}
        ${definition('Ostatni wzrost', latest.height ? `${formatDose(latest.height.heightCm)} cm (${formatDateShort(latest.height.date)})` : '—')}
        ${definition('Ostatnia masa', latest.weight ? `${formatDose(latest.weight.weightKg)} kg (${formatDateShort(latest.weight.date)})` : '—')}
        ${definition('Regularność 30 dni', `${regularity.given}/${regularity.totalDays} dni (${regularity.regularityPercent}%)`)}
        ${definition('Zużycie ampułek', `${formatMl(ampouleStats.registeredUsedMl)} ml · ${ampouleStats.finished}/${ampouleStats.opened} zakończonych`)}
      </dl>
      ${medical.diagnosis ? `<div class="doctor-note"><strong>Rozpoznanie i ważne informacje</strong><p>${escapeHtml(medical.diagnosis)}</p></div>` : ''}
      ${medical.notes ? `<div class="doctor-note"><strong>Dodatkowe uwagi medyczne</strong><p>${escapeHtml(medical.notes)}</p></div>` : ''}
      <div class="doctor-detail-columns">
        <section>
          <h3>Ostatnie pomiary</h3>
          <table class="doctor-compact-table"><thead><tr><th>Data</th><th>Wzrost</th><th>Masa</th><th>Uwagi</th></tr></thead><tbody>${measurements || '<tr><td colspan="4">Brak pomiarów.</td></tr>'}</tbody></table>
        </section>
        <section>
          <h3>Historia zmian dawki</h3>
          <table class="doctor-compact-table"><thead><tr><th>Od</th><th>Dawka</th><th>Powód / zalecenie</th></tr></thead><tbody>${doseHistory || '<tr><td colspan="3">Brak zapisanych zmian.</td></tr>'}</tbody></table>
        </section>
      </div>
    </section>`;
}

function buildReportTableRows(config) {
  const columns = getReportColumns(config);
  return config.records
    .map(
      (record) =>
        `<tr>${columns
          .map(
            (column) =>
              `<td data-label="${escapeHtml(column.label)}">${escapeHtml(getReportRecordValue(record, column.key))}</td>`
          )
          .join('')}</tr>`
    )
    .join('');
}

function buildReportBodyForConfig(config) {
  if (!config) return '<p>Nieprawidłowy zakres raportu.</p>';
  const given = config.records.filter(({ entry }) => entry.status === 'given').length;
  const skipped = config.records.filter(({ entry }) => entry.status === 'skipped').length;
  const fourth = getReportFourthSummary(config);
  const columns = getReportColumns(config);
  return `
      <h1>Dzienniczek Hormonu — ${escapeHtml(config.scopeLabel)}</h1>
      <p class="generated">Raport dla: ${escapeHtml(config.scopeLabel)}</p>
      <p class="generated">Raport wygenerowano: ${escapeHtml(new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()))}</p>
      <p class="generated">Zakres wpisów: ${escapeHtml(config.periodText)}</p>
      ${buildDoctorReportProfileHtml(config)}
      <div class="summary">
        <div><strong>${config.records.length}</strong><span>wszystkich wpisów</span></div>
        <div><strong>${given}</strong><span>podań</span></div>
        <div><strong>${skipped}</strong><span>pominiętych</span></div>
        <div><strong>${escapeHtml(fourth.number)}</strong><span>${escapeHtml(fourth.text)}</span></div>
      </div>
      <table class="report-history-table">
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
        <tbody>${buildReportTableRows(config) || `<tr><td class="report-empty-cell" colspan="${columns.length}">Brak wpisów.</td></tr>`}</tbody>
      </table>
      <p class="footer">Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.</p>`;
}

function reportDocumentHtml(config = getReportConfiguration({ notify: false, summaryOnly: true })) {
  const title = config?.scopeLabel || 'raport';
  return `<!doctype html><html lang="pl">
      <head><meta charset="utf-8"><title>Raport – ${escapeHtml(title)} – Dzienniczek Hormonu</title>
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        * { box-sizing: border-box; }
        html { background: #eef3f6; }
        body { font-family: Arial, sans-serif; color: #17324d; margin: 0; padding: 24px; background: #eef3f6; }
        .report-sheet { max-width: 1120px; margin: 0 auto; padding: 36px; background: #fff; box-shadow: 0 8px 30px rgba(23,50,77,.12); }
        h1 { margin: 0 0 4px; font-size: 24px; }
        .generated, .footer { color: #60768a; font-size: 12px; }
        .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0; }
        .summary div { border: 1px solid #d9e5ed; border-radius: 10px; padding: 10px 14px; min-width: 130px; flex: 1; }
        .summary strong { display: block; font-size: 20px; color: #0e927f; }
        .summary span { font-size: 12px; color: #60768a; }
        .doctor-profile-summary { margin: 18px 0 22px; padding: 16px; border: 1px solid #cfdce5; border-radius: 12px; }
        .doctor-profile-summary h2 { margin: 0 0 12px; font-size: 17px; }
        .doctor-profile-summary h3 { margin: 14px 0 7px; font-size: 13px; }
        .doctor-profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 18px; margin: 0; }
        .doctor-profile-grid div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px; }
        .doctor-profile-grid dt { color: #60768a; font-size: 10px; font-weight: 700; }
        .doctor-profile-grid dd { margin: 0; font-size: 11px; }
        .doctor-note { margin-top: 10px; padding: 9px; border-radius: 8px; background: #f5f9fb; }
        .doctor-note strong { font-size: 11px; }
        .doctor-note p { margin: 4px 0 0; white-space: pre-line; font-size: 10px; }
        .doctor-detail-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .doctor-compact-table { margin-top: 0; font-size: 9px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10px; }
        th, td { border: 1px solid #cfdce5; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #e9f7f4; }
        tr:nth-child(even) td { background: #f8fbfd; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        @media screen and (max-width: 760px) {
          body { padding: 10px; }
          .report-sheet { padding: 18px 14px; box-shadow: none; }
          .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .summary div { min-width: 0; }
          .doctor-profile-grid, .doctor-detail-columns { grid-template-columns: 1fr; }
          .doctor-profile-grid div { grid-template-columns: 110px minmax(0, 1fr); }
          table { font-size: 9px; }
          th, td { padding: 5px 4px; overflow-wrap: anywhere; }
          .report-history-table { display: block; margin-top: 16px; border-collapse: separate; }
          .report-history-table thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
          .report-history-table tbody { display: grid; gap: 10px; }
          .report-history-table tr { display: block; width: 100%; overflow: hidden; border: 1px solid #cfdce5; border-radius: 10px; background: #fff; }
          .report-history-table td { display: grid; grid-template-columns: minmax(92px, 38%) minmax(0, 1fr); gap: 8px; width: 100%; border: 0; border-bottom: 1px solid #e4edf3; padding: 7px 9px; background: #fff; }
          .report-history-table tr:nth-child(even) td { background: #f8fbfd; }
          .report-history-table td::before { content: attr(data-label); color: #60768a; font-weight: 700; }
          .report-history-table td:last-child { border-bottom: 0; }
          .report-history-table .report-empty-cell { display: block; text-align: center; }
          .report-history-table .report-empty-cell::before { content: none; }
        }
        @media print { html, body { background: #fff; } body { padding: 0; } .report-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; } .doctor-detail-columns section { break-inside: avoid; } }
      </style></head><body><main class="report-sheet">${buildReportBodyForConfig(config)}</main></body></html>`;
}

async function exportPdf() {
  if (reportJobBusy) return false;
  setReportJobBusy(true);
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const config = getReportConfiguration();
    if (!config) return false;
    showToast('Tworzenie raportu PDF…');
    if (window.NativeBridge?.reportPdf) {
      const result = await window.NativeBridge.reportPdf(createReportModel(config), `dzienniczek-raport-${getReportFilenameScope(config)}-${localDateISO()}.pdf`, false);
      if (!result.success && result.state !== 'cancelled') throw new Error(result.state);
      showToast(result.success ? 'Zapisano raport PDF.' : 'Anulowano zapis raportu PDF.', result.success ? 'success' : undefined);
      return result.success;
    }
    const blob = await createReportPdfBlob(config);
    const saved = await downloadBlob(
      `dzienniczek-raport-${getReportFilenameScope(config)}-${localDateISO()}.pdf`,
      blob
    );
    if (!saved) {
      showToast('Anulowano zapis raportu PDF.');
      return false;
    }
    showToast(isNativeAndroidApp() ? 'Zapisano raport PDF.' : 'Pobrano raport PDF.', 'success');
    return true;
  } catch (error) {
    console.error('Nie udało się utworzyć PDF:', error);
    showToast('Nie udało się utworzyć raportu PDF.', 'error');
    return false;
  } finally {
    setReportJobBusy(false);
  }
}

async function createReportPdfBlob(config = getReportConfiguration()) {
  if (!config) throw new Error('Nieprawidłowa konfiguracja raportu.');
  const jpegPages = [];
  await renderReportPdfPages(config, async (canvas) => {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('Nie udało się utworzyć strony PDF.')),
        'image/jpeg',
        0.92
      );
    });
    jpegPages.push(new Uint8Array(await blob.arrayBuffer()));
    canvas.width = canvas.height = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return buildPdfFromJpegPages(jpegPages, 1587, 1123);
}

function getReportRowsForCanvas(config) {
  const columns = getReportColumns(config);
  return config.records.map((record) =>
    columns.map((column) => getReportRecordValue(record, column.key))
  );
}

async function renderReportPdfPages(config, consumePage) {
  const width = 1587,
    height = 1123,
    margin = 58,
    tableWidth = width - margin * 2;
  const definitions = getReportColumns(config);
  const totalWeight = definitions.reduce((sum, column) => sum + column.weight, 0);
  const columns = definitions.map((column) => (tableWidth * column.weight) / totalWeight);
  const headers = definitions.map((column) => column.label);
  const rows = getReportRowsForCanvas(config);
  const fourth = getReportFourthSummary(config);
  const doctorProfile = getDoctorReportProfile(config);
  const doctorLines = doctorProfile ? getDoctorReportLines(doctorProfile).slice(0, 8) : [];
  const generated = new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());
  let pageNumber = 0;
  let page = null,
    ctx = null,
    y = 0;

  const createPage = (firstPage) => {
    page = document.createElement('canvas');
    page.width = width;
    page.height = height;
    ctx = page.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'top';
    if (firstPage) {
      ctx.fillStyle = '#17324d';
      ctx.font = '700 38px Arial, sans-serif';
      ctx.fillText(`Dzienniczek Hormonu — ${config.scopeLabel}`, margin, margin);
      ctx.font = '20px Arial, sans-serif';
      ctx.fillStyle = '#60768a';
      ctx.fillText(`Raport dla: ${config.scopeLabel}`, margin, margin + 54);
      ctx.fillText(`Raport wygenerowano: ${generated}`, margin, margin + 82);
      ctx.fillText(`Zakres wpisów: ${config.periodText}`, margin, margin + 110);
      let summaryY = margin + 154;
      doctorLines.forEach((line, index) => {
        drawPdfCellText(
          ctx,
          line,
          margin,
          margin + 148 + index * 27,
          tableWidth,
          17,
          index < 2 ? '#17324d' : '#526c80',
          index === 0,
          1
        );
      });
      if (doctorLines.length) summaryY += doctorLines.length * 27 + 12;
      drawPdfSummaryCards(ctx, margin, summaryY, tableWidth, config.records, fourth);
      y = summaryY + 126;
    } else {
      ctx.font = '700 25px Arial, sans-serif';
      ctx.fillStyle = '#17324d';
      ctx.fillText(`Dzienniczek Hormonu — ${config.scopeLabel} — ciąg dalszy`, margin, margin);
      y = margin + 48;
    }
    y = drawPdfTableHeader(ctx, margin, y, columns, headers);
    pageNumber++;
  };

  createPage(true);
  const heights = rows.map(row => measurePdfRowHeight(ctx, row, columns));
  let totalPages = 1, measuredY = y;
  for (const h of heights) {
    if (measuredY + h > height - margin - 42) { totalPages++; measuredY = margin + 48 + 46; }
    measuredY += h;
  }
  const finishPage = async () => {
    ctx.font = '17px Arial, sans-serif';
    ctx.fillStyle = '#60768a';
    ctx.fillText('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', margin, height - margin + 10);
    ctx.textAlign = 'right';
    ctx.fillText(`Strona ${pageNumber} z ${totalPages}`, width - margin, height - margin + 10);
    ctx.textAlign = 'left';
    await consumePage(page);
  };
  if (!rows.length) drawPdfCellText(ctx, 'Brak wpisów.', margin + 10, y + 10, tableWidth - 20, 18, '#17324d', false);
  for (let i = 0; i < rows.length; i++) {
    if (y + heights[i] > height - margin - 42) { await finishPage(); createPage(false); }
    drawPdfTableRow(ctx, margin, y, columns, rows[i], heights[i]);
    y += heights[i];
  }
  await finishPage();
}

function drawPdfSummaryCards(ctx, x, y, width, records, fourth) {
  const gap = 14,
    cardWidth = (width - gap * 3) / 4;
  const cards = [
    [String(records.length), 'wszystkich wpisów'],
    [String(records.filter(({ entry }) => entry.status === 'given').length), 'podań'],
    [String(records.filter(({ entry }) => entry.status === 'skipped').length), 'pominiętych'],
    [fourth.number, fourth.text],
  ];
  cards.forEach(([value, label], index) => {
    const left = x + index * (cardWidth + gap);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d9e5ed';
    ctx.lineWidth = 2;
    roundRectPath(ctx, left, y, cardWidth, 92, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0e927f';
    ctx.font = '700 27px Arial, sans-serif';
    ctx.fillText(String(value), left + 14, y + 12);
    drawPdfCellText(ctx, String(label), left + 14, y + 49, cardWidth - 28, 16, '#60768a', false, 2);
  });
}

function drawPdfTableHeader(ctx, x, y, columns, headers) {
  let left = x;
  const height = 46;
  headers.forEach((header, index) => {
    ctx.fillStyle = '#e9f7f4';
    ctx.strokeStyle = '#cfdce5';
    ctx.lineWidth = 1;
    ctx.fillRect(left, y, columns[index], height);
    ctx.strokeRect(left, y, columns[index], height);
    drawPdfCellText(ctx, header, left + 7, y + 9, columns[index] - 14, 15, '#17324d', true, 2);
    left += columns[index];
  });
  return y + height;
}

function measurePdfRowHeight(ctx, row, columns) {
  let maxLines = 1;
  row.forEach((value, index) => {
    const lines = wrapCanvasText(ctx, String(value), columns[index] - 14, '15px Arial, sans-serif');
    maxLines = Math.max(maxLines, Math.min(lines.length, index === row.length - 1 ? 5 : 3));
  });
  return Math.max(40, 16 + maxLines * 20);
}

function drawPdfTableRow(ctx, x, y, columns, row, height) {
  let left = x;
  row.forEach((value, index) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cfdce5';
    ctx.lineWidth = 1;
    ctx.fillRect(left, y, columns[index], height);
    ctx.strokeRect(left, y, columns[index], height);
    drawPdfCellText(
      ctx,
      String(value),
      left + 7,
      y + 8,
      columns[index] - 14,
      15,
      '#17324d',
      false,
      index === row.length - 1 ? 5 : 3
    );
    left += columns[index];
  });
}

function drawPdfCellText(ctx, text, x, y, maxWidth, fontSize, color, bold = false, maxLines = 3) {
  const font = `${bold ? '700 ' : ''}${fontSize}px Arial, sans-serif`,
    lines = wrapCanvasText(ctx, text, maxWidth, font);
  ctx.font = font;
  ctx.fillStyle = color;
  lines.slice(0, maxLines).forEach((line, index) => {
    let value = line;
    if (index === maxLines - 1 && lines.length > maxLines) value = `${line.replace(/[. ]+$/, '')}…`;
    ctx.fillText(value, x, y + index * (fontSize + 5));
  });
}

function wrapCanvasText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text || '—').split(/\s+/),
    lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function buildPdfFromJpegPages(jpegPages, imageWidth, imageHeight) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageIds = jpegPages.map((_, index) => 3 + index * 3);
  const imageIds = jpegPages.map((_, index) => 4 + index * 3);
  const contentIds = jpegPages.map((_, index) => 5 + index * 3);
  objects[1] = encoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = encoder.encode(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  );
  jpegPages.forEach((jpeg, index) => {
    const pageId = pageIds[index];
    const imageId = imageIds[index];
    const contentId = contentIds[index];
    objects[pageId] = encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    const imageHeader = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    const imageFooter = encoder.encode('\nendstream');
    objects[imageId] = concatUint8Arrays([imageHeader, jpeg, imageFooter]);
    const content = encoder.encode(`q\n841.89 0 0 595.28 0 0 cm\n/Im${index + 1} Do\nQ\n`);
    objects[contentId] = concatUint8Arrays([
      encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encoder.encode('endstream'),
    ]);
  });

  const header = encoder.encode('%PDF-1.4\n%âãÏÓ\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.length;
  for (let id = 1; id < objects.length; id += 1) {
    const body = objects[id];
    if (!body) continue;
    offsets[id] = offset;
    const objectBytes = concatUint8Arrays([
      encoder.encode(`${id} 0 obj\n`),
      body,
      encoder.encode('\nendobj\n'),
    ]);
    parts.push(objectBytes);
    offset += objectBytes.length;
  }
  const xrefOffset = offset;
  const maxId = objects.length - 1;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1)
    xref += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encoder.encode(xref));
  return new Blob(parts, { type: 'application/pdf' });
}

async function exportWord() {
  if (reportJobBusy) return false;
  setReportJobBusy(true);
  try {
    showToast('Tworzenie dokumentu Word…');
    await new Promise(resolve => setTimeout(resolve, 0));
    const config = getReportConfiguration();
    if (!config) return false;
    const blob = await createDocxBlobForConfig(config);
    const saved = await downloadBlob(
      `dzienniczek-raport-${getReportFilenameScope(config)}-${localDateISO()}.docx`,
      blob
    );
    if (!saved) {
      showToast('Anulowano zapis dokumentu Word.');
      return false;
    }
    showToast(
      isNativeAndroidApp() ? 'Zapisano dokument Word .docx.' : 'Pobrano prawidłowy dokument Word .docx.',
      'success'
    );
    return true;
  } catch (error) {
    console.error('Nie udało się utworzyć DOCX:', error);
    showToast('Nie udało się utworzyć dokumentu Word.', 'error');
    return false;
  } finally {
    setReportJobBusy(false);
  }
}

function createDocxBlobForConfig(config) {
  const model = createReportModel(config);
  return new Promise((resolve, reject) => {
    const worker = new Worker('./report-worker.js');
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Przekroczono czas tworzenia DOCX.')); }, 120000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onerror = () => { finish(); reject(new Error('Nie udało się uruchomić eksportu DOCX.')); };
    worker.onmessage = ({ data: result }) => {
      finish();
      if (result.error) reject(new Error(result.error));
      else resolve(new Blob([result.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    };
    worker.postMessage({ id: 1, model });
  });
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

