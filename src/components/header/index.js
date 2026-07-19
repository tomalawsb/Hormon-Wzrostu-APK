
function updateCurrentDateHeader() {
  el['current-date-label'].textContent = capitalize(
    new Intl.DateTimeFormat('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  );
}
