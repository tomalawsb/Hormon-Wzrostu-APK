
  const defaultData = createDefaultData();

  let data = attachActiveProfileAliases(structuredCloneSafe(defaultData));
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
  let lastEntryUndoOperation = null;
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
