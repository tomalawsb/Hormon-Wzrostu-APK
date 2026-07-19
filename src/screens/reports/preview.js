
function openReportPreview(trigger = null) {
  const config = getReportConfiguration();
  if (!config) return;
  const frame = el['report-preview-frame'];
  frame.srcdoc = reportDocumentHtml(config);
  frame.onload = () => {
    try {
      const height = Math.max(720, frame.contentDocument?.documentElement?.scrollHeight || 720);
      frame.style.height = `${height}px`;
    } catch {}
  };
  const returnTarget = trigger?.nodeType === 1 ? trigger : el['report-preview-button'];
  openDataDialog(el['report-preview-dialog'], returnTarget);
}

function printReportPreview() {
  const frameWindow = el['report-preview-frame']?.contentWindow;
  if (!frameWindow) {
    showToast('Nie udało się otworzyć podglądu raportu.', 'error');
    return;
  }
  frameWindow.focus();
  frameWindow.print();
}
