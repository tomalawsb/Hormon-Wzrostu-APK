
function exportCsv() {
  const config = getReportConfiguration();
  if (!config) return false;
  const columns = getReportColumns(config);
  const header = columns.map((column) => column.label);
  const rows = config.records.map((record) =>
    columns.map((column) => getReportRecordValue(record, column.key))
  );
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  downloadFile(
    `dzienniczek-historia-${getReportFilenameScope(config)}-${localDateISO()}.csv`,
    csv,
    'text/csv;charset=utf-8'
  );
  showToast('Pobrano historię CSV.', 'success');
  return true;
}
