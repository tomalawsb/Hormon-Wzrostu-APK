
function openExportReportPanel(trigger = null) {
  const returnTarget = trigger?.nodeType === 1 ? trigger : el['export-report-button'];
  openDataDialog(el['export-report-dialog'], returnTarget);
  window.setTimeout(() => el['export-pdf-button']?.focus(), 30);
}

function openBackupPanel() {
  clearPendingImportPreview();
  renderAutomaticBackupState();
  openDataDialog(el['backup-dialog'], el['backup-panel-button']);
  window.setTimeout(() => el['export-json-button']?.focus(), 30);
}
