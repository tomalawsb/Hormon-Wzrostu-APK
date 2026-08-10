function setVoiceListeningState(listening) {
  isListening = listening;
  el['voice-button'].classList.toggle('is-listening', listening);
  el['voice-button'].setAttribute('aria-pressed', listening ? 'true' : 'false');
  el['voice-button'].querySelector('.voice-button-label').textContent = listening
    ? 'Słucham…'
    : 'Naciśnij i mów';
}

function configureSpeechRecognition() {
  const nativeAndroid =
    window.NativeBridge?.platform === 'android' &&
    typeof window.NativeBridge.startVoiceRecognition === 'function';
  if (nativeAndroid) {
    recognition = {
      isNative: true,
      async start() {
        setVoiceListeningState(true);
        try {
          const result = await window.NativeBridge.startVoiceRecognition();
          setVoiceListeningState(false);
          if (result.success && result.transcript) {
            processVoiceCommand(result.transcript);
          } else if (result.state === 'no_speech') {
            showToast('Nie rozpoznano mowy. Spróbuj ponownie.', 'error');
          } else if (['permission_denied', 'permission_required'].includes(result.state)) {
            showToast(
              'Zezwól aplikacji na dostęp do mikrofonu. Zgodę możesz też włączyć w Więcej → Informacje.',
              'error'
            );
          } else if (result.state === 'network') {
            showToast('Systemowe rozpoznawanie mowy nie ma teraz połączenia.', 'error');
          } else if (!['cancelled', 'timeout'].includes(result.state)) {
            showToast('Rozpoznawanie głosu jest niedostępne na tym urządzeniu.', 'error');
          }
        } catch (error) {
          setVoiceListeningState(false);
          console.warn(error);
          showToast('Nie udało się rozpoznać polecenia.', 'error');
        }
      },
      stop() {
        window.NativeBridge.stopVoiceRecognition?.();
        setVoiceListeningState(false);
      },
    };
    setVoiceReadyState();
    return;
  }

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
    setVoiceListeningState(true);
    announce('Rozpoznawanie głosu uruchomione.');
  });

  recognition.addEventListener('end', () => {
    setVoiceListeningState(false);
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
      network: 'Rozpoznawanie głosu wymaga połączenia obsługiwanego przez przeglądarkę.',
    };
    showToast(messages[event.error] || 'Nie udało się rozpoznać polecenia.', 'error');
  });
}

function setVoiceUnavailableState() {
  el['voice-button'].disabled = true;
  el['voice-button'].classList.add('is-unavailable');
  el['voice-button'].querySelector('.voice-button-label').textContent = 'Niedostępne';
  el['voice-help'].textContent = 'Polecenia głosowe są niedostępne na tym urządzeniu.';
}

function setVoiceReadyState() {
  el['voice-button'].disabled = false;
  el['voice-button'].classList.remove('is-unavailable');
  el['voice-button'].querySelector('.voice-button-label').textContent = 'Naciśnij i mów';
  el['voice-help'].textContent = 'Podanie, pominięcie lub zmiana ampułki.';
}

function toggleVoiceRecognition() {
  if (!recognition) {
    showToast('Rozpoznawanie głosu jest niedostępne na tym urządzeniu.', 'error');
    return;
  }
  if (isListening) {
    recognition.stop();
    return;
  }
  try {
    const started = recognition.start();
    if (started?.catch) started.catch((error) => console.warn(error));
  } catch (error) {
    console.warn(error);
  }
}

function stopVoiceRecognition() {
  if (recognition && isListening) recognition.stop();
}

