/** Bound profile reads independently of the 10 Hz movement stream. Authentication
 * still runs on every request; unique name claims always go to the database. */
export const createProfileCache = ({ load, now = Date.now, ttlMs = 30_000, limit = 512 }) => {
  const entries = new Map();
  const put = (ownerId, entry) => {
    entries.delete(ownerId);
    entries.set(ownerId, entry);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
  };
  const remember = (ownerId, profile) => {
    const value = profile ? Object.freeze({ ...profile }) : null;
    put(ownerId, { value, expiresAt: now() + (value ? ttlMs : 1000) });
    return value;
  };
  return {
    remember,
    async get(ownerId) {
      const cached = entries.get(ownerId);
      if (cached && cached.expiresAt > now()) return cached.pending || cached.value;
      const entry = { expiresAt: now() + ttlMs, pending: null };
      put(ownerId, entry);
      entry.pending = Promise.resolve().then(() => load(ownerId)).then((profile) => {
        const current = entries.get(ownerId);
        // A successful name/gender change must win over an older database read.
        if (current !== entry) return current && !current.pending ? current.value : profile;
        return remember(ownerId, profile);
      }).catch((error) => {
        if (entries.get(ownerId) === entry) entries.delete(ownerId);
        throw error;
      });
      return entry.pending;
    },
  };
};
