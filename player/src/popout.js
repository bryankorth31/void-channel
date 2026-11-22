/*
 * The pop-out: one picture, alone, in a small window that floats on top while you use other sites.
 * Bryan, 22 Nov 2026: "in the same way id like the playr from vtv to b e treated the same so i can bring it along in the corner up
 * front as i use the web"; for PLAY's: "the pop out needs toonly be the screen of game", "not a full screen with empty sides etc",
 * "not the page as pop upo.. just the game play".
 *
 *   VoidPopout.open(el, { aspect: 4 / 3, onClose, onKey, holder: '<p>Playing in the pop-out</p>' })   // inside the click
 *   VoidPopout.close()
 *
 * Document Picture-in-Picture (Chrome and Edge 116+): the element itself moves into the window, the same element, so a <video>
 * keeps playing, a <canvas> keeps drawing, listeners and captions come along, and a page that keeps changing what the element
 * shows (Live TV going from one programme to the next) changes it there too. The window is shaped to the picture (aspect), so it
 * has no empty sides. A box (the holder) keeps the element's place on the page; closing the window puts the element back there.
 * The page's stylesheets are copied in, so the element looks as it did. Where the browser has no Document Picture-in-Picture,
 * supported() is false and the caller uses what it has (a <video>'s own picture-in-picture).
 * Shared by the voidtv.net player (player/src/player.js) and PLAY. Loaded alone at /assets/player/popout.js, and inside
 * voidplayer.js.
 */
(function (root) {
  'use strict';
  let cur = null; // { win, el, holder, o }

  const supported = () => !!(root.documentPictureInPicture && typeof root.documentPictureInPicture.requestWindow === 'function');

  // The window: the picture's shape, about a third of the screen's width (320 to 640 px). A shape outside 1:5 to 5:1 is a
  // reading gone wrong (no picture yet): 16:9 then.
  function sizeFor(aspect, screenWidth) {
    const a = aspect > 0.2 && aspect < 5 ? aspect : 16 / 9;
    const width = Math.round(Math.max(320, Math.min(640, (screenWidth || 1280) * 0.3)));
    return { width, height: Math.round(width / a) };
  }

  // The page's styles, copied into the window: each sheet's rules as text, or a link to it when its rules cannot be read (another
  // site's sheet). A <base> first, so the sheets' relative addresses (fonts, pictures) still point at this site.
  function copyStyles(from, to) {
    const base = to.createElement('base'); base.href = from.baseURI; to.head.appendChild(base);
    for (const sheet of Array.from(from.styleSheets)) {
      let css = null;
      try { css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'); } catch (e) { /* another site's sheet */ }
      if (css !== null) { const st = to.createElement('style'); st.textContent = css; to.head.appendChild(st); }
      else if (sheet.href) { const l = to.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; to.head.appendChild(l); }
    }
  }

  async function open(el, o) {
    o = o || {};
    if (!supported() || !el || !el.parentNode) return null;
    if (cur) close();
    const win = await root.documentPictureInPicture.requestWindow(sizeFor(o.aspect, root.screen && root.screen.availWidth));
    const doc = win.document;
    copyStyles(document, doc);
    const st = doc.createElement('style');
    st.textContent = 'html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}' + (o.css || '');
    doc.head.appendChild(st);
    if (o.title) doc.title = o.title;
    const holder = document.createElement('div');
    holder.className = o.holderClass || 'vpop-holder';
    holder.innerHTML = o.holder || '';
    el.parentNode.insertBefore(holder, el);
    doc.body.appendChild(el); // the same element, moved in the same task: a playing video does not stop
    el.classList.add('vpop-in');
    cur = { win, el, holder, o };
    win.addEventListener('pagehide', () => back(win)); // the window's own close button, or the browser closing it
    if (o.onKey) doc.addEventListener('keydown', (e) => o.onKey(e));
    if (o.onOpen) o.onOpen(win);
    return win;
  }

  // The element goes back to its place on the page. When the page has meanwhile taken that place away (it went to another view),
  // the element is left out: what owned it has moved on.
  function back(win) {
    if (!cur || (win && cur.win !== win)) return;
    const { el, holder, o } = cur;
    cur = null;
    el.classList.remove('vpop-in');
    if (holder.parentNode) holder.parentNode.replaceChild(el, holder);
    if (o.onClose) o.onClose();
  }

  function close() {
    if (!cur) return;
    const w = cur.win;
    back(w);
    try { w.close(); } catch (e) { /* already closing */ }
  }

  const api = {
    supported, open, close, sizeFor,
    isOpen: (el) => !!cur && (!el || cur.el === el),
    holder: () => (cur ? cur.holder : null),
    window: () => (cur ? cur.win : null),
  };
  root.VoidPopout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
