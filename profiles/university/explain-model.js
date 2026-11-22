// Void University explainers: the model under every one (22 Nov 2026). Bryan: "i want less "thing" and more issues
// or delemas ... issues ppl cant seem to grasp". Most of those issues share one shape that research shows people
// misread: a store that fills from some flows and drains through others (the CO2 in the air, a river's lakes, a loan
// balance, the national debt). This file knows nothing about any one issue. An explainer block in a course file names:
//   stores:  [{ id, name, start, base, unit: { name, per } }]   start and base in the unit people know (ppm, acre-feet);
//            per = how many model units one of them is (1 ppm = 2.124 billion tonnes of carbon), so flows add up.
//   flows:   [{ id, name, to | from: store id, rule }]          a flow into a store (to) or out of it (from), per year.
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
      return out;
    }
    // Move the world on by dt years. Small steps, so a fast-draining store never overshoots.
    function step(state, choices, dt) {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(left, 0.05), fl = flows(state, choices);
        for (const f of ex.flows) {
          if (f.to) state.level[f.to] += fl[f.id] * h;
          if (f.from) state.level[f.from] -= fl[f.id] * h;
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
    // The choices that hold a store exactly where it is now: the sum of the flows out, shared over the choices in
    // the same proportions as their starting values. Used by the page to say "to hold it here you would need ...".
    function holding(storeId) {
      const s = start(), fl = flows(s, {});
      const out = ex.flows.filter((f) => f.from === storeId && f.rule.kind === 'rate').reduce((a, f) => a + fl[f.id], 0);
      const ins = ex.flows.filter((f) => f.to === storeId && f.rule.kind === 'choice');
      const total = ins.reduce((a, f) => a + ex.choices.find((c) => c.id === f.rule.choice).start, 0);
      const o = {};
      for (const f of ins) { const c = ex.choices.find((x) => x.id === f.rule.choice); o[c.id] = out * c.start / total; }
      return o;
    }
    return { start, flows, step, shown, run, holding, rates: k, period: (y) => period(ex, y), measured: (id, y) => measured(ex, id, y) };
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