const VOICE_NUMBER_VALUES = Object.freeze({
  zero: 0,
  jeden: 1,
  jedna: 1,
  jedno: 1,
  pierwszy: 1,
  pierwsza: 1,
  pierwszej: 1,
  dwa: 2,
  dwie: 2,
  drugi: 2,
  druga: 2,
  drugiej: 2,
  trzy: 3,
  trzeci: 3,
  trzecia: 3,
  trzeciej: 3,
  cztery: 4,
  czwarty: 4,
  czwarta: 4,
  czwartej: 4,
  piec: 5,
  piaty: 5,
  piata: 5,
  piatej: 5,
  szesc: 6,
  szosty: 6,
  szosta: 6,
  szostej: 6,
  siedem: 7,
  siodmy: 7,
  siodma: 7,
  siodmej: 7,
  osiem: 8,
  osmy: 8,
  osma: 8,
  osmej: 8,
  dziewiec: 9,
  dziewiaty: 9,
  dziewiata: 9,
  dziewiatej: 9,
  dziesiec: 10,
  dziesiaty: 10,
  dziesiata: 10,
  dziesiatej: 10,
  jedenascie: 11,
  jedenasty: 11,
  jedenasta: 11,
  jedenastej: 11,
  dwanascie: 12,
  dwunasty: 12,
  dwunasta: 12,
  dwunastej: 12,
  trzynascie: 13,
  trzynasty: 13,
  trzynasta: 13,
  trzynastej: 13,
  czternascie: 14,
  czternasty: 14,
  czternasta: 14,
  czternastej: 14,
  pietnascie: 15,
  pietnasty: 15,
  pietnasta: 15,
  pietnastej: 15,
  szesnascie: 16,
  szesnasty: 16,
  szesnasta: 16,
  szesnastej: 16,
  siedemnascie: 17,
  siedemnasty: 17,
  siedemnasta: 17,
  siedemnastej: 17,
  osiemnascie: 18,
  osiemnasty: 18,
  osiemnasta: 18,
  osiemnastej: 18,
  dziewietnascie: 19,
  dziewietnasty: 19,
  dziewietnasta: 19,
  dziewietnastej: 19,
  dwadziescia: 20,
  dwudziesty: 20,
  dwudziesta: 20,
  dwudziestej: 20,
  trzydziesci: 30,
  trzydziesty: 30,
  trzydziesta: 30,
  trzydziestej: 30,
  czterdziesci: 40,
  czterdziesty: 40,
  czterdziesta: 40,
  czterdziestej: 40,
  piecdziesiat: 50,
  piecdziesiaty: 50,
  piecdziesiata: 50,
  piecdziesiatej: 50,
  szescdziesiat: 60,
  siedemdziesiat: 70,
  osiemdziesiat: 80,
  dziewiecdziesiat: 90,
  sto: 100,
  setny: 100,
  setna: 100,
});

function parseSpokenNumber(value) {
  const text = normalizeText(value);
  const numeric = text.match(/\b\d{1,3}\b/);
  if (numeric) return Number(numeric[0]);
  let total = 0;
  let found = false;
  text.split(/\s+/).forEach((token) => {
    if (!Object.hasOwn(VOICE_NUMBER_VALUES, token)) return;
    total += VOICE_NUMBER_VALUES[token];
    found = true;
  });
  return found ? total : null;
}

function parseVoiceAmpouleCommand(normalized) {
  const text = normalizeText(normalized);
  if (!/\bampul\w*/.test(text)) return null;
  const pause = /\b(?:odloz\w*|odklad\w*|zostaw\w*|wstrzymaj\w*|przerwij\w*)\b/.test(
    text
  );
  const resume =
    /\b(?:wroc\w*|wrac\w*|wznow\w*|wznaw\w*|kontynu\w*|przelacz\w*)\b/.test(text);
  if (!pause && !resume) return null;
  return { action: pause ? 'pause' : 'resume', number: parseSpokenNumber(text) };
}

function executeVoiceAmpouleCommand(command) {
  if (!command) return false;
  const number = Number(command.number) || null;
  const matching = number
    ? data.ampoules.find((ampoule) => Number(ampoule.number) === number) || null
    : null;

  if (command.action === 'pause') {
    const active = getActiveAmpoule();
    if (!active) {
      showToast('Nie ma aktywnej ampułki do odłożenia.', 'error');
      return true;
    }
    if (number && Number(active.number) !== number) {
      showToast(`Aktywna jest ampułka ${active.number}.`, 'error');
      return true;
    }
    if (pauseAmpoule(active.id)) speakIfEnabled(`Odłożono ampułkę ${active.number}.`);
    return true;
  }

  let target = matching;
  if (!target && !number) {
    const paused = getOpenPausedAmpoules();
    if (paused.length === 1) target = paused[0];
  }
  if (!target) {
    showToast(number ? `Nie znaleziono ampułki ${number}.` : 'Powiedz numer ampułki.', 'error');
    return true;
  }
  if (target.id === data.activeAmpouleId) {
    showToast(`Ampułka ${target.number} jest już aktywna.`, 'success');
    return true;
  }
  if (getAmpouleRemainingDoseCount(target.id) <= 0) {
    showToast(`Ampułka ${target.number} jest już wykorzystana.`, 'error');
    return true;
  }
  resumeAmpoule(target.id);
  speakIfEnabled(`Wznowiono ampułkę ${target.number}.`);
  return true;
}

