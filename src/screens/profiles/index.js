let profileEditorIcon = DEFAULT_PROFILE_ICON;
let profileEditorColor = DEFAULT_PROFILE_COLOR;
let pendingDeleteProfileId = '';

function renderProfileControls() {
  const activeProfile = getActiveProfile();
  el['active-profile-name'].textContent = activeProfile.name;
  el['active-profile-avatar'].textContent = activeProfile.icon;
  el['active-profile-avatar'].dataset.profileColor = activeProfile.color;
  el['active-profile-button'].setAttribute(
    'aria-label',
    `Aktywny profil: ${activeProfile.name}. Zmień profil dziecka.`
  );

  const availableCount = getAvailableProfiles().length;
  const archivedCount = getArchivedProfiles().length;
  const availableText = `${availableCount} ${plural(availableCount, 'aktywny profil', 'aktywne profile', 'aktywnych profili')}`;
  el['profiles-summary'].textContent = archivedCount
    ? `${availableText} · ${archivedCount} ${plural(archivedCount, 'archiwalny', 'archiwalne', 'archiwalnych')}`
    : availableText;

  renderProfilesList();
}

function openProfilesDialog() {
  renderProfilesList();
  if (!el['profiles-dialog'].open) el['profiles-dialog'].showModal();
}

function closeProfilesDialog() {
  if (el['profiles-dialog'].open) el['profiles-dialog'].close();
}

function renderProfilesList() {
  if (!el['profiles-list']) return;
  const available = getAvailableProfiles();
  const archived = getArchivedProfiles();
  const activeId = data.activeProfileId;

  const renderProfileCard = (profile, archivedProfile = false) => {
    const active = profile.id === activeId;
    const entriesCount = profile.entries.length;
    const ampoulesCount = profile.ampoules.length;
    const meta = [
      `${entriesCount} ${plural(entriesCount, 'wpis', 'wpisy', 'wpisów')}`,
      `${ampoulesCount} ${plural(ampoulesCount, 'ampułka', 'ampułki', 'ampułek')}`,
    ].join(' · ');
    return `
        <article class="profile-list-item${active ? ' is-active' : ''}${archivedProfile ? ' is-archived' : ''}" data-profile-id="${escapeHtml(profile.id)}">
          <span class="profile-avatar profile-avatar--large" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <div class="profile-list-item__content">
            <div class="profile-list-item__title">
              <strong>${escapeHtml(profile.name)}</strong>
              ${active ? '<span class="profile-state-badge">Aktywny</span>' : ''}
              ${archivedProfile ? '<span class="profile-state-badge profile-state-badge--archived">Archiwum</span>' : ''}
            </div>
            <span>${escapeHtml(meta)}</span>
          </div>
          <div class="profile-list-item__actions">
            ${!archivedProfile && !active ? `<button class="mini-button" type="button" data-profile-action="select" data-profile-id="${escapeHtml(profile.id)}">Wybierz</button>` : ''}
            <button class="mini-button" type="button" data-profile-action="edit" data-profile-id="${escapeHtml(profile.id)}">Edytuj</button>
            ${
              archivedProfile
                ? `<button class="mini-button" type="button" data-profile-action="restore" data-profile-id="${escapeHtml(profile.id)}">Przywróć</button>`
                : `<button class="mini-button" type="button" data-profile-action="archive" data-profile-id="${escapeHtml(profile.id)}">Archiwizuj</button>`
            }
            <button class="mini-button mini-button--danger" type="button" data-profile-action="delete" data-profile-id="${escapeHtml(profile.id)}">Usuń</button>
          </div>
        </article>
      `;
  };

  let html = '<section class="profiles-section"><h3>Aktywne profile</h3>';
  html += available.map((profile) => renderProfileCard(profile)).join('');
  html += '</section>';
  if (archived.length) {
    html += '<section class="profiles-section profiles-section--archived"><h3>Archiwum</h3>';
    html += archived.map((profile) => renderProfileCard(profile, true)).join('');
    html += '</section>';
  }
  el['profiles-list'].innerHTML = html;
  el['add-profile-button'].disabled = data.profiles.length >= MAX_PROFILES;
  el['add-profile-button'].title =
    data.profiles.length >= MAX_PROFILES
      ? `Osiągnięto limit ${MAX_PROFILES} profili.`
      : 'Dodaj nowy profil dziecka';
}

