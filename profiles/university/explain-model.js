// Void University explainers: the model under every one (22 Nov 2026). Bryan: "i want less "thing" and more issues
// or delemas ... issues ppl cant seem to grasp". Most of those issues share one shape that research shows people
// misread: a store that fills from some flows and drains through others (the CO2 in the air, a river's lakes, a loan
// balance, the national debt). This file knows nothing about any one issue. An explainer block in a course file names:
//   stores:  [{ id, name, start, base, unit: { name, per } }]   start and base in the unit people know (ppm, acre-feet);
//            per = how many model units one of them is (1 ppm = 2.124 billion tonnes of carbon), so flows add up.
//   flows:   [{ id, name, to and/or from: store id, rule }]     a flow into a store (to), out of one (from), or from
//                                                               one store into another (both), per year.
//   rule:    { kind: 'choice', choice }                          the learner's own setting (a fader on the page);
//            { kind: 'rate', store, above, fit: { period: [y0, y1], value } }
//                                                               a flow that grows with how far the store is above a
//                                                               level: value / (the store's measured mean over the
//                                                               period minus above). So the rate is taken from the
//                                                               measured years in the file, never typed in by hand.
//   choices: [{ id, name, start, min, max, step }]
//   history: { stores: { id: { year: value } }, periods: [{ from, to, name, flows: { id: value } }] }
// It is a plain script so the page (window.VUExplainModel) and the tests (require) run the very same code.
(function (root) {
  'use strict';

  // The measured value of a store in a year, in the unit people know (null when the file has none for that year).
  function measured(ex, id, year) {
    const h = ex.history && ex.history.stores && ex.history.stores[id];
    const v = h ? h[String(year)] : undefined;
    return typeof v === 'number' ? v : null;
  }
  function period(ex, year) {
    return ((ex.history && ex.history.periods) || []).find((p) => year >= p.from && year <= p.to) || null;
  }
  // The rate of a 'rate' flow, from the measured years: value / (mean of the store over the period - above).
  function rateOf(ex, rule) {
    const st = ex.stores.find((s) => s.id === rule.store);
    const [y0, y1] = rule.fit.period;
    const vals = [];
    for (let y = y0; y <= y1; y++) { const v = measured(ex, st.id, y); if (v != null) vals.push(v); }
    if (!vals.length) return NaN;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return rule.fit.value / ((mean - rule.above) * st.unit.per);
  }

  function make(ex) {
    const stores = {}, k = {};
    for (const s of ex.stores) stores[s.id] = s;
    for (const f of ex.flows) if (f.rule.kind === 'rate') k[f.id] = rateOf(ex, f.rule);
    // A state: each store in model units, plus the year. Starts at the file's "now".
    function start(year) {
      const y = year == null ? ex.clock.now : year, level = {};
      for (const s of ex.stores) { const m = measured(ex, s.id, y); level[s.id] = (m != null ? m : s.start) * s.unit.per; }
      return { year: y, level };
    }
    // Every flow this year, per year, in model units. choices: { id: value }.
    function flows(state, choices) {
      const out = {};
      for (const f of ex.flows) {
        const r = f.rule;
        if (r.kind === 'choice') out[f.id] = choices[r.choice];
        else if (r.kind === 'rate') out[f.id] = k[f.id] * (state.level[r.store] - r.above * stores[r.store].unit.per);
        else out[f.id] = 0;
      }
      // an empty store can let out only what comes into it
      for (const s of ex.stores) {
        if (state.level[s.id] > 1e-6) continue;
        const ins = ex.flows.filter((f) => f.to === s.id).reduce((a, f) => a + Math.max(0, out[f.id]), 0);
        const outs = ex.flows.filter((f) => f.from === s.id && out[f.id] > 0);
        const sum = outs.reduce((a, f) => a + out[f.id], 0);
        if (sum > ins) for (const f of outs) out[f.id] *= ins / sum;
      }
      return out;
    }
    // Move the world on by dt years. Small steps, so a fast-draining store never overshoots.
    function step(state, choices, dt) {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(left, 0.05), fl = flows(state, choices);
        for (const f of ex.flows) {
          // a store cannot give more than it holds: a flow out of an empty store stops
          const v = f.from && fl[f.id] > 0 ? Math.min(fl[f.id], state.level[f.from] / h) : fl[f.id];
          if (f.to) state.level[f.to] += v * h;
          if (f.from) state.level[f.from] -= v * h;
        }
        for (const s of ex.stores) if (state.level[s.id] < 0) state.level[s.id] = 0;
        state.year += h; left -= h;
      }
      return state;
    }
    const shown = (state, id) => state.level[id] / stores[id].unit.per; // a store in the unit people know
    // Run for whole years and keep each year's value: [{ year, value }] for one store.
    function run(choices, years, storeId, from) {
      const s = start(from), out = [{ year: s.year, value: shown(s, storeId) }];
      for (let i = 0; i < years; i++) { step(s, choices, 1); out.push({ year: Math.round(s.year), value: shown(s, storeId) }); }
      return out;
    }
    // The settings that hold a store exactly where it is today: the named choices (by default every choice that
    // feeds the store) scaled together until what comes in equals what goes out, the others left as they are.
    // Used by the page to say "to hold it here you would need ...". Flows are straight lines in the choices, so the
    // scale is solved exactly.
    function holding(storeId, ids, set) {
      const s = start(), now = Object.assign({}, ...ex.choices.map((c) => ({ [c.id]: c.start })), set || {});
      const feeds = (c) => ex.flows.filter((f) => f.rule.kind === 'choice' && f.rule.choice === c.id).reduce((a, f) => a + (f.to === storeId ? 1 : 0) - (f.from === storeId ? 1 : 0), 0);
      const pick = ids || ex.choices.filter((c) => feeds(c) > 0).map((c) => c.id);
      const net = (vals) => { const fl = flows(s, vals); return ex.flows.reduce((a, f) => a + (f.to === storeId ? fl[f.id] : 0) - (f.from === storeId ? fl[f.id] : 0), 0); };
      const b = pick.reduce((a, id) => a + feeds(ex.choices.find((c) => c.id === id)) * now[id], 0);
      const t = b ? 1 - net(now) / b : 1;
      const o = {}; for (const id of pick) o[id] = now[id] * t;
      return o;
    }
    // A store that is a lake has a level: its measured storage and water level pairs (level.curve, in the store's unit
    // and in feet), read straight across. Below the lowest measured pair the level runs straight down to level.bottom
    // (the bed the stage draws, ours), and says it is lower than anything measured.
    function levelOf(id, value) {
      const st = stores[id], L = st && st.level; if (!L) return null;
      const c = L.curve.slice().sort((a, b) => a[0] - b[0]);
      let ft;
      if (value <= c[0][0]) ft = L.bottom + (c[0][1] - L.bottom) * Math.max(0, value) / c[0][0];
      else if (value >= c[c.length - 1][0]) { const [a, b] = c.slice(-2); ft = b[1] + (value - b[0]) * (b[1] - a[1]) / (b[0] - a[0]); }
      else for (let i = 1; i < c.length; i++) if (value <= c[i][0]) { const a = c[i - 1], b = c[i]; ft = a[1] + (value - a[0]) * (b[1] - a[1]) / (b[0] - a[0]); break; }
      return { ft, measured: value >= c[0][0] };
    }
    function level(id, value) {
      const l = levelOf(id, value); if (!l) return null;
      return Math.round(l.ft).toLocaleString('en-US') + ' feet' + (l.measured ? '' : ', lower than any level measured');
    }
    return { start, flows, step, shown, run, holding, levelOf, level, rates: k, period: (y) => period(ex, y), measured: (id, y) => measured(ex, id, y) };
  }

  // Say a number the way the page says it: a store in its unit with no decimals past 100, a flow with one decimal.
  const fmt = (v, d) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(d == null ? 1 : d));
  // Fill a line's {placeholders} from the world: {year}, {store id}, {flow id}, {change id} (a store's change a year).
  function say(text, values) {
    return String(text).replace(/\{([a-z]+)\}/gi, (m, key) => (values[key] == null ? m : typeof values[key] === 'number' ? fmt(values[key]) : values[key]));
  }

  const api = { make, say, fmt, rateOf, measured };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VUExplainModel = api;
})(typeof window !== 'undefined' ? window : this);
