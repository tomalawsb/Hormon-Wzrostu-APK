
async function exportCsv() {
  const config = getReportConfiguration();
  if (!config) return false;
  const columns = getReportColumns(config);
  const header = columns.map((column) => column.label);
  const rows = config.records.map((record) =>
    columns.map((column) => getReportRecordValue(record, column.key))
  );
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  try {
    const saved = await downloadFile(
      `dzienniczek-historia-${getReportFilenameScope(config)}-${localDateISO()}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    if (!saved) {
      showToast('Anulowano zapis historii CSV.');
      return false;
    }
    showToast(isNativeAndroidApp() ? 'Zapisano historię CSV.' : 'Pobrano historię CSV.', 'success');
    return true;
  } catch (error) {
    console.error('Nie udało się zapisać CSV:', error);
    showToast('Nie udało się zapisać historii CSV.', 'error');
    return false;
  }
}
