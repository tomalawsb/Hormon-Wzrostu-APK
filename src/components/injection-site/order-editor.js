let draggedInjectionOrderId = '';
let draggedInjectionOrderDropAfter = false;
let injectionOrderPointerState = null;

function saveInjectionOrder(nextOrder, { render = true, notify = true } = {}) {
  const profile = getActiveProfile();
  const previous = structuredCloneSafe(profile.injectionOrder);
  const previousUpdatedAt = profile.updatedAt;
  profile.injectionOrder = sanitizeInjectionOrder(nextOrder);
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.injectionOrder = previous;
    profile.updatedAt = previousUpdatedAt;
    return false;
  }
  if (render) {
    renderInjectionOrderSettings();
    renderToday();
  }
  if (notify) showToast('Zapisano kolejność miejsc wkłucia.', 'success');
  return true;
}

function addInjectionOrderItem(side, site, options = {}) {
  if (!ALLOWED_SIDES.has(side) || !ALLOWED_SITES.has(site)) return false;
  const next = [...data.injectionOrder, { id: createId(), side, site, enabled: true }];
  return saveInjectionOrder(next, options);
}

function moveInjectionOrderItem(itemId, direction, options = {}) {
  const index = data.injectionOrder.findIndex((item) => item.id === itemId);
  if (index < 0) return false;
  const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (target < 0 || target >= data.injectionOrder.length) return false;
  const next = structuredCloneSafe(data.injectionOrder);
  [next[index], next[target]] = [next[target], next[index]];
  return saveInjectionOrder(next, { notify: false, ...options });
}

function moveInjectionOrderItemRelative(itemId, targetId, placeAfter = false, options = {}) {
  if (!itemId || !targetId || itemId === targetId) return false;
  const next = structuredCloneSafe(data.injectionOrder);
  const sourceIndex = next.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0 || !next.some((item) => item.id === targetId)) return false;
  const [item] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) return false;
  next.splice(targetIndex + (placeAfter ? 1 : 0), 0, item);
  return saveInjectionOrder(next, { notify: false, ...options });
}

function setInjectionOrderItemEnabled(itemId, enabled, options = {}) {
  const next = structuredCloneSafe(data.injectionOrder);
  const item = next.find((entry) => entry.id === itemId);
  if (!item) return false;
  item.enabled = Boolean(enabled);
  const saved = saveInjectionOrder(next, { notify: false, ...options });
  if (saved && !next.some((entry) => entry.enabled)) {
    showToast(
      'Wyłączono wszystkie miejsca. Aplikacja nie zaproponuje miejsca, dopóki nie włączysz co najmniej jednego.',
      'error',
      7000
    );
  }
  return saved;
}

function duplicateInjectionOrderItem(itemId, options = {}) {
  const index = data.injectionOrder.findIndex((item) => item.id === itemId);
  if (index < 0) return false;
  const next = structuredCloneSafe(data.injectionOrder);
  next.splice(index + 1, 0, { ...next[index], id: createId() });
  return saveInjectionOrder(next, options);
}

function removeInjectionOrderItem(itemId, options = {}) {
  if (data.injectionOrder.length <= 1) {
    showToast('Kolejność musi zawierać co najmniej jedną pozycję.', 'error');
    return false;
  }
  const next = data.injectionOrder.filter((item) => item.id !== itemId);
  if (next.length === data.injectionOrder.length) return false;
  const saved = saveInjectionOrder(next, options);
  if (saved && !next.some((item) => item.enabled)) {
    showToast(
      'Nie ma aktywnych miejsc wkłucia. Włącz co najmniej jedno miejsce, aby otrzymywać propozycje.',
      'error',
      7000
    );
  }
  return saved;
}

function resetInjectionOrder(options = {}) {
  return saveInjectionOrder(createDefaultInjectionOrder(), options);
}

