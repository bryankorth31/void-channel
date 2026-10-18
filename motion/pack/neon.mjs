// "Neon alley": a piece built for the neon alley scenes in shared/assets (neon-alley-*.jpg, from Bryan's 2K set of
// 18 Oct 2026; originals in brand-kit/neon-aesthetic/). The scene already carries the big "voidtv.net" neon sign, so
// the piece never draws a second logo: the sign powers on, the camera pushes in on it, and a call to action settles
// underneath. Wide shows the whole scene. Vertical and 4:5 feed would crop the sign to "idtv.ne", so they show the
// scene as a full-width band over a blurred copy of itself, and the name always stays whole.
// build-pack.mjs merges NEON_PIECES / NEON_BUILD into PIECES / BUILD. Pick the scene per piece in the editor under
// "Look for this part" > Background image; with none picked it uses neon-alley-crowd.jpg.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escName = (s) => esc(s).replace(/(voidtv)(\.net)/gi, '$1<span class="net">$2</span>');
// Font size from character counts at build time (never measured during render).
const fit = (text, boxW, base, em) => Math.round(Math.min(base, boxW / (Math.max(1, String(text || " ").length) * em)));
const clipAt = (id, dur, track, cls = "", inner = "") =>
  `<div id="${id}" class="clip ${cls}" data-start="0" data-duration="${dur}" data-track-index="${track}">${inner}</div>`;
const F = (key, label, def, max = 60) => ({ key, label, def, max });

const DUR = 8;
const DEFAULT_SCENE = "neon-alley-crowd.jpg";
const FIELDS = [F("cta", "Call to action", "Watch free at voidtv.net", 34), F("sub", "Line under", "Free TV · No ads · No account", 44)];

export const NEON_PIECES = {
  "neon-alley": { title: "Neon alley", w: 1920, h: 1080, dur: DUR, format: "mp4", fields: FIELDS },
  "neon-alley-vertical": { title: "Neon alley (vertical)", w: 1080, h: 1920, dur: DUR, format: "mp4", fields: FIELDS },
  "neon-alley-feed": { title: "Neon alley (4:5 feed)", w: 1080, h: 1350, dur: DUR, format: "mp4", fields: FIELDS },
};

const build = (f, spec, theme = {}) => {
  const { w, h } = spec, V = h > w, S = V && h < w * 1.6;
  const img = theme.image && theme.image !== "None" ? theme.image : DEFAULT_SCENE;
  const cs = fit(f.cta, w * 0.84, V ? 52 : 50, 0.6), ss = fit(f.sub, w * 0.86, V ? 30 : 28, 0.78);
  // Wide: the scene fills the frame. Tall: a full-width band over a blurred copy, cropped 4:3 (vertical) or 3:2 (feed).
  // The sign spans about 23-78% of the scene's width, so both crops (and the 1.1x push) keep the whole name in view.
  const bandH = Math.round(S ? (w * 2) / 3 : (w * 3) / 4), bandTop = V ? (S ? 170 : 330) : 0;
  const ctaTop = V ? bandTop + bandH + (S ? 80 : 110) : Math.round(h * 0.8);
  const css = `
.cover { position: absolute; inset: 0; background-size: cover; background-repeat: no-repeat; }
#n-blur { background-image: url(assets/${img}); background-position: center; filter: blur(26px) brightness(.72) saturate(1.25); }
#n-band { position: absolute; left: 0; right: 0; top: ${bandTop}px; height: ${V ? bandH + "px" : "100%"}; overflow: hidden;
  ${V ? "box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 70px color-mix(in srgb, var(--glow) 40%, transparent), 0 30px 80px rgba(0,0,0,.7);" : ""} }
#n-img { background-image: url(assets/${img}); background-position: center; transform-origin: 50% 46%; }
#n-sh { position: absolute; inset: 0; background: #000; opacity: 0; }
#n-low { position: absolute; inset: 0; background: linear-gradient(transparent ${V ? 60 : 58}%, rgba(0,0,0,${V ? 0.55 : 0.8})); }
#n-cta { position: absolute; left: 0; right: 0; top: ${ctaTop}px; text-align: center; opacity: 0; }
#n-cta .chip { display: inline-block; font-size: ${cs}px; padding: 22px 38px; }
#n-sub { position: absolute; left: 0; right: 0; top: ${ctaTop + cs + 84}px; text-align: center; font: 700 ${ss}px/1.2 Inter, sans-serif;
  letter-spacing: .16em; text-transform: uppercase; color: #fff; text-shadow: 0 2px 12px #000; opacity: 0; padding: 0 ${Math.round(w * 0.06)}px; }`;
  const scene = `<div class="cover" id="n-img" data-layout-allow-overflow></div><div id="n-sh"></div>`;
  const body = [
    clipAt("nbg", DUR, 0, "layer", (V ? `<div class="cover" id="n-blur" data-layout-allow-overflow></div><div class="layer vig"></div>` : "")
      + `<div id="n-band">${scene}</div>` + `<div id="n-low"></div>` + (V ? "" : `<div class="layer vig"></div>`)),
    clipAt("ntx", DUR, 1, "layer", `<div id="n-cta"><span class="chip">${escName(f.cta)}</span></div><div id="n-sub">${escName(f.sub)}</div>`),
  ].join("\n");
  // Sign power-on: one dip on the way up, well under 3 flashes a second. The camera keeps moving to the last frame.
  const js = `tl.fromTo("#n-img", { scale: 1, x: 0 }, { scale: ${V ? 1.1 : 1.14}, x: ${V ? 0 : -24}, duration: ${DUR}, ease: "none" }, 0)
  .fromTo("#n-sh", { opacity: 1 }, { opacity: 0.3, duration: 0.45, ease: "power2.out" }, 0)
  .to("#n-sh", { opacity: 0.65, duration: 0.08 }, 0.55)
  .to("#n-sh", { opacity: 0, duration: 0.5, ease: "power2.out" }, 0.7)${V ? `
  .fromTo("#n-blur", { scale: 1.2 }, { scale: 1.3, duration: ${DUR}, ease: "none" }, 0)
  .fromTo("#n-blur", { opacity: 0 }, { opacity: 1, duration: 1.1, ease: "power2.out" }, 0.2)
  .fromTo("#n-band", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0)` : ""}
  .fromTo("#n-cta", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, 2.4)
  .fromTo("#n-sub", { opacity: 0, y: 16 }, { opacity: 0.92, y: 0, duration: 0.5, ease: "power2.out" }, 2.9);`;
  return { css, body, js };
};

export const NEON_BUILD = { "neon-alley": build, "neon-alley-vertical": build, "neon-alley-feed": build };
