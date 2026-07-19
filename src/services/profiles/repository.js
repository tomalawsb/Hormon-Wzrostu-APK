
function getActiveProfile(container = data) {
  if (!Array.isArray(container.profiles) || !container.profiles.length) {
    container.profiles = [createDefaultProfile()];
    container.activeProfileId = container.profiles[0].id;
  }
  let profile = container.profiles.find(
    (item) => item.id === container.activeProfileId && !item.archivedAt
  );
  if (!profile) {
    profile = container.profiles.find((item) => !item.archivedAt);
    if (!profile) {
      profile = container.profiles[0];
      profile.archivedAt = '';
    }
    container.activeProfileId = profile.id;
  }
  return profile;
}

function setActiveProfileId(profileId, { refresh = false } = {}) {
  const normalizedId = sanitizeProfileId(profileId);
  if (
    !normalizedId ||
    !data.profiles.some((profile) => profile.id === normalizedId && !profile.archivedAt)
  )
    return false;

  const previousProfileId = data.activeProfileId;
  if (previousProfileId !== normalizedId) {
    data.activeProfileId = normalizedId;
    if (!persistData()) {
      data.activeProfileId = previousProfileId;
      return false;
    }
  }

  if (refresh) {
    resetQuickDraftForToday();
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
  }
  return true;
}

function sanitizeProfileId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '';
}

function sanitizeProfileName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}

function sanitizeProfileIcon(value) {
  return ALLOWED_PROFILE_ICONS.has(value) ? value : DEFAULT_PROFILE_ICON;
}

function sanitizeProfileColor(value) {
  return ALLOWED_PROFILE_COLORS.has(value) ? value : DEFAULT_PROFILE_COLOR;
}

function getAvailableProfiles(container = data) {
  return Array.isArray(container.profiles)
    ? container.profiles.filter((profile) => !profile.archivedAt)
    : [];
}

function getArchivedProfiles(container = data) {
  return Array.isArray(container.profiles)
    ? container.profiles.filter((profile) => Boolean(profile.archivedAt))
    : [];
}

function getProfileById(profileId, container = data) {
  const normalizedId = sanitizeProfileId(profileId);
  return normalizedId && Array.isArray(container.profiles)
    ? container.profiles.find((profile) => profile.id === normalizedId) || null
    : null;
}

function createUniqueProfileId(container = data) {
  const used = new Set((container.profiles || []).map((profile) => profile.id));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const randomPart = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const id = `profile-${randomPart}`;
    if (!used.has(id)) return id;
  }
  let suffix = 1;
  while (used.has(`profile-${suffix}`)) suffix += 1;
  return `profile-${suffix}`;
}

function isProfileNameTaken(name, ignoredProfileId = '') {
  const normalizedName = normalizeText(sanitizeProfileName(name));
  return data.profiles.some(
    (profile) => profile.id !== ignoredProfileId && normalizeText(profile.name) === normalizedName
  );
}

function addProfileData({ name, icon, color } = {}) {
  const sanitizedName = sanitizeProfileName(name);
  if (!sanitizedName) return { ok: false, reason: 'name-required' };
  if (data.profiles.length >= MAX_PROFILES) return { ok: false, reason: 'limit' };
  if (isProfileNameTaken(sanitizedName)) return { ok: false, reason: 'duplicate-name' };

  const previousActiveId = data.activeProfileId;
  const profile = createDefaultProfile({
    id: createUniqueProfileId(),
    name: sanitizedName,
    icon: sanitizeProfileIcon(icon),
    color: sanitizeProfileColor(color),
  });
  data.profiles.push(profile);
  data.activeProfileId = profile.id;
  if (!persistData()) {
    data.profiles.pop();
    data.activeProfileId = previousActiveId;
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, profile };
}

function updateProfileData(profileId, { name, icon, color } = {}) {
  const profile = getProfileById(profileId);
  const sanitizedName = sanitizeProfileName(name);
  if (!profile) return { ok: false, reason: 'not-found' };
  if (!sanitizedName) return { ok: false, reason: 'name-required' };
  if (isProfileNameTaken(sanitizedName, profile.id)) return { ok: false, reason: 'duplicate-name' };

  const previous = {
    name: profile.name,
    icon: profile.icon,
    color: profile.color,
    updatedAt: profile.updatedAt,
  };
  profile.name = sanitizedName;
  profile.icon = sanitizeProfileIcon(icon);
  profile.color = sanitizeProfileColor(color);
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    Object.assign(profile, previous);
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, profile };
}

function archiveProfileData(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) return { ok: false, reason: 'not-found' };
  if (profile.archivedAt) return { ok: false, reason: 'already-archived' };
  const available = getAvailableProfiles();
  if (available.length <= 1) return { ok: false, reason: 'last-active' };

  const previousActiveId = data.activeProfileId;
  const previousArchivedAt = profile.archivedAt;
  const previousUpdatedAt = profile.updatedAt;
  profile.archivedAt = new Date().toISOString();
  profile.updatedAt = profile.archivedAt;
  if (data.activeProfileId === profile.id) {
    data.activeProfileId = available.find((item) => item.id !== profile.id).id;
  }
  if (!persistData()) {
    profile.archivedAt = previousArchivedAt;
    profile.updatedAt = previousUpdatedAt;
    data.activeProfileId = previousActiveId;
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, profile };
}

function restoreProfileData(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) return { ok: false, reason: 'not-found' };
  if (!profile.archivedAt) return { ok: false, reason: 'not-archived' };
  const previousArchivedAt = profile.archivedAt;
  const previousUpdatedAt = profile.updatedAt;
  profile.archivedAt = '';
  profile.updatedAt = new Date().toISOString();
  if (!persistData()) {
    profile.archivedAt = previousArchivedAt;
    profile.updatedAt = previousUpdatedAt;
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, profile };
}

function deleteProfileData(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) return { ok: false, reason: 'not-found' };
  if (data.profiles.length <= 1) return { ok: false, reason: 'last-profile' };
  const otherAvailable = getAvailableProfiles().filter((item) => item.id !== profile.id);
  if (data.activeProfileId === profile.id && !otherAvailable.length) {
    return { ok: false, reason: 'last-active' };
  }

  const previousProfiles = data.profiles;
  const previousActiveId = data.activeProfileId;
  data.profiles = data.profiles.filter((item) => item.id !== profile.id);
  if (data.activeProfileId === profile.id) data.activeProfileId = otherAvailable[0].id;
  if (!persistData()) {
    data.profiles = previousProfiles;
    data.activeProfileId = previousActiveId;
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, profile };
}