function handleVoicePlaceQuestion(normalized) {
  const text = normalizeText(normalized);
  const asksForPlace =
    /\b(?:gdzie|w co|jakie miejsce|ktore miejsce|z ktorej strony)\b/.test(text) &&
    /\b(?:zastrzyk\w*|wkluc\w*|naklu\w*|podac\w*|podam\w*|wstrzyk\w*)\b/.test(text);
  if (!asksForPlace) return false;

  const date = parseDateFromSpeech(text) || localDateISO();
  const existing = getEntryForDate(date);
  let message;
  if (existing?.status === 'given') {
    message = `${formatDateSpeech(date)}: ${formatPlace(existing.side, existing.site)}.`;
  } else if (existing?.status === 'skipped') {
    message = `${formatDateSpeech(date)}: podanie pominięte.`;
  } else {
    const suggestion = getSuggestedPlace(parseISODate(date));
    message = suggestion.side && suggestion.site
      ? `${formatDateSpeech(date)}: proponowane miejsce to ${formatPlace(suggestion.side, suggestion.site)}.`
      : 'Nie ma aktywnego miejsca wkłucia.';
  }
  showToast(capitalize(message), existing?.status === 'skipped' ? 'error' : 'success');
  speakIfEnabled(capitalize(message));
  return true;
}

