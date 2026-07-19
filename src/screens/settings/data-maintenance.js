
function clearAllEntries() {
  if (!data.entries.length) {
    showToast('Historia jest już pusta.');
    return;
  }
  if (
    !window.confirm(
      `Usunąć wszystkie wpisy profilu „${getActiveProfile().name}”? Dane innych profili pozostaną bez zmian. Tej operacji nie można cofnąć.`
    )
  )
    return;
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
  let lastReminder;
  try {
    lastReminder = Number(localStorage.getItem(BACKUP_REMINDER_KEY) || 0);
  } catch (error) {
    console.warn(error);
    return;
  }

  const now = Date.now();
  if (!Number.isFinite(lastReminder) || lastReminder <= 0) {
    try {
      localStorage.setItem(BACKUP_REMINDER_KEY, String(now));
    } catch (error) {
      console.warn(error);
    }
    return;
  }
  if (now - lastReminder < BACKUP_REMINDER_INTERVAL_MS) return;

  try {
    localStorage.setItem(BACKUP_REMINDER_KEY, String(now));
  } catch (error) {
    console.warn(error);
  }
  window.setTimeout(() => {
    const accepted = window.confirm(
      'Minęły 3 dni od ostatniego przypomnienia o kopii zapasowej. Czy pobrać teraz pełną kopię danych?'
    );
    if (accepted) exportJson();
    else showToast('Przypomnę ponownie za 3 dni.', 'success');
  }, 1200);
}
