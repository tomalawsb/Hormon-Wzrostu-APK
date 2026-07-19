
  function getToastRegion(type = '') {
    if (type !== 'error') return el['toast-region'];
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const topDialog = openDialogs.at(-1);
    if (!topDialog) return el['toast-region'];
    let region = topDialog.querySelector('.toast-region--dialog');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region toast-region--dialog';
      region.setAttribute('role', 'alert');
      region.setAttribute('aria-live', 'assertive');
      region.setAttribute('aria-atomic', 'true');
      topDialog.appendChild(region);
    }
    return region;
  }

  function prepareToastRegion(type = '') {
    const activeError = document.querySelector('.toast--error');
    if (type !== 'error' && activeError) return null;
    if (type === 'error') {
      document.querySelectorAll('.toast').forEach((item) => item.remove());
    }
    return getToastRegion(type);
  }

  function showToast(message, type = '', duration = 4200) {
    const region = prepareToastRegion(type);
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    if (type === 'error') toast.setAttribute('role', 'alert');
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function showActionToast(message, actionLabel, action, type = 'success', duration = 8000) {
    const region = prepareToastRegion(type);
    if (!region) return;
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
    region.appendChild(toast);
    window.setTimeout(remove, duration);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
