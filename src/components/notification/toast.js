
  function showToast(message, type = '', duration = 4200) {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    el['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function showActionToast(message, actionLabel, action, type = 'success', duration = 8000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--action${type ? ` toast--${type}` : ''}`;
    const text = document.createElement('span');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = actionLabel;
    let completed = false;
    const remove = () => { if (toast.isConnected) toast.remove(); };
    button.addEventListener('click', () => {
      if (completed) return;
      completed = true;
      remove();
      action();
    });
    toast.append(text, button);
    el['toast-region'].appendChild(toast);
    window.setTimeout(remove, duration);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
