// Void University scenes, the plan (22 Nov 2026). Bryan picked "A, lit table": a lesson's scene is acted out with real
// things on a lit wooden table (scene.js draws it on three.js). This file is the part with no drawing in it, so the
// tests run the same code the page runs: what each piece of a scene becomes, the state after every step, when a piece
// turns over (the analogy on the front, the idea on the back), and what the camera must keep in frame.
//
// A scene is the unit's existing `scene` block: { analogy, map, actors: [...], beats: [{ say, dur, set }] }.
// What a piece becomes on the table:
//   card   -> a paper card; "prop": "tag" makes it a hang tag with a hole and a string
//   card whose size changes in any step -> a strip of coloured paper that grows and shrinks (a bar)
//   stamp  -> a die-cut sticker that slaps down; a stamp that never has words is a small ball
//   text   -> a paper slip with the words; a slip with no words is not shown
//   slot   -> an empty place marked out in masking tape, its words in pencil
//   arrow  -> a thread from (x, y) to (x2, y2) with a pin at the end; draw 0..1 is how far it is laid
(function (root) {
  const W = 800, H = 360;

  // The state after every step: step i starts from the state before it and merges its `set`.
  function states(sc) {
    let cur = {};
    sc.actors.forEach((a) => { cur[a.id] = Object.assign({ o: 1, s: 1, draw: 1 }, a); });
    return sc.beats.map((b) => {
      const next = {};
      for (const id in cur) next[id] = Object.assign({}, cur[id], { shake: false });
      for (const id in b.set || {}) if (next[id]) next[id] = Object.assign(next[id], b.set[id]);
      const out = { from: cur, to: next, set: b.set || {} };
      cur = next;
      return out;
    });
  }

  function kinds(sc, st) {
    const k = {};
    sc.actors.forEach((a) => {
      const all = [a].concat(st.map((s) => s.to[a.id]));
      if (a.type === 'arrow') k[a.id] = 'thread';
      else if (a.type === 'slot') k[a.id] = 'tape';
      else if (a.type === 'text') k[a.id] = 'slip';
      else if (a.type === 'stamp') k[a.id] = all.some((v) => v.label) ? 'sticker' : 'ball';
      else if (all.some((v) => v.w !== a.w || (v.h || 0) !== (a.h || 0))) k[a.id] = 'bar';
      else k[a.id] = a.prop === 'tag' ? 'tag' : 'card';
    });
    return k;
  }

  const words = (v) => (v.label || '') + '|' + (v.sub || '');
  // Which face shows each step's words. A piece that is on the table and changes its words turns over; a bar changes
  // its words where it lies (it is measuring, not being renamed), and a piece not yet on the table is simply written.
  function faces(sc, st, kind) {
    const out = {};
    sc.actors.forEach((a) => {
      let face = 0;
      out[a.id] = st.map((s) => {
        const A = s.from[a.id], B = s.to[a.id];
        const turned = ['card', 'tag', 'sticker', 'slip'].includes(kind[a.id]) && words(A) !== words(B)
          && (A.o == null ? 1 : A.o) >= 0.5 && !!(A.label || A.sub) && !!(B.label || B.sub);
        const from = face;
        if (turned) face = 1 - face;
        return { face, from, turned };
      });
    });
    return out;
  }

  // A text slip's size in scene units, from its words and its type size.
  function slipSize(v) {
    const size = Math.max(15, v.size || 22); // the smallest print still reads on a phone
    return { w: Math.max(size * 3, String(v.label || '').length * size * 0.56 + size * 1.6), h: size * 2.1 };
  }
  // The box a piece covers in scene units: [x0, y0, x1, y1].
  function extent(v, kind) {
    if (kind === 'thread') return [Math.min(v.x, v.x2), Math.min(v.y, v.y2), Math.max(v.x, v.x2), Math.max(v.y, v.y2)];
    if (kind === 'slip') { const z = slipSize(v); return [v.x - z.w / 2, v.y - z.h / 2, v.x + z.w / 2, v.y + z.h / 2]; }
    if (kind === 'sticker' || kind === 'ball') { const d = (v.w || 70) * (v.s == null ? 1 : v.s); return [v.x, v.y, v.x + d, v.y + d]; }
    return [v.x, v.y, v.x + (v.w || 0), v.y + (v.h || 0)];
  }
  const shown = (v, kind) => (v.o == null ? 1 : v.o) >= 0.5 && !(kind === 'slip' && !v.label) && !(kind === 'thread' && (v.draw == null ? 1 : v.draw) < 0.05);
  // What the camera keeps in frame at the end of step i, and what that step is about.
  function frame(st, i, kind) {
    const s = st[Math.max(0, Math.min(st.length - 1, i))];
    const grow = (b, e) => (b ? [Math.min(b[0], e[0]), Math.min(b[1], e[1]), Math.max(b[2], e[2]), Math.max(b[3], e[3])] : e.slice());
    let box = null, focus = null;
    for (const id in s.to) {
      const v = s.to[id];
      if (!shown(v, kind[id])) continue;
      const e = extent(v, kind[id]);
      box = grow(box, e);
      if (s.set[id]) focus = grow(focus, e);
    }
    if (!box) box = [W * 0.25, H * 0.25, W * 0.75, H * 0.75];
    return { box, focus: focus || box };
  }

  function plan(sc) {
    const st = states(sc), kind = kinds(sc, st);
    return { states: st, kind, faces: faces(sc, st, kind), frame: (i) => frame(st, i, kind) };
  }

  const api = { W, H, states, kinds, faces, extent, frame, slipSize, shown, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VUScenePlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
