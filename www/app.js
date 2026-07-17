(() => {
  'use strict';

  const STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1';
  const DATA_SCHEMA_VERSION = 7;
  const ERROR_LOG_KEY = 'dzienniczek-hormonu-wzrostu-error-log';
  const MAX_ERROR_LOG_ITEMS = 20;
  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';
  const MAX_NOTE_LENGTH = 1000;
  const ALLOWED_UNITS = new Set(['mg', 'ml', 'IU', 'j.m.']);
  const ALLOWED_SIDES = new Set(['lewa', 'prawa']);
  const ALLOWED_SITES = new Set(['brzuch', 'udo', 'ramię', 'pośladek', 'łopatka']);
  const ALLOWED_STATUSES = new Set(['given', 'skipped']);
  const ALLOWED_AMPOULE_STATUSES = new Set(['active', 'paused', 'finished']);
  const DEFAULT_AMPOULE_VOLUME_ML = '10';
  const startupWarnings = [];
  const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const MONTHS_NORMALIZED = {
    stycznia: 0, styczen: 0,
    lutego: 1, luty: 1,
    marca: 2, marzec: 2,
    kwietnia: 3, kwiecien: 3,
    maja: 4, maj: 4,
    czerwca: 5, czerwiec: 5,
    lipca: 6, lipiec: 6,
    sierpnia: 7, sierpien: 7,
    wrzesnia: 8, wrzesien: 8,
    pazdziernika: 9, pazdziernik: 9,
    listopada: 10, listopad: 10,
    grudnia: 11, grudzien: 11
  };

  const SITE_LABELS = {
    brzuch: 'brzuch',
    udo: 'udo',
    'ramię': 'ramię',
    'pośladek': 'pośladek',
    'łopatka': 'łopatka'
  };

  const DEFAULT_ROTATION = [
    ['lewa', 'brzuch'], ['prawa', 'brzuch'],
    ['lewa', 'udo'], ['prawa', 'udo'],
    ['lewa', 'pośladek'], ['prawa', 'pośladek'],
    ['lewa', 'ramię'], ['prawa', 'ramię'],
    ['lewa', 'łopatka'], ['prawa', 'łopatka']
  ];

  const defaultData = {
    version: DATA_SCHEMA_VERSION,
    settings: {
      defaultDose: '1,0',
      unit: 'mg',
      defaultTime: '20:00',
      voiceFeedback: false,
      voiceConfirm: true,
      reminderEnabled: true,
      reminderTime: '21:00',
      ampouleStartDate: '',
      ampouleStartNumber: 1,
      ampouleVolumeMl: DEFAULT_AMPOULE_VOLUME_ML,
      ampouleDoseMl: '',
      ampouleMaxOpenDays: '',
      injectionRotation: DEFAULT_ROTATION.map(([side, site]) => ({ side, site, enabled: true }))
    },
    meta: {
      onboardingCompleted: false,
      lastReminderDate: ''
    },
    ampoules: [],
    activeAmpouleId: '',
    entries: []
  };

  let data = loadData();
  let lastKnownLocalDate = localDateISO();
  let activeView = 'today';
  let selectedCalendarDate = localDateISO();
  let calendarCursor = startOfMonth(new Date());
  let deferredInstallPrompt = null;
  let recognition = null;
  let isListening = false;
  let lastRecognizedText = '';
  let quickDraft = createInitialQuickDraft();
  let quickDraftTouched = false;
  let midnightTimer = null;
  let reminderTimer = null;
  let serviceWorkerRegistration = null;
  let dataDialogReturnTarget = null;
  let rotationDraft = [];
  let draggedRotationIndex = -1;

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    installGlobalErrorHandlers();
    bindEvents();
    configureAndroidIntegration();
    configureSpeechRecognition();
    updateCurrentDateHeader();
    loadVersion();
    renderAll();
    switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false });
    await registerServiceWorker();
    updateOnlineInstallState();
    await updatePermissionStatuses();
    scheduleDailyReminder();
    await syncNativeReminder();
    scheduleMidnightRefresh();
    checkReminderDue();
    maybeShowFirstRunPermissions();
    flushStartupWarnings();
  }

  function isNativeAndroid() {
    const capacitor = globalThis.Capacitor;
    return Boolean(capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android');
  }

  function nativePlugin(name) {
    return globalThis.Capacitor?.Plugins?.[name] || null;
  }

  function configureAndroidIntegration() {
    const capacitor = globalThis.Capacitor;
    const appPlugin = capacitor?.Plugins?.App;
    if (!capacitor?.isNativePlatform?.() || !appPlugin?.addListener) return;

    appPlugin.addListener('backButton', () => {
      const openDialog = document.querySelector('dialog[open]');
      if (openDialog) {
        openDialog.close();
        return;
      }

      if (activeView !== 'today') {
        switchView('today');
        return;
      }

      appPlugin.exitApp();
    });
  }

  function switchSettingsTab(tabName) {
    const buttons = [...document.querySelectorAll('[data-settings-tab]')];
    const panels = [...document.querySelectorAll('[data-settings-panel]')];
    const selectedButton = buttons.find((button) => button.dataset.settingsTab === tabName);
    const selectedPanel = panels.find((panel) => panel.dataset.settingsPanel === tabName);
    if (!selectedButton || !selectedPanel) return;

    buttons.forEach((button) => {
      const active = button === selectedButton;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      const active = panel === selectedPanel;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  }

  function cacheElements() {
    const ids = [
      'current-date-label', 'today-entry-date', 'today-dose', 'today-time', 'today-status-heading', 'today-status-badge',
      'main-action-heading', 'main-action-text', 'recommended-save-button', 'recommended-manual-button',
      'ampoule-start-main-button', 'ampoule-alert', 'ampoule-alert-title', 'ampoule-alert-text',
      'voice-button', 'voice-help', 'voice-result', 'voice-result-text', 'selected-place', 'save-button', 'save-help',
      'skip-button', 'last-place', 'suggested-place', 'ampoule-status', 'use-suggestion-button', 'mini-calendar', 'recent-list',
      'date-chip', 'dose-chip', 'time-chip', 'place-field', 'entry-dialog', 'entry-form',
      'entry-dialog-title', 'entry-id', 'entry-date', 'entry-time', 'entry-dose', 'entry-unit', 'entry-side',
      'entry-site', 'entry-status', 'entry-note', 'delete-entry-button', 'dialog-close-button',
      'dialog-cancel-button', 'toast-region', 'live-region', 'calendar-prev', 'calendar-next',
      'calendar-month-label', 'calendar-grid', 'selected-day-label', 'selected-day-entries',
      'add-for-selected-day', 'history-search', 'status-filter', 'site-filter', 'history-table-body',
      'history-empty', 'settings-dose', 'settings-unit', 'settings-time', 'ampoule-start-date',
      'ampoule-start-number', 'ampoule-volume', 'ampoule-dose-ml', 'ampoule-max-open-days', 'ampoule-start-today-button', 'ampoule-pause-button', 'ampoule-new-button',
      'ampoule-management-summary', 'ampoule-list', 'voice-feedback-toggle',
      'voice-confirm-toggle', 'save-voice-settings-button', 'save-settings-button', 'save-ampoule-settings-button', 'reminder-enabled-toggle', 'reminder-time',
      'save-reminder-button', 'notification-permission-status', 'request-notification-button',
      'test-notification-button', 'report-preview-button', 'export-report-button', 'backup-panel-button',
      'report-preview-dialog', 'report-preview-close-button', 'report-preview-frame', 'report-print-button',
      'export-report-dialog', 'export-report-close-button', 'backup-dialog', 'backup-close-button',
      'export-pdf-button', 'export-word-button', 'export-json-button', 'export-csv-button', 'import-button',
      'import-file', 'clear-data-button', 'data-backup-section', 'header-install-button',
      'desktop-install-button', 'settings-install-button', 'version-label', 'permissions-dialog',
      'permission-microphone-button', 'permission-notification-button', 'permission-storage-button',
      'permission-microphone-status', 'permission-notification-status', 'permission-storage-status',
      'permissions-finish-button', 'permissions-skip-button', 'microphone-permission-settings', 'notification-permission-settings',
      'storage-permission-settings', 'open-permissions-button', 'place-picker-dialog', 'place-picker-options', 'place-picker-edit-button', 'place-picker-close-button',
      'rotation-list', 'rotation-next-preview', 'save-rotation-button', 'reset-rotation-button'
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    document.querySelectorAll('[data-go-home]').forEach((button) => {
      button.addEventListener('click', () => switchView('today'));
    });

    document.querySelectorAll('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => switchSettingsTab(button.dataset.settingsTab));
    });

    document.querySelectorAll('[data-open-entry]').forEach((button) => {
      button.addEventListener('click', () => openEntryForDate(localDateISO()));
    });

    el['date-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-date'));
    el['place-field'].addEventListener('click', openPlacePicker);
    el['dose-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-dose'));
    el['time-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-time'));
    el['place-picker-options'].addEventListener('click', handlePlacePickerSelection);
    el['place-picker-edit-button'].addEventListener('click', openPlaceDetailsFromPicker);
    el['place-picker-close-button'].addEventListener('click', closePlacePicker);
    el['place-picker-dialog'].addEventListener('click', (event) => {
      if (event.target === el['place-picker-dialog']) closePlacePicker();
    });
    el['recommended-save-button'].addEventListener('click', saveRecommendedDraft);
    el['recommended-manual-button'].addEventListener('click', openAmpouleSettings);
    el['ampoule-start-main-button'].addEventListener('click', setAmpouleStartToday);
    el['voice-button'].addEventListener('click', toggleVoiceRecognition);
    el['save-button'].addEventListener('click', saveQuickDraft);
    el['skip-button'].addEventListener('click', prepareSkippedDraft);
    el['use-suggestion-button'].addEventListener('click', useSuggestedPlace);

    el['entry-form'].addEventListener('submit', handleEntrySubmit);
    el['dialog-close-button'].addEventListener('click', closeEntryDialog);
    el['dialog-cancel-button'].addEventListener('click', closeEntryDialog);
    el['delete-entry-button'].addEventListener('click', deleteEntryFromDialog);
    el['entry-status'].addEventListener('change', updateEntryRequirements);
    el['entry-dialog'].addEventListener('click', (event) => {
      if (event.target === el['entry-dialog']) closeEntryDialog();
    });

    el['calendar-prev'].addEventListener('click', () => changeCalendarMonth(-1));
    el['calendar-next'].addEventListener('click', () => changeCalendarMonth(1));
    el['add-for-selected-day'].addEventListener('click', openOrEditSelectedDay);
    el['calendar-grid'].addEventListener('keydown', handleCalendarKeydown);

    [el['history-search'], el['status-filter'], el['site-filter']].forEach((control) => {
      control.addEventListener('input', renderHistory);
      control.addEventListener('change', renderHistory);
    });
    el['history-table-body'].addEventListener('click', handleHistoryAction);
    el['selected-day-entries'].addEventListener('click', handleDayDetailsAction);

    el['save-settings-button'].addEventListener('click', saveTreatmentSettings);
    el['save-rotation-button'].addEventListener('click', saveRotationSettings);
    el['reset-rotation-button'].addEventListener('click', resetRotationSettings);
    el['rotation-list'].addEventListener('click', handleRotationListClick);
    el['rotation-list'].addEventListener('change', handleRotationListChange);
    el['rotation-list'].addEventListener('dragstart', handleRotationDragStart);
    el['rotation-list'].addEventListener('dragover', handleRotationDragOver);
    el['rotation-list'].addEventListener('drop', handleRotationDrop);
    el['rotation-list'].addEventListener('dragend', handleRotationDragEnd);
    el['save-ampoule-settings-button'].addEventListener('click', saveAmpouleSettings);
    el['save-voice-settings-button'].addEventListener('click', saveVoiceSettings);
    el['ampoule-start-today-button'].addEventListener('click', setAmpouleStartToday);
    el['ampoule-pause-button'].addEventListener('click', pauseActiveAmpoule);
    el['ampoule-new-button'].addEventListener('click', startNewAmpoule);
    el['ampoule-list'].addEventListener('click', handleAmpouleListAction);
    el['save-reminder-button'].addEventListener('click', saveReminderSettings);
    el['request-notification-button'].addEventListener('click', requestNotificationPermission);
    el['test-notification-button'].addEventListener('click', testReminderNotification);
    el['report-preview-button'].addEventListener('click', openReportPreview);
    el['export-report-button'].addEventListener('click', openExportReportPanel);
    el['backup-panel-button'].addEventListener('click', openBackupPanel);
    el['report-preview-close-button'].addEventListener('click', () => closeDataDialog(el['report-preview-dialog']));
    el['export-report-close-button'].addEventListener('click', () => closeDataDialog(el['export-report-dialog']));
    el['backup-close-button'].addEventListener('click', () => closeDataDialog(el['backup-dialog']));
    el['report-print-button'].addEventListener('click', printReportPreview);
    el['export-pdf-button'].addEventListener('click', async () => {
      if (await exportPdf()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-word-button'].addEventListener('click', async () => {
      if (await exportWord()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-json-button'].addEventListener('click', async () => {
      if (await exportJson()) closeDataDialog(el['backup-dialog']);
    });
    el['export-csv-button'].addEventListener('click', async () => {
      if (await exportCsv()) closeDataDialog(el['export-report-dialog']);
    });
    el['import-button'].addEventListener('click', () => el['import-file'].click());
    el['import-file'].addEventListener('change', importJson);
    el['clear-data-button'].addEventListener('click', clearAllEntries);

    [el['report-preview-dialog'], el['export-report-dialog'], el['backup-dialog']].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDataDialog(dialog);
      });
      dialog.addEventListener('close', returnToDataSection);
    });

    el['permission-microphone-button'].addEventListener('click', requestMicrophonePermission);
    el['permission-notification-button'].addEventListener('click', requestNotificationPermission);
    el['permission-storage-button'].addEventListener('click', requestPersistentStorage);
    el['permissions-finish-button'].addEventListener('click', finishPermissionsOnboarding);
    el['permissions-skip-button'].addEventListener('click', skipPermissionsOnboarding);
    el['open-permissions-button'].addEventListener('click', openPermissionsDialog);
    el['permissions-dialog'].addEventListener('cancel', () => {
      if (!data.meta.onboardingCompleted) skipPermissionsOnboarding({ silent: true });
    });

    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.addEventListener('click', installPwa);
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateOnlineInstallState();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
      showToast('Aplikacja została zainstalowana.', 'success');
    });

    document.addEventListener('keydown', handleGlobalKeyboard);
    window.addEventListener('focus', handleAppResume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleAppResume();
    });
    window.addEventListener('hashchange', () => switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false }));
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        data = loadData();
        resetQuickDraftForToday();
        renderAll();
        showToast('Dane odświeżono z innej karty.', 'success');
      }
    });
  }

  function loadData() {
    const primaryRaw = safeStorageGet(STORAGE_KEY);
    const backupRaw = safeStorageGet(BACKUP_STORAGE_KEY);

    for (const [raw, source] of [[primaryRaw, 'głównej pamięci'], [backupRaw, 'kopii zapasowej']]) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const result = normalizeStoredData(parsed);
        if (source === 'kopii zapasowej') {
          startupWarnings.push('Odzyskano dane z lokalnej kopii zapasowej, ponieważ główny zapis był niedostępny lub uszkodzony.');
        }
        if (result.removedDuplicates > 0) {
          safeStorageSet(BACKUP_STORAGE_KEY, raw);
          startupWarnings.push(`Wykryto ${result.removedDuplicates} zduplikowanych wpisów. Zachowano po jednym, najnowszym wpisie dla każdego dnia.`);
        }
        return result.data;
      } catch (error) {
        console.error(`Nie udało się odczytać danych z ${source}:`, error);
      }
    }

    if (primaryRaw || backupRaw) startupWarnings.push('Nie udało się odczytać zapisanej historii. Uruchomiono pusty dzienniczek.');
    return structuredCloneSafe(defaultData);
  }

  function normalizeStoredData(parsed) {
    const entriesInput = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const sanitized = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitized);
    const settings = sanitizeSettings(parsed?.settings);
    const storedAmpoules = Array.isArray(parsed?.ampoules) ? parsed.ampoules.map(sanitizeAmpoule).filter(Boolean) : [];
    const migrated = storedAmpoules.length
      ? normalizeAmpouleCollection(storedAmpoules, entries, parsed?.activeAmpouleId)
      : migrateLegacyAmpoules(entries, settings);
    return {
      removedDuplicates,
      data: {
        version: DATA_SCHEMA_VERSION,
        settings,
        meta: sanitizeMeta(parsed?.meta),
        ampoules: migrated.ampoules,
        activeAmpouleId: migrated.activeAmpouleId,
        entries: migrated.entries
      }
    };
  }

  function sanitizeSettings(settings = {}) {
    const dose = normalizeDose(settings.defaultDose) || defaultData.settings.defaultDose;
    return {
      defaultDose: dose,
      unit: ALLOWED_UNITS.has(settings.unit) ? settings.unit : defaultData.settings.unit,
      defaultTime: isValidTime(settings.defaultTime) ? settings.defaultTime : defaultData.settings.defaultTime,
      voiceFeedback: typeof settings.voiceFeedback === 'boolean' ? settings.voiceFeedback : defaultData.settings.voiceFeedback,
      voiceConfirm: typeof settings.voiceConfirm === 'boolean' ? settings.voiceConfirm : defaultData.settings.voiceConfirm,
      reminderEnabled: typeof settings.reminderEnabled === 'boolean' ? settings.reminderEnabled : defaultData.settings.reminderEnabled,
      reminderTime: isValidTime(settings.reminderTime) ? settings.reminderTime : defaultData.settings.reminderTime,
      ampouleStartDate: isValidIsoDate(settings.ampouleStartDate) ? settings.ampouleStartDate : defaultData.settings.ampouleStartDate,
      ampouleStartNumber: normalizeAmpouleNumber(settings.ampouleStartNumber),
      ampouleVolumeMl: normalizePositiveDecimal(settings.ampouleVolumeMl) || defaultData.settings.ampouleVolumeMl,
      ampouleDoseMl: normalizeOptionalPositiveDecimal(settings.ampouleDoseMl),
      ampouleMaxOpenDays: normalizeOptionalDayLimit(settings.ampouleMaxOpenDays),
      injectionRotation: sanitizeInjectionRotation(settings.injectionRotation)
    };
  }


  function sanitizeInjectionRotation(rotation) {
    const defaultItems = DEFAULT_ROTATION.map(([side, site]) => ({ side, site, enabled: true }));
    if (!Array.isArray(rotation)) return defaultItems;

    const validKeys = new Set(DEFAULT_ROTATION.map(([side, site]) => `${side}|${site}`));
    const seen = new Set();
    const normalized = [];
    rotation.forEach((item) => {
      const side = item?.side;
      const site = item?.site;
      const key = `${side}|${site}`;
      if (!validKeys.has(key) || seen.has(key)) return;
      seen.add(key);
      normalized.push({ side, site, enabled: item.enabled !== false });
    });
    defaultItems.forEach((item) => {
      const key = `${item.side}|${item.site}`;
      if (!seen.has(key)) normalized.push(item);
    });
    if (!normalized.some((item) => item.enabled)) normalized[0].enabled = true;
    return normalized;
  }

  function getRotation({ enabledOnly = true } = {}) {
    const rotation = sanitizeInjectionRotation(data.settings.injectionRotation);
    return enabledOnly ? rotation.filter((item) => item.enabled) : rotation;
  }

  function sanitizeMeta(meta = {}) {
    return {
      onboardingCompleted: Boolean(meta.onboardingCompleted),
      lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : ''
    };
  }

  function sanitizeAmpoule(ampoule) {
    if (!ampoule || typeof ampoule !== 'object') return null;
    const id = typeof ampoule.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(ampoule.id) ? ampoule.id : '';
    const startDate = isValidIsoDate(ampoule.startDate) ? ampoule.startDate : '';
    const volumeMl = normalizePositiveDecimal(ampoule.volumeMl);
    const doseMl = normalizePositiveDecimal(ampoule.doseMl);
    if (!id || !startDate || !volumeMl || !doseMl) return null;
    return {
      id,
      number: normalizeAmpouleNumber(ampoule.number),
      startDate,
      volumeMl,
      doseMl,
      status: ALLOWED_AMPOULE_STATUSES.has(ampoule.status) ? ampoule.status : 'paused',
      createdAt: isValidDateTime(ampoule.createdAt) ? ampoule.createdAt : new Date(`${startDate}T00:00:00`).toISOString(),
      updatedAt: isValidDateTime(ampoule.updatedAt) ? ampoule.updatedAt : ''
    };
  }

  function normalizeAmpouleCollection(ampoules, entries, requestedActiveId = '') {
    const byId = new Map(ampoules.map((ampoule) => [ampoule.id, ampoule]));
    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      ampouleId: entry.ampouleId && byId.has(entry.ampouleId) ? entry.ampouleId : ''
    }));
    const remainingById = new Map(ampoules.map((ampoule) => {
      const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
      const used = normalizedEntries
        .filter((entry) => entry.ampouleId === ampoule.id && entry.status === 'given')
        .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
      return [ampoule.id, Math.max(0, decimalToNumber(ampoule.volumeMl) - used)];
    }));
    let activeAmpouleId = typeof requestedActiveId === 'string'
      && byId.has(requestedActiveId)
      && (remainingById.get(requestedActiveId) || 0) > 0.000001
      ? requestedActiveId
      : '';
    if (!activeAmpouleId) {
      activeAmpouleId = ampoules.find((ampoule) => ampoule.status === 'active' && (remainingById.get(ampoule.id) || 0) > 0.000001)?.id || '';
    }
    const normalizedAmpoules = ampoules.map((ampoule) => {
      const remaining = remainingById.get(ampoule.id) || 0;
      return {
        ...ampoule,
        status: remaining <= 0.000001
          ? 'finished'
          : (ampoule.id === activeAmpouleId ? 'active' : 'paused')
      };
    });
    return { ampoules: normalizedAmpoules, activeAmpouleId, entries: normalizedEntries };
  }

  function migrateLegacyAmpoules(entries, settings) {
    const startDate = settings.ampouleStartDate || '';
    const volumeMl = decimalToNumber(settings.ampouleVolumeMl);
    const doseMl = settings.unit === 'ml' ? decimalToNumber(settings.defaultDose) : decimalToNumber(settings.ampouleDoseMl);
    if (!startDate || !volumeMl || !doseMl) return { ampoules: [], activeAmpouleId: '', entries };

    const ampoules = [];
    const migratedEntries = entries.map((entry) => ({ ...entry, ampouleId: entry.ampouleId || '' }));
    let number = normalizeAmpouleNumber(settings.ampouleStartNumber);
    let current = createAmpouleRecord({ number, startDate, volumeMl, doseMl, status: 'active' });
    ampoules.push(current);
    let remainingMl = volumeMl;

    migratedEntries
      .filter((entry) => entry.date >= startDate)
      .sort((a, b) => ampouleSortKey(a).localeCompare(ampouleSortKey(b)))
      .forEach((entry) => {
        if (entry.status === 'given' && remainingMl <= 0.000001) {
          current.status = 'finished';
          number += 1;
          current = createAmpouleRecord({ number, startDate: entry.date, volumeMl, doseMl, status: 'active' });
          ampoules.push(current);
          remainingMl = volumeMl;
        }
        entry.ampouleId = current.id;
        if (entry.status === 'given') remainingMl = Math.max(0, remainingMl - getEntryAmpouleDoseMl(entry, doseMl));
      });

    if (remainingMl <= 0.000001) current.status = 'finished';
    const activeAmpouleId = current.status === 'active' ? current.id : '';
    return { ampoules, activeAmpouleId, entries: migratedEntries };
  }

  function sanitizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ? entry.id : '';
    const date = isValidIsoDate(entry.date) ? entry.date : '';
    const time = isValidTime(entry.time) ? entry.time : '';
    const status = ALLOWED_STATUSES.has(entry.status) ? entry.status : '';
    if (!id || !date || !time || !status) return null;

    const base = {
      id,
      date,
      time,
      status,
      note: typeof entry.note === 'string' ? entry.note.trim().slice(0, MAX_NOTE_LENGTH) : '',
      createdAt: isValidDateTime(entry.createdAt) ? entry.createdAt : new Date(`${date}T${time}:00`).toISOString(),
      updatedAt: isValidDateTime(entry.updatedAt) ? entry.updatedAt : '',
      ampouleId: typeof entry.ampouleId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.ampouleId) ? entry.ampouleId : ''
    };

    if (status === 'skipped') {
      return { ...base, dose: '', unit: '', side: '', site: '' };
    }

    const dose = normalizeDose(entry.dose);
    const unit = ALLOWED_UNITS.has(entry.unit) ? entry.unit : '';
    const side = ALLOWED_SIDES.has(entry.side) ? entry.side : '';
    const site = ALLOWED_SITES.has(entry.site) ? entry.site : '';
    if (!dose || !unit || !side || !site) return null;
    return { ...base, dose, unit, side, site };
  }

  function keepOneEntryPerDate(entries) {
    const sorted = [...entries].sort((a, b) => entryFreshnessKey(b).localeCompare(entryFreshnessKey(a)));
    const seenDates = new Set();
    const unique = [];
    let removedDuplicates = 0;
    sorted.forEach((entry) => {
      if (seenDates.has(entry.date)) {
        removedDuplicates += 1;
        return;
      }
      seenDates.add(entry.date);
      unique.push(entry);
    });
    return { entries: unique, removedDuplicates };
  }

  function entryFreshnessKey(entry) {
    return entry.updatedAt || entry.createdAt || `${entry.date}T${entry.time}:00`;
  }

  function persistData({ notifyError = true } = {}) {
    try {
      const serialized = serializeDataForStorage(data);
      const previous = safeStorageGet(STORAGE_KEY);
      if (previous && !safeStorageSet(BACKUP_STORAGE_KEY, previous)) {
        throw new Error('Nie udało się utworzyć lokalnej kopii poprzedniego zapisu.');
      }
      if (!safeStorageSet(STORAGE_KEY, serialized)) {
        throw new Error('Pamięć urządzenia odrzuciła zapis danych.');
      }
      window.queueMicrotask(() => {
        scheduleDailyReminder();
        syncReminderStateWithServiceWorker();
        syncNativeReminder();
      });
      return true;
    } catch (error) {
      reportTechnicalError('persistData', error);
      if (notifyError && el['toast-region']) showToast('Nie udało się zapisać danych w pamięci urządzenia. Wykonaj eksport kopii JSON.', 'error');
      else startupWarnings.push('Nie udało się zapisać danych w pamięci urządzenia.');
      return false;
    }
  }

  function serializeDataForStorage(value) {
    if (!value || typeof value !== 'object') throw new TypeError('Nieprawidłowy główny obiekt danych.');
    if (!value.settings || typeof value.settings !== 'object') throw new TypeError('Brak ustawień aplikacji.');
    if (!Array.isArray(value.entries) || !Array.isArray(value.ampoules)) throw new TypeError('Nieprawidłowa historia lub lista ampułek.');
    const snapshot = structuredCloneSafe(value);
    snapshot.version = DATA_SCHEMA_VERSION;
    return JSON.stringify(snapshot);
  }

  function installGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      reportTechnicalError('window.error', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      reportTechnicalError('unhandledrejection', event.reason);
    });
  }

  function reportTechnicalError(source, error) {
    const message = error instanceof Error ? error.message : String(error || 'Nieznany błąd');
    console.error(`[${source}]`, error);
    try {
      const current = JSON.parse(safeStorageGet(ERROR_LOG_KEY) || '[]');
      const log = Array.isArray(current) ? current : [];
      log.push({ time: new Date().toISOString(), source, message: message.slice(0, 500) });
      safeStorageSet(ERROR_LOG_KEY, JSON.stringify(log.slice(-MAX_ERROR_LOG_ITEMS)));
    } catch {
      // Rejestrowanie błędu nie może wywołać kolejnego błędu aplikacji.
    }
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  function structuredCloneSafe(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function isValidEntry(entry) {
    return Boolean(sanitizeEntry(entry));
  }

  function isValidIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return Boolean(match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  function isValidTime(value) {
    const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
  }

  function isValidDateTime(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function createDefaultDraft(overrides = {}) {
    const now = new Date();
    return {
      id: '',
      date: localDateISO(now),
      time: localTime(now),
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: '',
      site: '',
      status: 'given',
      note: '',
      ...overrides
    };
  }

  function createInitialQuickDraft() {
    const todayEntry = getEntryForDate(localDateISO());
    return todayEntry ? { ...todayEntry } : createDefaultDraft();
  }

  function resetQuickDraftForToday() {
    quickDraft = createInitialQuickDraft();
    quickDraftTouched = false;
    lastRecognizedText = '';
  }

  function getEntryForDate(date, excludeId = '') {
    return data.entries.find((entry) => entry.date === date && entry.id !== excludeId) || null;
  }

  function flushStartupWarnings() {
    if (!startupWarnings.length) return;
    const message = startupWarnings.join(' ');
    startupWarnings.length = 0;
    showToast(message, 'error', 9000);
  }

  function handleAppResume() {
    refreshDayState();
    checkReminderDue();
  }

  function refreshDayState() {
    updateCurrentDateHeader();
    const currentDate = localDateISO();
    if (currentDate === lastKnownLocalDate) return;

    const previousDate = lastKnownLocalDate;
    lastKnownLocalDate = currentDate;
    if (!quickDraftTouched && (!quickDraft.id || quickDraft.date === previousDate)) {
      resetQuickDraftForToday();
    } else if (quickDraft.date === previousDate) {
      showToast('Zmienił się dzień. Sprawdź datę przygotowanego wpisu przed zapisaniem.', 'error', 7000);
    }
    if (activeView === 'today') {
      selectedCalendarDate = currentDate;
      calendarCursor = startOfMonth(new Date());
    }
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    scheduleMidnightRefresh();
  }

  function scheduleMidnightRefresh() {
    if (midnightTimer) window.clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    midnightTimer = window.setTimeout(() => refreshDayState(), Math.max(1000, next.getTime() - now.getTime()));
  }

  function renderAll() {
    renderToday();
    renderMiniCalendar();
    renderRecent();
    renderCalendar();
    renderSelectedDay();
    renderHistory();
    renderSettings();
    updateNavigation();
  }

  function updateCurrentDateHeader() {
    el['current-date-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date()));
  }

  function renderToday() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    const editingExisting = Boolean(quickDraft.id && data.entries.some((entry) => entry.id === quickDraft.id));

    el['today-entry-date'].textContent = quickDraft.date === today ? 'Dzisiaj' : formatDateShort(quickDraft.date);
    el['today-dose'].textContent = quickDraft.status === 'skipped'
      ? '—'
      : `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;
    el['today-time'].textContent = quickDraft.time;
    el['selected-place'].textContent = quickDraft.status === 'skipped'
      ? 'Dawka pominięta'
      : (quickDraft.side && quickDraft.site ? formatPlace(quickDraft.side, quickDraft.site) : 'Nie wybrano');

    const ready = quickDraft.status === 'skipped' || Boolean(quickDraft.side && quickDraft.site && normalizeDose(quickDraft.dose));
    el['save-button'].disabled = !ready;
    el['save-button'].innerHTML = editingExisting
      ? '<span aria-hidden="true">✓</span> Zapisz zmiany'
      : '<span aria-hidden="true">✓</span> Zapisz podanie';
    el['save-help'].textContent = quickDraftSaveHelpMessage(ready);

    if (todayEntry) {
      el['today-status-badge'].className = `status-badge status-badge--${todayEntry.status}`;
      el['today-status-badge'].textContent = todayEntry.status === 'given' ? 'Podano' : 'Pominięto';
      el['today-status-heading'].textContent = todayEntry.status === 'given'
        ? `Zapisano o ${todayEntry.time}`
        : 'Dawka oznaczona jako pominięta';
    } else {
      el['today-status-badge'].className = 'status-badge status-badge--neutral';
      el['today-status-badge'].textContent = 'Brak wpisu';
      el['today-status-heading'].textContent = ready && quickDraftTouched ? 'Propozycja gotowa — jeszcze nie zapisana' : (ready ? 'Sprawdź i zapisz' : 'Uzupełnij wpis');
    }

    if (lastRecognizedText) {
      el['voice-result'].classList.remove('is-hidden');
      el['voice-result-text'].textContent = lastRecognizedText;
    } else {
      el['voice-result'].classList.add('is-hidden');
      el['voice-result-text'].textContent = '';
    }

    const latestGiven = getLatestGivenBefore(new Date());
    el['last-place'].textContent = latestGiven
      ? `${formatPlace(latestGiven.side, latestGiven.site)} · ${formatDateShort(latestGiven.date)}`
      : 'Brak wcześniejszych wpisów';

    const suggestion = getSuggestedPlace(new Date());
    el['suggested-place'].textContent = capitalize(formatPlace(suggestion.side, suggestion.site));

    const ampouleInfo = getAmpouleInfo();
    renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting });
  }

  function renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting }) {
    const suggestedPlace = capitalize(formatPlace(suggestion.side, suggestion.site));
    const doseText = `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;

    el['recommended-save-button'].classList.remove('is-hidden');
    el['recommended-save-button'].disabled = false;
    el['recommended-manual-button'].classList.add('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustaw ampułkę';
    el['ampoule-start-main-button'].classList.add('is-hidden');

    if (todayEntry?.status === 'given') {
      el['main-action-heading'].textContent = `Dzisiaj zapisano: ${capitalize(formatPlace(todayEntry.side, todayEntry.site))}`;
      el['main-action-text'].textContent = `${formatDateShort(todayEntry.date)}, ${todayEntry.time}. Dawka: ${formatDose(todayEntry.dose)} ${todayEntry.unit}.`;
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else if (todayEntry?.status === 'skipped') {
      el['main-action-heading'].textContent = 'Dzisiaj dawka jest oznaczona jako pominięta';
      el['main-action-text'].textContent = 'Jeżeli to pomyłka, otwórz edycję i popraw dzisiejszy wpis.';
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else {
      el['main-action-heading'].textContent = `Proponowane miejsce: ${suggestedPlace}`;
      el['main-action-text'].textContent = `Dawka: ${doseText}. Godzina: ${quickDraft.time}. Przed zapisem możesz zmienić dawkę, godzinę albo miejsce.`;
      el['recommended-save-button'].textContent = 'Użyj propozycji';
    }

    if (!ampouleInfo.configured && ampouleInfo.reason === 'start') {
      el['ampoule-start-main-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustaw inną datę';
    } else if (!ampouleInfo.configured && ampouleInfo.reason === 'dose') {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustaw dawkę ampułki';
    } else if (!ampouleInfo.configured && ampouleInfo.reason === 'paused') {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Wybierz odłożoną ampułkę';
    } else if (!ampouleInfo.configured && ampouleInfo.reason === 'finished') {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Rozpocznij nową ampułkę';
    } else if (ampouleInfo.todayIsLast) {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustawienia ampułki';
    }

    const ampouleMessage = ampouleSummary(ampouleInfo);
    el['ampoule-status'].textContent = ampouleMessage.short;
    el['ampoule-alert-title'].textContent = ampouleMessage.title;
    el['ampoule-alert-text'].textContent = ampouleMessage.text;
    el['ampoule-alert'].className = `ampoule-alert ampoule-alert--${ampouleMessage.level}`;
  }

  function quickDraftSaveHelpMessage(ready) {
    if (quickDraft.status === 'skipped') return 'Gotowe: zapisze pominięcie dawki bez dawki, strony i miejsca.';
    if (!normalizeDose(quickDraft.dose)) return 'Sprawdź dawkę, aby zapisać podanie.';
    if (!quickDraft.side || !quickDraft.site) return 'Wybierz miejsce wkłucia, aby zapisać podanie.';
    if (ready) return 'Gotowe do zapisu. Przed zapisaniem możesz jeszcze zmienić dawkę, godzinę albo miejsce.';
    return 'Uzupełnij dane, aby zapisać podanie.';
  }

  function renderMiniCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const offset = mondayIndex(first.getDay());
    const days = new Date(year, month + 1, 0).getDate();
    const entriesByDate = groupEntriesByDate();

    let html = '<div class="mini-calendar-head"><span>Pn</span><span>Wt</span><span>Śr</span><span>Cz</span><span>Pt</span><span>So</span><span>Nd</span></div><div class="mini-calendar-grid">';
    for (let i = 0; i < offset; i += 1) html += '<span class="mini-day is-outside"></span>';
    for (let day = 1; day <= days; day += 1) {
      const iso = datePartsToISO(year, month + 1, day);
      const entries = entriesByDate.get(iso) || [];
      const hasGiven = entries.some((entry) => entry.status === 'given');
      const hasSkipped = entries.some((entry) => entry.status === 'skipped');
      const classes = ['mini-day'];
      if (iso === localDateISO()) classes.push('is-today');
      if (hasGiven) classes.push('has-given');
      else if (hasSkipped) classes.push('has-skipped');
      html += `<span class="${classes.join(' ')}" title="${escapeHtml(formatDateLong(iso))}">${day}</span>`;
    }
    html += '</div>';
    el['mini-calendar'].innerHTML = html;
  }

  function renderRecent() {
    const entries = getEntriesSorted().slice(0, 5);
    if (!entries.length) {
      el['recent-list'].innerHTML = '<div class="empty-state"><strong>Brak wpisów</strong><span>Dodaj pierwsze podanie.</span></div>';
      return;
    }
    el['recent-list'].innerHTML = entries.map((entry) => `
      <div class="recent-item">
        <span>${escapeHtml(formatDateShort(entry.date))}</span>
        <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</span>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Pominięto'}</strong>
      </div>
    `).join('');
  }

  function renderCalendar() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    el['calendar-month-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(calendarCursor));

    const firstVisible = new Date(year, month, 1 - mondayIndex(new Date(year, month, 1).getDay()));
    const entriesByDate = groupEntriesByDate();
    let html = '';

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstVisible);
      date.setDate(firstVisible.getDate() + index);
      const iso = localDateISO(date);
      const entries = entriesByDate.get(iso) || [];
      const classes = ['calendar-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (iso === selectedCalendarDate) classes.push('is-selected');
      if (iso === localDateISO()) classes.push('is-today');
      const markers = entries.slice(0, 1).map((entry) => `<i class="day-marker day-marker--${entry.status}" aria-hidden="true"></i>`).join('');
      const statusText = entries.length ? ', zapisano jeden wpis' : ', brak wpisu';
      html += `
        <button class="${classes.join(' ')}" type="button" role="gridcell" data-date="${iso}" aria-label="${escapeHtml(formatDateLong(iso) + statusText)}" aria-selected="${iso === selectedCalendarDate}">
          <span class="day-number">${date.getDate()}</span>
          <span class="day-markers">${markers}</span>
        </button>
      `;
    }

    el['calendar-grid'].innerHTML = html;
    el['calendar-grid'].querySelectorAll('[data-date]').forEach((button) => {
      button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
    });
  }

  function renderSelectedDay() {
    el['selected-day-label'].textContent = capitalize(formatDateLong(selectedCalendarDate));
    const entry = getEntryForDate(selectedCalendarDate);
    el['add-for-selected-day'].textContent = entry ? 'Edytuj' : 'Dodaj';
    if (!entry) {
      el['selected-day-entries'].innerHTML = '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania.</span></div>';
      return;
    }
    el['selected-day-entries'].innerHTML = `
      <article class="day-entry-card">
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Dawka pominięta'}</strong>
        <div class="day-entry-card-meta">
          <span>${escapeHtml(entry.time)}</span>
          <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'bez dawki'}</span>
          <span>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span>
        </div>
        ${entry.note ? `<span class="muted">${escapeHtml(entry.note)}</span>` : ''}
        <button class="text-button" type="button" data-edit-id="${entry.id}">Edytuj wpis</button>
      </article>
    `;
  }

  function renderHistory() {
    const query = normalizeText(el['history-search']?.value || '');
    const status = el['status-filter']?.value || 'all';
    const site = el['site-filter']?.value || 'all';

    const entries = getEntriesSorted().filter((entry) => {
      if (status !== 'all' && entry.status !== status) return false;
      if (site !== 'all' && entry.site !== site) return false;
      if (!query) return true;
      const haystack = normalizeText([
        entry.date, formatDateShort(entry.date), entry.time, entry.dose, entry.unit,
        entry.side, entry.site, formatPlace(entry.side, entry.site), entry.note,
        entry.status === 'given' ? 'podano' : 'pominięto'
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    });

    el['history-table-body'].innerHTML = entries.map((entry) => `
      <tr>
        <td><strong>${escapeHtml(formatDateShort(entry.date))}</strong><br><span class="muted">${escapeHtml(entry.time)}</span></td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td><span class="status-pill status-pill--${entry.status}">${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span></td>
        <td>${entry.note ? escapeHtml(entry.note) : '<span class="muted">—</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="table-action" type="button" data-edit-id="${entry.id}">Edytuj</button>
            <button class="table-action table-action--danger" type="button" data-delete-id="${entry.id}">Usuń</button>
          </div>
        </td>
      </tr>
    `).join('');

    el['history-empty'].classList.toggle('is-hidden', entries.length > 0);
  }

  function renderSettings() {
    const activeAmpoule = getActiveAmpoule();
    el['settings-dose'].value = data.settings.defaultDose;
    el['settings-unit'].value = data.settings.unit;
    el['settings-time'].value = data.settings.defaultTime;
    el['ampoule-start-date'].value = activeAmpoule?.startDate || data.settings.ampouleStartDate || '';
    el['ampoule-start-number'].value = activeAmpoule?.number || data.settings.ampouleStartNumber || 1;
    el['ampoule-volume'].value = activeAmpoule?.volumeMl || data.settings.ampouleVolumeMl || DEFAULT_AMPOULE_VOLUME_ML;
    el['ampoule-dose-ml'].value = data.settings.ampouleDoseMl || '';
    el['ampoule-max-open-days'].value = data.settings.ampouleMaxOpenDays || '';
    renderAmpouleManagement();
    el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
    el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
    el['reminder-enabled-toggle'].checked = Boolean(data.settings.reminderEnabled);
    el['reminder-time'].value = data.settings.reminderTime || '21:00';
    rotationDraft = sanitizeInjectionRotation(data.settings.injectionRotation).map((item) => ({ ...item }));
    renderRotationSettings();
    updatePermissionStatuses();
  }

  function switchView(view, { updateHash = true, focus = true, smooth = true } = {}) {
    if (!['today', 'calendar', 'history', 'more'].includes(view)) return;
    activeView = view;
    document.querySelectorAll('.view').forEach((section) => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    updateNavigation();
    if (view === 'calendar') {
      renderCalendar();
      renderSelectedDay();
    }
    if (view === 'history') renderHistory();
    if (view === 'more') renderSettings();
    if (updateHash && window.location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (focus) document.getElementById(`view-${view}`)?.querySelector('h1, [tabindex]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  }

  function viewFromHash() {
    const value = window.location.hash.replace('#', '').trim();
    return ['today', 'calendar', 'history', 'more'].includes(value) ? value : 'today';
  }

  function updateNavigation() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === activeView;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function openPlacePicker() {
    if (quickDraft.status === 'skipped') {
      quickDraft.status = 'given';
      quickDraft.dose = data.settings.defaultDose;
      quickDraft.unit = data.settings.unit;
    }
    renderPlacePickerOptions();
    if (!el['place-picker-dialog'].open) el['place-picker-dialog'].showModal();
  }

  function closePlacePicker() {
    if (el['place-picker-dialog'].open) el['place-picker-dialog'].close();
  }

  function renderPlacePickerOptions() {
    el['place-picker-options'].innerHTML = getRotation().map(({ side, site }) => {
      const active = quickDraft.side === side && quickDraft.site === site;
      return `
        <button class="place-option${active ? ' is-active' : ''}" type="button" data-side="${side}" data-site="${site}" aria-pressed="${active ? 'true' : 'false'}">
          <span>${escapeHtml(capitalize(side))}</span>
          <strong>${escapeHtml(capitalize(SITE_LABELS[site] || site))}</strong>
        </button>
      `;
    }).join('');
  }

  function handlePlacePickerSelection(event) {
    const button = event.target.closest('[data-side][data-site]');
    if (!button) return;
    const side = button.dataset.side;
    const site = button.dataset.site;
    if (!ALLOWED_SIDES.has(side) || !ALLOWED_SITES.has(site)) return;
    quickDraft.side = side;
    quickDraft.site = site;
    quickDraft.status = 'given';
    if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
    quickDraftTouched = true;
    lastRecognizedText = `Wybrano: ${formatPlace(side, site)}`;
    closePlacePicker();
    renderToday();
    el['save-button'].focus({ preventScroll: true });
  }

  function openPlaceDetailsFromPicker() {
    closePlacePicker();
    openEntryDialog(quickDraft.id || null, quickDraft, 'entry-site');
  }

  function openEntryForDate(date, focusId = null) {
    const existing = getEntryForDate(date);
    if (existing) {
      showToast('Dla tego dnia istnieje już wpis. Otwieram go do edycji.');
      openEntryDialog(existing.id, null, focusId);
      return;
    }
    openEntryDialog(null, { date }, focusId);
  }

  function openOrEditSelectedDay() {
    openEntryForDate(selectedCalendarDate);
  }

  function openEntryDialog(entryId = null, draftOverride = null, focusId = null) {
    const entry = entryId ? data.entries.find((item) => item.id === entryId) : null;
    const source = entry
      ? { ...entry, ...(draftOverride || {}) }
      : { ...createDefaultDraft({ time: data.settings.defaultTime }), ...(draftOverride || {}) };
    el['entry-dialog-title'].textContent = entry ? 'Edytuj wpis' : 'Dodaj wpis';
    el['entry-id'].value = source.id || '';
    el['entry-date'].value = source.date || localDateISO();
    el['entry-time'].value = source.time || localTime();
    el['entry-dose'].value = source.dose || data.settings.defaultDose;
    el['entry-unit'].value = source.unit || data.settings.unit;
    el['entry-side'].value = source.side || '';
    el['entry-site'].value = source.site || '';
    el['entry-status'].value = source.status || 'given';
    el['entry-note'].value = source.note || '';
    el['delete-entry-button'].classList.toggle('is-hidden', !entry);
    updateEntryRequirements();
    el['entry-dialog'].showModal();
    window.setTimeout(() => document.getElementById(focusId || 'entry-date')?.focus(), 50);
  }

  function closeEntryDialog() {
    if (el['entry-dialog'].open) el['entry-dialog'].close();
  }

  function updateEntryRequirements() {
    const given = el['entry-status'].value === 'given';
    el['entry-side'].required = given;
    el['entry-site'].required = given;
    el['entry-dose'].required = given;
    [el['entry-dose'], el['entry-unit'], el['entry-side'], el['entry-site']].forEach((field) => {
      field.disabled = !given;
      field.closest('.form-field--given-only')?.classList.toggle('is-hidden', !given);
    });
  }

  function handleEntrySubmit(event) {
    event.preventDefault();
    const existingById = data.entries.find((item) => item.id === el['entry-id'].value) || null;
    const status = el['entry-status'].value;
    const entry = sanitizeEntry({
      id: existingById?.id || createId(),
      date: el['entry-date'].value,
      time: el['entry-time'].value,
      dose: status === 'given' ? el['entry-dose'].value : '',
      unit: status === 'given' ? el['entry-unit'].value : '',
      side: status === 'given' ? el['entry-side'].value : '',
      site: status === 'given' ? el['entry-site'].value : '',
      status,
      note: el['entry-note'].value,
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (!entry) {
      showToast(status === 'given'
        ? 'Uzupełnij prawidłową datę, godzinę, dawkę, stronę i miejsce wkłucia.'
        : 'Uzupełnij prawidłową datę i godzinę.', 'error');
      return;
    }

    const conflictingEntry = getEntryForDate(entry.date, entry.id);
    if (conflictingEntry) {
      showToast('Dla tej daty istnieje już wpis. Aplikacja pozwala tylko na jeden wpis dziennie.', 'error');
      return;
    }

    let ampouleId = existingById?.ampouleId || '';
    if (!ampouleId && status === 'given') {
      const resolvedAmpouleId = ensureActiveAmpouleForDate(entry.date);
      if (resolvedAmpouleId === null) {
        showToast('Najpierw wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
        closeEntryDialog();
        openAmpouleSettings();
        return;
      }
      ampouleId = resolvedAmpouleId;
    } else if (!ampouleId && status === 'skipped') {
      ampouleId = getActiveAmpoule()?.id || '';
    }
    entry.ampouleId = ampouleId;

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    if (!persistData()) return;
    closeEntryDialog();
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.';
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function saveRecommendedDraft() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    if (todayEntry) {
      openEntryDialog(todayEntry.id);
      return;
    }
    const suggestion = getSuggestedPlace(new Date());
    quickDraft = createDefaultDraft({
      date: today,
      time: data.settings.defaultTime,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given'
    });
    quickDraftTouched = true;
    lastRecognizedText = `Propozycja: ${formatPlace(suggestion.side, suggestion.site)}`;
    renderToday();
    document.querySelector('.injection-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el['save-button'].focus({ preventScroll: true });
    showToast('Propozycja gotowa — jeszcze nie zapisana. Sprawdź dane i naciśnij „Zapisz podanie”.', 'success');
  }

  function openAmpouleSettings() {
    switchView('more');
    switchSettingsTab('ampoules');
    window.setTimeout(() => {
      const field = el['ampoule-start-date'];
      if (!field) return;
      field.focus({ preventScroll: false });
      try { field.showPicker?.(); } catch {}
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }

  function setAmpouleStartToday() {
    const active = getActiveAmpoule();
    if (active) {
      showToast(`Ampułka ${active.number} jest już aktywna. Aby rozpocząć kolejną, użyj przycisku „Rozpocznij nową ampułkę”. Obecna ampułka zostanie odłożona.`, 'error', 7000);
      return;
    }

    const today = localDateISO();
    data.settings.ampouleStartDate = today;
    if (el['ampoule-start-date']) el['ampoule-start-date'].value = today;

    if (!active) {
      const doseMl = getConfiguredAmpouleDoseMl();
      const volumeMl = decimalToNumber(data.settings.ampouleVolumeMl);
      if (doseMl && volumeMl) {
        const ampoule = createAmpouleRecord({
          number: data.ampoules.length ? nextAmpouleNumber(true) : data.settings.ampouleStartNumber,
          startDate: today,
          volumeMl,
          doseMl,
          status: 'active'
        });
        data.ampoules.push(ampoule);
        data.activeAmpouleId = ampoule.id;
      }
    } else if (!getEntriesForAmpoule(active.id).some((entry) => entry.status === 'given')) {
      active.startDate = today;
      active.updatedAt = new Date().toISOString();
    }

    if (!persistData()) return;
    renderAll();
    showToast('Ustawiono dzisiejszą datę rozpoczęcia ampułki.', 'success');
  }

  function readAmpouleFormValues() {
    const volumeMl = normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
    const formUnit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : data.settings.unit;
    const doseMl = formUnit === 'ml'
      ? normalizePositiveDecimal(el['settings-dose'].value)
      : normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
    return {
      volumeMl,
      doseMl,
      startDate: el['ampoule-start-date'].value || localDateISO(),
      number: normalizeAmpouleNumber(el['ampoule-start-number'].value)
    };
  }

  function pauseActiveAmpoule() {
    const active = getActiveAmpoule();
    if (!active) {
      showToast('Nie ma aktywnej ampułki do odłożenia.', 'error');
      return;
    }
    const remaining = getAmpouleRemainingMl(active.id);
    if (remaining <= 0.000001) {
      reconcileAmpouleStatuses();
      persistData();
      renderAll();
      showToast('Aktywna ampułka jest już zużyta.', 'error');
      return;
    }
    if (!window.confirm(`Odłożyć ampułkę ${active.number}? Pozostanie w niej około ${formatMl(remaining)} ml i będzie można ją później wznowić.`)) return;

    const snapshot = structuredCloneSafe(data);
    active.status = 'paused';
    active.updatedAt = new Date().toISOString();
    data.activeAmpouleId = '';
    if (!persistData()) {
      data = snapshot;
      renderAll();
      return;
    }
    renderAll();
    showToast(`Odłożono ampułkę ${active.number}.`, 'success');
  }

  function startNewAmpoule() {
    const values = readAmpouleFormValues();
    if (!values.doseMl) {
      showToast('Najpierw ustaw zużycie na jedno podanie w ml.', 'error');
      return;
    }

    const active = getActiveAmpoule();
    const pausedCount = getOpenPausedAmpoules().length;
    const message = active
      ? `Rozpocząć nową ampułkę? Aktywna ampułka ${active.number} zostanie odłożona z pozostałą ilością około ${formatMl(getAmpouleRemainingMl(active.id))} ml.`
      : pausedCount
        ? `Masz ${pausedCount} odłożoną lub odłożone ampułki. Rozpocząć mimo to nową?`
        : 'Rozpocząć nową ampułkę z dzisiejszą datą?';
    if (!window.confirm(message)) return;

    const snapshot = structuredCloneSafe(data);
    const hadActiveAmpoule = Boolean(active);
    if (active && getAmpouleRemainingMl(active.id) > 0.000001) {
      active.status = 'paused';
      active.updatedAt = new Date().toISOString();
    } else if (active) active.status = 'finished';

    const ampoule = createAmpouleRecord({
      number: nextAmpouleNumber(true),
      startDate: localDateISO(),
      volumeMl: values.volumeMl,
      doseMl: values.doseMl,
      status: 'active'
    });
    data.ampoules.push(ampoule);
    data.activeAmpouleId = ampoule.id;
    data.settings.ampouleStartDate = ampoule.startDate;
    data.settings.ampouleStartNumber = ampoule.number;
    data.settings.ampouleVolumeMl = ampoule.volumeMl;
    data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : ampoule.doseMl;
    if (!persistData()) {
      data = snapshot;
      renderAll();
      return;
    }
    renderAll();
    showToast(hadActiveAmpoule
      ? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia została odłożona.`
      : `Rozpoczęto ampułkę ${ampoule.number}.`, 'success');
  }

  function handleAmpouleListAction(event) {
    const button = event.target.closest('[data-resume-ampoule-id]');
    if (!button) return;
    resumeAmpoule(button.dataset.resumeAmpouleId);
  }

  function resumeAmpoule(ampouleId) {
    const target = getAmpouleById(ampouleId);
    if (!target || getAmpouleRemainingMl(target.id) <= 0.000001) {
      showToast('Tej ampułki nie można wznowić, ponieważ jest już zużyta.', 'error');
      return;
    }
    const active = getActiveAmpoule();
    if (active && active.id !== target.id) {
      const remaining = getAmpouleRemainingMl(active.id);
      if (!window.confirm(`Wznowić ampułkę ${target.number}? Obecna ampułka ${active.number} zostanie odłożona z pozostałą ilością około ${formatMl(remaining)} ml.`)) return;
    } else if (!window.confirm(`Wznowić ampułkę ${target.number}, w której pozostało około ${formatMl(getAmpouleRemainingMl(target.id))} ml?`)) return;

    const snapshot = structuredCloneSafe(data);
    if (active && active.id !== target.id) {
      active.status = getAmpouleRemainingMl(active.id) > 0.000001 ? 'paused' : 'finished';
      active.updatedAt = new Date().toISOString();
    }
    target.status = 'active';
    target.updatedAt = new Date().toISOString();
    data.activeAmpouleId = target.id;
    data.settings.ampouleStartDate = target.startDate;
    data.settings.ampouleStartNumber = target.number;
    data.settings.ampouleVolumeMl = target.volumeMl;
    data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : target.doseMl;
    if (!persistData()) {
      data = snapshot;
      renderAll();
      return;
    }
    renderAll();
    showToast(`Wznowiono ampułkę ${target.number}.`, 'success');
  }

  function renderAmpouleManagement() {
    const active = getActiveAmpoule();
    const paused = getOpenPausedAmpoules();
    const startTodayButtons = [el['ampoule-start-today-button'], el['ampoule-start-main-button']].filter(Boolean);
    startTodayButtons.forEach((button) => {
      button.disabled = Boolean(active);
      button.title = active
        ? `Ampułka ${active.number} jest już aktywna. Użyj przycisku „Rozpocznij nową ampułkę”. Obecna ampułka zostanie odłożona.`
        : 'Rozpocznij pierwszą ampułkę z dzisiejszą datą';
    });

    if (active) {
      const openWarning = isAmpouleOpenTooLong(active) ? ' Przekroczono ustawiony limit czasu od otwarcia.' : '';
      el['ampoule-management-summary'].textContent = `Aktywna: ampułka ${active.number}, pozostało około ${formatMl(getAmpouleRemainingMl(active.id))} ml.${openWarning}`;
      el['ampoule-pause-button'].disabled = false;
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    } else if (paused.length) {
      el['ampoule-management-summary'].textContent = 'Brak aktywnej ampułki. Wybierz jedną z odłożonych albo rozpocznij nową.';
      el['ampoule-pause-button'].disabled = true;
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    } else {
      el['ampoule-management-summary'].textContent = 'Nie ma odłożonych ampułek.';
      el['ampoule-pause-button'].disabled = true;
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    }

    const statusOrder = { active: 0, paused: 1, finished: 2 };
    const visible = [...data.ampoules]
      .sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3) || b.number - a.number);
    el['ampoule-list'].innerHTML = visible.length ? visible.map((ampoule) => {
      const remaining = getAmpouleRemainingMl(ampoule.id);
      const entries = getEntriesForAmpoule(ampoule.id).filter((entry) => entry.status === 'given');
      const lastEntry = entries.at(-1);
      const status = ampoule.id === data.activeAmpouleId ? 'Aktywna' : remaining > 0.000001 ? 'Odłożona' : 'Zużyta';
      const openDays = getAmpouleOpenDays(ampoule);
      const tooLong = remaining > 0.000001 && isAmpouleOpenTooLong(ampoule);
      const action = ampoule.id !== data.activeAmpouleId && remaining > 0.000001
        ? `<button class="mini-button" type="button" data-resume-ampoule-id="${ampoule.id}">Wznów</button>`
        : '';
      const usage = entries.length
        ? ` · podań ${entries.length} · ostatnie ${formatDateShort(lastEntry.date)}`
        : ' · brak zapisanych podań';
      return `<div class="ampoule-list-item${tooLong ? ' ampoule-list-item--warning' : ''}"><div><strong>Ampułka ${ampoule.number} — ${status}</strong><span>start ${formatDateShort(ampoule.startDate)} · otwarta ${openDays} ${plural(openDays, 'dzień', 'dni', 'dni')} · pozostało ${formatMl(remaining)} ml${usage}${tooLong ? ' · przekroczony limit' : ''}</span></div>${action}</div>`;
    }).join('') : '<p class="muted">Lista rozpoczętych ampułek jest pusta.</p>';
  }

  function saveQuickDraft() {
    if (quickDraft.status === 'given' && (!quickDraft.side || !quickDraft.site || !normalizeDose(quickDraft.dose))) {
      showToast('Najpierw wybierz lub powiedz miejsce wkłucia oraz sprawdź dawkę.', 'error');
      return;
    }

    const existingById = quickDraft.id ? data.entries.find((item) => item.id === quickDraft.id) : null;
    const conflictingEntry = getEntryForDate(quickDraft.date, quickDraft.id || '');
    if (conflictingEntry) {
      showToast('Dla tej daty istnieje już wpis. Otwieram istniejący wpis do edycji.', 'error');
      openEntryDialog(conflictingEntry.id);
      return;
    }

    let ampouleId = existingById?.ampouleId || quickDraft.ampouleId || '';
    if (!ampouleId && quickDraft.status === 'given') {
      const resolvedAmpouleId = ensureActiveAmpouleForDate(quickDraft.date);
      if (resolvedAmpouleId === null) {
        showToast('Najpierw wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
        openAmpouleSettings();
        return;
      }
      ampouleId = resolvedAmpouleId;
    } else if (!ampouleId && quickDraft.status === 'skipped') {
      ampouleId = getActiveAmpoule()?.id || '';
    }

    const entry = sanitizeEntry({
      ...quickDraft,
      id: existingById?.id || createId(),
      dose: quickDraft.status === 'given' ? quickDraft.dose : '',
      unit: quickDraft.status === 'given' ? quickDraft.unit : '',
      side: quickDraft.status === 'given' ? quickDraft.side : '',
      site: quickDraft.status === 'given' ? quickDraft.site : '',
      ampouleId,
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      showToast('Przygotowany wpis zawiera nieprawidłowe dane.', 'error');
      return;
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    if (!persistData()) return;
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = entry.status === 'given'
      ? `${existingIndex >= 0 ? 'Zmieniono' : 'Zapisano'}: ${formatPlace(entry.side, entry.site)}.`
      : `${existingIndex >= 0 ? 'Zmieniono wpis na' : 'Zapisano'} pominięcie dawki.`;
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function prepareSkippedDraft() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    quickDraft = existing
      ? { ...existing, status: 'skipped', dose: '', unit: '', side: '', site: '' }
      : createDefaultDraft({ status: 'skipped', dose: '', unit: '', side: '', site: '' });
    quickDraftTouched = true;
    lastRecognizedText = 'dawka pominięta dzisiaj';
    renderToday();
    showToast(existing
      ? 'Przygotowano zmianę dzisiejszego wpisu na „Pominięto”. Naciśnij „Zapisz zmiany”.'
      : 'Przygotowano wpis „Pominięto”. Naciśnij „Zapisz”, aby potwierdzić.');
  }

  function useSuggestedPlace() {
    const reference = dateTimeFromEntry(quickDraft) || new Date();
    const suggestion = getSuggestedPlace(reference);
    quickDraft.side = suggestion.side;
    quickDraft.site = suggestion.site;
    quickDraft.status = 'given';
    if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
    quickDraftTouched = true;
    lastRecognizedText = formatPlace(suggestion.side, suggestion.site);
    renderToday();
    el['save-button'].focus();
  }

  function createAmpouleRecord({ number, startDate, volumeMl, doseMl, status = 'paused' }) {
    return {
      id: `ampoule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      number: normalizeAmpouleNumber(number),
      startDate: isValidIsoDate(startDate) ? startDate : localDateISO(),
      volumeMl: normalizePositiveDecimal(volumeMl) || DEFAULT_AMPOULE_VOLUME_ML,
      doseMl: normalizePositiveDecimal(doseMl) || '1',
      status: ALLOWED_AMPOULE_STATUSES.has(status) ? status : 'paused',
      createdAt: new Date().toISOString(),
      updatedAt: ''
    };
  }

  function getAmpouleById(id) {
    return data.ampoules.find((ampoule) => ampoule.id === id) || null;
  }

  function getActiveAmpoule() {
    const ampoule = getAmpouleById(data.activeAmpouleId);
    return ampoule && ampoule.status !== 'finished' ? ampoule : null;
  }

  function getEntriesForAmpoule(ampouleId) {
    return getEntriesAscending().filter((entry) => entry.ampouleId === ampouleId);
  }

  function getAmpouleRemainingMl(ampouleId) {
    const ampoule = getAmpouleById(ampouleId);
    if (!ampoule) return 0;
    const doseMl = decimalToNumber(ampoule.doseMl);
    const used = getEntriesForAmpoule(ampouleId)
      .filter((entry) => entry.status === 'given')
      .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, doseMl), 0);
    return Math.max(0, decimalToNumber(ampoule.volumeMl) - used);
  }

  function getAmpouleOpenDays(ampoule) {
    if (!ampoule?.startDate || !isValidIsoDate(ampoule.startDate)) return 0;
    const start = parseISODate(ampoule.startDate);
    const today = parseISODate(localDateISO());
    return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  }

  function isAmpouleOpenTooLong(ampoule) {
    const limit = Number(data.settings.ampouleMaxOpenDays) || 0;
    return Boolean(limit && getAmpouleOpenDays(ampoule) > limit);
  }

  function getOpenPausedAmpoules() {
    return data.ampoules.filter((ampoule) => ampoule.id !== data.activeAmpouleId && getAmpouleRemainingMl(ampoule.id) > 0.000001);
  }

  function nextAmpouleNumber(incrementExisting = true) {
    if (!data.ampoules.length) return normalizeAmpouleNumber(data.settings.ampouleStartNumber);
    const highest = Math.max(...data.ampoules.map((ampoule) => normalizeAmpouleNumber(ampoule.number)));
    return incrementExisting ? highest + 1 : highest;
  }

  function reconcileAmpouleStatuses() {
    data.ampoules.forEach((ampoule) => {
      if (getAmpouleRemainingMl(ampoule.id) <= 0.000001) {
        ampoule.status = 'finished';
        if (data.activeAmpouleId === ampoule.id) data.activeAmpouleId = '';
      } else if (data.activeAmpouleId === ampoule.id) {
        ampoule.status = 'active';
      } else if (ampoule.status === 'active' || ampoule.status === 'finished') {
        ampoule.status = 'paused';
      }
    });
  }

  function ensureActiveAmpouleForDate(date) {
    const active = getActiveAmpoule();
    if (active) return active.id;
    if (getOpenPausedAmpoules().length) return null;
    const volumeMl = decimalToNumber(data.settings.ampouleVolumeMl);
    const doseMl = getConfiguredAmpouleDoseMl();
    if (!volumeMl || !doseMl) return '';
    const ampoule = createAmpouleRecord({
      number: data.ampoules.length ? nextAmpouleNumber(true) : data.settings.ampouleStartNumber,
      startDate: data.ampoules.length ? date : (data.settings.ampouleStartDate || date),
      volumeMl,
      doseMl,
      status: 'active'
    });
    data.ampoules.push(ampoule);
    data.activeAmpouleId = ampoule.id;
    return ampoule.id;
  }

  function getAmpouleInfo() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    const timeline = buildAmpouleTimeline({ includePlannedToday: !todayEntry });

    if (!timeline.configured) {
      return {
        configured: false,
        reason: timeline.reason,
        volumeMl: timeline.volumeMl || decimalToNumber(data.settings.ampouleVolumeMl),
        doseMl: timeline.doseMl || getConfiguredAmpouleDoseMl(),
        startDate: timeline.startDate || data.settings.ampouleStartDate,
        pausedCount: getOpenPausedAmpoules().length
      };
    }

    const active = timeline.activeAmpoule;
    const activeRows = timeline.rows.filter((row) => row.ampouleId === active.id);
    const todayRow = [...activeRows].reverse().find((row) => row.entry.date === today);
    const latestRow = activeRows[activeRows.length - 1] || null;
    const remainingBeforeToday = todayRow ? todayRow.remainingBefore : timeline.remainingMl;
    const remainingAfterToday = todayRow ? todayRow.remainingAfter : timeline.remainingMl;
    const todayDoseMl = todayRow ? todayRow.doseMl : 0;
    const approximateDosesLeftAfterToday = Math.floor((remainingAfterToday + 0.000001) / decimalToNumber(active.doseMl));

    return {
      configured: true,
      reason: '',
      startDate: active.startDate,
      volumeMl: decimalToNumber(active.volumeMl),
      doseMl: decimalToNumber(active.doseMl),
      usedBeforeToday: Math.max(0, decimalToNumber(active.volumeMl) - remainingBeforeToday),
      remainingBeforeToday,
      remainingAfterToday,
      ampouleNumber: active.number,
      ampouleStartDate: active.startDate,
      nextAmpouleStartDate: todayRow?.nextAmpouleStartDate || '',
      todayIsLast: Boolean(todayRow?.isLastDose),
      todayStartsNewAmpoule: Boolean(todayRow?.startsNewAmpoule),
      todayEntryStatus: todayEntry?.status || '',
      todayDoseMl,
      approximateDosesLeftAfterToday,
      pausedCount: getOpenPausedAmpoules().length,
      openDays: getAmpouleOpenDays(active),
      maxOpenDays: Number(data.settings.ampouleMaxOpenDays) || 0,
      latestRow
    };
  }

  function ampouleSummary(info) {
    if (!info.configured && info.reason === 'paused') {
      return {
        level: 'warning',
        short: 'Wybierz odłożoną ampułkę',
        title: 'Brak aktywnej ampułki',
        text: `Masz ${info.pausedCount} ${plural(info.pausedCount, 'odłożoną ampułkę', 'odłożone ampułki', 'odłożonych ampułek')}. W ustawieniach wybierz „Wznów” albo rozpocznij nową.`
      };
    }
    if (!info.configured && info.reason === 'finished') {
      return {
        level: 'warning',
        short: 'Rozpocznij nową ampułkę',
        title: 'Poprzednia ampułka została zużyta',
        text: 'Przy następnym zapisanym podaniu aplikacja może rozpocząć kolejną ampułkę albo możesz zrobić to ręcznie w ustawieniach.'
      };
    }
    if (!info.configured && info.reason === 'start') {
      return {
        level: 'warning',
        short: 'Brak daty rozpoczęcia',
        title: 'Ampułka: ustaw datę rozpoczęcia',
        text: 'Ustaw datę rozpoczęcia obecnej ampułki i jej numer. Potem aplikacja pokaże stan ampułki po zapisanych podaniach.'
      };
    }
    if (!info.configured && info.reason === 'dose') {
      return {
        level: 'warning',
        short: 'Brak dawki w ml',
        title: 'Ampułka: brak dawki w ml',
        text: 'Aby liczyć zużycie ampułki, ustaw zużycie na jedno podanie w ml albo wybierz jednostkę ml.'
      };
    }
    if (info.maxOpenDays && info.openDays > info.maxOpenDays) {
      return {
        level: 'danger',
        short: `Ampułka ${info.ampouleNumber}: przekroczony limit otwarcia`,
        title: `Ampułka ${info.ampouleNumber}: sprawdź czas od otwarcia`,
        text: `Ampułka jest otwarta ${info.openDays} ${plural(info.openDays, 'dzień', 'dni', 'dni')}, a ustawiony limit wynosi ${info.maxOpenDays} dni. Aplikacja nie ocenia przydatności leku — sprawdź zalecenia producenta lub lekarza.`
      };
    }
    if (info.todayIsLast) {
      const prefix = info.todayEntryStatus === 'given' ? 'Dzisiejszy wpis był' : 'Dzisiaj jest';
      const pausedText = info.pausedCount ? ' Po jej zużyciu możesz wznowić odłożoną ampułkę.' : '';
      return {
        level: 'danger',
        short: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
        title: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
        text: `${prefix} ostatnim zastrzykiem z ampułki ${info.ampouleNumber}.${pausedText}`
      };
    }
    if (info.todayStartsNewAmpoule) {
      return {
        level: 'ok',
        short: `Ampułka ${info.ampouleNumber}: rozpoczęta dzisiaj`,
        title: `Ampułka ${info.ampouleNumber}: nowa ampułka`,
        text: `Ta ampułka zaczyna się dzisiaj. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml.`
      };
    }
    const pausedText = info.pausedCount ? ` Odłożonych ampułek: ${info.pausedCount}.` : '';
    return {
      level: 'ok',
      short: `Ampułka ${info.ampouleNumber}: zostanie ${formatMl(info.remainingAfterToday)} ml`,
      title: `Ampułka ${info.ampouleNumber}`,
      text: `Start tej ampułki: ${formatDateShort(info.ampouleStartDate)}. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml, czyli około ${info.approximateDosesLeftAfterToday} kolejnych pełnych podań.${pausedText}`
    };
  }

  function ampouleNotificationText(info) {
    if (!info.configured) return '';
    if (info.maxOpenDays && info.openDays > info.maxOpenDays) return `Ampułka jest otwarta ${info.openDays} dni i przekroczyła ustawiony limit ${info.maxOpenDays} dni.`;
    if (info.todayIsLast) return info.pausedCount
      ? 'Dzisiaj jest ostatni zastrzyk z tej ampułki. Potem możesz wznowić odłożoną ampułkę.'
      : 'Dzisiaj jest ostatni zastrzyk z tej ampułki.';
    if (info.todayStartsNewAmpoule) return `Ta ampułka zaczyna się dzisiaj. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml.`;
    return `Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml w ampułce.`;
  }

  function getConfiguredAmpouleDoseMl() {
    if (data.settings.unit === 'ml') return decimalToNumber(data.settings.defaultDose);
    return decimalToNumber(data.settings.ampouleDoseMl);
  }

  function getEntryAmpouleDoseMl(entry, fallbackDoseMl) {
    if (entry?.unit === 'ml') return decimalToNumber(entry.dose) || fallbackDoseMl;
    return fallbackDoseMl;
  }

  function addDaysISO(iso, days) {
    const date = parseISODate(iso);
    date.setDate(date.getDate() + days);
    return localDateISO(date);
  }

  function ampouleSortKey(entry) {
    return `${entry.date}T${entry.time || '00:00'}`;
  }

  function buildAmpouleTimeline({ includePlannedToday = false } = {}) {
    const rows = [];
    const today = localDateISO();
    const activeAmpoule = getActiveAmpoule();

    data.ampoules
      .slice()
      .sort((a, b) => a.number - b.number || a.startDate.localeCompare(b.startDate))
      .forEach((ampoule) => {
        const volumeMl = decimalToNumber(ampoule.volumeMl);
        const doseMl = decimalToNumber(ampoule.doseMl);
        let remainingMl = volumeMl;
        let givenCount = 0;
        const ampouleEntries = getEntriesForAmpoule(ampoule.id);
        const hasTodayEntry = ampouleEntries.some((entry) => entry.date === today);
        if (includePlannedToday && activeAmpoule?.id === ampoule.id && !hasTodayEntry) {
          ampouleEntries.push(createDefaultDraft({
            id: 'planned-today',
            date: today,
            time: data.settings.defaultTime,
            status: 'given',
            ampouleId: ampoule.id
          }));
        }
        ampouleEntries.sort((a, b) => ampouleSortKey(a).localeCompare(ampouleSortKey(b))).forEach((entry) => {
          const isGiven = entry.status === 'given';
          const entryDoseMl = isGiven ? getEntryAmpouleDoseMl(entry, doseMl) : 0;
          const remainingBefore = remainingMl;
          const remainingAfter = isGiven ? Math.max(0, remainingBefore - entryDoseMl) : remainingBefore;
          const startsNewAmpoule = isGiven && givenCount === 0;
          const isLastDose = isGiven && entryDoseMl > 0 && entryDoseMl >= remainingBefore - 0.000001;
          if (isGiven) givenCount += 1;
          rows.push({
            entry,
            planned: entry.id === 'planned-today',
            ampouleId: ampoule.id,
            ampouleNumber: ampoule.number,
            ampouleStartDate: ampoule.startDate,
            doseMl: entryDoseMl,
            remainingBefore,
            remainingAfter,
            startsNewAmpoule,
            isLastDose,
            nextAmpouleStartDate: isLastDose ? addDaysISO(entry.date, 1) : ''
          });
          remainingMl = remainingAfter;
        });
      });

    if (!activeAmpoule) {
      const pausedCount = getOpenPausedAmpoules().length;
      const configuredDoseMl = getConfiguredAmpouleDoseMl();
      return {
        configured: false,
        reason: pausedCount ? 'paused' : (data.ampoules.length ? 'finished' : (!data.settings.ampouleStartDate ? 'start' : (!configuredDoseMl ? 'dose' : 'finished'))),
        rows,
        activeAmpoule: null,
        remainingMl: 0,
        volumeMl: decimalToNumber(data.settings.ampouleVolumeMl),
        doseMl: configuredDoseMl,
        startDate: data.settings.ampouleStartDate
      };
    }

    return {
      configured: true,
      reason: '',
      rows,
      activeAmpoule,
      remainingMl: getAmpouleRemainingMl(activeAmpoule.id),
      volumeMl: decimalToNumber(activeAmpoule.volumeMl),
      doseMl: decimalToNumber(activeAmpoule.doseMl),
      startDate: activeAmpoule.startDate
    };
  }

  function formatMl(value) {
    const rounded = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
    return String(rounded).replace('.', ',');
  }

  function getLatestGivenBefore(referenceDate = new Date()) {
    const referenceMs = referenceDate.getTime();
    return getEntriesSorted().find((entry) => {
      if (entry.status !== 'given' || !entry.side || !entry.site) return false;
      const value = dateTimeFromEntry(entry);
      return value && value.getTime() <= referenceMs;
    }) || null;
  }

  function getSuggestedPlace(referenceDate = new Date()) {
    const latest = getLatestGivenBefore(referenceDate);
    const rotation = getRotation();
    const first = rotation[0] || { side: DEFAULT_ROTATION[0][0], site: DEFAULT_ROTATION[0][1] };
    if (!latest) return { side: first.side, site: first.site };
    const index = rotation.findIndex((item) => item.side === latest.side && item.site === latest.site);
    if (index < 0) return { side: first.side, site: first.site };
    const next = rotation[(index + 1) % rotation.length];
    return { side: next.side, site: next.site };
  }

  function dateTimeFromEntry(entry) {
    if (!entry?.date || !entry?.time || !isValidIsoDate(entry.date) || !isValidTime(entry.time)) return null;
    const [year, month, day] = entry.date.split('-').map(Number);
    const [hour, minute] = entry.time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  function selectCalendarDate(iso) {
    selectedCalendarDate = iso;
    const selected = parseISODate(iso);
    if (selected.getMonth() !== calendarCursor.getMonth() || selected.getFullYear() !== calendarCursor.getFullYear()) {
      calendarCursor = startOfMonth(selected);
    }
    renderCalendar();
    renderSelectedDay();
  }

  function changeCalendarMonth(delta) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    selectedCalendarDate = localDateISO(calendarCursor);
    renderCalendar();
    renderSelectedDay();
  }

  function handleCalendarKeydown(event) {
    if (!event.target.matches('[data-date]')) return;
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in deltas)) return;
    event.preventDefault();
    const date = parseISODate(event.target.dataset.date);
    date.setDate(date.getDate() + deltas[event.key]);
    const iso = localDateISO(date);
    selectCalendarDate(iso);
    window.setTimeout(() => el['calendar-grid'].querySelector(`[data-date="${iso}"]`)?.focus(), 0);
  }

  function handleHistoryAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    const deleteButton = event.target.closest('[data-delete-id]');
    if (editButton) openEntryDialog(editButton.dataset.editId);
    if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
  }

  function handleDayDetailsAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    if (editButton) openEntryDialog(editButton.dataset.editId);
  }

  function deleteEntryFromDialog() {
    const id = el['entry-id'].value;
    if (id) deleteEntry(id, true);
  }

  function deleteEntry(id, closeDialogAfter = false) {
    const entry = data.entries.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Usunąć wpis z ${formatDateShort(entry.date)}?`)) return;
    data.entries = data.entries.filter((item) => item.id !== id);
    reconcileAmpouleStatuses();
    if (!persistData()) return;
    if (closeDialogAfter) closeEntryDialog();
    resetQuickDraftForToday();
    renderAll();
    showToast('Wpis został usunięty.', 'success');
  }

  function renderRotationSettings() {
    if (!el['rotation-list']) return;
    if (!rotationDraft.length) rotationDraft = sanitizeInjectionRotation(data.settings.injectionRotation).map((item) => ({ ...item }));
    el['rotation-list'].innerHTML = rotationDraft.map((item, index) => `
      <li class="rotation-item${item.enabled ? '' : ' is-disabled'}" draggable="true" data-rotation-index="${index}">
        <button class="rotation-drag" type="button" aria-label="Przeciągnij ${escapeHtml(formatPlace(item.side, item.site))}" title="Przeciągnij, aby zmienić kolejność">☰</button>
        <span class="rotation-number">${index + 1}</span>
        <strong>${escapeHtml(capitalize(formatPlace(item.side, item.site)))}</strong>
        <div class="rotation-actions">
          <button type="button" class="rotation-move" data-rotation-move="up" aria-label="Przesuń w górę" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="rotation-move" data-rotation-move="down" aria-label="Przesuń w dół" ${index === rotationDraft.length - 1 ? 'disabled' : ''}>↓</button>
          <label class="rotation-toggle"><input type="checkbox" data-rotation-enabled ${item.enabled ? 'checked' : ''}><span>${item.enabled ? 'Włączone' : 'Wyłączone'}</span></label>
        </div>
      </li>
    `).join('');
    updateRotationPreview();
  }

  function updateRotationPreview() {
    if (!el['rotation-next-preview']) return;
    const enabled = rotationDraft.filter((item) => item.enabled);
    if (!enabled.length) {
      el['rotation-next-preview'].textContent = 'Włącz co najmniej jedno miejsce.';
      return;
    }
    const latest = getLatestGivenBefore(new Date());
    let next = enabled[0];
    if (latest) {
      const index = enabled.findIndex((item) => item.side === latest.side && item.site === latest.site);
      if (index >= 0) next = enabled[(index + 1) % enabled.length];
    }
    el['rotation-next-preview'].textContent = capitalize(formatPlace(next.side, next.site));
  }

  function moveRotationItem(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= rotationDraft.length || toIndex >= rotationDraft.length || fromIndex === toIndex) return;
    const [item] = rotationDraft.splice(fromIndex, 1);
    rotationDraft.splice(toIndex, 0, item);
    renderRotationSettings();
  }

  function handleRotationListClick(event) {
    const button = event.target.closest('[data-rotation-move]');
    if (!button) return;
    const item = button.closest('[data-rotation-index]');
    const index = Number(item?.dataset.rotationIndex);
    if (!Number.isInteger(index)) return;
    moveRotationItem(index, button.dataset.rotationMove === 'up' ? index - 1 : index + 1);
  }

  function handleRotationListChange(event) {
    const checkbox = event.target.closest('[data-rotation-enabled]');
    if (!checkbox) return;
    const item = checkbox.closest('[data-rotation-index]');
    const index = Number(item?.dataset.rotationIndex);
    if (!Number.isInteger(index) || !rotationDraft[index]) return;
    rotationDraft[index].enabled = checkbox.checked;
    renderRotationSettings();
  }

  function handleRotationDragStart(event) {
    const item = event.target.closest('[data-rotation-index]');
    if (!item) return;
    draggedRotationIndex = Number(item.dataset.rotationIndex);
    item.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(draggedRotationIndex));
    }
  }

  function handleRotationDragOver(event) {
    if (draggedRotationIndex < 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function handleRotationDrop(event) {
    event.preventDefault();
    const item = event.target.closest('[data-rotation-index]');
    const targetIndex = Number(item?.dataset.rotationIndex);
    if (Number.isInteger(targetIndex)) moveRotationItem(draggedRotationIndex, targetIndex);
    draggedRotationIndex = -1;
  }

  function handleRotationDragEnd() {
    draggedRotationIndex = -1;
    el['rotation-list']?.querySelectorAll('.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
  }

  function saveRotationSettings() {
    if (!rotationDraft.some((item) => item.enabled)) {
      showToast('Włącz co najmniej jedno miejsce wkłucia.', 'error');
      return;
    }
    data.settings.injectionRotation = sanitizeInjectionRotation(rotationDraft);
    if (!persistData()) return;
    renderAll();
    showToast('Kolejność miejsc wkłuć została zapisana.', 'success');
  }

  function resetRotationSettings() {
    if (!window.confirm('Przywrócić domyślną kolejność i włączyć wszystkie miejsca?')) return;
    rotationDraft = DEFAULT_ROTATION.map(([side, site]) => ({ side, site, enabled: true }));
    renderRotationSettings();
    showToast('Przywrócono kolejność domyślną. Naciśnij „Zapisz kolejność”.', 'success');
  }

  function saveTreatmentSettings() {
    const dose = normalizeDose(el['settings-dose'].value);
    if (!dose) {
      showToast('Podaj prawidłową dawkę domyślną.', 'error');
      return;
    }

    data.settings.defaultDose = dose;
    data.settings.unit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : 'mg';
    data.settings.defaultTime = isValidTime(el['settings-time'].value) ? el['settings-time'].value : '20:00';

    if (!persistData()) return;
    if (!quickDraftTouched && !quickDraft.id) resetQuickDraftForToday();
    renderAll();
    showToast(quickDraftTouched
      ? 'Ustawienia leczenia zostały zapisane. Przygotowany wpis pozostał bez zmian.'
      : 'Ustawienia leczenia zostały zapisane.', 'success');
  }

  function saveAmpouleSettings() {
    const snapshot = structuredCloneSafe(data);
    const ampouleStartNumber = normalizeAmpouleNumber(el['ampoule-start-number'].value);
    const ampouleVolume = normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
    const ampouleDoseMl = normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
    const ampouleStartDate = el['ampoule-start-date'].value;
    const ampouleMaxOpenDays = normalizeOptionalDayLimit(el['ampoule-max-open-days'].value);

    if (ampouleStartDate && !isValidIsoDate(ampouleStartDate)) {
      showToast('Podaj prawidłową datę rozpoczęcia ampułki.', 'error');
      return;
    }
    if (el['ampoule-dose-ml'].value.trim() && !ampouleDoseMl) {
      showToast('Podaj prawidłową wartość ml na jedno podanie.', 'error');
      return;
    }
    if (el['ampoule-max-open-days'].value.trim() && !ampouleMaxOpenDays) {
      showToast('Podaj prawidłowy limit dni od 1 do 365.', 'error');
      return;
    }

    data.settings.ampouleStartDate = ampouleStartDate || '';
    data.settings.ampouleStartNumber = ampouleStartNumber;
    data.settings.ampouleVolumeMl = ampouleVolume;
    data.settings.ampouleDoseMl = ampouleDoseMl;
    data.settings.ampouleMaxOpenDays = ampouleMaxOpenDays;

    const configuredDoseMl = getConfiguredAmpouleDoseMl();
    const active = getActiveAmpoule();
    if (active && configuredDoseMl) {
      active.number = ampouleStartNumber;
      active.startDate = ampouleStartDate || active.startDate;
      active.volumeMl = ampouleVolume;
      active.doseMl = normalizePositiveDecimal(configuredDoseMl);
      active.updatedAt = new Date().toISOString();
    } else if (!data.ampoules.length && ampouleStartDate && configuredDoseMl) {
      const ampoule = createAmpouleRecord({
        number: ampouleStartNumber,
        startDate: ampouleStartDate,
        volumeMl: ampouleVolume,
        doseMl: configuredDoseMl,
        status: 'active'
      });
      data.ampoules.push(ampoule);
      data.activeAmpouleId = ampoule.id;
    }

    reconcileAmpouleStatuses();
    if (!persistData()) {
      data = snapshot;
      renderAll();
      return;
    }
    renderAll();
    showToast('Ustawienia ampułki zostały zapisane.', 'success');
  }

  function saveVoiceSettings() {
    data.settings.voiceFeedback = el['voice-feedback-toggle'].checked;
    data.settings.voiceConfirm = el['voice-confirm-toggle'].checked;
    if (!persistData()) return;
    renderSettings();
    showToast('Ustawienia obsługi głosowej zostały zapisane.', 'success');
  }

  async function saveReminderSettings() {
    const time = el['reminder-time'].value || '21:00';
    const enabled = el['reminder-enabled-toggle'].checked;
    if (enabled && await readNotificationPermission() !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        el['reminder-enabled-toggle'].checked = false;
        showToast('Nie można włączyć przypomnienia bez zgody na powiadomienia.', 'error');
        return;
      }
    }
    data.settings.reminderEnabled = enabled;
    data.settings.reminderTime = isValidTime(time) ? time : '21:00';
    if (!persistData()) return;
    await registerPeriodicReminder();
    await syncNativeReminder();
    checkReminderDue();
    renderSettings();
    showToast(enabled ? `Przypomnienie ustawiono na ${time}.` : 'Przypomnienie zostało wyłączone.', 'success');
  }

  function openDataDialog(dialog, trigger) {
    if (!dialog) return;
    dataDialogReturnTarget = trigger || document.activeElement;
    if (!dialog.open) dialog.showModal();
  }

  function closeDataDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function returnToDataSection() {
    const section = el['data-backup-section'];
    window.setTimeout(() => {
      section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (dataDialogReturnTarget instanceof HTMLElement) dataDialogReturnTarget.focus({ preventScroll: true });
      dataDialogReturnTarget = null;
    }, 40);
  }

  function openReportPreview() {
    const frame = el['report-preview-frame'];
    frame.srcdoc = reportDocumentHtml();
    frame.onload = () => {
      try {
        const height = Math.max(720, frame.contentDocument?.documentElement?.scrollHeight || 720);
        frame.style.height = `${height}px`;
      } catch {}
    };
    openDataDialog(el['report-preview-dialog'], el['report-preview-button']);
  }

  function printReportPreview() {
    const frameWindow = el['report-preview-frame']?.contentWindow;
    if (!frameWindow) {
      showToast('Nie udało się otworzyć podglądu raportu.', 'error');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
  }

  function openExportReportPanel() {
    openDataDialog(el['export-report-dialog'], el['export-report-button']);
    window.setTimeout(() => el['export-pdf-button']?.focus(), 30);
  }

  function openBackupPanel() {
    openDataDialog(el['backup-dialog'], el['backup-panel-button']);
    window.setTimeout(() => el['export-json-button']?.focus(), 30);
  }

  function getAmpouleRowsByEntryId() {
    const timeline = buildAmpouleTimeline({ includePlannedToday: false });
    const rowsById = new Map();
    timeline.rows.forEach((row) => {
      if (row.entry?.id && !row.planned) rowsById.set(row.entry.id, row);
    });
    return { timeline, rowsById };
  }

  function formatReportAmpouleCell(row) {
    if (!row) return '—';
    const suffixes = [];
    if (row.startsNewAmpoule) suffixes.push('rozpoczęcie');
    if (row.isLastDose) suffixes.push('koniec');
    return suffixes.length ? `${row.ampouleNumber} — ${suffixes.join(', ')}` : String(row.ampouleNumber);
  }

  function formatReportRemainingCell(row) {
    if (!row) return '—';
    if (row.entry.status !== 'given') return `bez zmian, ${formatMl(row.remainingAfter)} ml`;
    return `${formatMl(row.remainingAfter)} ml`;
  }

  function buildReportTableRows() {
    const { rowsById } = getAmpouleRowsByEntryId();
    return getEntriesAscending().map((entry) => {
      const ampouleRow = rowsById.get(entry.id);
      return `
      <tr>
        <td>${escapeHtml(entry.time || '—')}</td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</td>
        <td>${escapeHtml(formatReportAmpouleCell(ampouleRow))}</td>
        <td>${escapeHtml(formatDateShort(entry.date))}</td>
        <td>${escapeHtml(formatReportRemainingCell(ampouleRow))}</td>
        <td>${entry.note ? escapeHtml(entry.note) : '—'}</td>
      </tr>`;
    }).join('');
  }

  function ampouleReportSummary(info) {
    if (!info.configured) {
      if (info.reason === 'paused') return { number: '—', text: 'brak aktywnej ampułki; dostępna jest odłożona ampułka do wznowienia' };
      if (info.reason === 'finished') return { number: '—', text: 'poprzednia ampułka została zużyta' };
      return { number: '—', text: info.reason === 'dose' ? 'brak dawki w ml do obliczeń' : 'brak daty startu ampułki' };
    }
    if (info.todayIsLast) {
      return {
        number: String(info.ampouleNumber),
        text: `start ${formatDateShort(info.ampouleStartDate)}, dzisiaj ostatni zastrzyk, następna ampułka planowo od ${formatDateShort(info.nextAmpouleStartDate)}`
      };
    }
    if (info.todayStartsNewAmpoule) {
      return {
        number: String(info.ampouleNumber),
        text: `nowa ampułka od ${formatDateShort(info.ampouleStartDate)}, po dzisiejszej dawce ok. ${formatMl(info.remainingAfterToday)} ml`
      };
    }
    return {
      number: String(info.ampouleNumber),
      text: `start ${formatDateShort(info.ampouleStartDate)}, po dzisiejszej dawce ok. ${formatMl(info.remainingAfterToday)} ml`
    };
  }

  function getReportPeriodText(entries) {
    if (!entries.length) return 'brak wpisów';
    return `${formatDateShort(entries[0].date)} – ${formatDateShort(entries[entries.length - 1].date)}`;
  }

  function buildReportBody() {
    const entries = getEntriesAscending();
    const given = entries.filter((entry) => entry.status === 'given').length;
    const skipped = entries.filter((entry) => entry.status === 'skipped').length;
    const ampouleInfo = getAmpouleInfo();
    const ampouleReport = ampouleReportSummary(ampouleInfo);
    return `
      <h1>Dzienniczek hormonu wzrostu</h1>
      <p class="generated">Raport wygenerowano: ${escapeHtml(new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()))}</p>
      <p class="generated">Zakres wpisów: ${escapeHtml(getReportPeriodText(entries))}</p>
      <div class="summary">
        <div><strong>${entries.length}</strong><span>wszystkich wpisów</span></div>
        <div><strong>${given}</strong><span>podań</span></div>
        <div><strong>${skipped}</strong><span>pominiętych</span></div>
        <div><strong>${escapeHtml(ampouleReport.number)}</strong><span>${escapeHtml(ampouleReport.text)}</span></div>
      </div>
      <table>
        <thead><tr><th>Godzina</th><th>Dawka</th><th>Miejsce</th><th>Status</th><th>Ampułka</th><th>Data podania</th><th>Pozostało po wpisie</th><th>Uwagi</th></tr></thead>
        <tbody>${buildReportTableRows() || '<tr><td colspan="8">Brak wpisów.</td></tr>'}</tbody>
      </table>
      <p class="footer">Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.</p>`;
  }

  function reportDocumentHtml() {
    return `<!doctype html><html lang="pl">
      <head><meta charset="utf-8"><title>Raport – Dzienniczek hormonu wzrostu</title>
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        * { box-sizing: border-box; }
        html { background: #eef3f6; }
        body { font-family: Arial, sans-serif; color: #17324d; margin: 0; padding: 24px; background: #eef3f6; }
        .report-sheet { max-width: 1120px; margin: 0 auto; padding: 36px; background: #fff; box-shadow: 0 8px 30px rgba(23,50,77,.12); }
        h1 { margin: 0 0 4px; font-size: 24px; }
        .generated, .footer { color: #60768a; font-size: 12px; }
        .summary { display: flex; gap: 12px; margin: 18px 0; }
        .summary div { border: 1px solid #d9e5ed; border-radius: 10px; padding: 10px 14px; min-width: 130px; }
        .summary strong { display: block; font-size: 20px; color: #0e927f; }
        .summary span { font-size: 12px; color: #60768a; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
        th, td { border: 1px solid #cfdce5; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #e9f7f4; }
        tr:nth-child(even) td { background: #f8fbfd; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          html, body { background: #fff; }
          body { padding: 0; }
          .report-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
        }
      </style></head><body><main class="report-sheet">${buildReportBody()}</main></body></html>`;
  }

  async function exportPdf() {
    try {
      showToast('Tworzenie raportu PDF…');
      const blob = await createReportPdfBlob();
      await downloadBlob(`dzienniczek-raport-${localDateISO()}.pdf`, blob);
      showToast('Raport PDF został zapisany lub przekazany do udostępnienia.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć PDF:', error);
      showToast('Nie udało się utworzyć lub zapisać raportu PDF.', 'error');
      return false;
    }
  }

  async function createReportPdfBlob() {
    const pageCanvases = renderReportPdfPages();
    const jpegPages = [];
    for (const canvas of pageCanvases) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Nie udało się utworzyć strony PDF.')), 'image/jpeg', 0.92);
      });
      jpegPages.push(new Uint8Array(await blob.arrayBuffer()));
    }
    return buildPdfFromJpegPages(jpegPages, 1587, 1123);
  }

  function getReportRowsForCanvas() {
    const { rowsById } = getAmpouleRowsByEntryId();
    return getEntriesAscending().map((entry) => {
      const ampouleRow = rowsById.get(entry.id);
      return [
        entry.time || '—',
        entry.status === 'given' ? `${formatDose(entry.dose)} ${entry.unit}` : '—',
        entry.status === 'given' ? formatPlace(entry.side, entry.site) : '—',
        entry.status === 'given' ? 'Podano' : 'Pominięto',
        formatReportAmpouleCell(ampouleRow),
        formatDateShort(entry.date),
        formatReportRemainingCell(ampouleRow),
        entry.note || '—'
      ];
    });
  }

  function renderReportPdfPages() {
    const width = 1587;
    const height = 1123;
    const margin = 58;
    const tableWidth = width - margin * 2;
    const columns = [95, 120, 200, 110, 130, 145, 190, tableWidth - 990];
    const headers = ['Godzina', 'Dawka', 'Miejsce', 'Status', 'Ampułka', 'Data podania', 'Pozostało po wpisie', 'Uwagi'];
    const rows = getReportRowsForCanvas();
    const entries = getEntriesAscending();
    const ampouleReport = ampouleReportSummary(getAmpouleInfo());
    const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const pages = [];
    let page = null;
    let ctx = null;
    let y = 0;

    const createPage = (firstPage) => {
      page = document.createElement('canvas');
      page.width = width;
      page.height = height;
      ctx = page.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#17324d';
      ctx.textBaseline = 'top';
      if (firstPage) {
        ctx.font = '700 38px Arial, sans-serif';
        ctx.fillText('Dzienniczek hormonu wzrostu', margin, margin);
        ctx.font = '20px Arial, sans-serif';
        ctx.fillStyle = '#60768a';
        ctx.fillText(`Raport wygenerowano: ${generated}`, margin, margin + 54);
        ctx.fillText(`Zakres wpisów: ${getReportPeriodText(entries)}`, margin, margin + 84);
        drawPdfSummaryCards(ctx, margin, margin + 128, tableWidth, entries, ampouleReport);
        y = margin + 254;
      } else {
        ctx.font = '700 25px Arial, sans-serif';
        ctx.fillStyle = '#17324d';
        ctx.fillText('Dzienniczek hormonu wzrostu — ciąg dalszy', margin, margin);
        y = margin + 48;
      }
      y = drawPdfTableHeader(ctx, margin, y, columns, headers);
      pages.push(page);
    };

    createPage(true);
    if (!rows.length) {
      drawPdfCellText(ctx, 'Brak wpisów.', margin + 10, y + 10, tableWidth - 20, 18, '#17324d', false);
      ctx.strokeStyle = '#cfdce5';
      ctx.strokeRect(margin, y, tableWidth, 44);
    } else {
      rows.forEach((row) => {
        const rowHeight = measurePdfRowHeight(ctx, row, columns);
        if (y + rowHeight > height - margin - 42) createPage(false);
        drawPdfTableRow(ctx, margin, y, columns, row, rowHeight);
        y += rowHeight;
      });
    }

    pages.forEach((canvas, index) => {
      const pageCtx = canvas.getContext('2d');
      pageCtx.font = '17px Arial, sans-serif';
      pageCtx.fillStyle = '#60768a';
      pageCtx.fillText('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', margin, height - margin + 10);
      pageCtx.textAlign = 'right';
      pageCtx.fillText(`Strona ${index + 1} z ${pages.length}`, width - margin, height - margin + 10);
      pageCtx.textAlign = 'left';
    });
    return pages;
  }

  function drawPdfSummaryCards(ctx, x, y, width, entries, ampouleReport) {
    const gap = 14;
    const cardWidth = (width - gap * 3) / 4;
    const cards = [
      [String(entries.length), 'wszystkich wpisów'],
      [String(entries.filter((entry) => entry.status === 'given').length), 'podań'],
      [String(entries.filter((entry) => entry.status === 'skipped').length), 'pominiętych'],
      [ampouleReport.number, ampouleReport.text]
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
      maxLines = Math.max(maxLines, Math.min(lines.length, index === 8 ? 5 : 3));
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
      drawPdfCellText(ctx, String(value), left + 7, y + 8, columns[index] - 14, 15, '#17324d', false, index === 8 ? 5 : 3);
      left += columns[index];
    });
  }

  function drawPdfCellText(ctx, text, x, y, maxWidth, fontSize, color, bold = false, maxLines = 3) {
    const font = `${bold ? '700 ' : ''}${fontSize}px Arial, sans-serif`;
    const lines = wrapCanvasText(ctx, text, maxWidth, font);
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
    const words = String(text || '—').split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
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
    objects[2] = encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    jpegPages.forEach((jpeg, index) => {
      const pageId = pageIds[index];
      const imageId = imageIds[index];
      const contentId = contentIds[index];
      objects[pageId] = encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      const imageHeader = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      const imageFooter = encoder.encode('\nendstream');
      objects[imageId] = concatUint8Arrays([imageHeader, jpeg, imageFooter]);
      const content = encoder.encode(`q\n841.89 0 0 595.28 0 0 cm\n/Im${index + 1} Do\nQ\n`);
      objects[contentId] = concatUint8Arrays([
        encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
        content,
        encoder.encode('endstream')
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
      const objectBytes = concatUint8Arrays([encoder.encode(`${id} 0 obj\n`), body, encoder.encode('\nendobj\n')]);
      parts.push(objectBytes);
      offset += objectBytes.length;
    }
    const xrefOffset = offset;
    const maxId = objects.length - 1;
    let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    parts.push(encoder.encode(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  async function exportWord() {
    try {
      const blob = createDocxBlob();
      await downloadBlob(`dzienniczek-raport-${localDateISO()}.docx`, blob);
      showToast('Dokument Word został zapisany lub przekazany do udostępnienia.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć DOCX:', error);
      showToast('Nie udało się utworzyć lub zapisać dokumentu Word.', 'error');
      return false;
    }
  }

  function createDocxBlob() {
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
          <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
          <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
          <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        </Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
        </Relationships>`],
      ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        </Relationships>`],
      ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:lang w:val="pl-PL"/></w:rPr></w:style>
        </w:styles>`],
      ['word/document.xml', buildDocxDocumentXml()],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <dc:title>Dzienniczek hormonu wzrostu</dc:title><dc:creator>Dzienniczek hormonu wzrostu</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
        </cp:coreProperties>`],
      ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Dzienniczek hormonu wzrostu</Application></Properties>`]
    ];
    return new Blob([buildStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function buildDocxDocumentXml() {
    const entries = getEntriesAscending();
    const { rowsById } = getAmpouleRowsByEntryId();
    const rows = [
      ['Godzina', 'Dawka', 'Miejsce', 'Status', 'Ampułka', 'Data podania', 'Pozostało po wpisie', 'Uwagi'],
      ...entries.map((entry) => {
        const ampouleRow = rowsById.get(entry.id);
        return [
          entry.time,
          entry.status === 'given' ? `${formatDose(entry.dose)} ${entry.unit}` : '—',
          entry.status === 'given' ? formatPlace(entry.side, entry.site) : '—',
          entry.status === 'given' ? 'Podano' : 'Pominięto',
          formatReportAmpouleCell(ampouleRow),
          formatDateShort(entry.date),
          formatReportRemainingCell(ampouleRow),
          entry.note || '—'
        ];
      })
    ];
    const tableRows = entries.length
      ? rows.map((row, rowIndex) => `<w:tr>${row.map((cell) => docxCell(cell, rowIndex === 0)).join('')}</w:tr>`).join('')
      : `<w:tr>${docxCell('Brak wpisów.', false)}</w:tr>`;
    const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const ampouleReport = ampouleReportSummary(getAmpouleInfo());
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          ${docxParagraph('Dzienniczek hormonu wzrostu', true, 32)}
          ${docxParagraph(`Raport wygenerowano: ${generated}`, false, 18)}
          ${docxParagraph(`Zakres wpisów: ${getReportPeriodText(entries)}`, false, 18)}
          ${docxParagraph(`Liczba wpisów: ${entries.length}. Podano: ${entries.filter((entry) => entry.status === 'given').length}. Pominięto: ${entries.filter((entry) => entry.status === 'skipped').length}.`, false, 20)}
          ${docxParagraph(`Ampułka: ${ampouleReport.number} — ${ampouleReport.text}`, false, 20)}
          <w:tbl>
            <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C9D6"/><w:left w:val="single" w:sz="4" w:color="B7C9D6"/><w:bottom w:val="single" w:sz="4" w:color="B7C9D6"/><w:right w:val="single" w:sz="4" w:color="B7C9D6"/><w:insideH w:val="single" w:sz="4" w:color="D8E3EA"/><w:insideV w:val="single" w:sz="4" w:color="D8E3EA"/></w:tblBorders></w:tblPr>
            ${tableRows}
          </w:tbl>
          ${docxParagraph('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', false, 18)}
          <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
        </w:body>
      </w:document>`;
  }

  function docxParagraph(text, bold = false, size = 20) {
    return `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  function docxCell(text, bold = false) {
    return `<w:tc><w:tcPr><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${docxParagraph(String(text), bold, 18)}</w:tc>`;
  }

  function escapeXml(value) {
    return String(value ?? '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));
  }

  function buildStoredZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const dataBytes = typeof content === 'string' ? encoder.encode(content) : content;
      const crc = crc32(dataBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, dataBytes.length, true);
      localView.setUint32(22, dataBytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, dataBytes.length, true);
      centralView.setUint32(24, dataBytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return concatUint8Arrays([...localParts, ...centralParts, end]);
  }

  function concatUint8Arrays(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => { result.set(part, offset); offset += part.length; });
    return result;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function exportJson() {
    try {
      const payload = {
        application: 'Dzienniczek hormonu wzrostu',
        exportedAt: new Date().toISOString(),
        data
      };
      await downloadFile(`dzienniczek-kopia-${localDateISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      showToast('Kopia JSON została zapisana lub przekazana do udostępnienia.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się zapisać kopii JSON:', error);
      showToast('Nie udało się zapisać kopii danych JSON.', 'error');
      return false;
    }
  }

  async function exportCsv() {
    const header = ['Godzina', 'Dawka', 'Jednostka', 'Strona', 'Miejsce', 'Status', 'Ampułka', 'Data podania', 'Pozostało po wpisie', 'Uwagi'];
    const { rowsById } = getAmpouleRowsByEntryId();
    const rows = getEntriesAscending().map((entry) => {
      const ampouleRow = rowsById.get(entry.id);
      return [
        entry.time, entry.status === 'given' ? formatDose(entry.dose) : '', entry.unit,
        entry.side, entry.site, entry.status === 'given' ? 'Podano' : 'Pominięto',
        formatReportAmpouleCell(ampouleRow),
        entry.date,
        formatReportRemainingCell(ampouleRow),
        entry.note || ''
      ];
    });
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    try {
      await downloadFile(`dzienniczek-historia-${localDateISO()}.csv`, csv, 'text/csv;charset=utf-8');
      showToast('Historia CSV została zapisana lub przekazana do udostępnienia.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się zapisać CSV:', error);
      showToast('Nie udało się zapisać historii CSV.', 'error');
      return false;
    }
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Plik jest zbyt duży.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed.data || parsed;
      if (!imported || !Array.isArray(imported.entries)) throw new Error('Nieprawidłowa struktura pliku.');
      const sanitizedEntries = imported.entries.map(sanitizeEntry).filter(Boolean);
      if (sanitizedEntries.length !== imported.entries.length) {
        throw new Error('Plik zawiera nieprawidłowe lub niekompletne wpisy.');
      }
      const unique = keepOneEntryPerDate(sanitizedEntries);
      if (unique.removedDuplicates > 0) {
        throw new Error('Plik zawiera więcej niż jeden wpis dla tego samego dnia. Usuń duplikaty przed importem.');
      }
      if (!window.confirm(`Import zawiera ${unique.entries.length} ${plural(unique.entries.length, 'wpis', 'wpisy', 'wpisów')}. Zastąpić obecne dane?`)) return;
      const previousData = data;
      const normalized = normalizeStoredData({ ...imported, entries: unique.entries });
      data = normalized.data;
      data.meta.onboardingCompleted = true;
      if (!persistData()) {
        data = previousData;
        return;
      }
      resetQuickDraftForToday();
      renderAll();
      showToast('Kopia została zaimportowana.', 'success');
      closeDataDialog(el['backup-dialog']);
    } catch (error) {
      console.error(error);
      showToast(`Nie udało się zaimportować pliku JSON. ${error.message || ''}`.trim(), 'error', 7000);
    }
  }

  function clearAllEntries() {
    if (!data.entries.length) {
      showToast('Historia jest już pusta.');
      return;
    }
    if (!window.confirm('Usunąć wszystkie wpisy? Tej operacji nie można cofnąć.')) return;
    const previousEntries = data.entries;
    data.entries = [];
    reconcileAmpouleStatuses();
    if (!persistData()) {
      data.entries = previousEntries;
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showToast('Wszystkie wpisy zostały usunięte.', 'success');
  }

  function maybeShowFirstRunPermissions() {
    // Nie blokujemy pierwszego uruchomienia oknem zgód.
    // Mikrofon pyta o zgodę dopiero przy użyciu obsługi głosowej,
    // a powiadomienia dopiero przy włączeniu przypomnienia.
  }

  async function openPermissionsDialog() {
    await updatePermissionStatuses();
    if (!el['permissions-dialog'].open) el['permissions-dialog'].showModal();
  }

  function finishPermissionsOnboarding() {
    data.meta.onboardingCompleted = true;
    if (!persistData()) return;
    if (el['permissions-dialog'].open) el['permissions-dialog'].close();
    scheduleDailyReminder();
    showToast('Ustawienia zgód zostały zapisane.', 'success');
  }

  function skipPermissionsOnboarding(options = {}) {
    data.meta.onboardingCompleted = true;
    persistData();
    if (el['permissions-dialog'].open) el['permissions-dialog'].close();
    if (!options.silent) showToast('Pominięto konfigurację zgód. Możesz wrócić do niej w ustawieniach.', 'success');
  }

  async function requestMicrophonePermission() {
    let state = 'unsupported';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      state = 'granted';
      showToast('Dostęp do mikrofonu został przyznany.', 'success');
    } catch (error) {
      state = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError' ? 'denied' : 'unsupported';
      showToast(state === 'denied' ? 'Dostęp do mikrofonu został zablokowany.' : 'Mikrofon nie jest dostępny w tej przeglądarce.', 'error');
    }
    await updatePermissionStatuses({ microphone: state });
    return state;
  }

  async function requestNotificationPermission() {
    let state = 'unsupported';
    try {
      const localNotifications = nativePlugin('LocalNotifications');
      if (isNativeAndroid() && localNotifications) {
        const result = await localNotifications.requestPermissions();
        state = result.display === 'granted' ? 'granted' : 'denied';
      } else {
        if (!('Notification' in window)) throw new Error('unsupported');
        state = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      }
      if (state === 'granted') {
        showToast('Powiadomienia zostały włączone.', 'success');
        if (isNativeAndroid()) await ensureExactAlarmSetting({ openSettings: true });
        await registerPeriodicReminder();
        scheduleDailyReminder();
        await syncNativeReminder();
        checkReminderDue();
      } else {
        showToast('Powiadomienia nie zostały włączone.', 'error');
      }
    } catch (error) {
      console.warn(error);
      state = 'unsupported';
      showToast('Powiadomienia nie są dostępne na tym urządzeniu.', 'error');
    }
    await updatePermissionStatuses({ notification: state });
    return state;
  }

  async function requestPersistentStorage() {
    let state = 'unsupported';
    try {
      if (!navigator.storage?.persist) throw new Error('unsupported');
      state = await navigator.storage.persist() ? 'granted' : 'denied';
      showToast(state === 'granted' ? 'Włączono trwałe przechowywanie danych.' : 'Przeglądarka nie przyznała trwałego przechowywania.', state === 'granted' ? 'success' : 'error');
    } catch (error) {
      state = 'unsupported';
      showToast('Trwałe przechowywanie nie jest obsługiwane.', 'error');
    }
    await updatePermissionStatuses({ storage: state });
    return state;
  }

  async function readMicrophonePermission() {
    try {
      if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state;
    } catch {
      return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
    }
  }

  async function readStoragePermission() {
    try {
      if (!navigator.storage?.persisted) return 'unsupported';
      return await navigator.storage.persisted() ? 'granted' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  function permissionText(state) {
    return ({ granted: 'Zezwolono', denied: 'Zablokowano', prompt: 'Wymaga zgody', default: 'Wymaga zgody', unsupported: 'Brak obsługi' })[state] || 'Nie sprawdzono';
  }

  function setPermissionLabel(node, state) {
    if (!node) return;
    node.textContent = permissionText(state);
    node.dataset.state = state;
  }

  async function readNotificationPermission() {
    try {
      const localNotifications = nativePlugin('LocalNotifications');
      if (isNativeAndroid() && localNotifications) {
        const result = await localNotifications.checkPermissions();
        return result.display === 'granted' ? 'granted' : (result.display === 'denied' ? 'denied' : 'prompt');
      }
      return ('Notification' in window) ? Notification.permission : 'unsupported';
    } catch {
      return 'unsupported';
    }
  }

  async function updatePermissionStatuses(overrides = {}) {
    const microphone = overrides.microphone || await readMicrophonePermission();
    const notification = overrides.notification || await readNotificationPermission();
    const storage = overrides.storage || await readStoragePermission();
    [el['permission-microphone-status'], el['microphone-permission-settings']].forEach((node) => setPermissionLabel(node, microphone));
    [el['permission-notification-status'], el['notification-permission-settings'], el['notification-permission-status']].forEach((node) => setPermissionLabel(node, notification));
    [el['permission-storage-status'], el['storage-permission-settings']].forEach((node) => setPermissionLabel(node, storage));
    if (el['request-notification-button']) el['request-notification-button'].disabled = notification === 'granted' || notification === 'unsupported' || notification === 'denied';
    if (el['test-notification-button']) el['test-notification-button'].disabled = notification !== 'granted';
    if (el['permission-microphone-button']) el['permission-microphone-button'].disabled = microphone === 'granted' || microphone === 'unsupported' || microphone === 'denied';
    if (el['permission-notification-button']) el['permission-notification-button'].disabled = notification === 'granted' || notification === 'unsupported' || notification === 'denied';
    if (el['permission-storage-button']) el['permission-storage-button'].disabled = storage === 'granted' || storage === 'unsupported';
  }

  function todayHasEntry() {
    const today = localDateISO();
    return data.entries.some((entry) => entry.date === today);
  }

  function reminderBody() {
    const suggestion = getSuggestedPlace();
    const ampouleInfo = getAmpouleInfo();
    const ampouleText = ampouleNotificationText(ampouleInfo);
    return `Dzisiaj: ${formatPlace(suggestion.side, suggestion.site)}. Dawka: ${formatDose(data.settings.defaultDose)} ${data.settings.unit}.${ampouleText ? ` ${ampouleText}` : ''}`;
  }

  function nextNativeReminderDate(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (todayHasEntry() || next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  async function ensureExactAlarmSetting({ openSettings = false } = {}) {
    const localNotifications = nativePlugin('LocalNotifications');
    if (!isNativeAndroid() || !localNotifications?.checkExactNotificationSetting) return true;
    try {
      const result = await localNotifications.checkExactNotificationSetting();
      const status = result?.exact_alarm || result?.status || result?.value;
      if (status === 'granted') return true;
      if (openSettings && localNotifications.changeExactNotificationSetting) {
        await localNotifications.changeExactNotificationSetting();
        showToast('Sprawdź w ustawieniach Androida, czy aplikacja może używać dokładnych alarmów.', '');
      }
      return false;
    } catch (error) {
      reportTechnicalError('ensureExactAlarmSetting', error);
      return false;
    }
  }

  async function syncNativeReminder() {
    const localNotifications = nativePlugin('LocalNotifications');
    if (!isNativeAndroid() || !localNotifications) return false;
    try {
      await localNotifications.cancel({ notifications: [{ id: 2701 }] });
      if (!data.settings.reminderEnabled) return true;
      const permission = await localNotifications.checkPermissions();
      if (permission.display !== 'granted') return false;
      await ensureExactAlarmSetting();
      const [hour, minute] = (data.settings.reminderTime || '21:00').split(':').map(Number);
      const firstReminder = nextNativeReminderDate(hour, minute);
      await localNotifications.schedule({
        notifications: [{
          id: 2701,
          title: 'Czas na zastrzyk',
          body: reminderBody(),
          schedule: { at: firstReminder, every: 'day', repeats: true, allowWhileIdle: true },
          extra: { view: 'today' },
          smallIcon: 'ic_stat_injection'
        }]
      });
      return true;
    } catch (error) {
      reportTechnicalError('syncNativeReminder', error);
      return false;
    }
  }

  async function showNativeTestNotification() {
    const localNotifications = nativePlugin('LocalNotifications');
    if (!isNativeAndroid() || !localNotifications) return false;
    await localNotifications.schedule({ notifications: [{
      id: 2702,
      title: 'Test przypomnienia',
      body: reminderBody(),
      schedule: { at: new Date(Date.now() + 1200), allowWhileIdle: true },
      extra: { view: 'today' },
      smallIcon: 'ic_stat_injection'
    }] });
    return true;
  }

  async function showReminderNotification({ test = false } = {}) {
    if (isNativeAndroid()) {
      if (test) return showNativeTestNotification();
      return syncNativeReminder();
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    let registration = serviceWorkerRegistration;
    if (!registration && 'serviceWorker' in navigator) {
      try { registration = await navigator.serviceWorker.ready; } catch { registration = null; }
    }
    const title = test ? 'Test przypomnienia' : 'Czas na zastrzyk';
    const options = {
      body: reminderBody(),
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: test ? 'gh-reminder-test' : `gh-reminder-${localDateISO()}`,
      renotify: false,
      requireInteraction: false,
      data: { url: './#today' }
    };
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
    if (!test) {
      data.meta.lastReminderDate = localDateISO();
      persistData({ notifyError: false });
    }
    return true;
  }

  async function testReminderNotification() {
    const currentPermission = await readNotificationPermission();
    if (currentPermission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') return;
    }
    await showReminderNotification({ test: true });
    showToast('Wysłano testowe powiadomienie.', 'success');
  }

  function checkReminderDue() {
    if (!data.settings.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const today = localDateISO();
    if (todayHasEntry() || data.meta.lastReminderDate === today) return;
    if (localTime() >= (data.settings.reminderTime || '21:00')) showReminderNotification();
  }

  function scheduleDailyReminder() {
    if (reminderTimer) window.clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!data.settings.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const [hour, minute] = (data.settings.reminderTime || '21:00').split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now || todayHasEntry() || data.meta.lastReminderDate === localDateISO()) target.setDate(target.getDate() + 1);
    const delay = Math.max(1000, target.getTime() - now.getTime());
    reminderTimer = window.setTimeout(async () => {
      checkReminderDue();
      scheduleDailyReminder();
    }, Math.min(delay, 2147483647));
  }

  async function syncReminderStateWithServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
      const suggestion = getSuggestedPlace();
      registration.active?.postMessage({
        type: 'REMINDER_STATE',
        payload: {
          enabled: Boolean(data.settings.reminderEnabled),
          time: data.settings.reminderTime || '21:00',
          lastReminderDate: data.meta.lastReminderDate || '',
          today: localDateISO(),
          todayHasEntry: todayHasEntry(),
          body: reminderBody(),
          url: './#today',
          suggestion: formatPlace(suggestion.side, suggestion.site)
        }
      });
    } catch (error) {
      console.warn('Nie udało się przekazać ustawień przypomnienia:', error);
    }
  }

  async function registerPeriodicReminder() {
    if (!('Notification' in window) || !serviceWorkerRegistration?.periodicSync || !data.settings.reminderEnabled || Notification.permission !== 'granted') return;
    try {
      await serviceWorkerRegistration.periodicSync.register('daily-injection-reminder', { minInterval: 6 * 60 * 60 * 1000 });
    } catch (error) {
      console.info('Okresowa praca w tle nie została przyznana:', error);
    }
  }

  function configureSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceUnavailableState();
      return;
    }

    setVoiceReadyState();
    recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.addEventListener('start', () => {
      isListening = true;
      el['voice-button'].classList.add('is-listening');
      el['voice-button'].setAttribute('aria-pressed', 'true');
      el['voice-button'].querySelector('.voice-button-label').textContent = 'Słucham…';
      announce('Rozpoznawanie głosu uruchomione.');
    });

    recognition.addEventListener('end', () => {
      isListening = false;
      el['voice-button'].classList.remove('is-listening');
      el['voice-button'].setAttribute('aria-pressed', 'false');
      el['voice-button'].querySelector('.voice-button-label').textContent = 'Powiedz miejsce';
    });

    recognition.addEventListener('result', (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) processVoiceCommand(transcript);
    });

    recognition.addEventListener('error', (event) => {
      const messages = {
        'not-allowed': 'Brak dostępu do mikrofonu. Zezwól przeglądarce na jego użycie.',
        'audio-capture': 'Nie wykryto mikrofonu.',
        'no-speech': 'Nie rozpoznano mowy. Spróbuj ponownie.',
        network: 'Rozpoznawanie głosu wymaga połączenia obsługiwanego przez przeglądarkę.'
      };
      showToast(messages[event.error] || 'Nie udało się rozpoznać polecenia.', 'error');
    });
  }

  function setVoiceUnavailableState() {
    el['voice-button'].disabled = true;
    el['voice-button'].classList.add('is-unavailable');
    el['voice-button'].querySelector('.voice-button-label').textContent = 'Brak obsługi głosu';
    el['voice-help'].textContent = 'Ta przeglądarka nie obsługuje rozpoznawania mowy. Wybierz miejsce wkłucia przyciskiem „Miejsce”.';
  }

  function setVoiceReadyState() {
    el['voice-button'].disabled = false;
    el['voice-button'].classList.remove('is-unavailable');
    el['voice-button'].querySelector('.voice-button-label').textContent = 'Powiedz miejsce';
    el['voice-help'].textContent = 'Np. „lewy brzuch”, „wczoraj prawe ramię” albo „zapisz”.';
  }

  function toggleVoiceRecognition() {
    if (!recognition) {
      showToast('Ta przeglądarka nie udostępnia rozpoznawania mowy. Wybierz miejsce ręcznie.', 'error');
      openPlacePicker();
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      console.warn(error);
    }
  }

  function stopVoiceRecognition() {
    if (recognition && isListening) recognition.stop();
  }

  function processVoiceCommand(transcript) {
    const normalized = normalizeText(transcript);
    lastRecognizedText = transcript;

    if (/\b(anuluj|nie zapisuj|wyczysc)\b/.test(normalized)) {
      resetQuickDraftForToday();
      renderToday();
      showToast('Anulowano przygotowane zmiany.');
      speakIfEnabled('Anulowano.');
      return;
    }

    if (/\b(zapisz|potwierdz|tak)\b/.test(normalized) && (quickDraft.status === 'skipped' || (quickDraft.side && quickDraft.site))) {
      saveQuickDraft();
      return;
    }

    if (/\b(kalendarz|pokaz kalendarz)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('calendar');
      speakIfEnabled('Otwieram kalendarz.');
      return;
    }
    if (/\b(historia|pokaz historie|ostatni zastrzyk)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('history');
      speakIfEnabled('Otwieram historię.');
      return;
    }
    if (/\b(ustawienia|wiecej)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('more');
      speakIfEnabled('Otwieram ustawienia.');
      return;
    }
    if (/\b(dzisiaj|strona glowna)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      resetQuickDraftForToday();
      switchView('today');
      return;
    }
    if (/\b(popraw|edytuj|wpisz recznie)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      openEntryDialog(quickDraft.id || null, quickDraft);
      return;
    }

    const parsed = parseVoiceEntry(normalized);
    if (!Object.keys(parsed).length) {
      showToast('Nie rozpoznano daty, dawki ani miejsca wkłucia.', 'error');
      speakIfEnabled('Nie rozpoznano polecenia.');
      return;
    }
    applyVoiceEntryToDraft(parsed);
    quickDraftTouched = true;
    renderToday();

    if (quickDraft.status === 'skipped') {
      const message = `Rozpoznano pominięcie dawki ${formatDateSpeech(quickDraft.date)}.`;
      showToast(`${message} Potwierdź przyciskiem „Zapisz” lub powiedz „zapisz”.`, 'success');
      speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
      if (!data.settings.voiceConfirm) saveQuickDraft();
      return;
    }

    if (!quickDraft.side || !quickDraft.site) {
      const missing = !quickDraft.side && !quickDraft.site ? 'stronę i miejsce' : (!quickDraft.side ? 'stronę' : 'miejsce');
      const message = `Rozpoznano częściowo. Data wpisu: ${formatDateSpeech(quickDraft.date)}. Podaj jeszcze ${missing}.`;
      showToast(message, 'error');
      speakIfEnabled(message);
      return;
    }

    const message = `Rozpoznano ${formatPlace(quickDraft.side, quickDraft.site)}, dawka ${formatDose(quickDraft.dose)} ${quickDraft.unit}, ${formatDateSpeech(quickDraft.date)}.`;
    showToast(`${message} Potwierdź zapis.`, 'success');
    speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
    if (!data.settings.voiceConfirm) saveQuickDraft();
  }

  function applyVoiceEntryToDraft(parsed) {
    let base = quickDraft;
    if (parsed.date && parsed.date !== quickDraft.date) {
      const existing = getEntryForDate(parsed.date);
      base = existing
        ? { ...existing }
        : createDefaultDraft({ date: parsed.date, time: parsed.time || localTime() });
    }
    quickDraft = { ...base, ...parsed };

    if (parsed.status === 'skipped') {
      quickDraft.dose = '';
      quickDraft.unit = '';
      quickDraft.side = '';
      quickDraft.site = '';
      return;
    }

    if (parsed.status === 'given') {
      quickDraft.status = 'given';
      if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
      if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    }
  }

  function parseVoiceEntry(normalized) {
    const now = new Date();
    const result = {};
    const date = parseDateFromSpeech(normalized, now);
    const time = parseTimeFromSpeech(normalized);
    if (date) result.date = date;
    if (time) result.time = time;

    const skipped = /\b(pomin|pomini|nie podano|bez dawki)\w*/.test(normalized);
    if (skipped) result.status = 'skipped';

    if (/\blew\w*/.test(normalized)) result.side = 'lewa';
    else if (/\bpraw\w*/.test(normalized)) result.side = 'prawa';

    if (/brzuch|brzusz/.test(normalized)) result.site = 'brzuch';
    else if (/\budo\b|\buda\b|\bnog\w*/.test(normalized)) result.site = 'udo';
    else if (/ramie|ramienia/.test(normalized)) result.site = 'ramię';
    else if (/poslad/.test(normalized)) result.site = 'pośladek';
    else if (/lopatk/.test(normalized)) result.site = 'łopatka';

    const dose = parseDoseFromSpeech(normalized);
    if (dose) result.dose = dose;
    if (!skipped && (result.side || result.site || result.dose)) result.status = 'given';
    return result;
  }

  function parseDateFromSpeech(text, now = new Date()) {
    if (/przedwczoraj/.test(text)) {
      const date = new Date(now); date.setDate(date.getDate() - 2); return localDateISO(date);
    }
    if (/wczoraj/.test(text)) {
      const date = new Date(now); date.setDate(date.getDate() - 1); return localDateISO(date);
    }
    if (/dzis/.test(text)) return localDateISO(now);

    const numeric = text.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      let year = numeric[3] ? Number(numeric[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      if (isValidDateParts(year, month, day)) return datePartsToISO(year, month, day);
    }

    const monthPattern = Object.keys(MONTHS_NORMALIZED).join('|');
    const words = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`));
    if (words) {
      const day = Number(words[1]);
      const month = MONTHS_NORMALIZED[words[2]] + 1;
      const year = words[3] ? Number(words[3]) : now.getFullYear();
      if (isValidDateParts(year, month, day)) return datePartsToISO(year, month, day);
    }
    return '';
  }

  function parseTimeFromSpeech(text) {
    const match = text.match(/(?:godzina|godzine|\bo)\s+(\d{1,2})(?:(?::|\s)(\d{2}))?\b/);
    if (!match) return '';
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (hour > 23 || minute > 59) return '';
    return `${pad(hour)}:${pad(minute)}`;
  }

  function parseDoseFromSpeech(text) {
    const numeric = text.match(/dawk\w*\s+(\d+(?:[.,]\d+)?)/);
    if (numeric) return normalizeDose(numeric[1]);

    const wordMatch = text.match(/dawk\w*\s+([a-z\s]+?)(?=\s+(?:lew|praw|brzuch|udo|nog|ramie|poslad|lopatk|dzis|wczoraj|godzin)|$)/);
    if (!wordMatch) return '';
    const phrase = wordMatch[1].trim();
    const numberWords = {
      zero: '0', jeden: '1', jedna: '1', jedno: '1', dwa: '2', dwie: '2', trzy: '3', cztery: '4',
      piec: '5', szesc: '6', siedem: '7', osiem: '8', dziewiec: '9', dziesiec: '10'
    };
    const parts = phrase.split(/\s+(?:przecinek|kropka)\s+/);
    const left = numberWords[parts[0]] ?? '';
    if (!left) return '';
    if (parts.length === 1) return `${left},0`;
    const rightTokens = parts[1].split(/\s+/).map((token) => numberWords[token]).filter((token) => token !== undefined);
    return rightTokens.length ? `${left},${rightTokens.join('')}` : '';
  }

  function containsInjectionDetails(text) {
    return /brzuch|udo|nog|ramie|poslad|lopatk|dawk|pomin|lew\w*|praw\w*/.test(text);
  }

  function speakIfEnabled(text) {
    if (!data.settings.voiceFeedback || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pl-PL';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function handleGlobalKeyboard(event) {
    const key = event.key.toLowerCase();
    const targetIsField = event.target.matches('input, textarea, select, [contenteditable="true"]');

    if (event.key === 'Escape') {
      if (el['report-preview-dialog'].open) closeDataDialog(el['report-preview-dialog']);
      else if (el['export-report-dialog'].open) closeDataDialog(el['export-report-dialog']);
      else if (el['backup-dialog'].open) closeDataDialog(el['backup-dialog']);
      else if (el['entry-dialog'].open) closeEntryDialog();
      else if (el['place-picker-dialog'].open) closePlacePicker();
      else if (el['permissions-dialog'].open) el['permissions-dialog'].close();
      else stopVoiceRecognition();
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const viewMap = { '1': 'today', '2': 'calendar', '3': 'history', '4': 'more' };
      if (viewMap[event.key]) {
        event.preventDefault();
        switchView(viewMap[event.key]);
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        switchView('today');
        toggleVoiceRecognition();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        openEntryForDate(localDateISO());
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        switchView('more');
        openReportPreview();
        return;
      }
      if (key === 'w') {
        event.preventDefault();
        exportWord();
        return;
      }
    }

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (el['entry-dialog'].open) el['entry-form'].requestSubmit();
      else if (!el['save-button'].disabled) saveQuickDraft();
      return;
    }

    if (!targetIsField && key === '/' && activeView === 'history') {
      event.preventDefault();
      el['history-search'].focus();
    }
  }

  function installPwa() {
    if (!deferredInstallPrompt) {
      showToast('Opcja instalacji pojawi się w obsługiwanej przeglądarce po otwarciu aplikacji przez HTTPS.');
      return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
    });
  }

  function updateOnlineInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const visible = Boolean(deferredInstallPrompt) && !standalone;
    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.classList.toggle('is-hidden', !visible);
    });
  }

  async function loadVersion() {
    try {
      const response = await fetch('./app-version.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Brak pliku wersji');
      const version = await response.json();
      const shortVersion = String(version.version || '').split(' - ')[0] || '2.1';
      el['version-label'].textContent = `Wersja ${version.version}`;
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = `v${shortVersion}`; });
      document.title = `Dzienniczek v${shortVersion}`;
    } catch (error) {
      el['version-label'].textContent = 'Wersja 2.1';
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = 'v2.1'; });
    }
  }

  async function readReminderStateFromServiceWorker() {
    if (!serviceWorkerRegistration?.active || !('MessageChannel' in window)) return null;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolve(null), 1200);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(event.data || null);
      };
      serviceWorkerRegistration.active.postMessage({ type: 'GET_REMINDER_STATE' }, [channel.port2]);
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js');
      serviceWorkerRegistration = await navigator.serviceWorker.ready;
      const workerState = await readReminderStateFromServiceWorker();
      if (workerState?.lastReminderDate && workerState.lastReminderDate > (data.meta.lastReminderDate || '')) {
        data.meta.lastReminderDate = workerState.lastReminderDate;
        persistData({ notifyError: false });
      }
      await syncReminderStateWithServiceWorker();
      await registerPeriodicReminder();
      return serviceWorkerRegistration;
    } catch (error) {
      console.warn('Nie udało się zarejestrować service workera:', error);
      return null;
    }
  }

  function getEntriesAscending() {
    return [...data.entries].sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
  }

  function getEntriesSorted() {
    return [...data.entries].sort((a, b) => `${b.date}T${b.time || '00:00'}`.localeCompare(`${a.date}T${a.time || '00:00'}`));
  }

  function groupEntriesByDate() {
    const map = new Map();
    data.entries.forEach((entry) => {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push(entry);
    });
    return map;
  }

  function formatPlace(side, site) {
    if (!side || !site) return 'nie wybrano';
    const adjectives = {
      brzuch: side === 'lewa' ? 'lewy' : 'prawy',
      udo: side === 'lewa' ? 'lewe' : 'prawe',
      'ramię': side === 'lewa' ? 'lewe' : 'prawe',
      'pośladek': side === 'lewa' ? 'lewy' : 'prawy',
      'łopatka': side === 'lewa' ? 'lewa' : 'prawa'
    };
    return `${adjectives[site] || side} ${SITE_LABELS[site] || site}`;
  }

  function formatDose(value) {
    return String(value ?? '').replace('.', ',');
  }

  function normalizeDose(value) {
    const cleaned = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return '';
    const number = Number(cleaned);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return '';
    return cleaned.replace('.', ',');
  }

  function normalizeAmpouleNumber(value) {
    const number = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(number) && number >= 1 && number <= 999 ? number : 1;
  }

  function normalizeOptionalDayLimit(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const number = Number.parseInt(text, 10);
    return Number.isFinite(number) && number >= 1 && number <= 365 ? String(number) : '';
  }

  function normalizePositiveDecimal(value) {
    const normalized = normalizeDose(value);
    if (!normalized) return '';
    const number = decimalToNumber(normalized);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return '';
    return normalized;
  }

  function normalizeOptionalPositiveDecimal(value) {
    return String(value ?? '').trim() ? normalizePositiveDecimal(value) : '';
  }

  function decimalToNumber(value) {
    const number = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatDateShort(iso) {
    const date = parseISODate(iso);
    return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function formatDateLong(iso) {
    const date = parseISODate(iso);
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function formatDateSpeech(iso) {
    if (iso === localDateISO()) return 'dzisiaj';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (iso === localDateISO(yesterday)) return 'wczoraj';
    const date = parseISODate(iso);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  function localDateISO(date = new Date()) {
    return datePartsToISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function localTime(date = new Date()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function datePartsToISO(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function parseISODate(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function isValidDateParts(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  }

  function mondayIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[!?;,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function plural(number, one, few, many) {
    if (number === 1) return one;
    const last = number % 10;
    const lastTwo = number % 100;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
    return many;
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  async function downloadFile(filename, content, type) {
    return downloadBlob(filename, new Blob([content], { type }));
  }

  async function blobToBase64(blob) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < buffer.length; index += chunk) {
      binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  async function downloadBlob(filename, blob) {
    const filesystem = nativePlugin('Filesystem');
    const share = nativePlugin('Share');
    if (isNativeAndroid() && filesystem) {
      try {
        const dataBase64 = await blobToBase64(blob);
        const result = await filesystem.writeFile({
          path: `exports/${filename}`,
          data: dataBase64,
          directory: 'CACHE',
          recursive: true
        });
        if (share) {
          await share.share({ title: filename, text: 'Plik z aplikacji Dzienniczek hormonu wzrostu', url: result.uri, dialogTitle: 'Zapisz lub udostępnij plik' });
        } else {
          showToast(`Plik zapisano: ${result.uri}`, 'success', 7000);
        }
        return result.uri;
      } catch (error) {
        reportTechnicalError('downloadBlob.native', error);
        showToast('Nie udało się zapisać lub udostępnić pliku w Androidzie.', 'error');
        throw error;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  function showToast(message, type = '', duration = 4200) {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    el['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