function renderInjectionOrderSettings() {
  if (!el['injection-order-list']) return;
  const profile = getActiveProfile();
  const order = profile.injectionOrder;
  const enabledCount = order.filter((item) => item.enabled).length;
  el['injection-order-summary'].textContent =
    `${enabledCount} z ${order.length} ${plural(order.length, 'pozycji', 'pozycji', 'pozycji')} aktywnych dla profilu ${profile.name}`;
  if (el['injection-order-warning']) {
    el['injection-order-warning'].classList.toggle('is-hidden', enabledCount > 0);
    el['injection-order-warning'].textContent =
      enabledCount > 0
        ? ''
        : 'Brak aktywnych miejsc. Propozycje są wstrzymane — włącz co najmniej jedną pozycję.';
  }
  el['injection-order-list'].innerHTML = order
    .map(
      (item, index) => `
      <article class="injection-order-item${item.enabled ? '' : ' is-disabled'}" draggable="true" data-injection-order-id="${escapeHtml(item.id)}">
        <span class="injection-order-handle" title="Przeciągnij myszką lub palcem, aby zmienić kolejność" aria-label="Przeciągnij, aby zmienić kolejność" role="button" tabindex="0">⋮⋮</span>
        <span class="injection-order-number">${index + 1}</span>
        <div class="injection-order-label">
          <strong>${escapeHtml(capitalize(formatPlace(item.side, item.site)))}</strong>
          <small>${item.enabled ? 'Uwzględniane w propozycjach' : 'Pominięte w propozycjach'}</small>
        </div>
        <label class="injection-order-toggle" title="Włącz lub wyłącz pozycję">
          <input type="checkbox" data-injection-order-toggle="${escapeHtml(item.id)}" ${item.enabled ? 'checked' : ''}>
          <span>${item.enabled ? 'Włączone' : 'Wyłączone'}</span>
        </label>
        <div class="injection-order-actions">
          <button class="mini-button" type="button" data-injection-order-action="up" data-injection-order-id="${escapeHtml(item.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Przesuń wyżej">${iconSvg('arrow-up')}</button>
          <button class="mini-button" type="button" data-injection-order-action="down" data-injection-order-id="${escapeHtml(item.id)}" ${index === order.length - 1 ? 'disabled' : ''} aria-label="Przesuń niżej">${iconSvg('arrow-down')}</button>
          <button class="mini-button" type="button" data-injection-order-action="duplicate" data-injection-order-id="${escapeHtml(item.id)}">Powtórz</button>
          <button class="mini-button mini-button--danger" type="button" data-injection-order-action="remove" data-injection-order-id="${escapeHtml(item.id)}">Usuń</button>
        </div>
      </article>
    `
    )
    .join('');
}

function handleInjectionOrderAction(event) {
  const button = event.target.closest('[data-injection-order-action][data-injection-order-id]');
  if (!button) return;
  const itemId = button.dataset.injectionOrderId;
  const action = button.dataset.injectionOrderAction;
  if (action === 'up' || action === 'down') moveInjectionOrderItem(itemId, action);
  else if (action === 'duplicate') duplicateInjectionOrderItem(itemId);
  else if (action === 'remove') removeInjectionOrderItem(itemId);
}

function handleInjectionOrderToggle(event) {
  const input = event.target.closest('[data-injection-order-toggle]');
  if (!input) return;
  setInjectionOrderItemEnabled(input.dataset.injectionOrderToggle, input.checked);
}

function clearInjectionOrderDragClasses() {
  el['injection-order-list']
    ?.querySelectorAll(
      '.is-dragging, .is-drag-target, .is-drag-target-before, .is-drag-target-after'
    )
    .forEach((item) =>
      item.classList.remove(
        'is-dragging',
        'is-drag-target',
        'is-drag-target-before',
        'is-drag-target-after'
      )
    );
}

function markInjectionOrderDropTarget(target, placeAfter) {
  clearInjectionOrderDragClasses();
  const sourceId = injectionOrderPointerState?.itemId || draggedInjectionOrderId;
  const source = sourceId
    ? el['injection-order-list']?.querySelector(
        `.injection-order-item[data-injection-order-id="${CSS.escape(sourceId)}"]`
      )
    : null;
  source?.classList.add('is-dragging');
  if (!target || target.dataset.injectionOrderId === sourceId) return;
  target.classList.add(
    'is-drag-target',
    placeAfter ? 'is-drag-target-after' : 'is-drag-target-before'
  );
}

function handleInjectionOrderDragStart(event) {
  const item = event.target.closest('.injection-order-item[data-injection-order-id]');
  if (!item || !el['injection-order-list'].contains(item)) return;
  draggedInjectionOrderId = item.dataset.injectionOrderId;
  draggedInjectionOrderDropAfter = false;
  item.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedInjectionOrderId);
  }
}

