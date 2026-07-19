// Phase 2 — Per-tab session identity.
// Survives page refresh (sessionStorage), regenerated on logout/login,
// unique per browser tab so concurrent edits are attributable.

const KEY = 'pos_session_id';

const generate = (): string =>
  `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const getSessionId = (): string => {
  if (typeof sessionStorage === 'undefined') return generate();
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = generate();
    sessionStorage.setItem(KEY, id);
  }
  return id;
};

export const resetSessionId = (): string => {
  const id = generate();
  try { sessionStorage.setItem(KEY, id); } catch {}
  return id;
};

export const clearSessionId = (): void => {
  try { sessionStorage.removeItem(KEY); } catch {}
};
