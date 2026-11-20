// VoidTV Trivia Nights: the words no trivia screen shows (one list for the question builder, the host screen and nicknames
// typed on phones). Slurs: never, in any deck (a bar TV or a park screen is a public place). Swearing, sex and drug words:
// never in a family game. Licence: GPL-2.0-or-later.
(function (root) {
  'use strict';
  const SLURS = /\bnigg|\bfagg?ot|\bfags?\b|\bretard|\bkikes?\b|\bspics?\b|\bchinks?\b|\bwetbacks?\b|\btrann(y|ie)|\bgooks?\b|\bdykes?\b|\bcoons?\b/i;
  const NOT_FAMILY = /\b(fuck\w*|shit\w*|bitch\w*|cunts?|dicks?|cocks?|puss(y|ies)|ass(es|hole\w*)?|bastards?|damn\w*|hell|sex\w*|sexy|porn\w*|whores?|sluts?|tits?|boobs?|penis\w*|vagina\w*|orgasm\w*|nude\w*|naked|strip(per|tease)\w*|hooker\w*|crack|cocaine|heroin|meth|stoned|drunk\w*|kill\w*|murder\w*|rape\w*|suicide)\b/i;

  // True when none of the texts holds a word this band never shows.
  function screenOk(band, texts) {
    const t = [].concat(texts).join(' | ');
    if (SLURS.test(t)) return false;
    return band !== 'family' || !NOT_FAMILY.test(t);
  }

  // A nickname typed on a phone, as the big screen may show it, or null (then the screen says "Player n").
  // Letters, numbers, spaces and a little punctuation; at most 16 characters; no slur ever; no grown word in a family game.
  // Squashed spellings ("s h i t", "sh1t") are caught by testing the name with its spaces and number-letters taken out too.
  function cleanName(raw, band) {
    const s = String(raw || '').normalize('NFKC').replace(/[^\p{L}\p{N} .'!?&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
    if (!s) return null;
    const squashed = s.toLowerCase().replace(/[\s.'!?&-]/g, '').replace(/1/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/\$/g, 's');
    if (!screenOk(band, [s]) || !screenOk(band, [squashed])) return null;
    // The squashed form has no word edges, so look for the worst words inside it too.
    if (/nigg|fagg|retard|fuck|shit|cunt|bitch|whore|slut|rape|porn/.test(squashed)) return null;
    return s;
  }

  const api = { SLURS, NOT_FAMILY, screenOk, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaWords = api;
})(this);