function voiceProfileVariants(word) {
  const value = normalizeText(word);
  const variants = new Set(value ? [value] : []);
  if (value.length < 2) return variants;

  if (value.endsWith('a')) {
    const stem = value.slice(0, -1);
    if (stem.length >= 3) variants.add(stem);
    ['i', 'y', 'e', 'ie', 'u', 'o'].forEach((ending) => variants.add(`${stem}${ending}`));
    if (stem.endsWith('w')) variants.add(`${stem}ie`); // Ewa → Ewie
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
      matches.push({
        profile,
        score: 200 + normalizedName.length,
        matched: exactMatch[1],
        tokenIndex: -1,
        charIndex,
      });
      return;
    }
    let best = null;
    tokens.forEach((token, tokenIndex) => {
      nameWords.forEach((word, wordIndex) => {
        const score = voiceProfileTokenMatch(token, word) - wordIndex;
        if (score > 0 && (!best || score > best.score))
          best = { score, matched: token, tokenIndex };
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
  let command;
  if (match.tokenIndex >= 0) {
    const commandTokens = [...tokens];
    commandTokens.splice(match.tokenIndex, 1);
    command = commandTokens.join(' ');
  } else {
    const charIndex = Number.isInteger(match.charIndex)
      ? match.charIndex
      : text.indexOf(match.matched);
    command = `${text.slice(0, charIndex)} ${text.slice(charIndex + match.matched.length)}`;
  }
  return { profile: match.profile, command: normalizeText(command), ambiguous: false };
}

function isProfileOnlyVoiceCommand(command) {
  return (
    !command ||
    /^(?:wybierz|wybierz profil|profil|przelacz|przelacz profil|dla|otworz profil|pokaz profil)$/.test(
      command
    )
  );
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
    showToast(
      'Nie wiadomo, którego profilu dotyczy polecenie. Powiedz pełną nazwę profilu.',
      'error'
    );
    speakIfEnabled('Powiedz pełną nazwę profilu.');
    return;
  }

  let normalized = profileMatch.command || originalNormalized;
  const targetProfile = profileMatch.profile;
  if (targetProfile && !activateVoiceProfile(targetProfile)) {
    showToast('Nie udało się przełączyć profilu.', 'error');
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

  const ampouleCommand = parseVoiceAmpouleCommand(normalized);
  if (executeVoiceAmpouleCommand(ampouleCommand)) return;

  if (handleVoicePlaceQuestion(normalized)) return;

  if (
    /\b(zapisz|potwierdz|tak)\b/.test(normalized) &&
    !containsInjectionDetails(normalized) &&
    (quickDraft.status === 'skipped' || (quickDraft.side && quickDraft.site))
  ) {
    saveQuickDraft();
    return;
  }

  if (/\b(kalendarz|pokaz kalendarz)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
    calendarProfileScope = data.activeProfileId;
    switchView('calendar');
    speakIfEnabled(`Otwieram kalendarz profilu ${getActiveProfile().name}.`);
    return;
  }
  if (
    /\b(historia|pokaz historie|ostatni zastrzyk)\b/.test(normalized) &&
    !containsInjectionDetails(normalized)
  ) {
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
  if (
    /\b(popraw|edytuj|wpisz recznie)\b/.test(normalized) &&
    !containsInjectionDetails(normalized)
  ) {
    openEntryDialog(quickDraft.id || null, quickDraft);
    return;
  }

  const voiceRequestedSave = /\b(?:zapisz|potwierdz)\b/.test(normalized);
  const parsed = parseVoiceEntry(normalized);
  if (!Object.keys(parsed).length) {
    showToast('Nie rozpoznano daty, dawki ani miejsca wkłucia.', 'error');
    speakIfEnabled('Nie rozpoznano polecenia.');
    return;
  }
  applyVoiceEntryToDraft(parsed);
  quickDraftTouched = true;
  renderToday();

  if (voiceRequestedSave) {
    saveQuickDraft();
    return;
  }

  const profileName = getActiveProfile().name;
  if (quickDraft.status === 'skipped') {
    const message = `Rozpoznano pominięcie dawki dla profilu ${profileName}, ${formatDateSpeech(quickDraft.date)}.`;
    showToast(
      `${message} Potwierdź przyciskiem „Zapisz” lub powiedz „zapisz ${profileName}”.`,
      'success'
    );
    speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
    if (!data.settings.voiceConfirm && quickDraft.date <= localDateISO()) saveQuickDraft();
    return;
  }

  if (!quickDraft.side || !quickDraft.site) {
    const missing =
      !quickDraft.side && !quickDraft.site
        ? 'stronę i miejsce'
        : !quickDraft.side
          ? 'stronę'
          : 'miejsce';
    const message = `Profil ${profileName}. Rozpoznano częściowo. Data wpisu: ${formatDateSpeech(quickDraft.date)}. Podaj jeszcze ${missing}.`;
    showToast(message, 'error');
    speakIfEnabled(message);
    return;
  }

  const message = `${profileName}: rozpoznano ${formatPlace(quickDraft.side, quickDraft.site)}, dawka ${formatDose(quickDraft.dose)} ${quickDraft.unit}, ${formatDateSpeech(quickDraft.date)}.`;
  showToast(`${message} Potwierdź zapis.`, 'success');
  speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
  if (!data.settings.voiceConfirm && quickDraft.date <= localDateISO()) saveQuickDraft();
}

function applyVoiceEntryToDraft(parsed) {
  let base = quickDraft;
  if (parsed.date && parsed.date !== quickDraft.date) {
    const existing = getEntryForDate(parsed.date);
    base = existing
      ? { ...existing }
      : createDefaultDraft({
          date: parsed.date,
          time:
            parsed.time ||
            (parsed.date === localDateISO() ? localTime() : data.settings.defaultTime),
        });
    quickDraftTimeExplicit = false;
  }
  quickDraft = { ...base, ...parsed };
  if (parsed.time) quickDraftTimeExplicit = true;

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

function parseVoiceEntry(normalized, now = new Date()) {
  const result = {};
  const date = parseDateFromSpeech(normalized, now);
  const time = parseTimeFromSpeech(normalized);
  if (date) result.date = date;
  if (time) result.time = time;

  const skipped =
    /\b(?:pomin\w*|pomij\w*|nie podal\w*|nie podano|nie podaje\w*|nie podam|bez dawki|bez zastrzyku|odpuszcz\w*)\b/.test(
      normalized
    );
  if (skipped) result.status = 'skipped';

  if (/\blew\w*/.test(normalized)) result.side = 'lewa';
  else if (/\bpraw\w*/.test(normalized)) result.side = 'prawa';

  if (/brzuch\w*|brzusz\w*/.test(normalized)) result.site = 'brzuch';
  else if (/\bud\w*|\bnog\w*/.test(normalized)) result.site = 'udo';
  else if (/rami\w*|\brek\w*|\brece\b/.test(normalized)) result.site = 'ramię';
  else if (/poslad\w*|\bpup\w*/.test(normalized)) result.site = 'pośladek';
  else if (/lopatk\w*/.test(normalized)) result.site = 'łopatka';

  const dose = parseDoseFromSpeech(normalized);
  if (dose) result.dose = dose;
  const givenVerb =
    /\b(?:podal\w*|podaje\w*|podam|wstrzykn\w*|wstrzykuj\w*|naklu\w*|wkluw\w*|zrobil\w*|zrobie|zastrzyk)\b/.test(
      normalized
    );
  if (!skipped && (result.side || result.site || result.dose || givenVerb)) {
    result.status = 'given';
  }
  return result;
}

function parseDateFromSpeech(text, now = new Date()) {
  if (/przedwczoraj/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 2);
    return localDateISO(date);
  }
  if (/wczoraj/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return localDateISO(date);
  }
  if (/dzis/.test(text)) return localDateISO(now);
  if (/popojutrze/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 3);
    return localDateISO(date);
  }
  if (/pojutrze/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 2);
    return localDateISO(date);
  }
  if (/jutro/.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return localDateISO(date);
  }

  const daysAgo = text.match(/\b(.+?)\s+dni?\s+temu\b/);
  if (daysAgo) {
    const amount = parseSpokenNumber(daysAgo[1]);
    if (amount !== null && amount >= 0 && amount <= 366) {
      const date = new Date(now);
      date.setDate(date.getDate() - amount);
      return localDateISO(date);
    }
  }
  const daysAhead = text.match(/\bza\s+(.+?)\s+(?:dni|dzien)\b/);
  if (daysAhead) {
    const amount = parseSpokenNumber(daysAhead[1]);
    if (amount !== null && amount >= 0 && amount <= 366) {
      const date = new Date(now);
      date.setDate(date.getDate() + amount);
      return localDateISO(date);
    }
  }

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

  const weekdays = [
    { pattern: /niedziel\w*/, day: 0 },
    { pattern: /poniedzial\w*/, day: 1 },
    { pattern: /wtork\w*|wtorek/, day: 2 },
    { pattern: /srod\w*/, day: 3 },
    { pattern: /czwart\w*/, day: 4 },
    { pattern: /piat\w*/, day: 5 },
    { pattern: /sobot\w*/, day: 6 },
  ];
  const weekday = weekdays.find((item) => item.pattern.test(text));
  if (weekday) {
    let offset = weekday.day - now.getDay();
    const previous = /\b(?:zeszl\w*|minion\w*|ostatni\w*)\b/.test(text);
    if (previous) {
      if (offset >= 0) offset -= 7;
    } else if (offset <= 0) {
      offset += 7;
    }
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return localDateISO(date);
  }
  return '';
}

function parseTimeFromSpeech(text) {
  const match = text.match(/(?:godzina|godzine|\bo)\s+(\d{1,2})(?:(?::|\s)(\d{2}))?\b/);
  if (match) {
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (hour <= 23 && minute <= 59) return `${pad(hour)}:${pad(minute)}`;
  }

  const marker = text.match(/(?:godzina|godzinie|godzine|\bo)\s+/);
  if (!marker) return '';
  const tokens = [];
  for (const token of text
    .slice((marker.index || 0) + marker[0].length)
    .split(/\s+/)) {
    if (!Object.hasOwn(VOICE_NUMBER_VALUES, token)) break;
    tokens.push(token);
    if (tokens.length === 3) break;
  }
  if (!tokens.length) return '';
  for (let hourLength = Math.min(2, tokens.length); hourLength >= 1; hourLength -= 1) {
    const hour = parseSpokenNumber(tokens.slice(0, hourLength).join(' '));
    const minute = tokens.length > hourLength
      ? parseSpokenNumber(tokens.slice(hourLength).join(' '))
      : 0;
    if (hour !== null && minute !== null && hour <= 23 && minute <= 59) {
      return `${pad(hour)}:${pad(minute)}`;
    }
  }
  return '';
}

function parseDoseFromSpeech(text) {
  const numeric = text.match(/dawk\w*\s+(\d+(?:[.,]\d+)?)/);
  if (numeric) return normalizeDose(numeric[1]);

  const wordMatch = text.match(
    /dawk\w*\s+([a-z\s]+?)(?=\s+(?:lew|praw|brzuch|udo|nog|ramie|poslad|lopatk|dzis|wczoraj|godzin)|$)/
  );
  if (!wordMatch) return '';
  const phrase = wordMatch[1].trim();
  const parts = phrase.split(/\s+(?:przecinek|kropka)\s+/);
  const left = parseSpokenNumber(parts[0]);
  if (left === null) return '';
  if (parts.length === 1) return normalizeDose(String(left));
  const rightTokens = parts[1]
    .split(/\s+/)
    .map((token) => VOICE_NUMBER_VALUES[token])
    .filter((token) => token !== undefined && token >= 0 && token <= 9);
  return rightTokens.length ? normalizeDose(`${left},${rightTokens.join('')}`) : '';
}

function containsInjectionDetails(text) {
  return /brzuch|brzusz|\bud\w*|nog|rami|poslad|pup|lopatk|dawk|pomin|pomij|zastrzyk|naklu|wkluw|wstrzy|lew\w*|praw\w*/.test(
    text
  );
}

function speakIfEnabled(text) {
  if (!data.settings.voiceFeedback || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pl-PL';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}
