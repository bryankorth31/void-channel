/* The voidverse's one memory block (voidverse plan M1; Bryan, 25 Nov 2026: "Yes, your picks" in the plan chat, then "Yes, start it"
   and "Yes, voidtv:" in the Void TV owner chat).

   What a room keeps in the visitor's browser goes through here: one prefix (voidtv:), and one list, KEPT below, of what is kept,
   where, by which room and why. A key that is not on the list is not read and not written. Nothing here leaves the browser, and
   nothing here identifies a person (DECISIONS V1: no accounts, no identifier).

   A browser keeps a separate store for each address, so this block shares memory between the rooms on one address only
   (voidtv.net: On Demand, Live TV, PLAY, Trivia Night, Card games, the phone remote). Nothing crosses to another address.

   Carry-over: a key that used to have another name lists it under was. The first read under the new name copies the old value
   across and leaves the old one where it is, so an older page still open in another tab keeps working. remove() clears both.

   Rules for the list:
     * fixed: true means the name is never changed (another room reads it by that name, or a visitor would lose something).
     * A room joins by adding its own lines; its owner chat does that, not this file's owner. PLAY's game saves are never renamed.
     * Kids does not load this file.

   Use: VoidMemory.get('voidtv:chan'), VoidMemory.set('voidtv:chan', 'mtv'), VoidMemory.remove('voidtv:chan'). */
(function () {
  'use strict';
  var PREFIX = 'voidtv:';
  var KEPT = [
    // voidtv.net's own page (On Demand and Live TV)
    { key: 'voidtv:me', where: 'local', room: 'ondemand', fixed: true, why: 'Your list, your likes, where you stopped in each show, and the broken videos you reported. Trivia Night reads it by this name.' },
    { key: 'voidtv:sid', where: 'local', room: 'ondemand', fixed: true, why: 'A random number that changes every month, so one visit is counted once. It names no person.' },
    { key: 'voidtv:vol', where: 'local', room: 'ondemand', fixed: true, why: 'The volume you last set.' },
    { key: 'voidtv:chan', where: 'local', room: 'live', fixed: true, why: 'The Live TV channel you last watched.' },
    { key: 'voidtv:enjoy', where: 'local', room: 'ondemand', fixed: true, why: 'When the "Enjoying it?" card was last shown, so it does not come back for a month.' },
    { key: 'voidtv:nocount', where: 'local', room: 'ondemand', was: 'void_nocount', why: 'Set by the owner on his own devices so his visits are not counted.' },
    { key: 'voidtv:install-x', where: 'local', room: 'ondemand', was: 'void_inst_x', why: 'That you closed the "Install" bar, so it stays closed.' },
    { key: 'voidtv-remote-room', where: 'session', room: 'remote', fixed: true, why: 'The phone remote room this screen is in, kept until the tab closes. The phone remote reads it by this name.' },
    { key: 'voidtv-party', where: 'session', room: 'remote', fixed: true, why: 'That this screen is in a watch party, kept until the tab closes.' },
    // the menu every room shares
    { key: 'voidtv:menu-turn', where: 'local', room: 'menu', was: 'va-turn', why: 'A count of pages opened, so the small card for another room is not the same one every time.' }
  ];
  function find(key) { for (var i = 0; i < KEPT.length; i++) if (KEPT[i].key === key) return KEPT[i]; return null; }
  function box(e) { return e.where === 'session' ? sessionStorage : localStorage; }
  function get(key) {
    var e = find(key);
    if (!e) return null;
    try {
      var s = box(e), v = s.getItem(e.key);
      if (v === null && e.was) { v = s.getItem(e.was); if (v !== null) s.setItem(e.key, v); }
      return v;
    } catch (x) { return null; }
  }
  function set(key, value) {
    var e = find(key);
    if (!e) return false;
    try { box(e).setItem(e.key, String(value)); return true; } catch (x) { return false; }
  }
  function remove(key) {
    var e = find(key);
    if (!e) return false;
    try { var s = box(e); s.removeItem(e.key); if (e.was) s.removeItem(e.was); return true; } catch (x) { return false; }
  }
  window.VoidMemory = { prefix: PREFIX, kept: KEPT, get: get, set: set, remove: remove };
})();
