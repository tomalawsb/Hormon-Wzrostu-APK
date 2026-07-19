
function openDataDialog(dialog, trigger) {
  if (!dialog) return;
  dataDialogReturnTarget = trigger || document.activeElement;
  if (!dialog.open) dialog.showModal();
}

function closeDataDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function returnToDataSection() {
  const section = el['data-backup-section'];
  window.setTimeout(() => {
    section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (dataDialogReturnTarget instanceof HTMLElement)
      dataDialogReturnTarget.focus({ preventScroll: true });
    dataDialogReturnTarget = null;
  }, 40);
}
