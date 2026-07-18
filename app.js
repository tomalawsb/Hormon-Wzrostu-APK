(() => {
  'use strict';

  const STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1';
  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';
  const BACKUP_REMINDER_KEY = 'dzienniczek-hormonu-backup-reminder-v1';
  const BACKUP_REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
  const AUTO_IMPORT_BACKUP_KEY = 'dzienniczek-hormonu-wzrostu-auto-import-backup-v1';
  const PERMISSIONS_ONBOARDING_STORAGE_KEY = 'dzienniczek-hormonu-zgody-onboarding';
  const PERMISSIONS_ONBOARDING_REVISION = 'permissions-v2';
  const BACKUP_FORMAT_VERSION = 2;
  const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_NOTE_LENGTH = 1000;
  const ALLOWED_UNITS = new Set(['mg', 'ml', 'IU', 'j.m.']);
  const ALLOWED_SIDES = new Set(['lewa', 'prawa']);
  const ALLOWED_SITES = new Set(['brzuch', 'udo', 'ramię', 'pośladek', 'łopatka']);
  const ALLOWED_STATUSES = new Set(['given', 'skipped']);
  const ALLOWED_AMPOULE_STATUSES = new Set(['active', 'paused', 'finished']);
  const DEFAULT_AMPOULE_VOLUME_ML = '10';
  const DATA_SCHEMA_VERSION = 10;
  const DEFAULT_PROFILE_ID = 'profile-1';
  const DEFAULT_PROFILE_NAME = 'Dziecko 1';
  const DEFAULT_PROFILE_COLOR = 'teal';
  const DEFAULT_PROFILE_ICON = '🧒';
  const MAX_PROFILES = 20;
  const ALLOWED_PROFILE_COLORS = new Set(['teal', 'blue', 'violet', 'rose', 'amber', 'green']);
  const ALLOWED_PROFILE_ICONS = new Set(['🧒', '👧', '👦', '🙂', '⭐', '💚', '💙', '💜']);
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

  const ROTATION = [
    ['lewa', 'brzuch'], ['prawa', 'brzuch'],
    ['lewa', 'udo'], ['prawa', 'udo'],
    ['lewa', 'pośladek'], ['prawa', 'pośladek'],
    ['lewa', 'ramię'], ['prawa', 'ramię'],
    ['lewa', 'łopatka'], ['prawa', 'łopatka']
  ];

  const DEFAULT_PROFILE_SETTINGS = Object.freeze({
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
    ampouleMaxOpenDays: ''
  });

  const DEFAULT_APP_META = Object.freeze({
    onboardingCompleted: false
  });

  const DEFAULT_PROFILE_META = Object.freeze({
    lastReminderDate: ''
  });

  const defaultData = createDefaultData();

  let data = attachActiveProfileAliases(loadData());
  let lastKnownLocalDate = localDateISO();
  let activeView = 'today';
  let todayDashboardMode = getAvailableProfiles().length > 1 ? 'all' : 'profile';
  let calendarProfileScope = data.activeProfileId;
  let historyProfileScope = data.activeProfileId;
  let reportProfileScope = data.activeProfileId;
  let selectedCalendarDate = localDateISO();
  let calendarCursor = startOfMonth(new Date());
  let deferredInstallPrompt = null;
  let recognition = null;
  let isListening = false;
  let lastRecognizedText = '';
  let quickDraft = createInitialQuickDraft();
  let quickDraftTouched = false;
  let midnightTimer = null;
  const reminderTimers = new Map();
  const reminderInFlightProfiles = new Set();
  let serviceWorkerRegistration = null;
  let dataDialogReturnTarget = null;
  let pendingImportPreview = null;
  let currentAppVersion = '1.0.0';
  let latestUpdateUrl = '';
  let latestUpdateVersion = '';

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    const launchedProfileChanged = applyProfileFromLaunchUrl();
    if (launchedProfileChanged) resetQuickDraftForToday();
    bindEvents();
    bindNativeEvents();
    configureSpeechRecognition();
    updateCurrentDateHeader();
    loadVersion();
    renderAll();
    switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false });
    await registerServiceWorker();
    updateOnlineInstallState();
    await updatePermissionStatuses();
    scheduleDailyReminder();
    scheduleMidnightRefresh();
    checkReminderDue();
    maybeShowFirstRunPermissions();
    flushStartupWarnings();
    maybeScheduleBackupReminder();
  }

  function cacheElements() {
    const ids = [
      'current-date-label', 'today-entry-date', 'today-dose', 'today-time', 'today-status-heading', 'today-status-badge',
      'today-profile-switcher', 'all-profiles-dashboard', 'all-profiles-progress', 'all-profiles-list', 'single-profile-dashboard',
      'today-profile-avatar', 'main-action-eyebrow', 'main-profile-name', 'main-status-badge',
      'main-place-value', 'main-dose-value', 'main-time-value', 'main-ampoule-value', 'main-dose-number-value', 'main-remaining-ml-value', 'main-doses-left-value', 'main-ampoule-open-value',
      'main-action-heading', 'main-action-text', 'recommended-save-button', 'recommended-edit-button', 'recommended-skip-button', 'recommended-manual-button',
      'ampoule-start-main-button', 'ampoule-alert', 'ampoule-alert-title', 'ampoule-alert-text',
      'voice-button', 'voice-help', 'voice-result', 'voice-result-text', 'selected-place', 'save-button', 'save-help',
      'skip-button', 'last-place', 'suggested-place', 'ampoule-status', 'use-suggestion-button', 'mini-calendar', 'recent-list',
      'date-chip', 'dose-chip', 'time-chip', 'place-field', 'entry-dialog', 'entry-form',
      'entry-dialog-title', 'entry-id', 'entry-date', 'entry-time', 'entry-dose', 'entry-unit', 'entry-side',
      'entry-site', 'entry-status', 'entry-note', 'delete-entry-button', 'dialog-close-button',
      'dialog-cancel-button', 'toast-region', 'live-region', 'calendar-prev', 'calendar-next',
      'calendar-month-label', 'calendar-grid', 'calendar-profile-filter', 'calendar-scope-label', 'calendar-profile-legend', 'selected-day-label', 'selected-day-entries',
      'add-for-selected-day', 'history-profile-filter', 'history-scope-label', 'history-search', 'status-filter', 'site-filter', 'history-table-body',
      'history-empty', 'settings-dose', 'settings-unit', 'settings-time', 'ampoule-start-date',
      'ampoule-start-number', 'ampoule-volume', 'ampoule-dose-ml', 'ampoule-max-open-days', 'ampoule-start-today-button', 'ampoule-new-button',
      'ampoule-management-summary', 'ampoule-list', 'voice-feedback-toggle',
      'voice-confirm-toggle', 'save-voice-settings-button', 'save-settings-button', 'reminder-enabled-toggle', 'reminder-time',
      'save-reminder-button', 'notification-permission-status', 'request-notification-button',
      'test-notification-button', 'report-profile-filter', 'report-date-from', 'report-date-to', 'report-include-ampoules', 'report-scope-summary', 'report-preview-button', 'export-report-button', 'backup-panel-button',
      'report-preview-dialog', 'report-preview-close-button', 'report-preview-frame', 'report-print-button',
      'export-report-dialog', 'export-report-close-button', 'backup-dialog', 'backup-close-button',
      'export-pdf-button', 'export-word-button', 'export-json-button', 'export-profile-json-button', 'export-csv-button', 'import-button',
      'restore-auto-backup-button', 'auto-backup-summary', 'import-preview', 'import-preview-summary', 'import-preview-profiles',
      'import-preview-warning', 'import-confirm-button', 'import-cancel-button',
      'import-file', 'clear-data-button', 'data-backup-section', 'header-install-button',
      'desktop-install-button', 'settings-install-button', 'version-label', 'permissions-dialog',
      'permission-microphone-button', 'permission-notification-button', 'permission-storage-button',
      'permission-microphone-status', 'permission-notification-status', 'permission-storage-status',
      'permissions-finish-button', 'permissions-skip-button', 'microphone-permission-settings', 'notification-permission-settings',
      'storage-permission-settings', 'open-permissions-button', 'place-picker-dialog', 'place-picker-options', 'place-picker-edit-button', 'place-picker-close-button',
      'active-profile-button', 'active-profile-avatar', 'active-profile-name', 'profiles-summary', 'manage-profiles-button',
      'profiles-dialog', 'profiles-dialog-close-button', 'profiles-list', 'add-profile-button',
      'profile-editor-dialog', 'profile-editor-form', 'profile-editor-title', 'profile-editor-id', 'profile-name-input',
      'profile-icon-options', 'profile-color-options', 'profile-editor-cancel-button', 'profile-editor-close-button',
      'profile-delete-dialog', 'profile-delete-close-button', 'profile-delete-cancel-button', 'profile-delete-confirm-button',
      'profile-delete-name', 'profile-delete-input', 'profile-delete-warning',
      'settings-profile-avatar', 'settings-profile-name', 'settings-profile-note',
      'injection-order-summary', 'injection-order-list', 'injection-order-side', 'injection-order-site',
      'injection-order-add-button', 'injection-order-reset-button', 'injection-order-warning',
      'settings-layout', 'settings-category-list', 'settings-section-back-button', 'settings-panels', 'save-ampoule-settings-button',
      'check-update-button', 'download-update-button', 'update-status', 'settings-version-label'
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
    el['recommended-save-button'].addEventListener('click', confirmRecommendedInjection);
    el['recommended-edit-button'].addEventListener('click', openRecommendedEntryEditor);
    el['recommended-skip-button'].addEventListener('click', confirmSkippedToday);
    el['recommended-manual-button'].addEventListener('click', openAmpouleSettings);
    el['ampoule-start-main-button'].addEventListener('click', setAmpouleStartToday);
    el['voice-button'].addEventListener('click', toggleVoiceRecognition);
    el['save-button'].addEventListener('click', saveQuickDraft);
    el['skip-button'].addEventListener('click', confirmSkippedToday);
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
    el['calendar-profile-filter'].addEventListener('change', handleCalendarProfileScopeChange);

    el['history-profile-filter'].addEventListener('change', handleHistoryProfileScopeChange);
    [el['history-search'], el['status-filter'], el['site-filter']].forEach((control) => {
      control.addEventListener('input', renderHistory);
      control.addEventListener('change', renderHistory);
    });
    el['history-table-body'].addEventListener('click', handleHistoryAction);
    el['selected-day-entries'].addEventListener('click', handleDayDetailsAction);

    el['today-profile-switcher'].addEventListener('click', handleTodayProfileSwitcherClick);
    el['all-profiles-list'].addEventListener('click', handleAllProfilesDashboardClick);

    el['active-profile-button'].addEventListener('click', openProfilesDialog);
    el['manage-profiles-button'].addEventListener('click', openProfilesDialog);
    el['profiles-dialog-close-button'].addEventListener('click', closeProfilesDialog);
    el['profiles-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profiles-dialog']) closeProfilesDialog();
    });
    el['profiles-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfilesDialog();
    });
    el['profiles-list'].addEventListener('click', handleProfilesListAction);
    el['add-profile-button'].addEventListener('click', () => openProfileEditor());
    el['profile-editor-form'].addEventListener('submit', saveProfileEditor);
    el['profile-editor-cancel-button'].addEventListener('click', closeProfileEditor);
    el['profile-editor-close-button'].addEventListener('click', closeProfileEditor);
    el['profile-editor-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profile-editor-dialog']) closeProfileEditor();
    });
    el['profile-editor-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfileEditor();
    });
    el['profile-icon-options'].addEventListener('click', handleProfileIconSelection);
    el['profile-color-options'].addEventListener('click', handleProfileColorSelection);
    el['profile-delete-close-button'].addEventListener('click', closeProfileDeleteDialog);
    el['profile-delete-cancel-button'].addEventListener('click', closeProfileDeleteDialog);
    el['profile-delete-confirm-button'].addEventListener('click', confirmProfileDeletion);
    el['profile-delete-input'].addEventListener('input', updateProfileDeleteButton);

    el['injection-order-list'].addEventListener('click', handleInjectionOrderAction);
    el['injection-order-list'].addEventListener('change', handleInjectionOrderToggle);
    el['injection-order-list'].addEventListener('dragstart', handleInjectionOrderDragStart);
    el['injection-order-list'].addEventListener('dragover', handleInjectionOrderDragOver);
    el['injection-order-list'].addEventListener('drop', handleInjectionOrderDrop);
    el['injection-order-list'].addEventListener('dragend', handleInjectionOrderDragEnd);
    el['injection-order-list'].addEventListener('pointerdown', handleInjectionOrderPointerDown);
    el['injection-order-list'].addEventListener('pointermove', handleInjectionOrderPointerMove);
    el['injection-order-list'].addEventListener('pointerup', handleInjectionOrderPointerUp);
    el['injection-order-list'].addEventListener('pointercancel', handleInjectionOrderPointerCancel);
    el['injection-order-list'].addEventListener('lostpointercapture', handleInjectionOrderPointerCancel);
    el['injection-order-add-button'].addEventListener('click', addInjectionOrderFromSettings);
    el['injection-order-reset-button'].addEventListener('click', resetInjectionOrderFromSettings);
    el['settings-category-list'].addEventListener('click', handleSettingsCategoryClick);
    el['settings-section-back-button'].addEventListener('click', () => showSettingsOverview());
    window.addEventListener?.('resize', handleSettingsLayoutChange);
    el['profile-delete-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profile-delete-dialog']) closeProfileDeleteDialog();
    });
    el['profile-delete-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfileDeleteDialog();
    });

    el['save-settings-button'].addEventListener('click', saveSettings);
    el['save-ampoule-settings-button'].addEventListener('click', saveAmpouleSettings);
    el['save-voice-settings-button'].addEventListener('click', saveVoiceSettings);
    el['ampoule-start-today-button'].addEventListener('click', setAmpouleStartToday);
    el['ampoule-new-button'].addEventListener('click', startNewAmpoule);
    el['ampoule-list'].addEventListener('click', handleAmpouleListAction);
    el['save-reminder-button'].addEventListener('click', saveReminderSettings);
    el['request-notification-button'].addEventListener('click', requestNotificationPermission);
    el['test-notification-button'].addEventListener('click', testReminderNotification);
    [el['report-profile-filter'], el['report-date-from'], el['report-date-to'], el['report-include-ampoules']].forEach((control) => {
      control.addEventListener('input', handleReportConfigurationChange);
      control.addEventListener('change', handleReportConfigurationChange);
    });
    el['report-preview-button'].addEventListener('click', openReportPreview);
    el['export-report-button'].addEventListener('click', openExportReportPanel);
    el['backup-panel-button'].addEventListener('click', openBackupPanel);
    el['report-preview-close-button'].addEventListener('click', () => closeDataDialog(el['report-preview-dialog']));
    el['export-report-close-button'].addEventListener('click', () => closeDataDialog(el['export-report-dialog']));
    el['backup-close-button'].addEventListener('click', closeBackupPanel);
    el['report-print-button'].addEventListener('click', printReportPreview);
    el['export-pdf-button'].addEventListener('click', async () => {
      if (await exportPdf()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-word-button'].addEventListener('click', () => {
      if (exportWord()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-json-button'].addEventListener('click', exportJson);
    el['export-profile-json-button'].addEventListener('click', exportActiveProfileJson);
    el['export-csv-button'].addEventListener('click', () => {
      if (exportCsv()) closeDataDialog(el['export-report-dialog']);
    });
    el['import-button'].addEventListener('click', () => el['import-file'].click());
    el['restore-auto-backup-button'].addEventListener('click', restoreAutomaticImportBackup);
    el['import-confirm-button'].addEventListener('click', confirmPendingImport);
    el['import-cancel-button'].addEventListener('click', clearPendingImportPreview);
    el['import-file'].addEventListener('change', importJson);
    el['clear-data-button'].addEventListener('click', clearAllEntries);

    [el['report-preview-dialog'], el['export-report-dialog'], el['backup-dialog']].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        if (dialog === el['backup-dialog']) closeBackupPanel();
        else closeDataDialog(dialog);
      });
      dialog.addEventListener('close', () => {
        if (dialog === el['backup-dialog']) {
          pendingImportPreview = null;
          renderImportPreview();
        }
        returnToDataSection();
      });
    });

    el['permission-microphone-button'].addEventListener('click', requestMicrophonePermission);
    el['permission-notification-button'].addEventListener('click', requestNotificationPermission);
    el['permission-storage-button'].addEventListener('click', requestPersistentStorage);
    el['permissions-finish-button'].addEventListener('click', finishPermissionsOnboarding);
    el['permissions-skip-button'].addEventListener('click', skipPermissionsOnboarding);
    el['open-permissions-button'].addEventListener('click', openPermissionsDialog);
    el['permissions-dialog'].addEventListener('cancel', (event) => {
      if (!isPermissionsOnboardingCompleted()) {
        event.preventDefault();
        showToast('Wybierz zgody albo użyj przycisku „Pomiń na razie”.', 'error');
      }
    });

    el['check-update-button'].addEventListener('click', () => checkForUpdates({ autoDownload: true }));
    el['download-update-button'].addEventListener('click', downloadAvailableUpdate);

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

  function createDefaultData() {
    return {
      version: DATA_SCHEMA_VERSION,
      appSettings: {},
      appMeta: structuredCloneSafe(DEFAULT_APP_META),
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: [createDefaultProfile()]
    };
  }

  function createDefaultProfile(overrides = {}) {
    const createdAt = isValidDateTime(overrides.createdAt) ? overrides.createdAt : new Date().toISOString();
    return {
      id: sanitizeProfileId(overrides.id) || DEFAULT_PROFILE_ID,
      name: sanitizeProfileName(overrides.name) || DEFAULT_PROFILE_NAME,
      icon: sanitizeProfileIcon(overrides.icon),
      color: sanitizeProfileColor(overrides.color),
      archivedAt: isValidDateTime(overrides.archivedAt) ? overrides.archivedAt : '',
      createdAt,
      updatedAt: isValidDateTime(overrides.updatedAt) ? overrides.updatedAt : '',
      settings: sanitizeSettings(overrides.settings),
      meta: sanitizeProfileMeta(overrides.meta),
      injectionOrder: sanitizeInjectionOrder(overrides.injectionOrder),
      ampoules: Array.isArray(overrides.ampoules) ? overrides.ampoules : [],
      activeAmpouleId: typeof overrides.activeAmpouleId === 'string' ? overrides.activeAmpouleId : '',
      entries: Array.isArray(overrides.entries) ? overrides.entries : []
    };
  }

  function createDefaultInjectionOrder() {
    return ROTATION.map(([side, site], index) => ({
      id: `rotation-${index + 1}`,
      side,
      site,
      enabled: true
    }));
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
          startupWarnings.push(`Wykryto ${result.removedDuplicates} zduplikowanych wpisów. Zachowano po jednym, najnowszym wpisie dla każdego dnia i profilu.`);
        }
        if (result.migratedFromLegacy || result.upgradedSchema) {
          safeStorageSet(BACKUP_STORAGE_KEY, raw);
          if (safeStorageSet(STORAGE_KEY, JSON.stringify(result.data))) {
            startupWarnings.push(result.migratedFromLegacy
              ? 'Dane zostały automatycznie dostosowane do obsługi profili. Dotychczasową historię przypisano do profilu „Dziecko 1”.'
              : 'Dane profili zostały automatycznie zaktualizowane do nowej wersji.');
          }
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
    const result = Array.isArray(parsed?.profiles)
      ? normalizeProfileBasedData(parsed)
      : migrateLegacyStoredData(parsed);
    result.data = attachActiveProfileAliases(result.data);
    return result;
  }

  function normalizeProfileBasedData(parsed) {
    const usedIds = new Set();
    let removedDuplicates = 0;
    const profiles = parsed.profiles.map((profile, index) => {
      const result = normalizeProfile(profile, index, usedIds);
      removedDuplicates += result.removedDuplicates;
      return result.profile;
    });

    if (!profiles.length) profiles.push(createDefaultProfile());
    let availableProfiles = profiles.filter((profile) => !profile.archivedAt);
    if (!availableProfiles.length) {
      profiles[0].archivedAt = '';
      availableProfiles = [profiles[0]];
    }
    const requestedActiveId = sanitizeProfileId(parsed.activeProfileId);
    const activeProfileId = availableProfiles.some((profile) => profile.id === requestedActiveId)
      ? requestedActiveId
      : availableProfiles[0].id;

    return {
      removedDuplicates,
      migratedFromLegacy: false,
      upgradedSchema: Number(parsed.version) !== DATA_SCHEMA_VERSION,
      data: {
        version: DATA_SCHEMA_VERSION,
        appSettings: sanitizeAppSettings(parsed.appSettings),
        appMeta: sanitizeAppMeta(parsed.appMeta || parsed.meta),
        activeProfileId,
        profiles
      }
    };
  }

  function migrateLegacyStoredData(parsed = {}) {
    const entriesInput = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const sanitized = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitized);
    const settings = sanitizeSettings(parsed?.settings);
    const storedAmpoules = Array.isArray(parsed?.ampoules) ? parsed.ampoules.map(sanitizeAmpoule).filter(Boolean) : [];
    const migrated = storedAmpoules.length
      ? normalizeAmpouleCollection(storedAmpoules, entries, parsed?.activeAmpouleId)
      : migrateLegacyAmpoules(entries, settings);
    const legacyMeta = sanitizeMeta(parsed?.meta);
    const profile = createDefaultProfile({
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME,
      settings,
      meta: { lastReminderDate: legacyMeta.lastReminderDate },
      ampoules: migrated.ampoules,
      activeAmpouleId: migrated.activeAmpouleId,
      entries: migrated.entries
    });

    return {
      removedDuplicates,
      migratedFromLegacy: true,
      upgradedSchema: true,
      data: {
        version: DATA_SCHEMA_VERSION,
        appSettings: {},
        appMeta: { onboardingCompleted: legacyMeta.onboardingCompleted },
        activeProfileId: profile.id,
        profiles: [profile]
      }
    };
  }

  function normalizeProfile(profileInput, index, usedIds) {
    const source = profileInput && typeof profileInput === 'object' ? profileInput : {};
    let id = sanitizeProfileId(source.id) || `profile-${index + 1}`;
    if (usedIds.has(id)) {
      const baseId = id;
      let suffix = 2;
      while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
      id = `${baseId}-${suffix}`;
    }
    usedIds.add(id);

    const entriesInput = Array.isArray(source.entries) ? source.entries : [];
    const sanitizedEntries = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitizedEntries);
    const settings = sanitizeSettings(source.settings);
    const storedAmpoules = Array.isArray(source.ampoules) ? source.ampoules.map(sanitizeAmpoule).filter(Boolean) : [];
    const migrated = storedAmpoules.length
      ? normalizeAmpouleCollection(storedAmpoules, entries, source.activeAmpouleId)
      : migrateLegacyAmpoules(entries, settings);

    return {
      removedDuplicates,
      profile: {
        id,
        name: sanitizeProfileName(source.name) || `Dziecko ${index + 1}`,
        icon: sanitizeProfileIcon(source.icon),
        color: sanitizeProfileColor(source.color),
        archivedAt: isValidDateTime(source.archivedAt) ? source.archivedAt : '',
        createdAt: isValidDateTime(source.createdAt) ? source.createdAt : new Date().toISOString(),
        updatedAt: isValidDateTime(source.updatedAt) ? source.updatedAt : '',
        settings,
        meta: sanitizeProfileMeta(source.meta),
        injectionOrder: sanitizeInjectionOrder(source.injectionOrder),
        ampoules: migrated.ampoules,
        activeAmpouleId: migrated.activeAmpouleId,
        entries: migrated.entries
      }
    };
  }

  function attachActiveProfileAliases(container) {
    if (!container || typeof container !== 'object') container = structuredCloneSafe(defaultData);
    if (!Array.isArray(container.profiles) || !container.profiles.length) container.profiles = [createDefaultProfile()];
    let availableProfiles = container.profiles.filter((profile) => !profile.archivedAt);
    if (!availableProfiles.length) {
      container.profiles[0].archivedAt = '';
      availableProfiles = [container.profiles[0]];
    }
    if (!availableProfiles.some((profile) => profile.id === container.activeProfileId)) {
      container.activeProfileId = availableProfiles[0].id;
    }

    const metaFacade = {};
    Object.defineProperties(metaFacade, {
      onboardingCompleted: {
        enumerable: true,
        get: () => Boolean(container.appMeta?.onboardingCompleted),
        set: (value) => {
          if (!container.appMeta || typeof container.appMeta !== 'object') container.appMeta = {};
          container.appMeta.onboardingCompleted = Boolean(value);
        }
      },
      lastReminderDate: {
        enumerable: true,
        get: () => getActiveProfile(container).meta.lastReminderDate,
        set: (value) => { getActiveProfile(container).meta.lastReminderDate = isValidIsoDate(value) ? value : ''; }
      }
    });

    Object.defineProperties(container, {
      settings: {
        configurable: true,
        get: () => getActiveProfile(container).settings,
        set: (value) => { getActiveProfile(container).settings = sanitizeSettings(value); }
      },
      meta: {
        configurable: true,
        get: () => metaFacade,
        set: (value) => {
          const sanitized = sanitizeMeta(value);
          container.appMeta = { onboardingCompleted: sanitized.onboardingCompleted };
          getActiveProfile(container).meta = { lastReminderDate: sanitized.lastReminderDate };
        }
      },
      injectionOrder: {
        configurable: true,
        get: () => getActiveProfile(container).injectionOrder,
        set: (value) => { getActiveProfile(container).injectionOrder = sanitizeInjectionOrder(value); }
      },
      ampoules: {
        configurable: true,
        get: () => getActiveProfile(container).ampoules,
        set: (value) => { getActiveProfile(container).ampoules = Array.isArray(value) ? value : []; }
      },
      activeAmpouleId: {
        configurable: true,
        get: () => getActiveProfile(container).activeAmpouleId,
        set: (value) => { getActiveProfile(container).activeAmpouleId = typeof value === 'string' ? value : ''; }
      },
      entries: {
        configurable: true,
        get: () => getActiveProfile(container).entries,
        set: (value) => { getActiveProfile(container).entries = Array.isArray(value) ? value : []; }
      }
    });
    return container;
  }

  function getActiveProfile(container = data) {
    if (!Array.isArray(container.profiles) || !container.profiles.length) {
      container.profiles = [createDefaultProfile()];
      container.activeProfileId = container.profiles[0].id;
    }
    let profile = container.profiles.find((item) => item.id === container.activeProfileId && !item.archivedAt);
    if (!profile) {
      profile = container.profiles.find((item) => !item.archivedAt);
      if (!profile) {
        profile = container.profiles[0];
        profile.archivedAt = '';
      }
      container.activeProfileId = profile.id;
    }
    return profile;
  }

  function setActiveProfileId(profileId, { refresh = false } = {}) {
    const normalizedId = sanitizeProfileId(profileId);
    if (!normalizedId || !data.profiles.some((profile) => profile.id === normalizedId && !profile.archivedAt)) return false;

    const previousProfileId = data.activeProfileId;
    if (previousProfileId !== normalizedId) {
      data.activeProfileId = normalizedId;
      if (!persistData()) {
        data.activeProfileId = previousProfileId;
        return false;
      }
    }

    if (refresh) {
      resetQuickDraftForToday();
      renderAll();
      scheduleDailyReminder();
      syncReminderStateWithServiceWorker();
    }
    return true;
  }

  function sanitizeProfileId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '';
  }

  function sanitizeProfileName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  }

  function sanitizeProfileIcon(value) {
    return ALLOWED_PROFILE_ICONS.has(value) ? value : DEFAULT_PROFILE_ICON;
  }

  function sanitizeProfileColor(value) {
    return ALLOWED_PROFILE_COLORS.has(value) ? value : DEFAULT_PROFILE_COLOR;
  }

  function getAvailableProfiles(container = data) {
    return Array.isArray(container.profiles) ? container.profiles.filter((profile) => !profile.archivedAt) : [];
  }

  function getArchivedProfiles(container = data) {
    return Array.isArray(container.profiles) ? container.profiles.filter((profile) => Boolean(profile.archivedAt)) : [];
  }

  function getProfileById(profileId, container = data) {
    const normalizedId = sanitizeProfileId(profileId);
    return normalizedId && Array.isArray(container.profiles)
      ? container.profiles.find((profile) => profile.id === normalizedId) || null
      : null;
  }

  function createUniqueProfileId(container = data) {
    const used = new Set((container.profiles || []).map((profile) => profile.id));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const randomPart = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const id = `profile-${randomPart}`;
      if (!used.has(id)) return id;
    }
    let suffix = 1;
    while (used.has(`profile-${suffix}`)) suffix += 1;
    return `profile-${suffix}`;
  }

  function isProfileNameTaken(name, ignoredProfileId = '') {
    const normalizedName = normalizeText(sanitizeProfileName(name));
    return data.profiles.some((profile) => profile.id !== ignoredProfileId && normalizeText(profile.name) === normalizedName);
  }

  function addProfileData({ name, icon, color } = {}) {
    const sanitizedName = sanitizeProfileName(name);
    if (!sanitizedName) return { ok: false, reason: 'name-required' };
    if (data.profiles.length >= MAX_PROFILES) return { ok: false, reason: 'limit' };
    if (isProfileNameTaken(sanitizedName)) return { ok: false, reason: 'duplicate-name' };

    const previousActiveId = data.activeProfileId;
    const profile = createDefaultProfile({
      id: createUniqueProfileId(),
      name: sanitizedName,
      icon: sanitizeProfileIcon(icon),
      color: sanitizeProfileColor(color)
    });
    data.profiles.push(profile);
    data.activeProfileId = profile.id;
    if (!persistData()) {
      data.profiles.pop();
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function updateProfileData(profileId, { name, icon, color } = {}) {
    const profile = getProfileById(profileId);
    const sanitizedName = sanitizeProfileName(name);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (!sanitizedName) return { ok: false, reason: 'name-required' };
    if (isProfileNameTaken(sanitizedName, profile.id)) return { ok: false, reason: 'duplicate-name' };

    const previous = { name: profile.name, icon: profile.icon, color: profile.color, updatedAt: profile.updatedAt };
    profile.name = sanitizedName;
    profile.icon = sanitizeProfileIcon(icon);
    profile.color = sanitizeProfileColor(color);
    profile.updatedAt = new Date().toISOString();
    if (!persistData()) {
      Object.assign(profile, previous);
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function archiveProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (profile.archivedAt) return { ok: false, reason: 'already-archived' };
    const available = getAvailableProfiles();
    if (available.length <= 1) return { ok: false, reason: 'last-active' };

    const previousActiveId = data.activeProfileId;
    const previousArchivedAt = profile.archivedAt;
    const previousUpdatedAt = profile.updatedAt;
    profile.archivedAt = new Date().toISOString();
    profile.updatedAt = profile.archivedAt;
    if (data.activeProfileId === profile.id) {
      data.activeProfileId = available.find((item) => item.id !== profile.id).id;
    }
    if (!persistData()) {
      profile.archivedAt = previousArchivedAt;
      profile.updatedAt = previousUpdatedAt;
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function restoreProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (!profile.archivedAt) return { ok: false, reason: 'not-archived' };
    const previousArchivedAt = profile.archivedAt;
    const previousUpdatedAt = profile.updatedAt;
    profile.archivedAt = '';
    profile.updatedAt = new Date().toISOString();
    if (!persistData()) {
      profile.archivedAt = previousArchivedAt;
      profile.updatedAt = previousUpdatedAt;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function deleteProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (data.profiles.length <= 1) return { ok: false, reason: 'last-profile' };
    const otherAvailable = getAvailableProfiles().filter((item) => item.id !== profile.id);
    if (data.activeProfileId === profile.id && !otherAvailable.length) {
      return { ok: false, reason: 'last-active' };
    }

    const previousProfiles = data.profiles;
    const previousActiveId = data.activeProfileId;
    data.profiles = data.profiles.filter((item) => item.id !== profile.id);
    if (data.activeProfileId === profile.id) data.activeProfileId = otherAvailable[0].id;
    if (!persistData()) {
      data.profiles = previousProfiles;
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function sanitizeInjectionOrder(order) {
    if (!Array.isArray(order)) return createDefaultInjectionOrder();
    const usedIds = new Set();
    const sanitized = [];
    order.slice(0, 100).forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const side = ALLOWED_SIDES.has(item.side) ? item.side : '';
      const site = ALLOWED_SITES.has(item.site) ? item.site : '';
      if (!side || !site) return;
      let id = sanitizeProfileId(item.id) || `rotation-${index + 1}`;
      if (usedIds.has(id)) {
        const baseId = id;
        let suffix = 2;
        while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
        id = `${baseId}-${suffix}`;
      }
      usedIds.add(id);
      sanitized.push({ id, side, site, enabled: item.enabled !== false });
    });
    if (!sanitized.length) return createDefaultInjectionOrder();
    return sanitized;
  }

  function sanitizeAppSettings(settings = {}) {
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? {} : {};
  }

  function sanitizeAppMeta(meta = {}) {
    return { onboardingCompleted: Boolean(meta.onboardingCompleted) };
  }

  function sanitizeProfileMeta(meta = {}) {
    return { lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : '' };
  }

  function sanitizeSettings(settings = {}) {
    const dose = normalizeDose(settings.defaultDose) || DEFAULT_PROFILE_SETTINGS.defaultDose;
    return {
      defaultDose: dose,
      unit: ALLOWED_UNITS.has(settings.unit) ? settings.unit : DEFAULT_PROFILE_SETTINGS.unit,
      defaultTime: isValidTime(settings.defaultTime) ? settings.defaultTime : DEFAULT_PROFILE_SETTINGS.defaultTime,
      voiceFeedback: typeof settings.voiceFeedback === 'boolean' ? settings.voiceFeedback : DEFAULT_PROFILE_SETTINGS.voiceFeedback,
      voiceConfirm: typeof settings.voiceConfirm === 'boolean' ? settings.voiceConfirm : DEFAULT_PROFILE_SETTINGS.voiceConfirm,
      reminderEnabled: typeof settings.reminderEnabled === 'boolean' ? settings.reminderEnabled : DEFAULT_PROFILE_SETTINGS.reminderEnabled,
      reminderTime: isValidTime(settings.reminderTime) ? settings.reminderTime : DEFAULT_PROFILE_SETTINGS.reminderTime,
      ampouleStartDate: isValidIsoDate(settings.ampouleStartDate) ? settings.ampouleStartDate : DEFAULT_PROFILE_SETTINGS.ampouleStartDate,
      ampouleStartNumber: normalizeAmpouleNumber(settings.ampouleStartNumber),
      ampouleVolumeMl: normalizePositiveDecimal(settings.ampouleVolumeMl) || DEFAULT_PROFILE_SETTINGS.ampouleVolumeMl,
      ampouleDoseMl: normalizeOptionalPositiveDecimal(settings.ampouleDoseMl),
      ampouleMaxOpenDays: normalizeOptionalDayLimit(settings.ampouleMaxOpenDays)
    };
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
    const normalizedEntries = entries.map((entry) => {
      const ampouleId = entry.ampouleId && byId.has(entry.ampouleId) ? entry.ampouleId : '';
      const ampoule = ampouleId ? byId.get(ampouleId) : null;
      const historicalDoseMl = entry.status === 'given' && ampoule
        ? normalizePositiveDecimal(entry.ampouleDoseMl)
          || (entry.unit === 'ml' ? normalizePositiveDecimal(entry.dose) : normalizePositiveDecimal(ampoule.doseMl))
        : '';
      return { ...entry, ampouleId, ampouleDoseMl: historicalDoseMl };
    });
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
        if (entry.status === 'given') {
          entry.ampouleDoseMl = normalizePositiveDecimal(entry.ampouleDoseMl)
            || (entry.unit === 'ml' ? normalizePositiveDecimal(entry.dose) : normalizePositiveDecimal(doseMl));
          remainingMl = Math.max(0, remainingMl - getEntryAmpouleDoseMl(entry, doseMl));
        }
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
      ampouleId: typeof entry.ampouleId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.ampouleId) ? entry.ampouleId : '',
      ampouleDoseMl: normalizeOptionalPositiveDecimal(entry.ampouleDoseMl)
    };

    if (status === 'skipped') {
      return { ...base, dose: '', unit: '', side: '', site: '', ampouleDoseMl: '' };
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
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) localStorage.setItem(BACKUP_STORAGE_KEY, previous);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.queueMicrotask(() => {
        scheduleDailyReminder();
        syncReminderStateWithServiceWorker();
      });
      return true;
    } catch (error) {
      console.error('Nie udało się zapisać danych:', error);
      if (notifyError && el['toast-region']) showToast('Nie udało się zapisać danych w pamięci urządzenia. Wykonaj eksport kopii JSON.', 'error');
      else startupWarnings.push('Nie udało się zapisać danych w pamięci urządzenia.');
      return false;
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
    if (todayEntry) return { ...todayEntry };
    const suggestion = getSuggestedPlace(new Date());
    return createDefaultDraft({
      time: data.settings.defaultTime,
      side: suggestion.side || '',
      site: suggestion.site || ''
    });
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
    if (applyProfileFromLaunchUrl()) {
      resetQuickDraftForToday();
      renderAll();
    }
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

  let profileEditorIcon = DEFAULT_PROFILE_ICON;
  let profileEditorColor = DEFAULT_PROFILE_COLOR;
  let pendingDeleteProfileId = '';

  function renderProfileControls() {
    const activeProfile = getActiveProfile();
    el['active-profile-name'].textContent = activeProfile.name;
    el['active-profile-avatar'].textContent = activeProfile.icon;
    el['active-profile-avatar'].dataset.profileColor = activeProfile.color;
    el['active-profile-button'].setAttribute('aria-label', `Aktywny profil: ${activeProfile.name}. Zmień profil dziecka.`);

    const availableCount = getAvailableProfiles().length;
    const archivedCount = getArchivedProfiles().length;
    const availableText = `${availableCount} ${plural(availableCount, 'aktywny profil', 'aktywne profile', 'aktywnych profili')}`;
    el['profiles-summary'].textContent = archivedCount
      ? `${availableText} · ${archivedCount} ${plural(archivedCount, 'archiwalny', 'archiwalne', 'archiwalnych')}`
      : availableText;

    renderProfilesList();
  }

  function openProfilesDialog() {
    renderProfilesList();
    if (!el['profiles-dialog'].open) el['profiles-dialog'].showModal();
  }

  function closeProfilesDialog() {
    if (el['profiles-dialog'].open) el['profiles-dialog'].close();
  }

  function renderProfilesList() {
    if (!el['profiles-list']) return;
    const available = getAvailableProfiles();
    const archived = getArchivedProfiles();
    const activeId = data.activeProfileId;

    const renderProfileCard = (profile, archivedProfile = false) => {
      const active = profile.id === activeId;
      const entriesCount = profile.entries.length;
      const ampoulesCount = profile.ampoules.length;
      const meta = [
        `${entriesCount} ${plural(entriesCount, 'wpis', 'wpisy', 'wpisów')}`,
        `${ampoulesCount} ${plural(ampoulesCount, 'ampułka', 'ampułki', 'ampułek')}`
      ].join(' · ');
      return `
        <article class="profile-list-item${active ? ' is-active' : ''}${archivedProfile ? ' is-archived' : ''}" data-profile-id="${escapeHtml(profile.id)}">
          <span class="profile-avatar profile-avatar--large" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <div class="profile-list-item__content">
            <div class="profile-list-item__title">
              <strong>${escapeHtml(profile.name)}</strong>
              ${active ? '<span class="profile-state-badge">Aktywny</span>' : ''}
              ${archivedProfile ? '<span class="profile-state-badge profile-state-badge--archived">Archiwum</span>' : ''}
            </div>
            <span>${escapeHtml(meta)}</span>
          </div>
          <div class="profile-list-item__actions">
            ${!archivedProfile && !active ? `<button class="mini-button" type="button" data-profile-action="select" data-profile-id="${escapeHtml(profile.id)}">Wybierz</button>` : ''}
            <button class="mini-button" type="button" data-profile-action="edit" data-profile-id="${escapeHtml(profile.id)}">Edytuj</button>
            ${archivedProfile
              ? `<button class="mini-button" type="button" data-profile-action="restore" data-profile-id="${escapeHtml(profile.id)}">Przywróć</button>`
              : `<button class="mini-button" type="button" data-profile-action="archive" data-profile-id="${escapeHtml(profile.id)}">Archiwizuj</button>`}
            <button class="mini-button mini-button--danger" type="button" data-profile-action="delete" data-profile-id="${escapeHtml(profile.id)}">Usuń</button>
          </div>
        </article>
      `;
    };

    let html = '<section class="profiles-section"><h3>Aktywne profile</h3>';
    html += available.map((profile) => renderProfileCard(profile)).join('');
    html += '</section>';
    if (archived.length) {
      html += '<section class="profiles-section profiles-section--archived"><h3>Archiwum</h3>';
      html += archived.map((profile) => renderProfileCard(profile, true)).join('');
      html += '</section>';
    }
    el['profiles-list'].innerHTML = html;
    el['add-profile-button'].disabled = data.profiles.length >= MAX_PROFILES;
    el['add-profile-button'].title = data.profiles.length >= MAX_PROFILES
      ? `Osiągnięto limit ${MAX_PROFILES} profili.`
      : 'Dodaj nowy profil dziecka';
  }

  function handleProfilesListAction(event) {
    const button = event.target.closest('[data-profile-action][data-profile-id]');
    if (!button) return;
    const profileId = button.dataset.profileId;
    const action = button.dataset.profileAction;
    if (action === 'select') selectProfileFromDialog(profileId);
    else if (action === 'edit') openProfileEditor(profileId);
    else if (action === 'archive') archiveProfile(profileId);
    else if (action === 'restore') restoreProfile(profileId);
    else if (action === 'delete') openProfileDeleteDialog(profileId);
  }

  function selectProfileFromDialog(profileId) {
    const profile = getProfileById(profileId);
    if (!profile || profile.archivedAt) return;
    closeProfilesDialog();
    todayDashboardMode = 'profile';
    if (setActiveProfileId(profileId, { refresh: true })) {
      showToast(`Wybrano profil: ${profile.name}.`, 'success');
    }
  }

  function openProfileEditor(profileId = '') {
    const profile = profileId ? getProfileById(profileId) : null;
    if (!profile && data.profiles.length >= MAX_PROFILES) {
      showToast(`Można utworzyć maksymalnie ${MAX_PROFILES} profili.`, 'error');
      return;
    }

    profileEditorIcon = profile?.icon || DEFAULT_PROFILE_ICON;
    profileEditorColor = profile?.color || DEFAULT_PROFILE_COLOR;
    el['profile-editor-title'].textContent = profile ? 'Edytuj profil' : 'Dodaj profil';
    el['profile-editor-id'].value = profile?.id || '';
    el['profile-name-input'].value = profile?.name || '';
    renderProfileEditorChoices();
    closeProfilesDialog();
    if (!el['profile-editor-dialog'].open) el['profile-editor-dialog'].showModal();
    window.setTimeout(() => el['profile-name-input'].focus(), 0);
  }

  function closeProfileEditor() {
    if (el['profile-editor-dialog'].open) el['profile-editor-dialog'].close();
    openProfilesDialog();
  }

  function renderProfileEditorChoices() {
    el['profile-icon-options'].querySelectorAll('[data-profile-icon]').forEach((button) => {
      const active = button.dataset.profileIcon === profileEditorIcon;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    el['profile-color-options'].querySelectorAll('[data-profile-color]').forEach((button) => {
      const active = button.dataset.profileColor === profileEditorColor;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function handleProfileIconSelection(event) {
    const button = event.target.closest('[data-profile-icon]');
    if (!button) return;
    profileEditorIcon = sanitizeProfileIcon(button.dataset.profileIcon);
    renderProfileEditorChoices();
  }

  function handleProfileColorSelection(event) {
    const button = event.target.closest('[data-profile-color]');
    if (!button) return;
    profileEditorColor = sanitizeProfileColor(button.dataset.profileColor);
    renderProfileEditorChoices();
  }

  function saveProfileEditor(event) {
    event.preventDefault();
    const profileId = sanitizeProfileId(el['profile-editor-id'].value);
    const name = sanitizeProfileName(el['profile-name-input'].value);
    if (!name) {
      showToast('Wpisz nazwę dziecka.', 'error');
      el['profile-name-input'].focus();
      return;
    }
    if (isProfileNameTaken(name, profileId)) {
      showToast('Profil o takiej nazwie już istnieje.', 'error');
      el['profile-name-input'].focus();
      return;
    }

    if (profileId) {
      const profile = getProfileById(profileId);
      if (!profile) {
        showToast('Nie znaleziono profilu do edycji.', 'error');
        return;
      }
      const result = updateProfileData(profileId, { name, icon: profileEditorIcon, color: profileEditorColor });
      if (!result.ok) return;
      el['profile-editor-dialog'].close();
      renderAll();
      syncReminderStateWithServiceWorker();
      openProfilesDialog();
      showToast(`Zapisano profil: ${name}.`, 'success');
      return;
    }

    if (data.profiles.length >= MAX_PROFILES) {
      showToast(`Można utworzyć maksymalnie ${MAX_PROFILES} profili.`, 'error');
      return;
    }
    const result = addProfileData({ name, icon: profileEditorIcon, color: profileEditorColor });
    if (!result.ok) return;
    todayDashboardMode = 'profile';
    el['profile-editor-dialog'].close();
    resetQuickDraftForToday();
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    openProfilesDialog();
    showToast(`Dodano profil: ${name}.`, 'success');
  }

  function archiveProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile || profile.archivedAt) return;
    const available = getAvailableProfiles();
    if (available.length <= 1) {
      showToast('Nie można zarchiwizować jedynego aktywnego profilu.', 'error');
      return;
    }
    if (!window.confirm(`Archiwizować profil „${profile.name}”? Historia i ustawienia zostaną zachowane.`)) return;

    const result = archiveProfileData(profileId);
    if (!result.ok) return;
    resetQuickDraftForToday();
    renderAll();
    renderProfilesList();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    showToast(`Profil „${profile.name}” przeniesiono do archiwum.`, 'success');
  }

  function restoreProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile || !profile.archivedAt) return;
    const result = restoreProfileData(profileId);
    if (!result.ok) return;
    renderAll();
    renderProfilesList();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    showToast(`Przywrócono profil „${profile.name}”.`, 'success');
  }

  function openProfileDeleteDialog(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return;
    if (data.profiles.length <= 1) {
      showToast('Nie można usunąć jedynego profilu.', 'error');
      return;
    }
    const otherAvailable = getAvailableProfiles().filter((item) => item.id !== profile.id);
    if (data.activeProfileId === profile.id && !otherAvailable.length) {
      showToast('Najpierw przywróć lub utwórz inny aktywny profil.', 'error');
      return;
    }

    pendingDeleteProfileId = profile.id;
    el['profile-delete-name'].textContent = profile.name;
    el['profile-delete-input'].value = '';
    el['profile-delete-warning'].innerHTML = `
      <strong>Usunięte zostaną wszystkie dane profilu „${escapeHtml(profile.name)}”.</strong>
      <span>${profile.entries.length} ${plural(profile.entries.length, 'wpis', 'wpisy', 'wpisów')}, ${profile.ampoules.length} ${plural(profile.ampoules.length, 'ampułka', 'ampułki', 'ampułek')} oraz wszystkie ustawienia. Tej operacji nie można cofnąć.</span>
    `;
    updateProfileDeleteButton();
    closeProfilesDialog();
    if (!el['profile-delete-dialog'].open) el['profile-delete-dialog'].showModal();
    window.setTimeout(() => el['profile-delete-input'].focus(), 0);
  }

  function closeProfileDeleteDialog() {
    pendingDeleteProfileId = '';
    if (el['profile-delete-dialog'].open) el['profile-delete-dialog'].close();
    openProfilesDialog();
  }

  function updateProfileDeleteButton() {
    const profile = getProfileById(pendingDeleteProfileId);
    el['profile-delete-confirm-button'].disabled = !profile || el['profile-delete-input'].value !== profile.name;
  }

  function confirmProfileDeletion() {
    const profile = getProfileById(pendingDeleteProfileId);
    if (!profile || el['profile-delete-input'].value !== profile.name) return;
    if (data.profiles.length <= 1) {
      showToast('Nie można usunąć jedynego profilu.', 'error');
      return;
    }

    const result = deleteProfileData(profile.id);
    if (!result.ok) return;

    pendingDeleteProfileId = '';
    el['profile-delete-dialog'].close();
    resetQuickDraftForToday();
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    openProfilesDialog();
    showToast(`Usunięto profil „${profile.name}”.`, 'success');
  }
  let draggedInjectionOrderId = '';
  let draggedInjectionOrderDropAfter = false;
  let injectionOrderPointerState = null;

  function getEnabledInjectionOrder(profile = getActiveProfile()) {
    const order = sanitizeInjectionOrder(profile?.injectionOrder);
    return order.filter((item) => item.enabled);
  }

  function saveInjectionOrder(nextOrder, { render = true, notify = true } = {}) {
    const profile = getActiveProfile();
    const previous = structuredCloneSafe(profile.injectionOrder);
    const previousUpdatedAt = profile.updatedAt;
    profile.injectionOrder = sanitizeInjectionOrder(nextOrder);
    profile.updatedAt = new Date().toISOString();
    if (!persistData()) {
      profile.injectionOrder = previous;
      profile.updatedAt = previousUpdatedAt;
      return false;
    }
    if (render) {
      renderInjectionOrderSettings();
      renderToday();
    }
    if (notify) showToast('Zapisano kolejność miejsc wkłucia.', 'success');
    return true;
  }

  function addInjectionOrderItem(side, site, options = {}) {
    if (!ALLOWED_SIDES.has(side) || !ALLOWED_SITES.has(site)) return false;
    const next = [...data.injectionOrder, { id: createId(), side, site, enabled: true }];
    return saveInjectionOrder(next, options);
  }

  function moveInjectionOrderItem(itemId, direction, options = {}) {
    const index = data.injectionOrder.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
    if (target < 0 || target >= data.injectionOrder.length) return false;
    const next = structuredCloneSafe(data.injectionOrder);
    [next[index], next[target]] = [next[target], next[index]];
    return saveInjectionOrder(next, { notify: false, ...options });
  }

  function moveInjectionOrderItemRelative(itemId, targetId, placeAfter = false, options = {}) {
    if (!itemId || !targetId || itemId === targetId) return false;
    const next = structuredCloneSafe(data.injectionOrder);
    const sourceIndex = next.findIndex((item) => item.id === itemId);
    if (sourceIndex < 0 || !next.some((item) => item.id === targetId)) return false;
    const [item] = next.splice(sourceIndex, 1);
    const targetIndex = next.findIndex((entry) => entry.id === targetId);
    if (targetIndex < 0) return false;
    next.splice(targetIndex + (placeAfter ? 1 : 0), 0, item);
    return saveInjectionOrder(next, { notify: false, ...options });
  }

  function moveInjectionOrderItemBefore(itemId, targetId, options = {}) {
    return moveInjectionOrderItemRelative(itemId, targetId, false, options);
  }

  function setInjectionOrderItemEnabled(itemId, enabled, options = {}) {
    const next = structuredCloneSafe(data.injectionOrder);
    const item = next.find((entry) => entry.id === itemId);
    if (!item) return false;
    item.enabled = Boolean(enabled);
    const saved = saveInjectionOrder(next, { notify: false, ...options });
    if (saved && !next.some((entry) => entry.enabled)) {
      showToast('Wyłączono wszystkie miejsca. Aplikacja nie zaproponuje miejsca, dopóki nie włączysz co najmniej jednego.', 'error', 7000);
    }
    return saved;
  }

  function duplicateInjectionOrderItem(itemId, options = {}) {
    const index = data.injectionOrder.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    const next = structuredCloneSafe(data.injectionOrder);
    next.splice(index + 1, 0, { ...next[index], id: createId() });
    return saveInjectionOrder(next, options);
  }

  function removeInjectionOrderItem(itemId, options = {}) {
    if (data.injectionOrder.length <= 1) {
      showToast('Kolejność musi zawierać co najmniej jedną pozycję.', 'error');
      return false;
    }
    const next = data.injectionOrder.filter((item) => item.id !== itemId);
    if (next.length === data.injectionOrder.length) return false;
    const saved = saveInjectionOrder(next, options);
    if (saved && !next.some((item) => item.enabled)) {
      showToast('Nie ma aktywnych miejsc wkłucia. Włącz co najmniej jedno miejsce, aby otrzymywać propozycje.', 'error', 7000);
    }
    return saved;
  }

  function resetInjectionOrder(options = {}) {
    return saveInjectionOrder(createDefaultInjectionOrder(), options);
  }

  function renderInjectionOrderSettings() {
    if (!el['injection-order-list']) return;
    const profile = getActiveProfile();
    const order = profile.injectionOrder;
    const enabledCount = order.filter((item) => item.enabled).length;
    el['injection-order-summary'].textContent = `${enabledCount} z ${order.length} ${plural(order.length, 'pozycji', 'pozycji', 'pozycji')} aktywnych dla profilu ${profile.name}`;
    if (el['injection-order-warning']) {
      el['injection-order-warning'].classList.toggle('is-hidden', enabledCount > 0);
      el['injection-order-warning'].textContent = enabledCount > 0
        ? ''
        : 'Brak aktywnych miejsc. Propozycje są wstrzymane — włącz co najmniej jedną pozycję.';
    }
    el['injection-order-list'].innerHTML = order.map((item, index) => `
      <article class="injection-order-item${item.enabled ? '' : ' is-disabled'}" draggable="true" data-injection-order-id="${escapeHtml(item.id)}">
        <span class="injection-order-handle" title="Przeciągnij myszką lub palcem, aby zmienić kolejność" aria-label="Przeciągnij, aby zmienić kolejność" role="button" tabindex="0">⋮⋮</span>
        <span class="injection-order-number">${index + 1}</span>
        <div class="injection-order-label">
          <strong>${escapeHtml(capitalize(formatPlace(item.side, item.site)))}</strong>
          <small>${item.enabled ? 'Uwzględniane w propozycjach' : 'Pominięte w propozycjach'}</small>
        </div>
        <label class="injection-order-toggle" title="Włącz lub wyłącz pozycję">
          <input type="checkbox" data-injection-order-toggle="${escapeHtml(item.id)}" ${item.enabled ? 'checked' : ''}>
          <span>${item.enabled ? 'Włączone' : 'Wyłączone'}</span>
        </label>
        <div class="injection-order-actions">
          <button class="mini-button" type="button" data-injection-order-action="up" data-injection-order-id="${escapeHtml(item.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Przesuń wyżej">↑</button>
          <button class="mini-button" type="button" data-injection-order-action="down" data-injection-order-id="${escapeHtml(item.id)}" ${index === order.length - 1 ? 'disabled' : ''} aria-label="Przesuń niżej">↓</button>
          <button class="mini-button" type="button" data-injection-order-action="duplicate" data-injection-order-id="${escapeHtml(item.id)}">Powtórz</button>
          <button class="mini-button mini-button--danger" type="button" data-injection-order-action="remove" data-injection-order-id="${escapeHtml(item.id)}">Usuń</button>
        </div>
      </article>
    `).join('');
  }

  function handleInjectionOrderAction(event) {
    const button = event.target.closest('[data-injection-order-action][data-injection-order-id]');
    if (!button) return;
    const itemId = button.dataset.injectionOrderId;
    const action = button.dataset.injectionOrderAction;
    if (action === 'up' || action === 'down') moveInjectionOrderItem(itemId, action);
    else if (action === 'duplicate') duplicateInjectionOrderItem(itemId);
    else if (action === 'remove') removeInjectionOrderItem(itemId);
  }

  function handleInjectionOrderToggle(event) {
    const input = event.target.closest('[data-injection-order-toggle]');
    if (!input) return;
    setInjectionOrderItemEnabled(input.dataset.injectionOrderToggle, input.checked);
  }

  function clearInjectionOrderDragClasses() {
    el['injection-order-list']?.querySelectorAll('.is-dragging, .is-drag-target, .is-drag-target-before, .is-drag-target-after')
      .forEach((item) => item.classList.remove('is-dragging', 'is-drag-target', 'is-drag-target-before', 'is-drag-target-after'));
  }

  function markInjectionOrderDropTarget(target, placeAfter) {
    clearInjectionOrderDragClasses();
    const sourceId = injectionOrderPointerState?.itemId || draggedInjectionOrderId;
    const source = sourceId ? el['injection-order-list']?.querySelector(`.injection-order-item[data-injection-order-id="${CSS.escape(sourceId)}"]`) : null;
    source?.classList.add('is-dragging');
    if (!target || target.dataset.injectionOrderId === sourceId) return;
    target.classList.add('is-drag-target', placeAfter ? 'is-drag-target-after' : 'is-drag-target-before');
  }

  function handleInjectionOrderDragStart(event) {
    const item = event.target.closest('.injection-order-item[data-injection-order-id]');
    if (!item || !el['injection-order-list'].contains(item)) return;
    draggedInjectionOrderId = item.dataset.injectionOrderId;
    draggedInjectionOrderDropAfter = false;
    item.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedInjectionOrderId);
    }
  }

  function handleInjectionOrderDragOver(event) {
    const target = event.target.closest('.injection-order-item[data-injection-order-id]');
    if (!target || !el['injection-order-list'].contains(target) || !draggedInjectionOrderId || target.dataset.injectionOrderId === draggedInjectionOrderId) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    draggedInjectionOrderDropAfter = event.clientY >= rect.top + rect.height / 2;
    markInjectionOrderDropTarget(target, draggedInjectionOrderDropAfter);
  }

  function handleInjectionOrderDrop(event) {
    const target = event.target.closest('.injection-order-item[data-injection-order-id]');
    if (!target || !el['injection-order-list'].contains(target) || !draggedInjectionOrderId) return;
    event.preventDefault();
    const sourceId = draggedInjectionOrderId;
    const targetId = target.dataset.injectionOrderId;
    const placeAfter = draggedInjectionOrderDropAfter;
    handleInjectionOrderDragEnd();
    moveInjectionOrderItemRelative(sourceId, targetId, placeAfter);
  }

  function handleInjectionOrderDragEnd() {
    draggedInjectionOrderId = '';
    draggedInjectionOrderDropAfter = false;
    clearInjectionOrderDragClasses();
  }

  function handleInjectionOrderPointerDown(event) {
    if (event.pointerType === 'mouse' || event.button !== 0 || event.isPrimary === false) return;
    const handle = event.target.closest('.injection-order-handle');
    const item = handle?.closest('.injection-order-item[data-injection-order-id]');
    if (!handle || !item) return;
    injectionOrderPointerState = {
      pointerId: event.pointerId,
      itemId: item.dataset.injectionOrderId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: '',
      placeAfter: false,
      moved: false,
      captureElement: handle
    };
    item.classList.add('is-dragging');
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  }

  function handleInjectionOrderPointerMove(event) {
    const state = injectionOrderPointerState;
    if (!state || event.pointerId !== state.pointerId) return;
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (!state.moved && distance < 6) return;
    state.moved = true;
    event.preventDefault();

    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('.injection-order-item[data-injection-order-id]');
    if (!target || !el['injection-order-list'].contains(target) || target.dataset.injectionOrderId === state.itemId) {
      state.targetId = '';
      markInjectionOrderDropTarget(null, false);
      return;
    }

    const rect = target.getBoundingClientRect();
    state.targetId = target.dataset.injectionOrderId;
    state.placeAfter = event.clientY >= rect.top + rect.height / 2;
    markInjectionOrderDropTarget(target, state.placeAfter);

    const edge = 56;
    if (event.clientY < edge) window.scrollBy?.({ top: -12, behavior: 'auto' });
    else if (event.clientY > window.innerHeight - edge) window.scrollBy?.({ top: 12, behavior: 'auto' });
  }

  function finishInjectionOrderPointerDrag(event, performMove) {
    const state = injectionOrderPointerState;
    if (!state || event.pointerId !== state.pointerId) return;
    const { itemId, targetId, placeAfter, moved, captureElement } = state;
    injectionOrderPointerState = null;
    try { captureElement?.releasePointerCapture?.(event.pointerId); } catch {}
    clearInjectionOrderDragClasses();
    if (performMove && moved && targetId) moveInjectionOrderItemRelative(itemId, targetId, placeAfter);
  }

  function handleInjectionOrderPointerUp(event) {
    finishInjectionOrderPointerDrag(event, true);
  }

  function handleInjectionOrderPointerCancel(event) {
    finishInjectionOrderPointerDrag(event, false);
  }

  function addInjectionOrderFromSettings() {
    addInjectionOrderItem(el['injection-order-side'].value, el['injection-order-site'].value);
  }

  function resetInjectionOrderFromSettings() {
    if (!window.confirm('Przywrócić domyślną kolejność miejsc wkłucia dla aktywnego profilu?')) return;
    resetInjectionOrder();
  }

  const SETTINGS_SECTIONS = new Set([
    'profiles', 'treatment', 'injection-order', 'ampoules',
    'reminders', 'voice', 'data', 'permissions-info'
  ]);
  let activeSettingsSection = 'profiles';
  let settingsDetailOpen = false;

  function isMobileSettingsLayout() {
    return Boolean(window.matchMedia?.('(max-width: 820px)').matches);
  }

  function handleSettingsCategoryClick(event) {
    const button = event.target.closest('[data-settings-target]');
    if (!button) return;
    openSettingsSection(button.dataset.settingsTarget);
  }

  function openSettingsSection(section, { focus = true } = {}) {
    if (!SETTINGS_SECTIONS.has(section)) section = 'profiles';
    if (activeView !== 'more') switchView('more');
    activeSettingsSection = section;
    settingsDetailOpen = true;
    renderSettingsNavigation();
    if (focus) {
      window.setTimeout(() => {
        const panel = document.querySelector(`[data-settings-panel="${section}"]`);
        if (isMobileSettingsLayout()) {
          el['settings-section-back-button']?.focus({ preventScroll: true });
          el['settings-section-back-button']?.scrollIntoView({ block: 'start', behavior: 'auto' });
        } else {
          panel?.querySelector('input, select, button, [tabindex]')?.focus({ preventScroll: false });
          panel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }, 40);
    }
  }

  function showSettingsOverview({ focus = true } = {}) {
    settingsDetailOpen = false;
    renderSettingsNavigation();
    if (focus) {
      window.setTimeout(() => {
        el['settings-category-list']?.querySelector(`[data-settings-target="${activeSettingsSection}"]`)?.focus({ preventScroll: true });
        el['settings-layout']?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 30);
    }
  }

  function renderSettingsNavigation() {
    if (!el['settings-layout'] || !el['settings-category-list'] || !el['settings-panels']) return;
    const mobile = isMobileSettingsLayout();
    const showDetail = !mobile || settingsDetailOpen;
    el['settings-layout'].classList.toggle('is-mobile-detail', mobile && settingsDetailOpen);
    el['settings-layout'].classList.toggle('is-mobile-overview', mobile && !settingsDetailOpen);
    el['settings-section-back-button'].classList.toggle('is-hidden', !(mobile && settingsDetailOpen));

    el['settings-category-list'].querySelectorAll('[data-settings-target]').forEach((button) => {
      const active = button.dataset.settingsTarget === activeSettingsSection;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = 0;
    });

    el['settings-panels'].querySelectorAll('[data-settings-panel]').forEach((panel) => {
      const active = panel.dataset.settingsPanel === activeSettingsSection;
      panel.hidden = !(showDetail && active);
      panel.setAttribute('aria-hidden', showDetail && active ? 'false' : 'true');
    });
  }

  function handleSettingsLayoutChange() {
    renderSettingsNavigation();
  }
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
  function renderAll() {
    renderProfileControls();
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
    renderTodayDashboard();
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
    el['suggested-place'].textContent = suggestion.side && suggestion.site
      ? capitalize(formatPlace(suggestion.side, suggestion.site))
      : 'Brak aktywnego miejsca';

    const ampouleInfo = getAmpouleInfo();
    renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting });
  }

  function renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting }) {
    renderMainTodayMetrics({ todayEntry, suggestion, ampouleInfo });
    const hasSuggestion = Boolean(suggestion?.side && suggestion?.site);
    const suggestedPlace = hasSuggestion ? capitalize(formatPlace(suggestion.side, suggestion.site)) : 'brak aktywnego miejsca';
    const doseText = `${formatDose(data.settings.defaultDose)} ${data.settings.unit}`;

    el['recommended-save-button'].classList.remove('is-hidden');
    el['recommended-save-button'].disabled = false;
    el['recommended-edit-button'].classList.toggle('is-hidden', Boolean(todayEntry));
    el['recommended-skip-button'].classList.toggle('is-hidden', Boolean(todayEntry));
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
    } else if (!hasSuggestion) {
      el['main-action-heading'].textContent = 'Brak aktywnych miejsc wkłucia';
      el['main-action-text'].textContent = suggestionExplanation(suggestion);
      el['recommended-save-button'].textContent = 'Otwórz miejsca wkłucia';
    } else {
      el['main-action-heading'].textContent = `Proponowane miejsce: ${suggestedPlace}`;
      el['main-action-text'].textContent = `Dawka: ${doseText} · godz. ${data.settings.defaultTime}.`;
      el['recommended-save-button'].textContent = 'Potwierdź podanie';
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
    calendarProfileScope = populateProfileScopeSelect(el['calendar-profile-filter'], calendarProfileScope, 'Wszystkie dzieci');
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const scopedProfiles = getProfilesForScope(calendarProfileScope);
    const scopedRecords = getScopedEntryRecords(calendarProfileScope);
    el['calendar-month-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(calendarCursor));
    el['calendar-scope-label'].textContent = profileScopeDescription(calendarProfileScope, scopedRecords.length);
    renderCalendarProfileLegend(scopedProfiles);

    const firstVisible = new Date(year, month, 1 - mondayIndex(new Date(year, month, 1).getDay()));
    const entriesByDate = groupScopedEntriesByDate(scopedRecords);
    let html = '';

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstVisible);
      date.setDate(firstVisible.getDate() + index);
      const iso = localDateISO(date);
      const records = entriesByDate.get(iso) || [];
      const classes = ['calendar-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (iso === selectedCalendarDate) classes.push('is-selected');
      if (iso === localDateISO()) classes.push('is-today');
      const markers = records.slice(0, 5).map(({ profile, entry }) => `<i class="day-marker day-marker--${entry.status} profile-color-dot" data-profile-color="${escapeHtml(profile.color)}" title="${escapeHtml(profile.name)}: ${entry.status === 'given' ? 'podano' : 'pominięto'}" aria-hidden="true"></i>`).join('');
      const more = records.length > 5 ? `<span class="day-marker-more" aria-hidden="true">+${records.length - 5}</span>` : '';
      const statusText = records.length
        ? `, ${records.length} ${plural(records.length, 'wpis', 'wpisy', 'wpisów')}`
        : ', brak wpisu';
      html += `
        <button class="${classes.join(' ')}" type="button" role="gridcell" data-date="${iso}" aria-label="${escapeHtml(formatDateLong(iso) + statusText)}" aria-selected="${iso === selectedCalendarDate}">
          <span class="day-number">${date.getDate()}</span>
          <span class="day-markers">${markers}${more}</span>
        </button>
      `;
    }

    el['calendar-grid'].innerHTML = html;
    el['calendar-grid'].querySelectorAll('[data-date]').forEach((button) => {
      button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
    });
  }

  function renderCalendarProfileLegend(profiles) {
    el['calendar-profile-legend'].innerHTML = profiles.length > 1
      ? profiles.map((profile) => `<span><i class="day-marker day-marker--given profile-color-dot" data-profile-color="${escapeHtml(profile.color)}"></i>${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</span>`).join('')
      : '';
    el['calendar-profile-legend'].classList.toggle('is-hidden', profiles.length <= 1);
  }

  function renderSelectedDay() {
    el['selected-day-label'].textContent = capitalize(formatDateLong(selectedCalendarDate));
    const records = getScopedEntryRecords(calendarProfileScope).filter(({ entry }) => entry.date === selectedCalendarDate);
    const targetProfile = getCalendarEntryTargetProfile();
    const targetEntry = targetProfile?.entries.find((entry) => entry.date === selectedCalendarDate) || null;
    el['add-for-selected-day'].textContent = targetEntry ? `Edytuj: ${targetProfile.name}` : `Dodaj: ${targetProfile?.name || getActiveProfile().name}`;
    if (!records.length) {
      el['selected-day-entries'].innerHTML = '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania dla wybranego zakresu.</span></div>';
      return;
    }
    el['selected-day-entries'].innerHTML = records.map(({ profile, entry }) => `
      <article class="day-entry-card" data-profile-color="${escapeHtml(profile.color)}">
        <div class="day-entry-profile">
          <span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
        </div>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Dawka pominięta'}</strong>
        <div class="day-entry-card-meta">
          <span>${escapeHtml(entry.time)}</span>
          <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'bez dawki'}</span>
          <span>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span>
        </div>
        ${entry.note ? `<span class="muted">${escapeHtml(entry.note)}</span>` : ''}
        <button class="text-button" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">Edytuj wpis</button>
      </article>
    `).join('');
  }

  function renderHistory() {
    historyProfileScope = populateProfileScopeSelect(el['history-profile-filter'], historyProfileScope, 'Wszystkie dzieci');
    const query = normalizeText(el['history-search']?.value || '');
    const status = el['status-filter']?.value || 'all';
    const site = el['site-filter']?.value || 'all';

    const entries = getScopedEntryRecords(historyProfileScope, { descending: true }).filter(({ profile, entry }) => {
      if (status !== 'all' && entry.status !== status) return false;
      if (site !== 'all' && entry.site !== site) return false;
      if (!query) return true;
      const haystack = normalizeText([
        profile.name, entry.date, formatDateShort(entry.date), entry.time, entry.dose, entry.unit,
        entry.side, entry.site, formatPlace(entry.side, entry.site), entry.note,
        entry.status === 'given' ? 'podano' : 'pominięto'
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    });

    el['history-scope-label'].textContent = profileScopeDescription(historyProfileScope, entries.length);
    el['history-table-body'].innerHTML = entries.map(({ profile, entry }) => `
      <tr>
        <td><span class="history-profile-cell"><span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span><strong>${escapeHtml(profile.name)}</strong></span></td>
        <td><strong>${escapeHtml(formatDateShort(entry.date))}</strong><br><span class="muted">${escapeHtml(entry.time)}</span></td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td><span class="status-pill status-pill--${entry.status}">${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span></td>
        <td>${entry.note ? escapeHtml(entry.note) : '<span class="muted">—</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="table-action" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">Edytuj</button>
            <button class="table-action table-action--danger" type="button" data-delete-id="${entry.id}" data-entry-profile-id="${profile.id}">Usuń</button>
          </div>
        </td>
      </tr>
    `).join('');

    el['history-empty'].classList.toggle('is-hidden', entries.length > 0);
  }

  function renderSettings() {
    const activeProfile = getActiveProfile();
    const activeAmpoule = getActiveAmpoule();
    el['settings-profile-avatar'].textContent = activeProfile.icon;
    el['settings-profile-avatar'].dataset.profileColor = activeProfile.color;
    el['settings-profile-name'].textContent = activeProfile.name;
    el['settings-profile-note'].textContent = `Te ustawienia, ampułki, przypomnienia, historia i raporty dotyczą wyłącznie profilu ${activeProfile.name}.`;
    el['settings-dose'].value = data.settings.defaultDose;
    el['settings-unit'].value = data.settings.unit;
    el['settings-time'].value = data.settings.defaultTime;
    el['ampoule-start-date'].value = activeAmpoule?.startDate || data.settings.ampouleStartDate || '';
    el['ampoule-start-number'].value = activeAmpoule?.number || data.settings.ampouleStartNumber || 1;
    el['ampoule-volume'].value = activeAmpoule?.volumeMl || data.settings.ampouleVolumeMl || DEFAULT_AMPOULE_VOLUME_ML;
    el['ampoule-dose-ml'].value = data.settings.ampouleDoseMl || '';
    el['ampoule-max-open-days'].value = data.settings.ampouleMaxOpenDays || '';
    renderAmpouleManagement();
    renderInjectionOrderSettings();
    el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
    el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
    el['reminder-enabled-toggle'].checked = Boolean(data.settings.reminderEnabled);
    el['reminder-time'].value = data.settings.reminderTime || '21:00';
    el['clear-data-button'].textContent = `Usuń wszystkie wpisy profilu ${activeProfile.name}`;
    renderReportConfiguration();
    updatePermissionStatuses();
    renderSettingsNavigation();
  }

  function switchView(view, { updateHash = true, focus = true, smooth = true } = {}) {
    if (!['today', 'calendar', 'history', 'more'].includes(view)) return;
    const previousView = activeView;
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
    if (view === 'more') {
      if (previousView !== 'more') settingsDetailOpen = false;
      renderSettings();
    }
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
    el['place-picker-options'].innerHTML = ROTATION.map(([side, site]) => {
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
    const profile = getCalendarEntryTargetProfile();
    if (profile && profile.id !== data.activeProfileId && !activateProfileForEntryAction(profile.id)) return;
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
    const entryId = existingById?.id || createId();
    const entry = sanitizeEntry({
      id: entryId,
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

    const undoOperation = captureEntryUndoOperation(entry.id, existingById);
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
    entry.ampouleDoseMl = getEntryAmpouleDoseSnapshot(entry, ampouleId, existingById);
    finalizeEntryUndoOperation(undoOperation, null);
    if (entry.status === 'given') {
      const capacity = getAmpouleCapacityForEntry(entry, ampouleId, existingById);
      if (!capacity.sufficient) {
        applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
        showInsufficientAmpouleError(capacity, existingById);
        closeEntryDialog();
        openAmpouleSettings();
        return;
      }
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    closeEntryDialog();
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.';
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function captureEntryUndoOperation(entryId, previousEntry = null) {
    const profile = getActiveProfile();
    return {
      profileId: profile.id,
      entryId,
      previousEntry: previousEntry ? structuredCloneSafe(previousEntry) : null,
      previousActiveAmpouleId: profile.activeAmpouleId || '',
      ampouleIdsBefore: profile.ampoules.map((ampoule) => ampoule.id),
      createdAmpoules: [],
      afterEntryUpdatedAt: ''
    };
  }

  function finalizeEntryUndoOperation(operation, entry) {
    const profile = data.profiles.find((item) => item.id === operation.profileId);
    if (!profile) return operation;
    const previousIds = new Set(operation.ampouleIdsBefore);
    operation.createdAmpoules = profile.ampoules
      .filter((ampoule) => !previousIds.has(ampoule.id))
      .map((ampoule) => structuredCloneSafe(ampoule));
    operation.afterEntryUpdatedAt = entry?.updatedAt || '';
    return operation;
  }

  function getUndoProfileAmpouleRemainingMl(profile, ampouleId) {
    const ampoule = profile.ampoules.find((item) => item.id === ampouleId);
    if (!ampoule) return 0;
    const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
    const used = profile.entries
      .filter((entry) => entry.status === 'given' && entry.ampouleId === ampouleId)
      .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
    return Math.max(0, decimalToNumber(ampoule.volumeMl) - used);
  }

  function reconcileUndoProfileAmpouleStatuses(profile) {
    profile.ampoules.forEach((ampoule) => {
      if (getUndoProfileAmpouleRemainingMl(profile, ampoule.id) <= 0.000001) {
        ampoule.status = 'finished';
        if (profile.activeAmpouleId === ampoule.id) profile.activeAmpouleId = '';
      } else if (profile.activeAmpouleId === ampoule.id) {
        ampoule.status = 'active';
      } else if (ampoule.status === 'active' || ampoule.status === 'finished') {
        ampoule.status = 'paused';
      }
    });
  }

  function createdAmpouleWasNotChanged(current, snapshot) {
    return Boolean(current && snapshot
      && current.id === snapshot.id
      && current.number === snapshot.number
      && current.startDate === snapshot.startDate
      && current.volumeMl === snapshot.volumeMl
      && current.doseMl === snapshot.doseMl
      && current.createdAt === snapshot.createdAt
      && current.updatedAt === snapshot.updatedAt);
  }

  function applyEntryUndoOperation(operation, { persist = true, announce = true, requireCurrentMatch = true, forceRemoveCreatedAmpoules = false } = {}) {
    if (!operation?.profileId || !operation.entryId) return false;
    const profileIndex = data.profiles.findIndex((profile) => profile.id === operation.profileId);
    if (profileIndex < 0) return false;
    const profile = data.profiles[profileIndex];
    const profileBeforeUndo = structuredCloneSafe(profile);
    const currentIndex = profile.entries.findIndex((entry) => entry.id === operation.entryId);
    const currentEntry = currentIndex >= 0 ? profile.entries[currentIndex] : null;
    if (requireCurrentMatch && (!currentEntry || currentEntry.updatedAt !== operation.afterEntryUpdatedAt)) {
      if (announce) showToast('Nie można cofnąć, ponieważ ten wpis został już później zmieniony.', 'error', 6500);
      return false;
    }

    if (operation.previousEntry) {
      if (currentIndex >= 0) profile.entries[currentIndex] = structuredCloneSafe(operation.previousEntry);
      else profile.entries.push(structuredCloneSafe(operation.previousEntry));
    } else if (currentIndex >= 0) {
      profile.entries.splice(currentIndex, 1);
    }

    const removedIds = new Set();
    for (const snapshot of operation.createdAmpoules || []) {
      const currentAmpoule = profile.ampoules.find((ampoule) => ampoule.id === snapshot.id);
      const stillUsed = profile.entries.some((entry) => entry.ampouleId === snapshot.id);
      if (!stillUsed && currentAmpoule && (forceRemoveCreatedAmpoules || createdAmpouleWasNotChanged(currentAmpoule, snapshot))) {
        profile.ampoules = profile.ampoules.filter((ampoule) => ampoule.id !== snapshot.id);
        removedIds.add(snapshot.id);
      }
    }

    if (!profile.activeAmpouleId || removedIds.has(profile.activeAmpouleId)) {
      const previous = profile.ampoules.find((ampoule) => ampoule.id === operation.previousActiveAmpouleId);
      if (previous && getUndoProfileAmpouleRemainingMl(profile, previous.id) > 0.000001) {
        profile.activeAmpouleId = previous.id;
      } else if (removedIds.has(profile.activeAmpouleId)) {
        profile.activeAmpouleId = '';
      }
    }
    reconcileUndoProfileAmpouleStatuses(profile);

    if (persist && !persistData()) {
      data.profiles[profileIndex] = profileBeforeUndo;
      return false;
    }
    if (data.activeProfileId === operation.profileId) resetQuickDraftForToday();
    if (persist) renderAll();
    if (announce) showToast('Cofnięto tylko ostatni zapis podania.', 'success');
    return true;
  }

  function showEntryUndo(message, operation) {
    showActionToast(message, 'Cofnij', () => applyEntryUndoOperation(operation), 'success', 9000);
  }

  function getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry = null) {
    if (entryLike?.status !== 'given') return '';
    if (entryLike.unit === 'ml') return normalizePositiveDecimal(entryLike.dose);
    const historical = normalizePositiveDecimal(existingEntry?.ampouleDoseMl);
    if (historical) return historical;
    const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
    return normalizePositiveDecimal(ampoule?.doseMl) || normalizePositiveDecimal(getConfiguredAmpouleDoseMl());
  }

  function getAmpouleCapacityForEntry(entryLike, ampouleId, existingEntry = null) {
    const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
    const requiredMl = decimalToNumber(getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry));
    if (!ampoule || entryLike?.status !== 'given' || requiredMl <= 0) {
      return { ampoule, requiredMl, availableMl: 0, sufficient: false };
    }
    let availableMl = getAmpouleRemainingMl(ampoule.id);
    if (existingEntry?.status === 'given' && existingEntry.ampouleId === ampoule.id) {
      availableMl += getEntryAmpouleDoseMl(existingEntry, decimalToNumber(ampoule.doseMl));
    }
    return {
      ampoule,
      requiredMl,
      availableMl,
      sufficient: requiredMl <= availableMl + 0.000001
    };
  }

  function showInsufficientAmpouleError(capacity, existingEntry = null) {
    const ampouleNumber = capacity.ampoule?.number || '?';
    const action = existingEntry
      ? 'Zmniejsz zużycie tej dawki albo popraw dane przypisanej ampułki.'
      : 'Odłóż obecną ampułkę i rozpocznij nową przed zapisaniem zastrzyku.';
    showToast(`Ampułka ${ampouleNumber} ma tylko ${formatMl(capacity.availableMl)} ml, a podanie wymaga ${formatMl(capacity.requiredMl)} ml. ${action}`, 'error', 9000);
  }

  function confirmRecommendedInjection() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    if (existing) {
      openEntryDialog(existing.id);
      return;
    }
    const suggestion = getSuggestedPlace(new Date());
    if (!suggestion.side || !suggestion.site) {
      showToast('Najpierw włącz co najmniej jedno miejsce wkłucia.', 'error', 6500);
      openSettingsSection('injection-order');
      return;
    }
    const dose = normalizeDose(data.settings.defaultDose);
    if (!dose) {
      showToast('Najpierw ustaw prawidłową dawkę domyślną.', 'error');
      openSettingsSection('treatment');
      return;
    }

    const entryId = createId();
    const undoOperation = captureEntryUndoOperation(entryId, null);
    const ampouleId = ensureActiveAmpouleForDate(today);
    if (ampouleId === null) {
      showToast('Wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
      openAmpouleSettings();
      return;
    }
    if (!ampouleId) {
      showToast('Ustaw pojemność i zużycie ampułki w ml, aby potwierdzić podanie.', 'error', 6500);
      openAmpouleSettings();
      return;
    }
    finalizeEntryUndoOperation(undoOperation, null);

    const entry = sanitizeEntry({
      id: entryId,
      date: today,
      time: data.settings.defaultTime,
      dose,
      unit: data.settings.unit,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given',
      note: '',
      ampouleId,
      ampouleDoseMl: getEntryAmpouleDoseSnapshot({ status: 'given', unit: data.settings.unit, dose }, ampouleId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showToast('Nie udało się przygotować dzisiejszego wpisu.', 'error');
      return;
    }
    const capacity = getAmpouleCapacityForEntry(entry, ampouleId);
    if (!capacity.sufficient) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showInsufficientAmpouleError(capacity);
      openAmpouleSettings();
      return;
    }

    data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    selectedCalendarDate = today;
    calendarCursor = startOfMonth(parseISODate(today));
    resetQuickDraftForToday();
    renderAll();
    const message = `Podano: ${formatPlace(entry.side, entry.site)}, ${formatDose(entry.dose)} ${entry.unit}.`;
    showEntryUndo(message, undoOperation);
    speakIfEnabled(message);
  }

  function openRecommendedEntryEditor() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    if (existing) {
      openEntryDialog(existing.id, null, 'entry-note');
      return;
    }
    const suggestion = getSuggestedPlace(new Date());
    if (!suggestion.side || !suggestion.site) {
      showToast('Brak aktywnego miejsca w kolejności.', 'error');
      openSettingsSection('injection-order');
      return;
    }
    openEntryDialog(null, createDefaultDraft({
      date: today,
      time: data.settings.defaultTime,
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given'
    }), 'entry-note');
  }

  function confirmSkippedToday() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    const entryId = existing?.id || createId();
    const undoOperation = captureEntryUndoOperation(entryId, existing);
    const entry = sanitizeEntry({
      id: entryId,
      date: today,
      time: localTime(),
      status: 'skipped',
      note: existing?.note || '',
      ampouleId: existing?.ampouleId || getActiveAmpoule()?.id || '',
      ampouleDoseMl: '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) return;
    const index = existing ? data.entries.findIndex((item) => item.id === existing.id) : -1;
    if (index >= 0) data.entries[index] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showEntryUndo(existing ? 'Dzisiejszy wpis zmieniono na pominięcie.' : 'Dzisiejszą dawkę oznaczono jako pominiętą.', undoOperation);
  }

  function openAmpouleSettings() {
    openSettingsSection('ampoules', { focus: false });
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
      showToast(`Ampułka ${active.number} jest już aktywna. Aby rozpocząć kolejną, użyj przycisku „Odłóż aktywną i rozpocznij nową”.`, 'error', 7000);
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

  function startNewAmpoule() {
    const values = readAmpouleFormValues();
    if (!values.doseMl) {
      showToast('Najpierw ustaw zużycie na jedno podanie w ml.', 'error');
      return;
    }

    const active = getActiveAmpoule();
    const hadActiveAmpoule = Boolean(active);
    if (active && getAmpouleRemainingMl(active.id) > 0.000001) active.status = 'paused';
    else if (active) active.status = 'finished';

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
    if (!persistData()) return;
    renderAll();
    showToast(hadActiveAmpoule
      ? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia ampułka została odłożona i możesz ją później wznowić z listy odłożonych.`
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
    if (active && active.id !== target.id) active.status = getAmpouleRemainingMl(active.id) > 0.000001 ? 'paused' : 'finished';
    target.status = 'active';
    target.updatedAt = new Date().toISOString();
    data.activeAmpouleId = target.id;
    data.settings.ampouleStartDate = target.startDate;
    data.settings.ampouleStartNumber = target.number;
    data.settings.ampouleVolumeMl = target.volumeMl;
    data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : target.doseMl;
    if (!persistData()) return;
    renderAll();
    showToast(active && active.id !== target.id
      ? `Wznowiono ampułkę ${target.number}. Poprzednio aktywna ampułka została odłożona.`
      : `Wznowiono ampułkę ${target.number}.`, 'success', 8000);
  }

  function formatPausedAmpouleShortList(ampoules) {
    if (!ampoules.length) return 'brak';
    return ampoules.map((ampoule) => `nr ${ampoule.number} (${formatMl(getAmpouleRemainingMl(ampoule.id))} ml)`).join(', ');
  }

  function renderAmpouleManagement() {
    const active = getActiveAmpoule();
    const paused = getOpenPausedAmpoules();
    const startTodayButtons = [el['ampoule-start-today-button'], el['ampoule-start-main-button']].filter(Boolean);
    startTodayButtons.forEach((button) => {
      button.disabled = Boolean(active);
      button.title = active
        ? `Ampułka ${active.number} jest już aktywna. Użyj przycisku „Odłóż aktywną i rozpocznij nową”.`
        : 'Rozpocznij pierwszą ampułkę z dzisiejszą datą';
    });

    const pausedListShort = formatPausedAmpouleShortList(paused);

    if (active) {
      const openWarning = isAmpouleOpenTooLong(active) ? ' Przekroczono ustawiony limit czasu od otwarcia.' : '';
      const baseSummary = `Aktywna: ampułka ${active.number}, pozostało około ${formatMl(getAmpouleRemainingMl(active.id))} ml.${openWarning}`;
      el['ampoule-management-summary'].textContent = paused.length
        ? `${baseSummary} Odłożone: ${pausedListShort}.`
        : `${baseSummary} Brak odłożonych ampułek.`;
      el['ampoule-new-button'].textContent = 'Odłóż aktywną i rozpocznij nową';
      if (el['ampoule-new-help']) {
        el['ampoule-new-help'].textContent = paused.length
          ? `Po kliknięciu ampułka ${active.number} zostanie odłożona. Poniżej masz już odłożone: ${pausedListShort}. Do każdej możesz wrócić przyciskiem „Wznów”.`
          : `Po kliknięciu ampułka ${active.number} zostanie odłożona. Zaraz rozpocznie się nowa ampułka, a tę obecną potem wznowisz z listy odłożonych poniżej.`;
      }
    } else if (paused.length) {
      el['ampoule-management-summary'].textContent = `Brak aktywnej ampułki. Odłożone: ${pausedListShort}. Wybierz „Wznów” przy odpowiedniej ampułce albo rozpocznij nową.`;
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
      if (el['ampoule-new-help']) el['ampoule-new-help'].textContent = 'Masz odłożone ampułki. Możesz je wznowić z listy poniżej albo rozpocząć nową.';
    } else {
      el['ampoule-management-summary'].textContent = 'Nie ma aktywnej ani odłożonej ampułki.';
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
      if (el['ampoule-new-help']) el['ampoule-new-help'].textContent = 'Gdy odłożysz aktywną ampułkę, pojawi się tu na liście i będzie można ją później wznowić.';
    }

    const visible = [...data.ampoules]
      .filter((ampoule) => ampoule.status !== 'finished' || ampoule.id === data.activeAmpouleId)
      .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.number - a.number));
    el['ampoule-list'].innerHTML = visible.length ? visible.map((ampoule) => {
      const remaining = getAmpouleRemainingMl(ampoule.id);
      const status = ampoule.id === data.activeAmpouleId ? 'Aktywna' : 'Odłożona';
      const openDays = getAmpouleOpenDays(ampoule);
      const tooLong = isAmpouleOpenTooLong(ampoule);
      const action = ampoule.id !== data.activeAmpouleId && remaining > 0.000001
        ? `<button class="mini-button" type="button" data-resume-ampoule-id="${ampoule.id}">Wznów</button>`
        : '';
      return `<div class="ampoule-list-item${tooLong ? ' ampoule-list-item--warning' : ''}"><div><strong>Ampułka ${ampoule.number}</strong><span>${status} · start ${formatDateShort(ampoule.startDate)} · otwarta ${openDays} ${plural(openDays, 'dzień', 'dni', 'dni')} · pozostało ${formatMl(remaining)} ml${tooLong ? ' · przekroczony limit' : ''}</span></div>${action}</div>`;
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

    const entryId = existingById?.id || createId();
    const undoOperation = captureEntryUndoOperation(entryId, existingById);
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
    finalizeEntryUndoOperation(undoOperation, null);

    const entry = sanitizeEntry({
      ...quickDraft,
      id: entryId,
      dose: quickDraft.status === 'given' ? quickDraft.dose : '',
      unit: quickDraft.status === 'given' ? quickDraft.unit : '',
      side: quickDraft.status === 'given' ? quickDraft.side : '',
      site: quickDraft.status === 'given' ? quickDraft.site : '',
      ampouleId,
      ampouleDoseMl: getEntryAmpouleDoseSnapshot(quickDraft, ampouleId, existingById),
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showToast('Przygotowany wpis zawiera nieprawidłowe dane.', 'error');
      return;
    }
    if (entry.status === 'given') {
      const capacity = getAmpouleCapacityForEntry(entry, ampouleId, existingById);
      if (!capacity.sufficient) {
        applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
        showInsufficientAmpouleError(capacity, existingById);
        openAmpouleSettings();
        return;
      }
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
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
    if (!suggestion.side || !suggestion.site) {
      showToast('Brak aktywnego miejsca w kolejności. Włącz co najmniej jedną pozycję.', 'error', 6500);
      openSettingsSection('injection-order');
      return;
    }
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

    const todayAmpoule = todayEntry?.ampouleId ? getAmpouleById(todayEntry.ampouleId) : null;
    const displayAmpoule = todayEntry?.status === 'given' && todayAmpoule
      ? todayAmpoule
      : (timeline.activeAmpoule || todayAmpoule);
    if (!displayAmpoule) {
      return {
        configured: false,
        reason: timeline.reason,
        volumeMl: timeline.volumeMl || decimalToNumber(data.settings.ampouleVolumeMl),
        doseMl: timeline.doseMl || getConfiguredAmpouleDoseMl(),
        startDate: timeline.startDate || data.settings.ampouleStartDate,
        pausedCount: getOpenPausedAmpoules().length
      };
    }

    const active = displayAmpoule;
    const activeRows = timeline.rows.filter((row) => row.ampouleId === active.id);
    const todayRow = [...activeRows].reverse().find((row) => row.entry.date === today);
    const latestRow = activeRows[activeRows.length - 1] || null;
    const currentRemaining = getAmpouleRemainingMl(active.id);
    const remainingBeforeToday = todayRow ? todayRow.remainingBefore : currentRemaining;
    const remainingAfterToday = todayRow ? todayRow.remainingAfter : currentRemaining;
    const todayDoseMl = todayRow ? todayRow.doseMl : 0;
    const approximateDosesLeftAfterToday = Math.floor((remainingAfterToday + 0.000001) / decimalToNumber(active.doseMl));

    return {
      configured: true,
      reason: timeline.configured ? '' : timeline.reason,
      startDate: active.startDate,
      volumeMl: decimalToNumber(active.volumeMl),
      doseMl: decimalToNumber(active.doseMl),
      usedBeforeToday: Math.max(0, decimalToNumber(active.volumeMl) - remainingBeforeToday),
      currentRemaining,
      remainingBeforeToday,
      remainingAfterToday,
      ampouleNumber: active.number,
      ampouleStartDate: active.startDate,
      nextAmpouleStartDate: todayRow?.nextAmpouleStartDate || '',
      todayIsLast: Boolean(todayRow?.isLastDose),
      todayStartsNewAmpoule: Boolean(todayRow?.startsNewAmpoule),
      todayEntryStatus: todayEntry?.status || '',
      todayDoseMl,
      todayDoseNumber: todayRow?.doseNumber || 0,
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
    const historicalDoseMl = decimalToNumber(entry?.ampouleDoseMl);
    if (historicalDoseMl > 0) return historicalDoseMl;
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
          const doseNumber = isGiven ? givenCount + 1 : 0;
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
            doseNumber,
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
    return getSuggestedPlaceForProfile(getActiveProfile(), referenceDate);
  }

  function getSuggestedPlaceForProfile(profile, referenceDate = new Date()) {
    const order = sanitizeInjectionOrder(profile?.injectionOrder);
    const enabledIndexes = order
      .map((item, index) => item.enabled ? index : -1)
      .filter((index) => index >= 0);
    if (!enabledIndexes.length) {
      return {
        side: '', site: '', rotationItemId: '', reason: 'empty-order',
        basedOnEntryId: '', basedOnPlace: '', historyCount: 0
      };
    }

    const referenceMs = referenceDate.getTime();
    const history = [...(Array.isArray(profile?.entries) ? profile.entries : [])]
      .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`))
      .filter((entry) => {
      if (entry.status !== 'given' || !entry.side || !entry.site) return false;
      const value = dateTimeFromEntry(entry);
      return value && value.getTime() <= referenceMs;
    });

    if (!history.length) {
      const first = order[enabledIndexes[0]];
      return {
        side: first.side, site: first.site, rotationItemId: first.id,
        reason: 'first-dose', basedOnEntryId: '', basedOnPlace: '', historyCount: 0
      };
    }

    let cursor = -1;
    let lastMatched = false;
    let lastEntry = null;
    history.forEach((entry) => {
      lastEntry = entry;
      let matchedIndex = -1;
      for (let offset = 1; offset <= order.length; offset += 1) {
        const candidateIndex = (cursor + offset + order.length) % order.length;
        const candidate = order[candidateIndex];
        if (candidate.side === entry.side && candidate.site === entry.site) {
          matchedIndex = candidateIndex;
          break;
        }
      }
      if (matchedIndex >= 0) {
        cursor = matchedIndex;
        lastMatched = true;
      } else {
        cursor = -1;
        lastMatched = false;
      }
    });

    if (!lastMatched) {
      const first = order[enabledIndexes[0]];
      return {
        side: first.side, site: first.site, rotationItemId: first.id,
        reason: 'last-place-not-in-order', basedOnEntryId: lastEntry?.id || '',
        basedOnPlace: lastEntry ? formatPlace(lastEntry.side, lastEntry.site) : '',
        historyCount: history.length
      };
    }

    let nextIndex = enabledIndexes[0];
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidateIndex = (cursor + offset) % order.length;
      if (order[candidateIndex].enabled) {
        nextIndex = candidateIndex;
        break;
      }
    }
    const next = order[nextIndex];
    return {
      side: next.side, site: next.site, rotationItemId: next.id,
      reason: 'after-last-given', basedOnEntryId: lastEntry?.id || '',
      basedOnPlace: lastEntry ? formatPlace(lastEntry.side, lastEntry.site) : '',
      historyCount: history.length
    };
  }

  function suggestionExplanation(suggestion) {
    if (!suggestion?.side || !suggestion?.site) {
      return 'Brak aktywnych miejsc w kolejności. Włącz co najmniej jedną pozycję w ustawieniach miejsc wkłucia.';
    }
    if (suggestion.reason === 'first-dose') {
      return 'To pierwsza propozycja w historii tego profilu.';
    }
    if (suggestion.reason === 'last-place-not-in-order') {
      return `Ostatnie podane miejsce (${suggestion.basedOnPlace || 'nieznane'}) nie występuje już w kolejności. Propozycja zaczyna od pierwszego aktywnego miejsca.`;
    }
    if (suggestion.reason === 'after-last-given') {
      return `Kolejne aktywne miejsce po ostatnim rzeczywiście podanym zastrzyku: ${suggestion.basedOnPlace}. Pominięte dni nie przesuwają kolejności.`;
    }
    return '';
  }

  function dateTimeFromEntry(entry) {
    if (!entry?.date || !entry?.time || !isValidIsoDate(entry.date) || !isValidTime(entry.time)) return null;
    const [year, month, day] = entry.date.split('-').map(Number);
    const [hour, minute] = entry.time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  function normalizeProfileScope(scope) {
    if (scope === 'all') return 'all';
    const available = getAvailableProfiles();
    return available.some((profile) => profile.id === scope) ? scope : data.activeProfileId;
  }

  function populateProfileScopeSelect(select, scope, allLabel = 'Wszystkie dzieci') {
    const normalized = normalizeProfileScope(scope);
    if (!select) return normalized;
    const profiles = getAvailableProfiles();
    select.innerHTML = [
      `<option value="all">${escapeHtml(allLabel)}</option>`,
      ...profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</option>`)
    ].join('');
    select.value = normalized;
    return select.value || data.activeProfileId;
  }

  function getProfilesForScope(scope) {
    const normalized = normalizeProfileScope(scope);
    return normalized === 'all'
      ? getAvailableProfiles()
      : getAvailableProfiles().filter((profile) => profile.id === normalized);
  }

  function getScopedEntryRecords(scope, { descending = false, from = '', to = '' } = {}) {
    const records = [];
    getProfilesForScope(scope).forEach((profile) => {
      profile.entries.forEach((entry) => {
        if (from && entry.date < from) return;
        if (to && entry.date > to) return;
        records.push({ profile, entry });
      });
    });
    records.sort((left, right) => {
      const leftKey = `${left.entry.date}T${left.entry.time || '00:00'}`;
      const rightKey = `${right.entry.date}T${right.entry.time || '00:00'}`;
      const order = leftKey.localeCompare(rightKey);
      if (order !== 0) return descending ? -order : order;
      return left.profile.name.localeCompare(right.profile.name, 'pl');
    });
    return records;
  }

  function groupScopedEntriesByDate(records) {
    const map = new Map();
    records.forEach((record) => {
      if (!map.has(record.entry.date)) map.set(record.entry.date, []);
      map.get(record.entry.date).push(record);
    });
    return map;
  }

  function profileScopeDescription(scope, count) {
    const profiles = getProfilesForScope(scope);
    const label = scope === 'all' ? 'Wszystkie dzieci' : (profiles[0]?.name || getActiveProfile().name);
    return `${label} · ${count} ${plural(count, 'wpis', 'wpisy', 'wpisów')}`;
  }

  function getCalendarEntryTargetProfile() {
    if (calendarProfileScope !== 'all') return getProfilesForScope(calendarProfileScope)[0] || getActiveProfile();
    return getActiveProfile();
  }

  function handleCalendarProfileScopeChange() {
    calendarProfileScope = normalizeProfileScope(el['calendar-profile-filter'].value);
    renderCalendar();
    renderSelectedDay();
  }

  function handleHistoryProfileScopeChange() {
    historyProfileScope = normalizeProfileScope(el['history-profile-filter'].value);
    renderHistory();
  }

  function activateProfileForEntryAction(profileId) {
    const normalized = normalizeProfileScope(profileId);
    if (normalized === 'all') return false;
    if (normalized === data.activeProfileId) return true;
    if (!setActiveProfileId(normalized, { refresh: false })) {
      showToast('Nie można otworzyć wpisu tego profilu.', 'error');
      return false;
    }
    resetQuickDraftForToday();
    renderProfileControls();
    return true;
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
    const button = editButton || deleteButton;
    if (!button) return;
    if (!activateProfileForEntryAction(button.dataset.entryProfileId || data.activeProfileId)) return;
    if (editButton) openEntryDialog(editButton.dataset.editId);
    if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
  }

  function handleDayDetailsAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    if (!editButton) return;
    if (!activateProfileForEntryAction(editButton.dataset.entryProfileId || data.activeProfileId)) return;
    openEntryDialog(editButton.dataset.editId);
  }

  function deleteEntryFromDialog() {
    const id = el['entry-id'].value;
    if (id) deleteEntry(id, true);
  }

  function deleteEntry(id, closeDialogAfter = false) {
    const entry = data.entries.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Usunąć wpis z ${formatDateShort(entry.date)} dla profilu ${getActiveProfile().name}?`)) return;
    data.entries = data.entries.filter((item) => item.id !== id);
    reconcileAmpouleStatuses();
    if (!persistData()) return;
    if (closeDialogAfter) closeEntryDialog();
    resetQuickDraftForToday();
    renderAll();
    showToast('Wpis został usunięty.', 'success');
  }

  function saveSettings() {
    const dose = normalizeDose(el['settings-dose'].value);
    if (!dose) {
      showToast('Podaj prawidłową dawkę domyślną.', 'error');
      return;
    }
    data.settings.defaultDose = dose;
    data.settings.unit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : 'mg';
    data.settings.defaultTime = isValidTime(el['settings-time'].value) ? el['settings-time'].value : '20:00';
    const activeAmpoule = getActiveAmpoule();
    if (activeAmpoule && data.settings.unit === 'ml') {
      activeAmpoule.doseMl = normalizePositiveDecimal(dose);
      activeAmpoule.updatedAt = new Date().toISOString();
      reconcileAmpouleStatuses();
    }
    if (!persistData()) return;
    if (!quickDraftTouched && !quickDraft.id) resetQuickDraftForToday();
    renderAll();
    showToast(quickDraftTouched
      ? 'Dawka i godzina zostały zapisane. Przygotowany wpis pozostał bez zmian.'
      : 'Dawka i godzina zostały zapisane.', 'success');
  }

  function saveAmpouleSettings() {
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
    if (!persistData()) return;
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
    if (enabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
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
    scheduleDailyReminder();
    await syncReminderStateWithServiceWorker();
    await registerPeriodicReminder();
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
    const config = getReportConfiguration();
    if (!config) return;
    const frame = el['report-preview-frame'];
    frame.srcdoc = reportDocumentHtml(config);
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
    clearPendingImportPreview();
    renderAutomaticBackupState();
    openDataDialog(el['backup-dialog'], el['backup-panel-button']);
    window.setTimeout(() => el['export-json-button']?.focus(), 30);
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
    return suffixes.length ? `${row.ampouleNumber} — ${suffixes.join(', ')}` : String(row.ampouleNumber);
  }

  function formatReportRemainingCell(row) {
    if (!row) return '—';
    if (row.entry.status !== 'given') return `bez zmian, ${formatMl(row.remainingAfter)} ml`;
    return `${formatMl(row.remainingAfter)} ml`;
  }

  function ampouleReportSummary(info) {
    if (!info.configured) {
      if (info.reason === 'paused') return { number: '—', text: 'brak aktywnej ampułki; dostępna jest odłożona ampułka do wznowienia' };
      if (info.reason === 'finished') return { number: '—', text: 'poprzednia ampułka została zużyta' };
      return { number: '—', text: info.reason === 'dose' ? 'brak dawki w ml do obliczeń' : 'brak daty startu ampułki' };
    }
    if (info.todayIsLast) return { number: String(info.ampouleNumber), text: `start ${formatDateShort(info.ampouleStartDate)}, dzisiaj ostatni zastrzyk` };
    if (info.todayStartsNewAmpoule) return { number: String(info.ampouleNumber), text: `nowa ampułka od ${formatDateShort(info.ampouleStartDate)}, około ${formatMl(info.remainingAfterToday)} ml po dzisiejszej dawce` };
    return { number: String(info.ampouleNumber), text: `start ${formatDateShort(info.ampouleStartDate)}, około ${formatMl(info.remainingAfterToday)} ml po dzisiejszej dawce` };
  }

  function renderReportConfiguration() {
    reportProfileScope = populateProfileScopeSelect(el['report-profile-filter'], reportProfileScope, 'Wszystkie dzieci');
    if (el['report-include-ampoules'].checked === undefined) el['report-include-ampoules'].checked = true;
    renderReportConfigurationSummary();
  }

  function handleReportConfigurationChange() {
    reportProfileScope = normalizeProfileScope(el['report-profile-filter'].value);
    renderReportConfigurationSummary();
  }

  function renderReportConfigurationSummary() {
    const config = getReportConfiguration({ notify: false });
    if (!config) {
      el['report-scope-summary'].textContent = 'Nieprawidłowy zakres dat';
      return;
    }
    const ampoules = config.includeAmpoules ? 'z ampułkami' : 'bez ampułek';
    el['report-scope-summary'].textContent = `${config.scopeLabel} · ${config.periodText} · ${ampoules}`;
  }

  function getReportConfiguration({ notify = true } = {}) {
    const scope = normalizeProfileScope(el['report-profile-filter']?.value || reportProfileScope || data.activeProfileId);
    const from = isValidIsoDate(el['report-date-from']?.value) ? el['report-date-from'].value : '';
    const to = isValidIsoDate(el['report-date-to']?.value) ? el['report-date-to'].value : '';
    if (from && to && from > to) {
      if (notify) showToast('Data „od” nie może być późniejsza niż data „do”.', 'error');
      return null;
    }
    const profiles = getProfilesForScope(scope);
    const includeAmpoules = el['report-include-ampoules'] ? Boolean(el['report-include-ampoules'].checked) : true;
    const records = getScopedEntryRecords(scope, { from, to }).map(({ profile, entry }) => ({ profile, entry, ampouleRow: null }));
    if (includeAmpoules) {
      const rowsByProfile = new Map(profiles.map((profile) => [profile.id, getAmpouleRowsByEntryId(profile.id).rowsById]));
      records.forEach((record) => { record.ampouleRow = rowsByProfile.get(record.profile.id)?.get(record.entry.id) || null; });
    }
    const scopeLabel = scope === 'all' ? 'Wszystkie dzieci' : (profiles[0]?.name || getActiveProfile().name);
    const periodText = from || to
      ? `${from ? formatDateShort(from) : 'początek'} – ${to ? formatDateShort(to) : 'dzisiaj'}`
      : getReportPeriodText(records.map((record) => record.entry));
    return { scope, profiles, records, includeAmpoules, from, to, scopeLabel, periodText };
  }

  function getReportPeriodText(entries) {
    if (!entries.length) return 'brak wpisów';
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    return `${formatDateShort(sorted[0].date)} – ${formatDateShort(sorted[sorted.length - 1].date)}`;
  }

  function getReportColumns(config) {
    const columns = [];
    if (config.profiles.length > 1) columns.push({ key: 'profile', label: 'Dziecko', weight: 125 });
    columns.push(
      { key: 'date', label: 'Data podania', weight: 120 },
      { key: 'time', label: 'Godzina', weight: 80 },
      { key: 'dose', label: 'Dawka', weight: 100 },
      { key: 'place', label: 'Miejsce', weight: 165 },
      { key: 'status', label: 'Status', weight: 95 }
    );
    if (config.includeAmpoules) columns.push(
      { key: 'ampoule', label: 'Ampułka', weight: 115 },
      { key: 'remaining', label: 'Pozostało po wpisie', weight: 170 }
    );
    columns.push({ key: 'note', label: 'Uwagi', weight: 240 });
    return columns;
  }

  function getReportRecordValue(record, key) {
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
      note: entry.note || '—'
    };
    return values[key] ?? '—';
  }

  function getReportFilenameScope(config) {
    return config.scope === 'all' ? 'wszystkie-dzieci' : safeFilenamePart(config.scopeLabel);
  }

  function getReportFourthSummary(config) {
    if (config.profiles.length > 1) return { number: String(config.profiles.length), text: 'dzieci w raporcie' };
    if (!config.includeAmpoules) return { number: String(config.profiles.length), text: 'profil w raporcie' };
    return withProfileContext(config.profiles[0].id, () => ampouleReportSummary(getAmpouleInfo()));
  }

  function buildReportTableRows(config) {
    const columns = getReportColumns(config);
    return config.records.map((record) => `<tr>${columns.map((column) => `<td>${escapeHtml(getReportRecordValue(record, column.key))}</td>`).join('')}</tr>`).join('');
  }

  function buildReportBody() {
    return buildReportBodyForConfig(getReportConfiguration({ notify: false }));
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
      <div class="summary">
        <div><strong>${config.records.length}</strong><span>wszystkich wpisów</span></div>
        <div><strong>${given}</strong><span>podań</span></div>
        <div><strong>${skipped}</strong><span>pominiętych</span></div>
        <div><strong>${escapeHtml(fourth.number)}</strong><span>${escapeHtml(fourth.text)}</span></div>
      </div>
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
        <tbody>${buildReportTableRows(config) || `<tr><td colspan="${columns.length}">Brak wpisów.</td></tr>`}</tbody>
      </table>
      <p class="footer">Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.</p>`;
  }

  function reportDocumentHtml(config = getReportConfiguration({ notify: false })) {
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
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10px; }
        th, td { border: 1px solid #cfdce5; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #e9f7f4; }
        tr:nth-child(even) td { background: #f8fbfd; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        @media print { html, body { background: #fff; } body { padding: 0; } .report-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; } }
      </style></head><body><main class="report-sheet">${buildReportBodyForConfig(config)}</main></body></html>`;
  }

  async function exportPdf() {
    const config = getReportConfiguration();
    if (!config) return false;
    try {
      showToast('Tworzenie raportu PDF…');
      const blob = await createReportPdfBlob(config);
      downloadBlob(`dzienniczek-raport-${getReportFilenameScope(config)}-${localDateISO()}.pdf`, blob);
      showToast('Pobrano raport PDF.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć PDF:', error);
      showToast('Nie udało się utworzyć raportu PDF.', 'error');
      return false;
    }
  }

  async function createReportPdfBlob(config = getReportConfiguration()) {
    if (!config) throw new Error('Nieprawidłowa konfiguracja raportu.');
    const pageCanvases = renderReportPdfPages(config);
    const jpegPages = [];
    for (const canvas of pageCanvases) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Nie udało się utworzyć strony PDF.')), 'image/jpeg', 0.92);
      });
      jpegPages.push(new Uint8Array(await blob.arrayBuffer()));
    }
    return buildPdfFromJpegPages(jpegPages, 1587, 1123);
  }

  function getReportRowsForCanvas(config) {
    const columns = getReportColumns(config);
    return config.records.map((record) => columns.map((column) => getReportRecordValue(record, column.key)));
  }

  function renderReportPdfPages(config) {
    const width = 1587, height = 1123, margin = 58, tableWidth = width - margin * 2;
    const definitions = getReportColumns(config);
    const totalWeight = definitions.reduce((sum, column) => sum + column.weight, 0);
    const columns = definitions.map((column) => tableWidth * column.weight / totalWeight);
    const headers = definitions.map((column) => column.label);
    const rows = getReportRowsForCanvas(config);
    const fourth = getReportFourthSummary(config);
    const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const pages = [];
    let page = null, ctx = null, y = 0;

    const createPage = (firstPage) => {
      page = document.createElement('canvas'); page.width = width; page.height = height;
      ctx = page.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.textBaseline = 'top';
      if (firstPage) {
        ctx.fillStyle = '#17324d'; ctx.font = '700 38px Arial, sans-serif';
        ctx.fillText(`Dzienniczek Hormonu — ${config.scopeLabel}`, margin, margin);
        ctx.font = '20px Arial, sans-serif'; ctx.fillStyle = '#60768a';
        ctx.fillText(`Raport dla: ${config.scopeLabel}`, margin, margin + 54);
        ctx.fillText(`Raport wygenerowano: ${generated}`, margin, margin + 82);
        ctx.fillText(`Zakres wpisów: ${config.periodText}`, margin, margin + 110);
        drawPdfSummaryCards(ctx, margin, margin + 154, tableWidth, config.records, fourth);
        y = margin + 280;
      } else {
        ctx.font = '700 25px Arial, sans-serif'; ctx.fillStyle = '#17324d';
        ctx.fillText(`Dzienniczek Hormonu — ${config.scopeLabel} — ciąg dalszy`, margin, margin); y = margin + 48;
      }
      y = drawPdfTableHeader(ctx, margin, y, columns, headers); pages.push(page);
    };

    createPage(true);
    if (!rows.length) {
      drawPdfCellText(ctx, 'Brak wpisów.', margin + 10, y + 10, tableWidth - 20, 18, '#17324d', false);
      ctx.strokeStyle = '#cfdce5'; ctx.strokeRect(margin, y, tableWidth, 44);
    } else rows.forEach((row) => {
      const rowHeight = measurePdfRowHeight(ctx, row, columns);
      if (y + rowHeight > height - margin - 42) createPage(false);
      drawPdfTableRow(ctx, margin, y, columns, row, rowHeight); y += rowHeight;
    });
    pages.forEach((canvas, index) => {
      const pageCtx = canvas.getContext('2d'); pageCtx.font = '17px Arial, sans-serif'; pageCtx.fillStyle = '#60768a';
      pageCtx.fillText('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', margin, height - margin + 10);
      pageCtx.textAlign = 'right'; pageCtx.fillText(`Strona ${index + 1} z ${pages.length}`, width - margin, height - margin + 10); pageCtx.textAlign = 'left';
    });
    return pages;
  }

  function drawPdfSummaryCards(ctx, x, y, width, records, fourth) {
    const gap = 14, cardWidth = (width - gap * 3) / 4;
    const cards = [
      [String(records.length), 'wszystkich wpisów'],
      [String(records.filter(({ entry }) => entry.status === 'given').length), 'podań'],
      [String(records.filter(({ entry }) => entry.status === 'skipped').length), 'pominiętych'],
      [fourth.number, fourth.text]
    ];
    cards.forEach(([value, label], index) => {
      const left = x + index * (cardWidth + gap); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#d9e5ed'; ctx.lineWidth = 2;
      roundRectPath(ctx, left, y, cardWidth, 92, 13); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#0e927f'; ctx.font = '700 27px Arial, sans-serif';
      ctx.fillText(String(value), left + 14, y + 12); drawPdfCellText(ctx, String(label), left + 14, y + 49, cardWidth - 28, 16, '#60768a', false, 2);
    });
  }

  function drawPdfTableHeader(ctx, x, y, columns, headers) {
    let left = x; const height = 46;
    headers.forEach((header, index) => { ctx.fillStyle = '#e9f7f4'; ctx.strokeStyle = '#cfdce5'; ctx.lineWidth = 1; ctx.fillRect(left, y, columns[index], height); ctx.strokeRect(left, y, columns[index], height); drawPdfCellText(ctx, header, left + 7, y + 9, columns[index] - 14, 15, '#17324d', true, 2); left += columns[index]; });
    return y + height;
  }

  function measurePdfRowHeight(ctx, row, columns) {
    let maxLines = 1;
    row.forEach((value, index) => { const lines = wrapCanvasText(ctx, String(value), columns[index] - 14, '15px Arial, sans-serif'); maxLines = Math.max(maxLines, Math.min(lines.length, index === row.length - 1 ? 5 : 3)); });
    return Math.max(40, 16 + maxLines * 20);
  }

  function drawPdfTableRow(ctx, x, y, columns, row, height) {
    let left = x;
    row.forEach((value, index) => { ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#cfdce5'; ctx.lineWidth = 1; ctx.fillRect(left, y, columns[index], height); ctx.strokeRect(left, y, columns[index], height); drawPdfCellText(ctx, String(value), left + 7, y + 8, columns[index] - 14, 15, '#17324d', false, index === row.length - 1 ? 5 : 3); left += columns[index]; });
  }

  function drawPdfCellText(ctx, text, x, y, maxWidth, fontSize, color, bold = false, maxLines = 3) {
    const font = `${bold ? '700 ' : ''}${fontSize}px Arial, sans-serif`, lines = wrapCanvasText(ctx, text, maxWidth, font);
    ctx.font = font; ctx.fillStyle = color;
    lines.slice(0, maxLines).forEach((line, index) => { let value = line; if (index === maxLines - 1 && lines.length > maxLines) value = `${line.replace(/[. ]+$/, '')}…`; ctx.fillText(value, x, y + index * (fontSize + 5)); });
  }

  function wrapCanvasText(ctx, text, maxWidth, font) {
    ctx.font = font; const words = String(text || '—').split(/\s+/), lines = []; let line = '';
    words.forEach((word) => { const candidate = line ? `${line} ${word}` : word; if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; } else line = candidate; });
    if (line) lines.push(line); return lines.length ? lines : ['—'];
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
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


  function exportWord() {
    const config = getReportConfiguration();
    if (!config) return false;
    try {
      const blob = createDocxBlobForConfig(config);
      downloadBlob(`dzienniczek-raport-${getReportFilenameScope(config)}-${localDateISO()}.docx`, blob);
      showToast('Pobrano prawidłowy dokument Word .docx.', 'success');
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć DOCX:', error);
      showToast('Nie udało się utworzyć dokumentu Word.', 'error');
      return false;
    }
  }

  function createDocxBlob() {
    const config = getReportConfiguration();
    if (!config) throw new Error('Nieprawidłowa konfiguracja raportu.');
    return createDocxBlobForConfig(config);
  }

  function createDocxBlobForConfig(config) {
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:lang w:val="pl-PL"/></w:rPr></w:style></w:styles>`],
      ['word/document.xml', buildDocxDocumentXml(config)],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Dzienniczek Hormonu — ${escapeXml(config.scopeLabel)}</dc:title><dc:creator>Dzienniczek Hormonu</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`],
      ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Dzienniczek Hormonu</Application></Properties>`]
    ];
    return new Blob([buildStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function buildDocxDocumentXml(config) {
    const columns = getReportColumns(config);
    const rows = [columns.map((column) => column.label), ...config.records.map((record) => columns.map((column) => getReportRecordValue(record, column.key)))];
    const tableRows = config.records.length
      ? rows.map((row, rowIndex) => `<w:tr>${row.map((cell) => docxCell(cell, rowIndex === 0)).join('')}</w:tr>`).join('')
      : `<w:tr>${docxCell('Brak wpisów.', false)}</w:tr>`;
    const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const fourth = getReportFourthSummary(config);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      ${docxParagraph(`Dzienniczek Hormonu — ${config.scopeLabel}`, true, 32)}
      ${docxParagraph(`Raport dla: ${config.scopeLabel}`, false, 18)}
      ${docxParagraph(`Raport wygenerowano: ${generated}`, false, 18)}
      ${docxParagraph(`Zakres wpisów: ${config.periodText}`, false, 18)}
      ${docxParagraph(`Liczba wpisów: ${config.records.length}. Podano: ${config.records.filter(({ entry }) => entry.status === 'given').length}. Pominięto: ${config.records.filter(({ entry }) => entry.status === 'skipped').length}.`, false, 20)}
      ${docxParagraph(`${fourth.number} — ${fourth.text}`, false, 20)}
      <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C9D6"/><w:left w:val="single" w:sz="4" w:color="B7C9D6"/><w:bottom w:val="single" w:sz="4" w:color="B7C9D6"/><w:right w:val="single" w:sz="4" w:color="B7C9D6"/><w:insideH w:val="single" w:sz="4" w:color="D8E3EA"/><w:insideV w:val="single" w:sz="4" w:color="D8E3EA"/></w:tblBorders></w:tblPr>${tableRows}</w:tbl>
      ${docxParagraph('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', false, 18)}
      <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
      </w:body></w:document>`;
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

  function exportJson() {
    exportBackupScope('all');
  }

  function exportActiveProfileJson() {
    exportBackupScope('profile');
  }

  function exportBackupScope(scope = 'all') {
    const activeProfile = getActiveProfile();
    const payload = createBackupPayload(scope, activeProfile.id);
    const filename = scope === 'profile'
      ? `dzienniczek-profil-${safeFilenamePart(activeProfile.name)}-${localDateISO()}.json`
      : `dzienniczek-kopia-${localDateISO()}.json`;
    downloadFile(filename, JSON.stringify(payload, null, 2), 'application/json');
    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now())); } catch (error) { console.warn(error); }
    showToast(scope === 'profile'
      ? `Pobrano kopię profilu „${activeProfile.name}”.`
      : 'Pobrano pełną kopię wszystkich profili.', 'success');
  }

  function createBackupPayload(scope = 'all', profileId = data.activeProfileId, extra = {}) {
    const exportedAt = new Date().toISOString();
    let backupData;
    let profileDescriptor = null;
    if (scope === 'profile') {
      const profile = getProfileById(profileId);
      if (!profile) throw new Error('Nie znaleziono profilu do eksportu.');
      const profileClone = JSON.parse(JSON.stringify(profile));
      backupData = {
        version: DATA_SCHEMA_VERSION,
        appSettings: {},
        appMeta: { onboardingCompleted: true },
        activeProfileId: profileClone.id,
        profiles: [profileClone]
      };
      profileDescriptor = { id: profileClone.id, name: profileClone.name };
    } else {
      backupData = JSON.parse(JSON.stringify(data));
    }
    const summary = summarizeBackupData(backupData);
    return {
      application: 'Dzienniczek Hormonu',
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      sourceDataVersion: DATA_SCHEMA_VERSION,
      exportedAt,
      scope: scope === 'profile' ? 'profile' : 'all',
      profile: profileDescriptor,
      summary,
      ...extra,
      data: backupData
    };
  }

  function summarizeBackupData(value) {
    const profiles = Array.isArray(value?.profiles) ? value.profiles : [];
    const entries = profiles.flatMap((profile) => Array.isArray(profile.entries) ? profile.entries : []);
    const ampoules = profiles.flatMap((profile) => Array.isArray(profile.ampoules) ? profile.ampoules : []);
    const dates = entries.map((entry) => entry.date).filter(isValidIsoDate).sort();
    return {
      profileCount: profiles.length,
      entryCount: entries.length,
      ampouleCount: ampoules.length,
      firstEntryDate: dates[0] || '',
      lastEntryDate: dates.at(-1) || ''
    };
  }

  function inspectImportedData(imported) {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
      throw new Error('Nieprawidłowa struktura pliku.');
    }
    const profiles = Array.isArray(imported.profiles)
      ? imported.profiles
      : (Array.isArray(imported.entries) ? [{ name: DEFAULT_PROFILE_NAME, entries: imported.entries, ampoules: imported.ampoules }] : null);
    if (!profiles) throw new Error('Nieprawidłowa struktura pliku.');
    if (profiles.length === 0) throw new Error('Kopia nie zawiera żadnego profilu.');
    if (profiles.length > MAX_PROFILES) throw new Error(`Kopia zawiera więcej niż ${MAX_PROFILES} profili.`);

    const rawProfileIds = new Set();
    const profileNames = [];
    let entryCount = 0;
    let ampouleCount = 0;
    let archivedProfileCount = 0;
    const entryDates = [];

    profiles.forEach((profile, index) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Array.isArray(profile.entries)) {
        throw new Error(`Profil ${index + 1} nie zawiera prawidłowej historii.`);
      }
      if (profile.entries.length > 50000) throw new Error(`Profil ${index + 1} zawiera zbyt wiele wpisów.`);
      const sanitizedEntries = profile.entries.map(sanitizeEntry).filter(Boolean);
      if (sanitizedEntries.length !== profile.entries.length) {
        throw new Error(`Profil ${index + 1} zawiera nieprawidłowe lub niekompletne wpisy.`);
      }
      const unique = keepOneEntryPerDate(sanitizedEntries);
      if (unique.removedDuplicates > 0) {
        throw new Error(`Profil ${index + 1} zawiera więcej niż jeden wpis dla tego samego dnia. Usuń duplikaty przed importem.`);
      }

      if (profile.id) {
        const profileId = sanitizeProfileId(profile.id);
        if (!profileId) throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator.`);
        if (rawProfileIds.has(profileId)) throw new Error('Kopia zawiera zduplikowane identyfikatory profili.');
        rawProfileIds.add(profileId);
      }

      const ampouleIds = new Set();
      if (profile.ampoules !== undefined) {
        if (!Array.isArray(profile.ampoules)) throw new Error(`Profil ${index + 1} ma nieprawidłową listę ampułek.`);
        if (profile.ampoules.length > 10000) throw new Error(`Profil ${index + 1} zawiera zbyt wiele ampułek.`);
        profile.ampoules.forEach((ampoule) => {
          const sanitized = sanitizeAmpoule(ampoule);
          if (!sanitized) throw new Error(`Profil ${index + 1} zawiera nieprawidłową ampułkę.`);
          if (ampouleIds.has(sanitized.id)) throw new Error(`Profil ${index + 1} zawiera zduplikowane identyfikatory ampułek.`);
          ampouleIds.add(sanitized.id);
        });
        ampouleCount += profile.ampoules.length;
      }

      profile.entries.forEach((entry, entryIndex) => {
        const referencedAmpouleId = entry?.ampouleId;
        if (referencedAmpouleId === undefined || referencedAmpouleId === null || referencedAmpouleId === '') return;
        if (typeof referencedAmpouleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(referencedAmpouleId)) {
          throw new Error(`Profil ${index + 1}, wpis ${entryIndex + 1} ma nieprawidłowe powiązanie z ampułką.`);
        }
        if (!ampouleIds.has(referencedAmpouleId)) {
          throw new Error(`Profil ${index + 1}, wpis ${entryIndex + 1} wskazuje nieistniejącą ampułkę „${referencedAmpouleId}”.`);
        }
      });

      const activeAmpouleId = profile.activeAmpouleId;
      if (activeAmpouleId !== undefined && activeAmpouleId !== null && activeAmpouleId !== '') {
        if (typeof activeAmpouleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(activeAmpouleId)) {
          throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator aktywnej ampułki.`);
        }
        if (!ampouleIds.has(activeAmpouleId)) {
          throw new Error(`Profil ${index + 1} wskazuje nieistniejącą aktywną ampułkę „${activeAmpouleId}”.`);
        }
      }

      if (profile.injectionOrder !== undefined) {
        if (!Array.isArray(profile.injectionOrder)) throw new Error(`Profil ${index + 1} ma nieprawidłową kolejność miejsc wkłucia.`);
        if (profile.injectionOrder.length > 100) throw new Error(`Profil ${index + 1} ma zbyt długą kolejność miejsc wkłucia.`);
        const invalidOrderItem = profile.injectionOrder.some((item) => !item || typeof item !== 'object' || !ALLOWED_SIDES.has(item.side) || !ALLOWED_SITES.has(item.site));
        if (invalidOrderItem) throw new Error(`Profil ${index + 1} zawiera nieprawidłowe miejsce wkłucia.`);
      }

      entryCount += unique.entries.length;
      entryDates.push(...unique.entries.map((entry) => entry.date));
      if (profile.archivedAt) archivedProfileCount += 1;
      profileNames.push(sanitizeProfileName(profile.name) || `Dziecko ${index + 1}`);
    });

    entryDates.sort();
    return {
      profileCount: profiles.length,
      entryCount,
      ampouleCount,
      archivedProfileCount,
      profileNames,
      firstEntryDate: entryDates[0] || '',
      lastEntryDate: entryDates.at(-1) || ''
    };
  }

  function inspectBackupPayload(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Plik JSON nie zawiera obiektu danych.');
    const imported = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const declaredFormat = Number(parsed.backupFormatVersion || 0);
    const declaredSourceDataVersion = Number(parsed.sourceDataVersion || 0);
    const importedDataVersion = Number(imported.version || 0);
    const sourceDataVersion = declaredSourceDataVersion || importedDataVersion;
    if (Number.isFinite(declaredFormat) && declaredFormat > BACKUP_FORMAT_VERSION) {
      throw new Error(`Kopia używa nowszego formatu (${declaredFormat}). Zaktualizuj aplikację przed importem.`);
    }
    const newerDataVersion = [declaredSourceDataVersion, importedDataVersion]
      .find((version) => Number.isFinite(version) && version > DATA_SCHEMA_VERSION);
    if (newerDataVersion !== undefined) {
      throw new Error(`Kopia pochodzi z nowszego schematu danych (${newerDataVersion}). Zaktualizuj aplikację przed importem.`);
    }
    const summary = inspectImportedData(imported);
    const normalized = normalizeStoredData(imported);
    const declaredScope = parsed.scope === 'profile' ? 'profile' : 'all';
    const mode = declaredFormat >= 2 && declaredScope === 'profile' ? 'add-profile' : 'replace-all';
    if (mode === 'add-profile' && summary.profileCount !== 1) {
      throw new Error('Kopia pojedynczego profilu musi zawierać dokładnie jeden profil.');
    }
    return {
      parsed,
      imported,
      normalized,
      summary,
      mode,
      sourceDataVersion,
      backupFormatVersion: declaredFormat,
      exportedAt: isValidDateTime(parsed.exportedAt) ? parsed.exportedAt : '',
      legacy: !Array.isArray(imported.profiles) || declaredFormat < BACKUP_FORMAT_VERSION
    };
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_FILE_SIZE) throw new Error('Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      pendingImportPreview = { ...inspectBackupPayload(parsed), filename: file.name || 'kopia.json' };
      renderImportPreview();
    } catch (error) {
      console.error(error);
      pendingImportPreview = null;
      renderImportPreview();
      showToast(`Nie udało się odczytać pliku JSON. ${error.message || ''}`.trim(), 'error', 7000);
    }
  }

  function renderImportPreview() {
    const container = el['import-preview'];
    if (!container) return;
    if (!pendingImportPreview) {
      container.hidden = true;
      el['import-preview-summary'].textContent = '';
      el['import-preview-profiles'].replaceChildren();
      return;
    }
    const preview = pendingImportPreview;
    const summary = preview.summary;
    const dates = summary.firstEntryDate
      ? `${formatDateShort(summary.firstEntryDate)} – ${formatDateShort(summary.lastEntryDate)}`
      : 'brak wpisów';
    const modeLabel = preview.mode === 'add-profile'
      ? 'Profil zostanie dodany do obecnego dzienniczka.'
      : 'Wszystkie obecne profile zostaną zastąpione zawartością kopii.';
    el['import-preview-summary'].innerHTML = `
      <strong>${escapeHtml(preview.filename)}</strong>
      <span>${summary.profileCount} ${plural(summary.profileCount, 'profil', 'profile', 'profili')} · ${summary.entryCount} ${plural(summary.entryCount, 'wpis', 'wpisy', 'wpisów')} · ${summary.ampouleCount} ${plural(summary.ampouleCount, 'ampułka', 'ampułki', 'ampułek')}</span>
      <span>Zakres historii: ${escapeHtml(dates)}</span>
      <span>${preview.legacy ? 'Starszy format — zostanie bezpiecznie zmigrowany.' : `Format kopii ${preview.backupFormatVersion}, schemat danych ${preview.sourceDataVersion || 'nieznany'}.`}</span>`;
    el['import-preview-profiles'].innerHTML = summary.profileNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    el['import-preview-warning'].textContent = modeLabel;
    el['import-confirm-button'].textContent = preview.mode === 'add-profile' ? 'Dodaj profil' : 'Zastąp wszystkie dane';
    container.hidden = false;
    window.setTimeout(() => el['import-confirm-button']?.focus(), 30);
  }

  function clearPendingImportPreview() {
    pendingImportPreview = null;
    renderImportPreview();
    el['import-button']?.focus();
  }

  function saveAutomaticImportBackup(reason = 'przed importem') {
    try {
      const payload = createBackupPayload('all', data.activeProfileId, {
        automatic: true,
        reason,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem(AUTO_IMPORT_BACKUP_KEY, JSON.stringify(payload));
      renderAutomaticBackupState();
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć automatycznej kopii przed importem:', error);
      showToast('Nie można utworzyć automatycznej kopii bezpieczeństwa. Import został przerwany.', 'error', 7000);
      return false;
    }
  }

  function readAutomaticImportBackup() {
    const raw = safeStorageGet(AUTO_IMPORT_BACKUP_KEY);
    if (!raw) return null;
    try {
      return { raw, inspection: inspectBackupPayload(JSON.parse(raw)) };
    } catch (error) {
      console.warn('Automatyczna kopia importu jest uszkodzona:', error);
      try { localStorage.removeItem(AUTO_IMPORT_BACKUP_KEY); } catch {}
      return null;
    }
  }

  function renderAutomaticBackupState() {
    if (!el['restore-auto-backup-button']) return;
    const stored = readAutomaticImportBackup();
    el['restore-auto-backup-button'].hidden = !stored;
    if (!stored) {
      el['auto-backup-summary'].textContent = 'Brak lokalnej kopii utworzonej przed importem.';
      return;
    }
    const payload = stored.inspection.parsed;
    const savedAt = payload.savedAt || payload.exportedAt;
    const dateLabel = isValidDateTime(savedAt)
      ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt))
      : 'nieznana data';
    el['auto-backup-summary'].textContent = `Ostatnia kopia bezpieczeństwa: ${dateLabel}.`;
  }

  function createUniqueImportedProfile(profile) {
    const clone = JSON.parse(JSON.stringify(profile));
    const usedIds = new Set(data.profiles.map((item) => item.id));
    const baseId = sanitizeProfileId(clone.id) || `profile-import-${Date.now()}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    clone.id = id;
    clone.archivedAt = '';
    clone.updatedAt = new Date().toISOString();

    const usedNames = new Set(data.profiles.map((item) => normalizeText(item.name)));
    const baseName = sanitizeProfileName(clone.name) || 'Zaimportowane dziecko';
    let name = baseName;
    let nameSuffix = 2;
    while (usedNames.has(normalizeText(name))) name = `${baseName} (import ${nameSuffix++})`;
    clone.name = name;
    return normalizeStoredData({ version: DATA_SCHEMA_VERSION, activeProfileId: id, profiles: [clone] }).data.profiles[0];
  }

  function applyInspectedImport(preview, { createSafetyBackup = true } = {}) {
    if (!preview) return false;
    if (createSafetyBackup && !saveAutomaticImportBackup(preview.mode === 'add-profile' ? 'przed dodaniem profilu' : 'przed zastąpieniem danych')) return false;
    const previousData = data;
    try {
      if (preview.mode === 'add-profile') {
        if (data.profiles.length >= MAX_PROFILES) throw new Error(`Osiągnięto limit ${MAX_PROFILES} profili.`);
        const incoming = createUniqueImportedProfile(preview.normalized.data.profiles[0]);
        const next = JSON.parse(JSON.stringify(data));
        next.profiles.push(incoming);
        next.activeProfileId = incoming.id;
        data = attachActiveProfileAliases(normalizeStoredData(next).data);
      } else {
        data = attachActiveProfileAliases(preview.normalized.data);
        data.meta.onboardingCompleted = true;
      }
      if (!persistData()) {
        data = previousData;
        return false;
      }
      resetQuickDraftForToday();
      calendarProfileScope = data.activeProfileId;
      historyProfileScope = data.activeProfileId;
      reportProfileScope = data.activeProfileId;
      renderAll();
      scheduleDailyReminder();
      syncReminderStateWithServiceWorker();
      showToast(preview.mode === 'add-profile'
        ? `Dodano profil „${getActiveProfile().name}”.`
        : (preview.normalized.migratedFromLegacy
          ? 'Stara kopia została zaimportowana i przypisana do profilu „Dziecko 1”.'
          : 'Pełna kopia wszystkich profili została przywrócona.'), 'success', 6500);
      return true;
    } catch (error) {
      data = previousData;
      console.error(error);
      showToast(`Nie udało się przywrócić kopii. ${error.message || ''}`.trim(), 'error', 7000);
      return false;
    }
  }

  function confirmPendingImport() {
    if (!pendingImportPreview) return;
    const preview = pendingImportPreview;
    const actionText = preview.mode === 'add-profile'
      ? `Dodać profil „${preview.summary.profileNames[0]}” do dzienniczka?`
      : `Zastąpić wszystkie obecne dane kopią zawierającą ${preview.summary.profileCount} ${plural(preview.summary.profileCount, 'profil', 'profile', 'profili')}?`;
    if (!window.confirm(actionText)) return;
    if (applyInspectedImport(preview)) {
      pendingImportPreview = null;
      renderImportPreview();
      renderAutomaticBackupState();
    }
  }

  function restoreAutomaticImportBackup() {
    const stored = readAutomaticImportBackup();
    if (!stored) {
      renderAutomaticBackupState();
      showToast('Brak automatycznej kopii do przywrócenia.');
      return;
    }
    if (!window.confirm('Przywrócić stan aplikacji zapisany automatycznie przed ostatnim importem?')) return;
    const preview = { ...stored.inspection, mode: 'replace-all', filename: 'automatyczna kopia bezpieczeństwa' };
    if (applyInspectedImport(preview, { createSafetyBackup: false })) {
      try { localStorage.removeItem(AUTO_IMPORT_BACKUP_KEY); } catch {}
      renderAutomaticBackupState();
      clearPendingImportPreview();
    }
  }

  function closeBackupPanel() {
    clearPendingImportPreview();
    closeDataDialog(el['backup-dialog']);
  }

  function exportCsv() {
    const config = getReportConfiguration();
    if (!config) return false;
    const columns = getReportColumns(config);
    const header = columns.map((column) => column.label);
    const rows = config.records.map((record) => columns.map((column) => getReportRecordValue(record, column.key)));
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`dzienniczek-historia-${getReportFilenameScope(config)}-${localDateISO()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Pobrano historię CSV.', 'success');
    return true;
  }

  function clearAllEntries() {
    if (!data.entries.length) {
      showToast('Historia jest już pusta.');
      return;
    }
    if (!window.confirm(`Usunąć wszystkie wpisy profilu „${getActiveProfile().name}”? Dane innych profili pozostaną bez zmian. Tej operacji nie można cofnąć.`)) return;
    const previousEntries = data.entries;
    data.entries = [];
    reconcileAmpouleStatuses();
    if (!persistData()) {
      data.entries = previousEntries;
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showToast(`Usunięto wszystkie wpisy profilu ${getActiveProfile().name}.`, 'success');
  }


  function maybeScheduleBackupReminder() {
    let lastReminder = 0;
    try {
      lastReminder = Number(localStorage.getItem(BACKUP_REMINDER_KEY) || 0);
    } catch (error) {
      console.warn(error);
      return;
    }

    const now = Date.now();
    if (!Number.isFinite(lastReminder) || lastReminder <= 0) {
      try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
      return;
    }
    if (now - lastReminder < BACKUP_REMINDER_INTERVAL_MS) return;

    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
    window.setTimeout(() => {
      const accepted = window.confirm('Minęły 3 dni od ostatniego przypomnienia o kopii zapasowej. Czy pobrać teraz pełną kopię danych?');
      if (accepted) exportJson();
      else showToast('Przypomnę ponownie za 3 dni.', 'success');
    }, 1200);
  }
  function isPermissionsOnboardingCompleted() {
    try {
      return localStorage.getItem(PERMISSIONS_ONBOARDING_STORAGE_KEY) === PERMISSIONS_ONBOARDING_REVISION;
    } catch {
      return Boolean(data.meta.onboardingCompleted);
    }
  }

  function markPermissionsOnboardingCompleted() {
    try {
      localStorage.setItem(PERMISSIONS_ONBOARDING_STORAGE_KEY, PERMISSIONS_ONBOARDING_REVISION);
    } catch {}
  }

  function maybeShowFirstRunPermissions() {
    if (isPermissionsOnboardingCompleted()) return;
    window.setTimeout(() => {
      openPermissionsDialog().catch((error) => {
        console.warn('Nie udało się otworzyć konfiguracji zgód:', error);
      });
    }, 180);
  }

  async function openPermissionsDialog() {
    await updatePermissionStatuses();
    if (!el['permissions-dialog'].open) el['permissions-dialog'].showModal();
  }

  function finishPermissionsOnboarding() {
    data.meta.onboardingCompleted = true;
    if (!persistData()) return;
    markPermissionsOnboardingCompleted();
    if (el['permissions-dialog'].open) el['permissions-dialog'].close();
    scheduleDailyReminder();
    showToast('Ustawienia zgód zostały zapisane.', 'success');
  }

  function skipPermissionsOnboarding(options = {}) {
    data.meta.onboardingCompleted = true;
    if (!persistData()) return;
    markPermissionsOnboardingCompleted();
    if (el['permissions-dialog'].open) el['permissions-dialog'].close();
    if (!options.silent) showToast('Pominięto konfigurację zgód. Możesz wrócić do niej w ustawieniach.', 'success');
  }

  async function requestMicrophonePermission() {
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp() && typeof window.NativeBridge?.requestMicrophonePermission === 'function') {
        state = await window.NativeBridge.requestMicrophonePermission();
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        state = 'granted';
      }
      if (state !== 'granted') throw Object.assign(new Error('permission_denied'), { name: 'NotAllowedError' });
      showToast('Dostęp do mikrofonu został przyznany.', 'success');
    } catch (error) {
      console.warn('Błąd dostępu do mikrofonu:', error);
      const denied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(String(error?.name || ''));
      state = denied ? 'denied' : 'unsupported';
      showToast(
        denied
          ? 'Dostęp do mikrofonu został zablokowany. Spróbuj ponownie albo włącz go w ustawieniach systemu.'
          : 'Mikrofon nie jest dostępny w tej przeglądarce lub urządzeniu.',
        'error'
      );
    }
    await updatePermissionStatuses({ microphone: state });
    return state;
  }

  async function requestNotificationPermission() {
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp()) {
        state = await window.NativeBridge.requestNotificationPermission();
      } else {
        if (!('Notification' in window)) throw new Error('unsupported');
        state = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      }
      if (state === 'granted') {
        showToast('Powiadomienia zostały włączone.', 'success');
        await registerPeriodicReminder();
        scheduleDailyReminder();
        checkReminderDue();
      } else {
        showToast('Powiadomienia nie zostały włączone.', 'error');
      }
    } catch (error) {
      console.warn(error);
      state = 'unsupported';
      showToast(isNativeAndroidApp() ? 'Android nie udostępnił powiadomień.' : 'Ta przeglądarka nie obsługuje powiadomień.', 'error');
    }
    await updatePermissionStatuses({ notification: state });
    return state;
  }

  async function requestPersistentStorage() {
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp()) {
        state = 'granted';
        showToast('Dane są przechowywane w pamięci aplikacji Android.', 'success');
        await updatePermissionStatuses({ storage: state });
        return state;
      }
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
      if (isNativeAndroidApp() && typeof window.NativeBridge?.microphonePermission === 'function') {
        return await window.NativeBridge.microphonePermission();
      }
      if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state;
    } catch {
      return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
    }
  }

  async function readStoragePermission() {
    try {
      if (isNativeAndroidApp()) return 'granted';
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

  async function updatePermissionStatuses(overrides = {}) {
    const microphone = overrides.microphone || await readMicrophonePermission();
    const notification = overrides.notification || (isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : (('Notification' in window) ? Notification.permission : 'unsupported'));
    const storage = overrides.storage || await readStoragePermission();
    [el['permission-microphone-status'], el['microphone-permission-settings']].forEach((node) => setPermissionLabel(node, microphone));
    [el['permission-notification-status'], el['notification-permission-settings'], el['notification-permission-status']].forEach((node) => setPermissionLabel(node, notification));
    [el['permission-storage-status'], el['storage-permission-settings']].forEach((node) => setPermissionLabel(node, storage));
    if (el['request-notification-button']) el['request-notification-button'].disabled = notification === 'granted' || notification === 'unsupported';
    if (el['test-notification-button']) el['test-notification-button'].disabled = notification !== 'granted';
    if (el['permission-microphone-button']) el['permission-microphone-button'].disabled = microphone === 'granted' || microphone === 'unsupported';
    if (el['permission-notification-button']) el['permission-notification-button'].disabled = notification === 'granted' || notification === 'unsupported';
    if (el['permission-storage-button']) el['permission-storage-button'].disabled = storage === 'granted' || storage === 'unsupported';
  }

  function getProfileTodayEntry(profile, date = localDateISO()) {
    return Array.isArray(profile?.entries) ? profile.entries.find((entry) => entry.date === date) || null : null;
  }

  function todayHasEntry(profile = getActiveProfile(), date = localDateISO()) {
    return Boolean(getProfileTodayEntry(profile, date));
  }

  function getProfileAmpouleReminderText(profile) {
    if (!profile || !Array.isArray(profile.ampoules)) return '';
    const ampoule = profile.ampoules.find((item) => item.id === profile.activeAmpouleId && item.status !== 'finished');
    if (!ampoule) return '';
    const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
    const usedMl = (profile.entries || [])
      .filter((entry) => entry.status === 'given' && entry.ampouleId === ampoule.id)
      .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
    const remainingBefore = Math.max(0, decimalToNumber(ampoule.volumeMl) - usedMl);
    const plannedDoseMl = profile.settings.unit === 'ml'
      ? decimalToNumber(profile.settings.defaultDose)
      : (decimalToNumber(profile.settings.ampouleDoseMl) || fallbackDoseMl);
    if (!plannedDoseMl) return '';
    const remainingAfter = Math.max(0, remainingBefore - plannedDoseMl);
    const maxOpenDays = Number(profile.settings.ampouleMaxOpenDays) || 0;
    const startDate = isValidIsoDate(ampoule.startDate) ? parseISODate(ampoule.startDate) : null;
    const today = parseISODate(localDateISO());
    const openDays = startDate ? Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1) : 0;
    if (maxOpenDays && openDays > maxOpenDays) {
      return `Ampułka ${ampoule.number} jest otwarta ${openDays} dni i przekroczyła ustawiony limit ${maxOpenDays} dni.`;
    }
    if (remainingBefore + 0.000001 < plannedDoseMl) {
      return `W ampułce ${ampoule.number} zostało około ${formatMl(remainingBefore)} ml — za mało na pełną dawkę.`;
    }
    const dosesLeft = Math.floor((remainingAfter + 0.000001) / plannedDoseMl);
    return `Po dawce zostanie około ${formatMl(remainingAfter)} ml w ampułce ${ampoule.number}, czyli około ${dosesLeft} ${plural(dosesLeft, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}.`;
  }

  function reminderBody(profile = getActiveProfile()) {
    const suggestion = getSuggestedPlaceForProfile(profile);
    const ampouleText = getProfileAmpouleReminderText(profile);
    const placeText = suggestion.side && suggestion.site
      ? `dzisiaj ${formatPlace(suggestion.side, suggestion.site)}`
      : 'brak aktywnego miejsca wkłucia — otwórz ustawienia kolejności';
    return `${profile.name}: ${placeText}. Dawka: ${formatDose(profile.settings.defaultDose)} ${profile.settings.unit}.${ampouleText ? ` ${ampouleText}` : ''}`;
  }

  function buildReminderState(profile, today = localDateISO()) {
    const suggestion = getSuggestedPlaceForProfile(profile);
    return {
      profileId: profile.id,
      profileName: profile.name,
      enabled: Boolean(profile.settings.reminderEnabled),
      time: profile.settings.reminderTime || '21:00',
      lastReminderDate: profile.meta.lastReminderDate || '',
      today,
      todayHasEntry: todayHasEntry(profile, today),
      body: reminderBody(profile),
      url: './#today',
      suggestion: suggestion.side && suggestion.site ? formatPlace(suggestion.side, suggestion.site) : ''
    };
  }

  function buildReminderStates() {
    const today = localDateISO();
    return getAvailableProfiles().map((profile) => buildReminderState(profile, today));
  }

  async function showReminderNotification({ test = false, profile = getActiveProfile() } = {}) {
    if (!profile) return false;
    if (isNativeAndroidApp()) {
      const permission = await window.NativeBridge.notificationPermission();
      if (permission !== 'granted') return false;
      return window.NativeBridge.showNotification({
        title: test ? `Test przypomnienia — ${profile.name}` : `Czas na zastrzyk — ${profile.name}`,
        body: reminderBody(profile),
        profileId: profile.id,
        test
      });
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const lockKey = String(profile.id || '');
    if (!test && lockKey && reminderInFlightProfiles.has(lockKey)) return false;
    if (!test && lockKey) reminderInFlightProfiles.add(lockKey);
    try {
      let registration = serviceWorkerRegistration;
      if (!registration && 'serviceWorker' in navigator) {
        try { registration = await navigator.serviceWorker.ready; } catch { registration = null; }
      }
      const title = test ? `Test przypomnienia — ${profile.name}` : `Czas na zastrzyk — ${profile.name}`;
      const options = {
        body: reminderBody(profile),
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: test ? `gh-reminder-test-${profile.id}` : `gh-reminder-${profile.id}-${localDateISO()}`,
        renotify: false,
        requireInteraction: false,
        data: { url: './#today', profileId: profile.id }
      };
      if (registration?.showNotification) await registration.showNotification(title, options);
      else new Notification(title, options);
      if (!test) {
        profile.meta.lastReminderDate = localDateISO();
        persistData({ notifyError: false });
      }
      return true;
    } finally {
      if (!test && lockKey) reminderInFlightProfiles.delete(lockKey);
    }
  }

  async function testReminderNotification() {
    const currentPermission = isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : (('Notification' in window) ? Notification.permission : 'unsupported');
    if (currentPermission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') return;
    }
    await showReminderNotification({ test: true, profile: getActiveProfile() });
    showToast(`Wysłano testowe powiadomienie dla profilu ${getActiveProfile().name}.`, 'success');
  }

  async function checkReminderDue(profileId = '') {
    if (isNativeAndroidApp()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const profiles = profileId
      ? getAvailableProfiles().filter((profile) => profile.id === profileId)
      : getAvailableProfiles();
    const today = localDateISO();
    const time = localTime();
    for (const profile of profiles) {
      if (!profile.settings.reminderEnabled) continue;
      if (todayHasEntry(profile, today) || profile.meta.lastReminderDate === today) continue;
      if (time >= (profile.settings.reminderTime || '21:00')) {
        await showReminderNotification({ profile });
      }
    }
  }

  function clearReminderTimers() {
    reminderTimers.forEach((timerId) => window.clearTimeout(timerId));
    reminderTimers.clear();
  }

  function getNextReminderTarget(profile, now = new Date()) {
    const [hour, minute] = (profile.settings.reminderTime || '21:00').split(':').map(Number);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    const today = localDateISO(now);
    if (target <= now || todayHasEntry(profile, today) || profile.meta.lastReminderDate === today) target.setDate(target.getDate() + 1);
    return target;
  }

  function scheduleProfileReminder(profile, now = new Date()) {
    if (!profile?.id || !profile.settings.reminderEnabled) return;
    const previousTimer = reminderTimers.get(profile.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    const target = getNextReminderTarget(profile, now);
    const delay = Math.max(1000, target.getTime() - now.getTime());
    const timerId = window.setTimeout(async () => {
      reminderTimers.delete(profile.id);
      await checkReminderDue(profile.id);
      const currentProfile = getAvailableProfiles().find((item) => item.id === profile.id);
      if (currentProfile?.settings.reminderEnabled) scheduleProfileReminder(currentProfile);
    }, Math.min(delay, 2147483647));
    reminderTimers.set(profile.id, timerId);
  }

  function scheduleDailyReminder() {
    clearReminderTimers();
    if (isNativeAndroidApp()) {
      window.NativeBridge.syncDailyReminders(buildReminderStates()).catch((error) => {
        console.warn('Nie udało się zaplanować natywnych przypomnień:', error);
      });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    getAvailableProfiles().forEach((profile) => scheduleProfileReminder(profile, now));
  }

  async function syncReminderStateWithServiceWorker() {
    if (isNativeAndroidApp()) {
      await window.NativeBridge.syncDailyReminders(buildReminderStates()).catch((error) => {
        console.warn('Nie udało się zsynchronizować przypomnień Android:', error);
      });
      return;
    }
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'REMINDER_STATE',
        payload: { version: 2, profiles: buildReminderStates() }
      });
    } catch (error) {
      console.warn('Nie udało się przekazać ustawień przypomnień:', error);
    }
  }

  function mergeReminderStateFromServiceWorker(workerState) {
    const states = Array.isArray(workerState?.profiles)
      ? workerState.profiles
      : (workerState?.profileId ? [workerState] : []);
    let changed = false;
    states.forEach((state) => {
      const profile = getProfileById(state.profileId);
      if (!profile || profile.archivedAt || !isValidIsoDate(state.lastReminderDate)) return;
      if (state.lastReminderDate > (profile.meta.lastReminderDate || '')) {
        profile.meta.lastReminderDate = state.lastReminderDate;
        changed = true;
      }
    });
    if (changed) persistData({ notifyError: false });
    return changed;
  }

  function applyProfileFromLaunchUrl() {
    try {
      const url = new URL(window.location.href);
      const profileId = sanitizeProfileId(url.searchParams.get('profile'));
      if (!profileId) return false;
      const profile = getProfileById(profileId);
      url.searchParams.delete('profile');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      if (!profile || profile.archivedAt || profile.id === data.activeProfileId) return false;
      const previousId = data.activeProfileId;
      data.activeProfileId = profile.id;
      if (!persistData({ notifyError: false })) {
        data.activeProfileId = previousId;
        return false;
      }
      todayDashboardMode = 'profile';
      return true;
    } catch {
      return false;
    }
  }

  async function registerPeriodicReminder() {
    if (isNativeAndroidApp()) return;
    if (!serviceWorkerRegistration?.periodicSync || !('Notification' in window) || Notification.permission !== 'granted') return;
    const hasEnabledReminder = getAvailableProfiles().some((profile) => profile.settings.reminderEnabled);
    try {
      if (hasEnabledReminder) {
        await serviceWorkerRegistration.periodicSync.register('daily-injection-reminder', { minInterval: 6 * 60 * 60 * 1000 });
      } else if (serviceWorkerRegistration.periodicSync.unregister) {
        await serviceWorkerRegistration.periodicSync.unregister('daily-injection-reminder');
      }
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
    el['voice-help'].textContent = 'Np. „Kasia lewe udo”, „pomiń dawkę Tomkowi”, „zapisz Kasi” albo „historia Tomka”.';
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

  function voiceProfileVariants(word) {
    const value = normalizeText(word);
    const variants = new Set(value ? [value] : []);
    if (value.length < 2) return variants;

    if (value.endsWith('a')) {
      const stem = value.slice(0, -1);
      if (stem.length >= 3) variants.add(stem);
      ['i', 'y', 'e', 'ie', 'u', 'o'].forEach((ending) => variants.add(`${stem}${ending}`));
      if (stem.endsWith('w')) variants.add(`${stem}ie`);   // Ewa → Ewie
      if (stem.endsWith('d')) variants.add(`${stem}zie`); // Ada → Adzie
    }

    if (value.endsWith('ek') && value.length > 3) {
      const stem = value.slice(0, -2);
      ['ek', 'ka', 'kowi', 'kiem', 'ku'].forEach((ending) => variants.add(`${stem}${ending}`));
    } else if (!value.endsWith('a')) {
      ['a', 'owi', 'em', 'ie', 'u'].forEach((ending) => variants.add(`${value}${ending}`));
    }
    return variants;
  }

  function voiceProfileTokenMatch(token, profileWord) {
    if (!token || !profileWord) return 0;
    const value = normalizeText(profileWord);
    if (token === value) return 100;
    return voiceProfileVariants(value).has(token) ? 80 : 0;
  }

  function resolveVoiceProfile(normalized) {
    const text = normalizeText(normalized);
    const tokens = text.split(' ').filter(Boolean);
    const matches = [];
    getAvailableProfiles().forEach((profile) => {
      const normalizedName = normalizeText(profile.name);
      const nameWords = normalizedName.split(' ').filter(Boolean);
      if (!nameWords.length) return;
      const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exactMatch = text.match(new RegExp(`(?:^|\\s)(${escapedName})(?=\\s|$)`));
      if (exactMatch) {
        const charIndex = exactMatch.index + exactMatch[0].length - exactMatch[1].length;
        matches.push({ profile, score: 200 + normalizedName.length, matched: exactMatch[1], tokenIndex: -1, charIndex });
        return;
      }
      let best = null;
      tokens.forEach((token, tokenIndex) => {
        nameWords.forEach((word, wordIndex) => {
          const score = voiceProfileTokenMatch(token, word) - wordIndex;
          if (score > 0 && (!best || score > best.score)) best = { score, matched: token, tokenIndex };
        });
      });
      if (best) matches.push({ profile, ...best });
    });
    if (!matches.length) return { profile: null, command: text, ambiguous: false };
    matches.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);
    const topScore = matches[0].score;
    const topMatches = matches.filter((item) => item.score === topScore);
    if (topMatches.length > 1) return { profile: null, command: text, ambiguous: true };
    const match = matches[0];
    let command = text;
    if (match.tokenIndex >= 0) {
      const commandTokens = [...tokens];
      commandTokens.splice(match.tokenIndex, 1);
      command = commandTokens.join(' ');
    } else {
      const charIndex = Number.isInteger(match.charIndex) ? match.charIndex : text.indexOf(match.matched);
      command = `${text.slice(0, charIndex)} ${text.slice(charIndex + match.matched.length)}`;
    }
    return { profile: match.profile, command: normalizeText(command), ambiguous: false };
  }

  function isProfileOnlyVoiceCommand(command) {
    return !command || /^(?:wybierz|wybierz profil|profil|przelacz|przelacz profil|dla|otworz profil|pokaz profil)$/.test(command);
  }

  function activateVoiceProfile(profile) {
    if (!profile || profile.archivedAt) return false;
    const changed = profile.id !== data.activeProfileId;
    if (changed && !setActiveProfileId(profile.id, { refresh: false })) return false;
    todayDashboardMode = 'profile';
    if (changed) resetQuickDraftForToday();
    return true;
  }

  function processVoiceCommand(transcript) {
    const originalNormalized = normalizeText(transcript);
    const profileMatch = resolveVoiceProfile(originalNormalized);
    lastRecognizedText = transcript;

    if (profileMatch.ambiguous) {
      showToast('Nie wiadomo, którego dziecka dotyczy polecenie. Powiedz pełną nazwę profilu.', 'error');
      speakIfEnabled('Powiedz pełną nazwę dziecka.');
      return;
    }

    let normalized = profileMatch.command || originalNormalized;
    const targetProfile = profileMatch.profile;
    if (targetProfile && !activateVoiceProfile(targetProfile)) {
      showToast('Nie udało się przełączyć profilu dziecka.', 'error');
      return;
    }

    if (targetProfile && isProfileOnlyVoiceCommand(normalized)) {
      renderAll();
      showToast(`Wybrano profil: ${targetProfile.name}.`, 'success');
      speakIfEnabled(`Wybrano profil ${targetProfile.name}.`);
      return;
    }

    if (/\b(anuluj|nie zapisuj|wyczysc)\b/.test(normalized)) {
      resetQuickDraftForToday();
      renderToday();
      showToast(`Anulowano przygotowane zmiany dla profilu ${getActiveProfile().name}.`);
      speakIfEnabled('Anulowano.');
      return;
    }

    if (/\b(zapisz|potwierdz|tak)\b/.test(normalized) && (quickDraft.status === 'skipped' || (quickDraft.side && quickDraft.site))) {
      saveQuickDraft();
      return;
    }

    if (/\b(kalendarz|pokaz kalendarz)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      calendarProfileScope = data.activeProfileId;
      switchView('calendar');
      speakIfEnabled(`Otwieram kalendarz profilu ${getActiveProfile().name}.`);
      return;
    }
    if (/\b(historia|pokaz historie|ostatni zastrzyk)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      historyProfileScope = data.activeProfileId;
      switchView('history');
      speakIfEnabled(`Otwieram historię profilu ${getActiveProfile().name}.`);
      return;
    }
    if (/\b(ustawienia|wiecej)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('more');
      speakIfEnabled(`Otwieram ustawienia profilu ${getActiveProfile().name}.`);
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

    const profileName = getActiveProfile().name;
    if (quickDraft.status === 'skipped') {
      const message = `Rozpoznano pominięcie dawki dla profilu ${profileName}, ${formatDateSpeech(quickDraft.date)}.`;
      showToast(`${message} Potwierdź przyciskiem „Zapisz” lub powiedz „zapisz ${profileName}”.`, 'success');
      speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
      if (!data.settings.voiceConfirm) saveQuickDraft();
      return;
    }

    if (!quickDraft.side || !quickDraft.site) {
      const missing = !quickDraft.side && !quickDraft.site ? 'stronę i miejsce' : (!quickDraft.side ? 'stronę' : 'miejsce');
      const message = `Profil ${profileName}. Rozpoznano częściowo. Data wpisu: ${formatDateSpeech(quickDraft.date)}. Podaj jeszcze ${missing}.`;
      showToast(message, 'error');
      speakIfEnabled(message);
      return;
    }

    const message = `${profileName}: rozpoznano ${formatPlace(quickDraft.side, quickDraft.site)}, dawka ${formatDose(quickDraft.dose)} ${quickDraft.unit}, ${formatDateSpeech(quickDraft.date)}.`;
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

  function isNativeAndroidApp() {
    return Boolean(window.NativeBridge?.isNative);
  }

  function bindNativeEvents() {
    window.addEventListener('nativeBackButton', handleNativeBackButton);
    window.addEventListener('nativeAppResume', () => {
      updateCurrentDateHeader();
      renderAll();
      scheduleDailyReminder();
      updatePermissionStatuses();
    });
    window.addEventListener('nativeNotificationAction', (event) => {
      const profileId = sanitizeProfileId(event.detail?.profileId);
      const notificationDate = String(event.detail?.date || '');
      const profile = profileId ? getProfileById(profileId) : null;
      if (profile && isValidIsoDate(notificationDate) && notificationDate > (profile.meta.lastReminderDate || '')) {
        profile.meta.lastReminderDate = notificationDate;
        persistData({ notifyError: false });
      }
      if (profileId) setActiveProfileId(profileId, { refresh: true });
      todayDashboardMode = 'profile';
      switchView('today', { updateHash: true, focus: false, smooth: false });
    });
  }

  function handleNativeBackButton() {
    const dialogs = [
      el['profile-delete-dialog'], el['profile-editor-dialog'], el['profiles-dialog'],
      el['permissions-dialog'], el['place-picker-dialog'], el['entry-dialog'],
      el['backup-dialog'], el['export-report-dialog'], el['report-preview-dialog']
    ];
    const openDialog = dialogs.find((dialog) => dialog?.open);
    if (openDialog) {
      if (openDialog === el['entry-dialog']) closeEntryDialog();
      else if (openDialog === el['place-picker-dialog']) closePlacePicker();
      else if (openDialog === el['backup-dialog']) closeBackupPanel();
      else if (openDialog === el['export-report-dialog'] || openDialog === el['report-preview-dialog']) closeDataDialog(openDialog);
      else openDialog.close();
      return;
    }
    if (activeView !== 'today') {
      switchView('today');
      return;
    }
    window.NativeBridge?.exitApp?.();
  }

  function handleGlobalKeyboard(event) {
    const key = event.key.toLowerCase();
    const targetIsField = event.target.matches('input, textarea, select, [contenteditable="true"]');

    if (event.key === 'Escape') {
      if (el['report-preview-dialog'].open) closeDataDialog(el['report-preview-dialog']);
      else if (el['export-report-dialog'].open) closeDataDialog(el['export-report-dialog']);
      else if (el['backup-dialog'].open) closeBackupPanel();
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
      const shortVersion = String(version.version || '').split(' - ')[0] || '1.0';
      currentAppVersion = shortVersion;
      el['version-label'].textContent = `Wersja ${version.version}`;
      if (el['settings-version-label']) el['settings-version-label'].textContent = `v${shortVersion}`;
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = `v${shortVersion}`; });
      document.title = `Dzienniczek Hormonu v${shortVersion}`;
    } catch (error) {
      currentAppVersion = '1.0.0';
      el['version-label'].textContent = 'Wersja 1.0';
      if (el['settings-version-label']) el['settings-version-label'].textContent = 'v1.0';
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = 'v1.0'; });
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
    if (isNativeAndroidApp()) return null;
    if (!('serviceWorker' in navigator)) return null;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js');
      serviceWorkerRegistration = await navigator.serviceWorker.ready;
      const workerState = await readReminderStateFromServiceWorker();
      mergeReminderStateFromServiceWorker(workerState);
      await syncReminderStateWithServiceWorker();
      await registerPeriodicReminder();
      return serviceWorkerRegistration;
    } catch (error) {
      console.warn('Nie udało się zarejestrować service workera:', error);
      return null;
    }
  }

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
  // Android WebView uruchamia aplikację z file://, dlatego zwykły fetch lokalnej
  // wersji i GitHub API może zostać zablokowany. Dla APK odpowiedzi dostarcza
  // natywny most Java, a PWA nadal używa normalnego fetch().
  const browserFetchBeforeNativeFix = window.fetch.bind(window);
  window.fetch = async function nativeAwareFetch(input, options) {
    const rawUrl = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input || '');
    let absoluteUrl = rawUrl;
    try { absoluteUrl = new URL(rawUrl, window.location.href).href; } catch {}

    if (isNativeAndroidApp() && /\/app-version\.json(?:[?#]|$)/i.test(absoluteUrl)
        && typeof window.AndroidNative?.appVersion === 'function') {
      const version = String(window.AndroidNative.appVersion() || '').trim();
      if (version) {
        return new Response(JSON.stringify({ version }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    if (isNativeAndroidApp() && absoluteUrl === GITHUB_RELEASE_API
        && typeof window.AndroidNative?.latestReleaseJson === 'function') {
      const payload = String(window.AndroidNative.latestReleaseJson() || '').trim();
      if (!payload) return new Response('', { status: 503 });
      try {
        JSON.parse(payload);
        return new Response(payload, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
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

  function safeFilenamePart(value) {
    const normalized = normalizeText(value).replaceAll('ł', 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'profil';
  }

  function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  function downloadFile(filename, content, type) {
    downloadBlob(filename, new Blob([content], { type }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message, type = '', duration = 4200) {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    el['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function showActionToast(message, actionLabel, action, type = 'success', duration = 8000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--action${type ? ` toast--${type}` : ''}`;
    const text = document.createElement('span');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = actionLabel;
    let completed = false;
    const remove = () => { if (toast.isConnected) toast.remove(); };
    button.addEventListener('click', () => {
      if (completed) return;
      completed = true;
      remove();
      action();
    });
    toast.append(text, button);
    el['toast-region'].appendChild(toast);
    window.setTimeout(remove, duration);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