function handleInjectionOrderDragOver(event) {
  const target = event.target.closest('.injection-order-item[data-injection-order-id]');
  if (
    !target ||
    !el['injection-order-list'].contains(target) ||
    !draggedInjectionOrderId ||
    target.dataset.injectionOrderId === draggedInjectionOrderId
  )
    return;
  event.preventDefault();
  const rect = target.getBoundingClientRect();
  draggedInjectionOrderDropAfter = event.clientY >= rect.top + rect.height / 2;
  markInjectionOrderDropTarget(target, draggedInjectionOrderDropAfter);
}

function handleInjectionOrderDrop(event) {
  const target = event.target.closest('.injection-order-item[data-injection-order-id]');
  if (!target || !el['injection-order-list'].contains(target) || !draggedInjectionOrderId) return;
  event.preventDefault();
  const sourceId = draggedInjectionOrderId;
  const targetId = target.dataset.injectionOrderId;
  const placeAfter = draggedInjectionOrderDropAfter;
  handleInjectionOrderDragEnd();
  moveInjectionOrderItemRelative(sourceId, targetId, placeAfter);
}

function handleInjectionOrderDragEnd() {
  draggedInjectionOrderId = '';
  draggedInjectionOrderDropAfter = false;
  clearInjectionOrderDragClasses();
}

function handleInjectionOrderPointerDown(event) {
  if (event.pointerType === 'mouse' || event.button !== 0 || event.isPrimary === false) return;
  const handle = event.target.closest('.injection-order-handle');
  const item = handle?.closest('.injection-order-item[data-injection-order-id]');
  if (!handle || !item) return;
  injectionOrderPointerState = {
    pointerId: event.pointerId,
    itemId: item.dataset.injectionOrderId,
    startX: event.clientX,
    startY: event.clientY,
    targetId: '',
    placeAfter: false,
    moved: false,
    captureElement: handle,
  };
  item.classList.add('is-dragging');
  try {
    handle.setPointerCapture?.(event.pointerId);
  } catch {}
  event.preventDefault();
}

function handleInjectionOrderPointerMove(event) {
  const state = injectionOrderPointerState;
  if (!state || event.pointerId !== state.pointerId) return;
  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (!state.moved && distance < 6) return;
  state.moved = true;
  event.preventDefault();

  const target = document
    .elementFromPoint?.(event.clientX, event.clientY)
    ?.closest?.('.injection-order-item[data-injection-order-id]');
  if (
    !target ||
    !el['injection-order-list'].contains(target) ||
    target.dataset.injectionOrderId === state.itemId
  ) {
    state.targetId = '';
    markInjectionOrderDropTarget(null, false);
    return;
  }

  const rect = target.getBoundingClientRect();
  state.targetId = target.dataset.injectionOrderId;
  state.placeAfter = event.clientY >= rect.top + rect.height / 2;
  markInjectionOrderDropTarget(target, state.placeAfter);

  const edge = 56;
  if (event.clientY < edge) window.scrollBy?.({ top: -12, behavior: 'auto' });
  else if (event.clientY > window.innerHeight - edge)
    window.scrollBy?.({ top: 12, behavior: 'auto' });
}

function finishInjectionOrderPointerDrag(event, performMove) {
  const state = injectionOrderPointerState;
  if (!state || event.pointerId !== state.pointerId) return;
  const { itemId, targetId, placeAfter, moved, captureElement } = state;
  injectionOrderPointerState = null;
  try {
    captureElement?.releasePointerCapture?.(event.pointerId);
  } catch {}
  clearInjectionOrderDragClasses();
  if (performMove && moved && targetId)
    moveInjectionOrderItemRelative(itemId, targetId, placeAfter);
}

function handleInjectionOrderPointerUp(event) {
  finishInjectionOrderPointerDrag(event, true);
}

function handleInjectionOrderPointerCancel(event) {
  finishInjectionOrderPointerDrag(event, false);
}

function addInjectionOrderFromSettings() {
  addInjectionOrderItem(el['injection-order-side'].value, el['injection-order-site'].value);
}

function resetInjectionOrderFromSettings() {
  if (!window.confirm('Przywrócić domyślną kolejność miejsc wkłucia dla aktywnego profilu?'))
    return;
  resetInjectionOrder();
}
