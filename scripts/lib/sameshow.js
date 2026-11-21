// Is a TMDB record the same show as VoidTV's TVmaze record? The catalog joins the two, and a wrong join hands a show
// another show's poster, story and cast (night audit N12, 21 Nov 2026: "Payne" (CBS, 1999) wore Tyler Perry's House of
// Payne) or its ratings in trivia (the catalog's "Clubhouse", a 2004 drama, carried Mickey Mouse Clubhouse's TMDB id).
// Same when the names match once tidied (or one holds the other) and the first years are at most one apart. Used by
// scripts/art.js (posters and cast) and scripts/trivia/pool.js (trivia's pool). Pure; tested in tests/trivia-pool.test.js
// and tests/art-match.test.js.
'use strict';

// An apostrophe joins its word (It's = Its, Grey's = Greys).
function tidy(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

// One name holds the other only when the longer starts with the shorter as whole words ("Cosmos: A Personal Voyage" holds
// "Cosmos"); a name somewhere inside another is another show ("Maps: Power, Plunder and Possession" is not "Plunder",
// "Good Game: Spawn Point" is not "Spawn", "Tyler Perry's House of Payne" is not "Payne").
const startsWith = (long, short) => long === short || long.startsWith(short + ' ');
function sameShow(tvmazeName, tvmazeFirst, tmdbName, tmdbFirst) {
  const a = tidy(tvmazeName), b = tidy(tmdbName);
  if (!a || !b || !(startsWith(a, b) || startsWith(b, a))) return false;
  const ya = parseInt(String(tvmazeFirst || '').slice(0, 4), 10), yb = parseInt(String(tmdbFirst || '').slice(0, 4), 10);
  return !(ya && yb) || Math.abs(ya - yb) <= 1;
}

// The names and first year to judge a show by. VoidTV's own name always counts. The cached TVmaze record counts too, but
// only when its name agrees with VoidTV's: a cached record can itself be another show (VoidTV's "M*A*S*H" was cached as
// TVmaze's "A Teacher", 2020), and then its name and year are not used (night audit, 21 Nov 2026).
function identity(voidName, tvmazeName, tvmazeFirst) {
  const v = tidy(voidName), t = tidy(tvmazeName);
  const agrees = !!t && !!v && (startsWith(t, v) || startsWith(v, t));
  return { names: [voidName].concat(agrees && t !== v ? [tvmazeName] : []), first: agrees || !v ? tvmazeFirst : null };
}
const asList = (n) => (Array.isArray(n) ? n : [n]).filter(Boolean);
const exactName = (names, x) => asList(names).some((n) => tidy(n) === tidy(x));

// From a TMDB search's results, the one that is this show: the same name first, then a name that holds the other, each
// within a year of the first year. A show's first year differs between sources by a pilot or a TV movie (Columbo:
// 1968 on TVmaze, 1971 on TMDB), so when no result is within a year, the result with exactly the same name and the
// nearest first year is taken. Never the top hit otherwise (that was the slip). Null when no result is this show.
// A result with exactly the show's name always beats one whose name only holds it ("Spawn" beats "Good Game: Spawn Point");
// a longer name is taken only when no result has exactly the name, and then only within a year.
function pickSame(results, names, first) {
  const list = asList(names);
  const rs = results || [];
  const within = (r) => list.some((n) => sameShow(n, first, r.name, r.first_air_date));
  const same = rs.filter((r) => exactName(list, r.name));
  if (same.length) {
    const near = same.find(within);
    if (near) return near;
    const y = parseInt(String(first || '').slice(0, 4), 10);
    const yearOf = (r) => parseInt(String(r.first_air_date || '').slice(0, 4), 10);
    return y ? same.slice().sort((a, b) => Math.abs((yearOf(a) || 9999) - y) - Math.abs((yearOf(b) || 9999) - y))[0] : same[0];
  }
  return rs.find(within) || null;
}

module.exports = { tidy, sameShow, pickSame, identity, exactName };
