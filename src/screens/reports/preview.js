let reportPreviewConfig = null;
let reportPreviewReady = false;

function openReportPreview(trigger = null) {
  const config = getReportConfiguration();
  if (!config) return;
  reportPreviewConfig = config;
  createReportModel(config);
  reportPreviewReady = false;
  const frame = el['report-preview-frame'];
  frame.onload = () => {
    reportPreviewReady = true;
    try {
      const height = Math.max(720, frame.contentDocument?.documentElement?.scrollHeight || 720);
      frame.style.height = `${height}px`;
    } catch {}
  };
  frame.srcdoc = reportDocumentHtml(config);
  const returnTarget = trigger?.nodeType === 1 ? trigger : el['report-preview-button'];
  openDataDialog(el['report-preview-dialog'], returnTarget);
}

async function printReportPreview() {
  if (reportJobBusy) return;
  if (window.NativeBridge?.reportPdf && reportPreviewConfig) {
    setReportJobBusy(true);
    try {
      showToast('Przygotowanie do drukowania…');
      const result = await window.NativeBridge.reportPdf(createReportModel(reportPreviewConfig), 'Dzienniczek Hormonu', true);
      if (!result.success && result.state !== 'cancelled') throw new Error(result.state);
    } catch {
      showToast('Nie udało się otworzyć drukowania.', 'error');
    } finally { setReportJobBusy(false); }
    return;
  }
  const frameWindow = el['report-preview-frame']?.contentWindow;
  if (!frameWindow || !reportPreviewReady) {
    showToast('Poczekaj na przygotowanie podglądu raportu.');
    return;
  }
  try { frameWindow.focus(); frameWindow.print(); }
  catch { showToast('Nie udało się otworzyć drukowania.', 'error'); }
}
