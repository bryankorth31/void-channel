// VoidTV PLAY: save states in the viewer's own browser. Licence: GPL-2.0-or-later (play/LICENSE).
// No accounts (DECISIONS V1): a save lives in this browser only, one slot per game for now, and nothing about the
// viewer is attached to it.
(function (root) {
  const DB = 'voidtv-play', STORE = 'states';
  function open() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
    });
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((ok, fail) => {
      const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); ok(req && req.result); }; t.onerror = () => { db.close(); fail(t.error); };
    });
  }
  const api = {
    put: (id, state) => run('readwrite', (s) => s.put({ state, when: Date.now() }, id)),
    get: (id) => run('readonly', (s) => s.get(id)),
  };
  root.PlaySaves = api;
})(typeof self !== 'undefined' ? self : this);
