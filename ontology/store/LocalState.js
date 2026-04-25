const STORAGE_KEY = 'ontology:changesets';

export const LocalState = {
  getAllChangeSets() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  appendChangeSet(changeSet) {
    const all = this.getAllChangeSets();
    all.push(changeSet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  },

  removeChangeSet(id) {
    const all = this.getAllChangeSets();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const [removed] = all.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return removed;
  },

  getEditsFor(typeName, id) {
    const targetId = String(id);
    return this.getAllChangeSets().filter(
      (c) => c.objectType === typeName && String(c.objectId) === targetId,
    );
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
