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
  const MAX_PROFILE_MEDICAL_TEXT_LENGTH = 2000;
  const MAX_PROFILE_MEASUREMENTS = 500;
  const MAX_PROFILE_DOSE_CHANGES = 500;
  const ALLOWED_UNITS = new Set(['mg', 'ml', 'IU', 'j.m.']);
  const ALLOWED_SIDES = new Set(['lewa', 'prawa']);
  const ALLOWED_SITES = new Set(['brzuch', 'udo', 'ramię', 'pośladek', 'łopatka']);
  const ALLOWED_STATUSES = new Set(['given', 'skipped']);
  const ALLOWED_AMPOULE_STATUSES = new Set(['active', 'paused', 'finished']);
  const ALLOWED_THEME_MODES = new Set([
    'system',
    'light',
    'dark',
    'elegant',
    'amber',
    'silver',
    'lavender',
  ]);
  const DEFAULT_THEME_MODE = 'system';
  const ALLOWED_FONT_SIZES = new Set(['small', 'standard', 'large', 'xlarge']);
  const DEFAULT_FONT_SIZE = 'standard';
  const ALLOWED_FONT_STYLES = new Set(['system', 'readable', 'classic']);
  const DEFAULT_FONT_STYLE = 'system';
  const DEFAULT_AMPOULE_VOLUME_ML = '10';
  const DATA_SCHEMA_VERSION = 13;
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
