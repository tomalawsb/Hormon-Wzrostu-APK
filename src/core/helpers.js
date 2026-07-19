  function iconSvg(name, extraClass = '') {
    const safeName = /^[a-z0-9-]+$/.test(String(name)) ? String(name) : 'info';
    const safeClass = String(extraClass)
      .split(/\s+/)
      .filter((item) => /^[a-z0-9_-]+$/i.test(item))
      .join(' ');
    return `<svg class="app-icon${safeClass ? ` ${safeClass}` : ''}" aria-hidden="true" focusable="false"><use href="#icon-${safeName}"></use></svg>`;
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

  function formatDateTimeShort(value) {
    if (!isValidDateTime(value)) return '';
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
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
