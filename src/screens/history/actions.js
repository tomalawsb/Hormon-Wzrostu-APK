
function handleHistoryAction(event) {
  const editButton = event.target.closest('[data-edit-id]');
  const deleteButton = event.target.closest('[data-delete-id]');
  const button = editButton || deleteButton;
  if (!button) return;
  if (!activateProfileForEntryAction(button.dataset.entryProfileId || data.activeProfileId)) return;
  if (editButton) openEntryDialog(editButton.dataset.editId);
  if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
}

function handleDayDetailsAction(event) {
  const editButton = event.target.closest('[data-edit-id]');
  if (!editButton) return;
  if (!activateProfileForEntryAction(editButton.dataset.entryProfileId || data.activeProfileId))
    return;
  openEntryDialog(editButton.dataset.editId);
}

function deleteEntryFromDialog() {
  const id = el['entry-id'].value;
  if (id) deleteEntry(id, true);
}

function deleteEntry(id, closeDialogAfter = false) {
  const entry = data.entries.find((item) => item.id === id);
  if (!entry) return;
  if (
    !window.confirm(
      `Usunąć wpis z ${formatDateShort(entry.date)} dla profilu ${getActiveProfile().name}?`
    )
  )
    return;
  const undoOperation = captureEntryUndoOperation(entry.id, entry);
  data.entries = data.entries.filter((item) => item.id !== id);
  reconcileAmpouleStatuses();
  finalizeEntryUndoOperation(undoOperation, null);
  if (!persistData()) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
    });
    return;
  }
  if (closeDialogAfter) closeEntryDialog();
  resetQuickDraftForToday();
  renderAll();
  showEntryUndo('Wpis został usunięty.', undoOperation);
}
