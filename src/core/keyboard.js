
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
    const viewMap = { 1: 'today', 2: 'calendar', 3: 'history', 4: 'more' };
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
