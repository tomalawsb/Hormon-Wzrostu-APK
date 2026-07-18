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