function handleProfilesListAction(event) {
  const button = event.target.closest('[data-profile-action][data-profile-id]');
  if (!button) return;
  const profileId = button.dataset.profileId;
  const action = button.dataset.profileAction;
  if (action === 'select') selectProfileFromDialog(profileId);
  else if (action === 'edit') openProfileEditor(profileId);
  else if (action === 'archive') archiveProfile(profileId);
  else if (action === 'restore') restoreProfile(profileId);
  else if (action === 'delete') openProfileDeleteDialog(profileId);
}

function selectProfileFromDialog(profileId) {
  const profile = getProfileById(profileId);
  if (!profile || profile.archivedAt) return;
  closeProfilesDialog();
  todayDashboardMode = 'profile';
  if (setActiveProfileId(profileId, { refresh: true })) {
    showToast(`Wybrano profil: ${profile.name}.`, 'success');
  }
}

function openProfileEditor(profileId = '') {
  const profile = profileId ? getProfileById(profileId) : null;
  if (!profile && data.profiles.length >= MAX_PROFILES) {
    showToast(`Można utworzyć maksymalnie ${MAX_PROFILES} profili.`, 'error');
    return;
  }

  profileEditorIcon = profile?.icon || DEFAULT_PROFILE_ICON;
  profileEditorColor = profile?.color || DEFAULT_PROFILE_COLOR;
  el['profile-editor-title'].textContent = profile ? 'Edytuj profil' : 'Dodaj profil';
  el['profile-editor-id'].value = profile?.id || '';
  el['profile-name-input'].value = profile?.name || '';
  renderProfileEditorChoices();
  closeProfilesDialog();
  if (!el['profile-editor-dialog'].open) el['profile-editor-dialog'].showModal();
  window.setTimeout(() => el['profile-name-input'].focus(), 0);
}

function closeProfileEditor() {
  if (el['profile-editor-dialog'].open) el['profile-editor-dialog'].close();
  openProfilesDialog();
}

