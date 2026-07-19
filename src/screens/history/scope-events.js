
function handleHistoryProfileScopeChange() {
  historyProfileScope = normalizeProfileScope(el['history-profile-filter'].value);
  renderHistory();
}

function clearHistoryFilters() {
  historyProfileScope = 'all';
  el['history-profile-filter'].value = 'all';
  el['history-search'].value = '';
  el['status-filter'].value = 'all';
  el['site-filter'].value = 'all';
  el['history-correction-filter'].value = 'all';
  renderHistory();
  el['history-search'].focus();
}
