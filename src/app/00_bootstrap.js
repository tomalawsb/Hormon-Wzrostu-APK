(() => {
  'use strict';

  const STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1';
  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';
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
      'check-update-button', 'download-update-button', 'update-status'
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

    el['check-update-button'].addEventListener('click', () => checkForUpdates());
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

