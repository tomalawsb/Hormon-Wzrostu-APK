
function getLatestGivenBefore(referenceDate = new Date()) {
  const referenceMs = referenceDate.getTime();
  return (
    getEntriesSorted().find((entry) => {
      if (entry.status !== 'given' || !entry.side || !entry.site) return false;
      const value = dateTimeFromEntry(entry);
      return value && value.getTime() <= referenceMs;
    }) || null
  );
}

function getSuggestedPlace(referenceDate = new Date()) {
  return getSuggestedPlaceForProfile(getActiveProfile(), referenceDate);
}

function getSuggestedPlaceForProfile(profile, referenceDate = new Date()) {
  const order = sanitizeInjectionOrder(profile?.injectionOrder);
  const enabledIndexes = order
    .map((item, index) => (item.enabled ? index : -1))
    .filter((index) => index >= 0);
  if (!enabledIndexes.length) {
    return {
      side: '',
      site: '',
      rotationItemId: '',
      reason: 'empty-order',
      basedOnEntryId: '',
      basedOnPlace: '',
      historyCount: 0,
    };
  }

  const referenceMs = referenceDate.getTime();
  const history = [...(Array.isArray(profile?.entries) ? profile.entries : [])]
    .sort((a, b) =>
      `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`)
    )
    .filter((entry) => {
      if (entry.status !== 'given' || !entry.side || !entry.site) return false;
      const value = dateTimeFromEntry(entry);
      return value && value.getTime() <= referenceMs;
    });

  if (!history.length) {
    const first = order[enabledIndexes[0]];
    return {
      side: first.side,
      site: first.site,
      rotationItemId: first.id,
      reason: 'first-dose',
      basedOnEntryId: '',
      basedOnPlace: '',
      historyCount: 0,
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
      side: first.side,
      site: first.site,
      rotationItemId: first.id,
      reason: 'last-place-not-in-order',
      basedOnEntryId: lastEntry?.id || '',
      basedOnPlace: lastEntry ? formatPlace(lastEntry.side, lastEntry.site) : '',
      historyCount: history.length,
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
    side: next.side,
    site: next.site,
    rotationItemId: next.id,
    reason: 'after-last-given',
    basedOnEntryId: lastEntry?.id || '',
    basedOnPlace: lastEntry ? formatPlace(lastEntry.side, lastEntry.site) : '',
    historyCount: history.length,
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
  if (!entry?.date || !entry?.time || !isValidIsoDate(entry.date) || !isValidTime(entry.time))
    return null;
  const [year, month, day] = entry.date.split('-').map(Number);
  const [hour, minute] = entry.time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
