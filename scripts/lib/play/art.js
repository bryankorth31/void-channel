// PLAY AND LEARN pictures, style A "Sticker book" (B picked it 15 Nov 2026 from profiles/kids/docs/PLAY-STYLES.html):
// thick ink outlines, flat kids-brand colors (sun, teal, pink, sky), round friendly shapes, nothing that moves.
// Each entry is the inside of an <svg viewBox="0 0 100 100">; the page draws the outline with the .ink class.
// Drawn here by hand for this first slice (original, no outside source). P5 makes the finished set in the same look.
const INK = '#1b1f3b', SUN = '#ffd23f', TEAL = '#2ec4b6', PINK = '#ff5fa2', SKY = '#4cc9f0', WHITE = '#ffffff', PAPER = '#fff1cc';
const o = 'stroke="' + INK + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
const eye = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="' + INK + '"/>';
const smile = (x1, x2, y) => '<path d="M' + x1 + ' ' + y + 'Q' + (x1 + x2) / 2 + ' ' + (y + 7) + ' ' + x2 + ' ' + y + '" fill="none" ' + o + '/>';

const ART = {
  cat: '<path d="M22 46L25 14L43 31H57L75 14L78 46C83 74 66 88 50 88C34 88 17 74 22 46Z" fill="' + SUN + '" ' + o + '/>' + eye(39, 54) + eye(61, 54) + '<path d="M47 64H53L50 68Z" fill="' + PINK + '" ' + o + ' stroke-width="3"/>' + smile(42, 58, 71),
  dog: '<path d="M26 34C26 22 38 16 50 16C62 16 74 22 74 34V62C74 78 62 88 50 88C38 88 26 78 26 62Z" fill="' + PAPER + '" ' + o + '/><path d="M26 30C14 30 10 48 14 62C22 62 26 52 26 44Z" fill="#a0602a" ' + o + '/><path d="M74 30C86 30 90 48 86 62C78 62 74 52 74 44Z" fill="#a0602a" ' + o + '/>' + eye(40, 48) + eye(60, 48) + '<ellipse cx="50" cy="62" rx="7" ry="5" fill="' + INK + '"/>' + smile(42, 58, 72),
  cow: '<path d="M30 20L22 8M70 20L78 8" ' + o + '/><path d="M22 36C22 22 34 16 50 16C66 16 78 22 78 36V58H22Z" fill="' + WHITE + '" ' + o + '/><path d="M58 18C66 18 70 26 66 34C60 34 56 26 58 18Z" fill="' + INK + '"/><path d="M14 34L24 38M86 34L76 38" ' + o + '/>' + eye(38, 40) + eye(62, 40) + '<rect x="24" y="54" width="52" height="32" rx="16" fill="' + PINK + '" ' + o + '/><circle cx="40" cy="70" r="4" fill="' + INK + '"/><circle cx="60" cy="70" r="4" fill="' + INK + '"/>',
  pig: '<path d="M24 26L30 12L42 20M76 26L70 12L58 20" fill="' + PINK + '" ' + o + '/><circle cx="50" cy="52" r="34" fill="' + PINK + '" ' + o + '/>' + eye(38, 44) + eye(62, 44) + '<ellipse cx="50" cy="62" rx="14" ry="10" fill="#ff9cc6" ' + o + '/><circle cx="45" cy="62" r="3" fill="' + INK + '"/><circle cx="55" cy="62" r="3" fill="' + INK + '"/>',
  sheep: '<path d="M30 30C22 22 32 12 40 18C44 8 58 8 60 18C68 12 80 22 72 30C82 36 80 50 70 50H30C20 50 18 36 30 30Z" fill="' + WHITE + '" ' + o + '/><path d="M34 46C34 40 40 36 50 36C60 36 66 40 66 46V68C66 80 58 88 50 88C42 88 34 80 34 68Z" fill="' + INK + '"/>' + '<circle cx="43" cy="58" r="4" fill="' + WHITE + '"/><circle cx="57" cy="58" r="4" fill="' + WHITE + '"/><path d="M44 74Q50 79 56 74" fill="none" stroke="' + WHITE + '" stroke-width="4" stroke-linecap="round"/>',
  duck: '<path d="M12 56C12 46 22 44 34 48C42 50 50 50 56 46L74 52C84 60 80 82 50 84C26 86 12 72 12 56Z" fill="' + SUN + '" ' + o + '/><circle cx="64" cy="34" r="16" fill="' + SUN + '" ' + o + '/><path d="M78 32L94 36L78 42Z" fill="#f08c00" ' + o + ' stroke-width="4"/><path d="M28 60Q42 70 54 60" fill="none" ' + o + ' stroke-width="4"/>' + eye(68, 30) + '<path d="M8 90H92" ' + o + ' stroke="' + SKY + '" stroke-width="7"/>',
  frog: '<circle cx="32" cy="28" r="14" fill="' + TEAL + '" ' + o + '/><circle cx="68" cy="28" r="14" fill="' + TEAL + '" ' + o + '/><path d="M12 60C12 40 30 34 50 34C70 34 88 40 88 60C88 78 70 88 50 88C30 88 12 78 12 60Z" fill="' + TEAL + '" ' + o + '/><circle cx="32" cy="28" r="6" fill="' + WHITE + '"/><circle cx="68" cy="28" r="6" fill="' + WHITE + '"/>' + eye(32, 29) + eye(68, 29) + '<path d="M30 62Q50 78 70 62" fill="none" ' + o + '/>',
  fish: '<path d="M10 50C26 24 60 24 74 50C60 76 26 76 10 50Z" fill="' + SKY + '" ' + o + '/><path d="M74 50L92 32V68Z" fill="' + SKY + '" ' + o + '/><path d="M44 30Q52 50 44 70" fill="none" ' + o + ' stroke-width="4"/>' + eye(28, 46),
  bird: '<circle cx="48" cy="54" r="30" fill="' + SKY + '" ' + o + '/><path d="M74 46L92 52L74 58Z" fill="' + SUN + '" ' + o + '/><path d="M30 58C36 72 54 74 60 62C50 64 40 62 30 58Z" fill="' + WHITE + '" ' + o + ' stroke-width="4"/>' + eye(60, 44) + '<path d="M40 84L36 94M52 84L54 94" ' + o + '/>',
  bee: '<ellipse cx="34" cy="30" rx="14" ry="12" fill="' + WHITE + '" ' + o + '/><ellipse cx="62" cy="28" rx="14" ry="12" fill="' + WHITE + '" ' + o + '/><ellipse cx="50" cy="60" rx="34" ry="24" fill="' + SUN + '" ' + o + '/><path d="M44 37V83M62 39V81" ' + o + ' stroke-width="8"/>' + eye(28, 56) + '<path d="M84 60L94 60" ' + o + '/>',

  circle: '<circle cx="50" cy="50" r="38" fill="' + SKY + '" ' + o + '/>',
  square: '<rect x="14" y="14" width="72" height="72" rx="6" fill="' + SUN + '" ' + o + '/>',
  triangle: '<path d="M50 12L90 84H10Z" fill="' + PINK + '" ' + o + '/>',
  rectangle: '<rect x="8" y="26" width="84" height="48" rx="6" fill="' + TEAL + '" ' + o + '/>',
  star: '<path d="M50 8L62 36L92 38L69 58L77 88L50 72L23 88L31 58L8 38L38 36Z" fill="' + SUN + '" ' + o + '/>',
  heart: '<path d="M50 86C20 66 8 50 10 34C12 18 32 10 50 28C68 10 88 18 90 34C92 50 80 66 50 86Z" fill="' + PINK + '" ' + o + '/>',
  oval: '<ellipse cx="50" cy="50" rx="30" ry="40" fill="' + TEAL + '" ' + o + '/>',
  diamond: '<path d="M50 6L84 50L50 94L16 50Z" fill="' + SKY + '" ' + o + '/>',

  yes: '<circle cx="50" cy="50" r="40" fill="' + TEAL + '" ' + o + '/><path d="M30 52L44 66L72 36" fill="none" stroke="' + WHITE + '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>',
  no: '<circle cx="50" cy="50" r="40" fill="' + PINK + '" ' + o + '/><path d="M28 50H72" stroke="' + WHITE + '" stroke-width="10" stroke-linecap="round"/>',
  straight: '<path d="M18 82L50 16L82 82M32 56H68" fill="none" ' + o + ' stroke-width="9"/>',
  curvy: '<path d="M76 26C62 10 26 12 22 46C18 82 62 92 78 72" fill="none" ' + o + ' stroke-width="9"/>',

  // The four games' own pictures, for their big buttons.
  g_listen: '<circle cx="50" cy="50" r="40" fill="' + TEAL + '" ' + o + '/><path d="M28 40V60H40L56 74V26L40 40Z" fill="' + WHITE + '" ' + o + ' stroke-width="4"/><path d="M64 38Q72 50 64 62M70 30Q84 50 70 70" fill="none" stroke="' + WHITE + '" stroke-width="5" stroke-linecap="round"/>',
  g_match: '<rect x="10" y="22" width="36" height="52" rx="8" fill="' + SKY + '" ' + o + ' transform="rotate(-8 28 48)"/><rect x="54" y="22" width="36" height="52" rx="8" fill="' + SUN + '" ' + o + ' transform="rotate(8 72 48)"/><circle cx="28" cy="48" r="8" fill="' + PINK + '" ' + o + ' stroke-width="4"/><circle cx="72" cy="48" r="8" fill="' + PINK + '" ' + o + ' stroke-width="4"/>',
  g_sort: '<path d="M8 50H44L40 88H12Z" fill="' + TEAL + '" ' + o + '/><path d="M56 50H92L88 88H60Z" fill="' + PINK + '" ' + o + '/><circle cx="26" cy="30" r="12" fill="' + SUN + '" ' + o + '/><rect x="62" y="18" width="24" height="24" rx="4" fill="' + SKY + '" ' + o + '/>',
  g_trace: '<path d="M18 84L50 14L82 84M32 58H68" fill="none" stroke="#e6dcc0" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 84L40 36" fill="none" stroke="' + TEAL + '" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="14" r="8" fill="' + PINK + '" ' + o + ' stroke-width="4"/>',
};

module.exports = { ART };