function renderProfileEditorChoices() {
  el['profile-icon-options'].querySelectorAll('[data-profile-icon]').forEach((button) => {
    const active = button.dataset.profileIcon === profileEditorIcon;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  el['profile-color-options'].querySelectorAll('[data-profile-color]').forEach((button) => {
    const active = button.dataset.profileColor === profileEditorColor;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function handleProfileIconSelection(event) {
  const button = event.target.closest('[data-profile-icon]');
  if (!button) return;
  profileEditorIcon = sanitizeProfileIcon(button.dataset.profileIcon);
  renderProfileEditorChoices();
}

function handleProfileColorSelection(event) {
  const button = event.target.closest('[data-profile-color]');
  if (!button) return;
  profileEditorColor = sanitizeProfileColor(button.dataset.profileColor);
  renderProfileEditorChoices();
}

function saveProfileEditor(event) {
  event.preventDefault();
  const profileId = sanitizeProfileId(el['profile-editor-id'].value);
  const name = sanitizeProfileName(el['profile-name-input'].value);
  if (!name) {
    showToast('Wpisz nazwę dziecka.', 'error');
    el['profile-name-input'].focus();
    return;
  }
  if (isProfileNameTaken(name, profileId)) {
    showToast('Profil o takiej nazwie już istnieje.', 'error');
    el['profile-name-input'].focus();
    return;
  }

  if (profileId) {
    const profile = getProfileById(profileId);
    if (!profile) {
      showToast('Nie znaleziono profilu do edycji.', 'error');
      return;
    }
    const result = updateProfileData(profileId, {
      name,
      icon: profileEditorIcon,
      color: profileEditorColor,
    });
    if (!result.ok) return;
    el['profile-editor-dialog'].close();
    renderAll();
    syncReminderStateWithServiceWorker();
    openProfilesDialog();
    showToast(`Zapisano profil: ${name}.`, 'success');
    return;
  }

  if (data.profiles.length >= MAX_PROFILES) {
    showToast(`Można utworzyć maksymalnie ${MAX_PROFILES} profili.`, 'error');
    return;
  }
  const result = addProfileData({ name, icon: profileEditorIcon, color: profileEditorColor });
  if (!result.ok) return;
  todayDashboardMode = 'profile';
  el['profile-editor-dialog'].close();
  resetQuickDraftForToday();
  renderAll();
  scheduleDailyReminder();
  syncReminderStateWithServiceWorker();
  openProfilesDialog();
  showToast(`Dodano profil: ${name}.`, 'success');
}

function archiveProfile(profileId) {
  const profile = getProfileById(profileId);
  if (!profile || profile.archivedAt) return;
  const available = getAvailableProfiles();
  if (available.length <= 1) {
    showToast('Nie można zarchiwizować jedynego aktywnego profilu.', 'error');
    return;
  }
  if (
    !window.confirm(
      `Archiwizować profil „${profile.name}”? Historia i ustawienia zostaną zachowane.`
    )
  )
    return;

  const result = archiveProfileData(profileId);
  if (!result.ok) return;
  resetQuickDraftForToday();
  renderAll();
  renderProfilesList();
  scheduleDailyReminder();
  syncReminderStateWithServiceWorker();
  showToast(`Profil „${profile.name}” przeniesiono do archiwum.`, 'success');
}

function restoreProfile(profileId) {
  const profile = getProfileById(profileId);
  if (!profile || !profile.archivedAt) return;
  const result = restoreProfileData(profileId);
  if (!result.ok) return;
  renderAll();
  renderProfilesList();
  scheduleDailyReminder();
  syncReminderStateWithServiceWorker();
  showToast(`Przywrócono profil „${profile.name}”.`, 'success');
}

function openProfileDeleteDialog(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) return;
  if (data.profiles.length <= 1) {
    showToast('Nie można usunąć jedynego profilu.', 'error');
    return;
  }
  const otherAvailable = getAvailableProfiles().filter((item) => item.id !== profile.id);
  if (data.activeProfileId === profile.id && !otherAvailable.length) {
    showToast('Najpierw przywróć lub utwórz inny aktywny profil.', 'error');
    return;
  }

  pendingDeleteProfileId = profile.id;
  el['profile-delete-name'].textContent = profile.name;
  el['profile-delete-input'].value = '';
  el['profile-delete-warning'].innerHTML = `
      <strong>Usunięte zostaną wszystkie dane profilu „${escapeHtml(profile.name)}”.</strong>
      <span>${profile.entries.length} ${plural(profile.entries.length, 'wpis', 'wpisy', 'wpisów')}, ${profile.ampoules.length} ${plural(profile.ampoules.length, 'ampułka', 'ampułki', 'ampułek')} oraz wszystkie ustawienia. Tej operacji nie można cofnąć.</span>
    `;
  updateProfileDeleteButton();
  closeProfilesDialog();
  if (!el['profile-delete-dialog'].open) el['profile-delete-dialog'].showModal();
  window.setTimeout(() => el['profile-delete-input'].focus(), 0);
}

function closeProfileDeleteDialog() {
  pendingDeleteProfileId = '';
  if (el['profile-delete-dialog'].open) el['profile-delete-dialog'].close();
  openProfilesDialog();
}

function updateProfileDeleteButton() {
  const profile = getProfileById(pendingDeleteProfileId);
  el['profile-delete-confirm-button'].disabled =
    !profile || el['profile-delete-input'].value !== profile.name;
}

function confirmProfileDeletion() {
  const profile = getProfileById(pendingDeleteProfileId);
  if (!profile || el['profile-delete-input'].value !== profile.name) return;
  if (data.profiles.length <= 1) {
    showToast('Nie można usunąć jedynego profilu.', 'error');
    return;
  }

  const result = deleteProfileData(profile.id);
  if (!result.ok) return;

  pendingDeleteProfileId = '';
  el['profile-delete-dialog'].close();
  resetQuickDraftForToday();
  renderAll();
  scheduleDailyReminder();
  syncReminderStateWithServiceWorker();
  openProfilesDialog();
  showToast(`Usunięto profil „${profile.name}”.`, 'success');
}
