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
  // build: which engine made the save ({ core, commit }); a core's saves only load in the same build of that core.
  const api = {
    put: (id, state, build) => run('readwrite', (s) => s.put(Object.assign({ state, when: Date.now() }, build || {}), id)),
    // Same core, same build: yes. A save from another build (or from before builds were recorded): no.
    fits: (rec, build) => !!(rec && build && rec.core === build.core && rec.commit === build.commit),
    get: (id) => run('readonly', (s) => s.get(id)),
    // Every save's name (<game id>:auto and the like), without reading the saves: the front page's Continue playing row.
    keys: () => run('readonly', (s) => s.getAllKeys()),
  };
  root.PlaySaves = api;
})(typeof self !== 'undefined' ? self : this);
