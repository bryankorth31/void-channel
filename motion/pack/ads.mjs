// voidtv.net promos and ads for the Motion Pack Kit. build-pack.mjs merges AD_PIECES / AD_BUILD into PIECES / BUILD.
// Each ad is a chain of SCENES. A scene writes its own HTML/CSS/GSAP at an absolute start time, so the same scene
// serves a one-campaign ad and the 30-second spot. Every ad comes in 16:9 (1920x1080), vertical 9:16 (1080x1920)
// and 4:5 feed (1080x1350, the tallest Instagram/Facebook feed size).
// Copy follows brand-kit/ads/README.md: name always "voidtv.net", no show artwork, "starts in seconds" (no exact number),
// "donation-supported, never required", no Internet Archive logo.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escName = (s) => esc(s).replace(/(voidtv)(\.net)/gi, '$1<span class="net">$2</span>');
// Font size from character counts at build time (never measured during render). em = average glyph width in ems.
const fitLines = (text, boxW, base, em, lines = 1) => {
  const t = String(text || " "); const longest = Math.max(1, ...t.split(/\s+/).map((w) => w.length));
  return Math.round(Math.min(base, (boxW * lines) / (t.length * em), boxW / (longest * em)));
};
const clipAt = (id, start, dur, track, cls = "", inner = "", extra = "") =>
  `<div id="${id}" class="clip ${cls}" data-start="${+start.toFixed(3)}" data-duration="${+dur.toFixed(3)}" data-track-index="${track}"${extra}>${inner}</div>`;
const F = (key, label, def, max = 60) => ({ key, label, def, max });
const n3 = (x) => +x.toFixed(3);

const AD_CSS = `
.neon { color: #fff0fa; text-shadow: 0 0 4px #fff, 0 0 12px var(--accent), 0 0 30px var(--glow), 0 0 64px var(--glow); }
.neon .net, .neonb { color: #e9fdff; text-shadow: 0 0 4px #fff, 0 0 12px var(--second), 0 0 30px var(--second), 0 0 64px color-mix(in srgb, var(--second) 70%, black); }
.white { color: #fff; text-shadow: 0 0 18px rgba(255,255,255,.35), 0 6px 30px rgba(0,0,0,.8); }
.gold { color: #ffe2a8; text-shadow: 0 0 4px #fff3d6, 0 0 14px #f2a93b, 0 0 34px #f2a93b, 0 0 70px #a8661a; }
.heavy { font-family: var(--display), sans-serif; font-weight: 800; line-height: 1.04; letter-spacing: -.01em; }
.center { position: absolute; left: 0; right: 0; text-align: center; }
.pill { display: inline-block; font-family: Inter, sans-serif; font-weight: 800; letter-spacing: .06em; color: var(--accentHi); border-radius: 999px;
  background: color-mix(in srgb, var(--bg) 80%, transparent); box-shadow: inset 0 0 0 2px var(--accent), 0 0 30px color-mix(in srgb, var(--glow) 45%, transparent), 0 10px 30px rgba(0,0,0,.6); }
.pill .net { color: color-mix(in srgb, var(--second) 55%, white); }
.cover { position: absolute; inset: 0; background-size: cover; background-repeat: no-repeat; }
.shade { position: absolute; inset: 0; background: #000; }
.wd { display: inline-block; }
`;

// ---------------------------------------------------------------- scenes
// ctx: { p: id prefix, t0: absolute start, d: length, k: d / base, f: fields, w, h, V: vertical }
const SCENES = {
  free: { title: "Free TV beats", base: 5.6,
    fields: [F("w1", "Beat 1", "Free TV.", 14), F("w2", "Beat 2", "No ads.", 14), F("w3", "Beat 3", "No account.", 14)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const cw = w * 0.86, words = [f.w1, f.w2, f.w3], cls = ["neon", "white", "neonb"];
      const css = words.map((x, i) => { const s = V ? fitLines(x, cw, 210, 0.74, 2) : fitLines(x, cw, 240, 0.7); return `#${p}-w${i} { top: ${Math.round(h / 2 - (V && x.length * s * 0.66 > cw ? s * 1.04 : s * 0.55))}px; font-size: ${s}px; padding: 0 ${Math.round((w - cw) / 2)}px; opacity: 0; }`; }).join("\n")
        + `\n#${p}-crt { position: absolute; left: 0; right: 0; top: ${h / 2 - 3}px; height: 6px; background: #fff; box-shadow: 0 0 24px #fff, 0 0 60px var(--second); opacity: 0; }`;
      const html = `<div class="cover" id="${p}-bg" data-layout-allow-overflow style="background-image:url(assets/static-dark.jpg);background-position:center;opacity:.6"></div><div class="layer vig"></div>
<div id="${p}-crt"></div>${words.map((x, i) => `<div id="${p}-w${i}" class="center heavy ${cls[i]}" data-layout-allow-overflow>${escName(x)}</div>`).join("")}`;
      const T = (x) => n3(t0 + x * k);
      let js = `tl.fromTo("#${p}-bg", { scale: 1.18 }, { scale: 1, duration: ${n3(5.6 * k)}, ease: "none" }, ${T(0)})
  .fromTo("#${p}-crt", { opacity: 1, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.22, ease: "power3.out" }, ${T(0)})
  .to("#${p}-crt", { scaleY: 40, opacity: 0, duration: 0.3, ease: "power2.in" }, ${n3(T(0) + 0.24)});`;
      words.forEach((_, i) => {
        const s = 0.55 + i * 1.7;
        js += `\ntl.fromTo("#${p}-w${i}", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" }, ${T(s)});`;
        if (i < 2) js += `\ntl.to("#${p}-w${i}", { opacity: 0, scale: 1.6, duration: 0.3, ease: "power2.in" }, ${n3(T(s + 1.7) - 0.3)});`;
      });
      return { css, html, js };
    } },

  stats: { title: "Library numbers", base: 6,
    fields: [F("n1", "Number 1", "4,600+", 9), F("l1", "Number 1 label", "shows", 16), F("n2", "Number 2", "50,000+", 9), F("l2", "Number 2 label", "episodes", 16),
      F("hl", "Headline", "Find the show you forgot you loved.", 44), F("genres", "Scrolling words", "Sitcoms · Cartoons · Westerns · Sci-fi · Game shows · Detectives · Variety · Anthology ·", 120)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const ns = Math.min(...[f.n1, f.n2].map((n) => fitLines(n, V ? w * 0.86 : w * 0.42, S ? 150 : V ? 190 : 200, 0.82))), pos = S ? [[0, h * 0.1], [0, h * 0.32]] : V ? [[0, h * 0.17], [0, h * 0.37]] : [[-w * 0.23, h * 0.2], [w * 0.23, h * 0.2]];
      const hs = fitLines(f.hl, w * 0.84, S ? 76 : V ? 92 : 96, 0.66, 2);
      const css = `.${p}-stat { position: absolute; left: 0; right: 0; text-align: center; }
.${p}-num { font-size: ${ns}px; } .${p}-lab { margin-top: 18px; font: 800 ${V ? 44 : 40}px/1 Inter, sans-serif; letter-spacing: .3em; text-transform: uppercase; color: var(--accentHi); opacity: 0; }
#${p}-hl { top: ${Math.round(S ? h * 0.57 : V ? h * 0.56 : h * 0.55)}px; padding: 0 ${Math.round(w * 0.08)}px; font-size: ${hs}px; text-wrap: balance; }
#${p}-hl .wd { opacity: 0; }
.${p}-row { position: absolute; left: 0; white-space: nowrap; font: 800 ${V ? 70 : 76}px/1 var(--display), sans-serif; opacity: .3; }
#${p}-r1 { top: ${Math.round(h * (S ? 0.8 : 0.8))}px; color: var(--accent); } #${p}-r2 { top: ${Math.round(h * (S ? 0.89 : V ? 0.87 : 0.9))}px; color: var(--second); }`;
      const stat = (i, n, l, [dx, y]) => `<div class="${p}-stat" style="top:${Math.round(y)}px;left:${Math.round(dx)}px;right:${Math.round(-dx)}px"><div class="heavy neon ${p}-num" id="${p}-n${i}">0</div><div class="${p}-lab" id="${p}-l${i}">${esc(l)}</div></div>`;
      const row = (id) => `<div class="${p}-row" id="${p}-${id}" data-layout-allow-overflow>${esc((f.genres + " ").repeat(4))}</div>`;
      const html = `<div class="cover" style="background:radial-gradient(70% 60% at 50% 35%, color-mix(in srgb, var(--glow) 30%, var(--bg)), var(--bg))"></div>
${stat(1, f.n1, f.l1, pos[0])}${stat(2, f.n2, f.l2, pos[1])}
<div id="${p}-hl" class="center heavy white">${String(f.hl).split(/\s+/).map((x) => `<span class="wd">${escName(x)}</span>`).join(" ")}</div>${row("r1")}${row("r2")}`;
      const counter = (i, txt, t) => {
        const m = String(txt).match(/^([^\d]*)([\d,.]+)(.*)$/); if (!m) return `tl.set("#${p}-n${i}", { textContent: ${JSON.stringify(String(txt))} }, ${t});`;
        const N = parseFloat(m[2].replace(/,/g, "")), pre = JSON.stringify(m[1]), suf = JSON.stringify(m[3]);
        return `{ const o = { v: 0 }, el = document.getElementById("${p}-n${i}");
  tl.fromTo(o, { v: 0 }, { v: ${N}, duration: 1.4, ease: "power2.out", onUpdate: () => { el.textContent = ${pre} + Math.round(o.v).toLocaleString("en-US") + ${suf}; } }, ${t}); }`;
      };
      const js = `tl.fromTo(".${p}-stat", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out", stagger: 0.35 }, ${T(0.2)});
${counter(1, f.n1, T(0.25))}
${counter(2, f.n2, T(0.6))}
tl.fromTo(["#${p}-l1", "#${p}-l2"], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.35 }, ${T(1.2)})
  .fromTo("#${p}-hl .wd", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.07 }, ${T(2.4)})
  .fromTo("#${p}-r1", { xPercent: 0 }, { xPercent: -30, duration: ${n3(6 * k)}, ease: "none" }, ${T(0)})
  .fromTo("#${p}-r2", { xPercent: -30 }, { xPercent: 0, duration: ${n3(6 * k)}, ease: "none" }, ${T(0)});`;
      return { css, html, js };
    } },

  search: { title: "Search", base: 5,
    fields: [F("q", "Typed search", "The Twilight Zone", 28), F("r1", "Result 1", "Every season", 30), F("r2", "Result 2", "Every episode, in order", 30),
      F("r3", "Result 3", "Free. No account.", 30), F("hl", "Headline", "Search every show, every episode, instantly.", 50)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const bw = Math.round(w * (V ? 0.88 : 0.6)), bh = V ? 130 : 120, bx = Math.round((w - bw) / 2), by = Math.round(h * (S ? 0.11 : V ? 0.2 : 0.16));
      const qs = fitLines(f.q, bw - 200, V ? 54 : 56, 0.56), hs = fitLines(f.hl, w * 0.84, S ? 70 : 84, 0.66, 2);
      const rowH = S ? 122 : V ? 150 : 118, ry = by + bh + 40;
      const css = `#${p}-bar { position: absolute; left: ${bx}px; top: ${by}px; width: ${bw}px; height: ${bh}px; border-radius: 999px; background: rgba(10,12,20,.92);
  box-shadow: inset 0 0 0 3px var(--accent), 0 0 50px color-mix(in srgb, var(--glow) 55%, transparent); display: flex; align-items: center; padding-left: 40px; gap: 26px; opacity: 0; }
#${p}-bar svg { width: ${Math.round(bh * 0.42)}px; height: ${Math.round(bh * 0.42)}px; flex: none; }
#${p}-q { font: 600 ${qs}px/1 Inter, sans-serif; color: #fff; white-space: pre; display: flex; align-items: center; }
#${p}-q .ch { display: none; } #${p}-caret { display: inline-block; width: 4px; height: ${Math.round(qs * 1.1)}px; margin-left: 4px; background: var(--second); box-shadow: 0 0 12px var(--second); }
.${p}-res { position: absolute; left: ${bx + 20}px; width: ${bw - 40}px; height: ${rowH - 22}px; display: flex; align-items: center; gap: 28px; border-radius: 18px;
  background: rgba(14,16,26,.85); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); opacity: 0; padding: 0 22px; }
.${p}-res .tile { width: ${Math.round((rowH - 50) * 16 / 9)}px; height: ${rowH - 50}px; border-radius: 10px; flex: none;
  background: linear-gradient(135deg, var(--glow), color-mix(in srgb, var(--second) 70%, black)); box-shadow: 0 0 20px color-mix(in srgb, var(--glow) 40%, transparent); }
.${p}-res .tx { font: 700 ${V ? 44 : 38}px/1.1 Inter, sans-serif; color: #fff; }
#${p}-hl { top: ${Math.round(S ? h * 0.73 : V ? h * 0.66 : h * 0.72)}px; padding: 0 ${Math.round(w * 0.08)}px; font-size: ${hs}px; text-wrap: balance; } #${p}-hl .wd { opacity: 0; }`;
      const chars = [...String(f.q)].map((c) => `<span class="ch">${esc(c)}</span>`).join("");
      const lens = `<svg viewBox="0 0 24 24" fill="none" stroke="#5fe3ff" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>`;
      const res = [f.r1, f.r2, f.r3].map((x, i) => `<div class="${p}-res" style="top:${ry + i * rowH}px"><div class="tile"></div><div class="tx">${escName(x)}</div></div>`).join("");
      const html = `<div class="cover" style="background:radial-gradient(80% 60% at 50% 20%, color-mix(in srgb, var(--second) 22%, var(--bg)), var(--bg))"></div>
<div id="${p}-bar">${lens}<div id="${p}-q">${chars}<span id="${p}-caret"></span></div></div>${res}
<div id="${p}-hl" class="center heavy white">${String(f.hl).split(/\s+/).map((x) => `<span class="wd">${escName(x)}</span>`).join(" ")}</div>`;
      const step = Math.min(0.08, 1.3 / Math.max(1, [...String(f.q)].length)), tEnd = 0.5 + step * [...String(f.q)].length;
      const js = `tl.fromTo("#${p}-bar", { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }, ${T(0.05)});
document.querySelectorAll("#${p}-q .ch").forEach((c, i) => tl.set(c, { display: "inline" }, ${T(0.5)} + i * ${n3(step * k)}));
tl.fromTo(".${p}-res", { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out", stagger: 0.14 }, ${T(tEnd + 0.15)})
  .fromTo("#${p}-hl .wd", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.06 }, ${T(tEnd + 0.75)})
  .to("#${p}-caret", { opacity: 0, duration: 0.15 }, ${T(tEnd + 0.4)});`;
      return { css, html, js };
    } },

  speed: { title: "Press play", base: 4.2,
    fields: [F("a", "Before", "Press play.", 16), F("b", "After", "It plays.", 14), F("sub", "Line under", "Starts in seconds, straight from the Internet Archive.", 60)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const r = S ? 140 : V ? 170 : 150, cx = w / 2, cy = Math.round(h * (S ? 0.36 : 0.4));
      const as = fitLines(f.a, w * 0.8, V ? 110 : 110, 0.74), bs = V ? fitLines(f.b, w * 0.86, S ? 180 : 210, 0.66, 2) : fitLines(f.b, w * 0.86, 230, 0.7), ss = fitLines(f.sub, w * 0.84, V ? 40 : 34, 0.56, 2);
      const css = `#${p}-btn, #${p}-ring { position: absolute; left: ${cx - r}px; top: ${cy - r}px; width: ${2 * r}px; height: ${2 * r}px; border-radius: 50%; }
#${p}-btn { background: radial-gradient(circle at 40% 35%, var(--accent), var(--accentDeep)); box-shadow: 0 0 0 6px #fff2, 0 0 60px var(--glow), 0 0 120px color-mix(in srgb, var(--glow) 50%, transparent); opacity: 0; }
#${p}-btn svg { position: absolute; left: 28%; top: 25%; width: 50%; height: 50%; }
#${p}-ring { box-shadow: inset 0 0 0 6px var(--second), 0 0 40px var(--second); opacity: 0; }
#${p}-a { top: ${Math.round(cy + r + (S ? 44 : 60))}px; font-size: ${as}px; opacity: 0; }
#${p}-b { top: ${Math.round(h * (S ? 0.2 : V ? 0.3 : 0.36))}px; font-size: ${bs}px; padding: 0 ${Math.round(w * 0.07)}px; opacity: 0; }
#${p}-sub { top: ${Math.round(h * (S ? 0.68 : V ? 0.62 : 0.66))}px; padding: 0 ${Math.round(w * 0.08)}px; opacity: 0; } #${p}-sub .pill { font-size: ${ss}px; padding: 18px 30px; line-height: 1.3; }`;
      const html = `<div class="cover" style="background:radial-gradient(60% 50% at 50% 40%, color-mix(in srgb, var(--glow) 28%, var(--bg)), var(--bg))"></div>
<div class="cover" id="${p}-hit" data-layout-allow-overflow style="background-image:url(assets/static-bolt.jpg);background-position:center;opacity:0"></div><div class="shade" id="${p}-sh" style="opacity:0"></div>
<div id="${p}-ring"></div><div id="${p}-btn"><svg viewBox="0 0 10 10"><path d="M1 0.6L9.4 5 1 9.4Z" fill="#fff"/></svg></div>
<div id="${p}-a" class="center heavy white">${escName(f.a)}</div><div id="${p}-b" class="center heavy neon" data-layout-allow-overflow>${escName(f.b)}</div>
<div id="${p}-sub" class="center"><span class="pill">${escName(f.sub)}</span></div>`;
      const js = `tl.fromTo("#${p}-btn", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, ${T(0.1)})
  .fromTo("#${p}-a", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, ${T(0.35)})
  .to("#${p}-btn", { scale: 0.86, duration: 0.09, ease: "power2.in" }, ${T(1.15)})
  .to("#${p}-btn", { scale: 1, duration: 0.25, ease: "back.out(3)" }, ${n3(T(1.15) + 0.09)})
  .fromTo("#${p}-ring", { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 2.6, duration: 0.55, ease: "power2.out" }, ${n3(T(1.15) + 0.09)})
  .to(["#${p}-btn", "#${p}-a"], { opacity: 0, scale: 1.5, duration: 0.3, ease: "power2.in" }, ${T(1.45)})
  .fromTo("#${p}-hit", { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, ${T(1.6)})
  .fromTo("#${p}-sh", { opacity: 0 }, { opacity: 0.5, duration: 0.5 }, ${T(1.6)})
  .fromTo("#${p}-b", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" }, ${T(1.7)})
  .fromTo("#${p}-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${T(2.3)});`;
      return { css, html, js };
    } },

  manifesto: { title: "Manifesto", base: 5,
    fields: [F("l1", "Line 1", "Before AI slop,", 30), F("l2", "Line 2 (neon)", "there was human creativity.", 40), F("l3", "Tag", "Classic and cult TV, kept alive.", 44)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const s1 = fitLines(f.l1, w * 0.84, S ? 100 : V ? 120 : 130, 0.72, V ? 2 : 1), s2 = fitLines(f.l2, w * 0.84, S ? 100 : 120, 0.72, 2), s3 = fitLines(f.l3, w * 0.84, V ? 40 : 36, 0.56, 2);
      const css = `#${p}-l1 { top: ${Math.round(h * (S ? 0.22 : V ? 0.22 : 0.2))}px; font-size: ${s1}px; padding: 0 ${Math.round(w * 0.07)}px; }
#${p}-l2 { top: ${Math.round(h * (S ? 0.42 : 0.4))}px; font-size: ${s2}px; padding: 0 ${Math.round(w * 0.07)}px; text-wrap: balance; }
#${p}-l1 .wd, #${p}-l2 .wd { opacity: 0; } #${p}-l3 { top: ${Math.round(h * (S ? 0.8 : V ? 0.72 : 0.78))}px; opacity: 0; } #${p}-l3 .pill { font-size: ${s3}px; padding: 18px 30px; }`;
      const words = (t) => String(t).split(/\s+/).map((x) => `<span class="wd">${escName(x)}</span>`).join(" ");
      const html = `<div class="cover" id="${p}-bg" data-layout-allow-overflow style="background-image:url(assets/static-glitch.jpg);background-position:center;opacity:.45"></div><div class="layer vig"></div>
<div id="${p}-l1" class="center heavy white">${words(f.l1)}</div><div id="${p}-l2" class="center heavy neon">${words(f.l2)}</div>
<div id="${p}-l3" class="center"><span class="pill">${escName(f.l3)}</span></div>`;
      const js = `tl.fromTo("#${p}-bg", { scale: 1.05, xPercent: 0 }, { scale: 1.15, xPercent: -3, duration: ${n3(5 * k)}, ease: "none" }, ${T(0)})
  .fromTo("#${p}-l1 .wd", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.12 }, ${T(0.25)})
  .fromTo("#${p}-l2 .wd", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.14 }, ${T(1.5)})
  .fromTo("#${p}-l3", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${T(3.0)});`;
      return { css, html, js };
    } },

  give: { title: "Free because people give", base: 5,
    fields: [F("hl", "Headline", "Free because people give.", 34), F("l2", "Line", "voidtv.net is a nonprofit project of CASH, a 501(c)(3).", 70),
      F("l3", "Tag", "Donation-supported. Never required.", 44)],
    build: ({ p, t0, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const hs = fitLines(f.hl, w * 0.84, S ? 116 : V ? 140 : 130, 0.72, 2), s2 = fitLines(f.l2, w * 0.8, V ? 46 : 42, 0.52, 2), s3 = fitLines(f.l3, w * 0.84, V ? 40 : 36, 0.56, 2);
      const css = `#${p}-hl { top: ${Math.round(h * (S ? 0.16 : V ? 0.26 : 0.2))}px; font-size: ${hs}px; padding: 0 ${Math.round(w * 0.07)}px; text-wrap: balance; } #${p}-hl .wd { opacity: 0; }
#${p}-l2 { top: ${Math.round(h * (S ? 0.55 : V ? 0.56 : 0.6))}px; padding: 0 ${Math.round(w * 0.1)}px; font: 600 ${s2}px/1.3 Inter, sans-serif; color: #fff; text-wrap: balance; opacity: 0; }
#${p}-l3 { top: ${Math.round(h * (S ? 0.74 : V ? 0.7 : 0.76))}px; opacity: 0; } #${p}-l3 .pill { font-size: ${s3}px; padding: 18px 30px; color: #ffe2a8; box-shadow: inset 0 0 0 2px #f2a93b, 0 0 30px #f2a93b66, 0 10px 30px rgba(0,0,0,.6); }`;
      const html = `<div class="cover" id="${p}-bg" data-layout-allow-overflow style="background-image:url(assets/sign-orange.jpg);background-position:${V ? "54%" : "center"} center;opacity:${V ? 0.3 : 0.4};filter:blur(14px)"></div><div class="layer vig"></div>
<div id="${p}-hl" class="center heavy gold">${String(f.hl).split(/\s+/).map((x) => `<span class="wd">${escName(x)}</span>`).join(" ")}</div>
<div id="${p}-l2" class="center">${escName(f.l2)}</div><div id="${p}-l3" class="center"><span class="pill">${escName(f.l3)}</span></div>`;
      const js = `tl.fromTo("#${p}-bg", { scale: 1 }, { scale: 1.1, duration: ${n3(5 * k)}, ease: "none" }, ${T(0)})
  .fromTo("#${p}-hl .wd", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.12 }, ${T(0.2)})
  .fromTo("#${p}-l2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${T(1.4)})
  .fromTo("#${p}-l3", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${T(2.0)});`;
      return { css, html, js };
    } },

  // The background art already carries the neon "voidtv.net" sign, so the lockup pushes in on it instead of drawing a logo.
  lockup: { title: "Neon sign lockup", base: 4,
    fields: [F("cta", "Call to action", "Watch free at voidtv.net", 34), F("sub", "Line under", "A nonprofit project of CASH", 44)],
    build: ({ p, t0, d, k, f, w, h, V, S }) => {
      const T = (x) => n3(t0 + x * k);
      const cs = fitLines(f.cta, w * 0.84, V ? 58 : 54, 0.6), ss = fitLines(f.sub, w * 0.84, V ? 34 : 30, 0.56);
      const css = `#${p}-cta { top: ${Math.round(h * (S ? 0.73 : V ? 0.75 : 0.76))}px; opacity: 0; } #${p}-cta .pill { font-size: ${cs}px; padding: 24px 40px; }
#${p}-sub { top: ${Math.round(h * (S ? 0.73 : V ? 0.75 : 0.76) + cs + 90)}px; font: 700 ${ss}px/1 Inter, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #fff; opacity: 0; text-shadow: 0 2px 12px #000; }`;
      const bg = V ? `background-image:url(assets/sign-pink.jpg);background-position:54% center` : `background-image:url(assets/wall.jpg);background-position:center 40%`;
      const html = `<div class="cover" id="${p}-bg" data-layout-allow-overflow style="${bg};transform-origin:50% ${V ? 38 : 45}%"></div><div class="shade" id="${p}-sh" style="opacity:0"></div>
<div class="cover" style="background:linear-gradient(transparent 55%, rgba(0,0,0,.75))"></div>
<div id="${p}-cta" class="center"><span class="pill">${escName(f.cta)}</span></div><div id="${p}-sub" class="center">${escName(f.sub)}</div>`;
      // Sign power-on: one dip on the way up, under the 3-flashes-per-second limit.
      const js = `tl.fromTo("#${p}-bg", { scale: 1 }, { scale: 1.1, duration: ${n3(d)}, ease: "none" }, ${n3(t0)})
  .fromTo("#${p}-sh", { opacity: 1 }, { opacity: 0.25, duration: 0.28, ease: "power2.out" }, ${n3(t0)})
  .to("#${p}-sh", { opacity: 0.7, duration: 0.08 }, ${T(0.45)})
  .to("#${p}-sh", { opacity: 0, duration: 0.35, ease: "power2.out" }, ${T(0.62)})
  .fromTo("#${p}-cta", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, ${T(1.0)})
  .fromTo("#${p}-sub", { opacity: 0 }, { opacity: 0.9, duration: 0.5 }, ${T(1.4)});`;
      return { css, html, js };
    } },
};

// ---------------------------------------------------------------- ads = chains of scenes
const O = 0.4; // crossfade overlap between scenes
const ADS = {
  "ad-free": { title: "Ad · Free TV", scenes: [["free", 5.6], ["lockup", 4]] },
  "ad-library": { title: "Ad · The library", scenes: [["stats", 6.4], ["lockup", 4]], defaults: { lockup_cta: "Find your show at voidtv.net" } },
  "ad-search": { title: "Ad · Search", scenes: [["search", 5.4], ["lockup", 4]], defaults: { lockup_cta: "Find your show at voidtv.net" } },
  "ad-speed": { title: "Ad · Press play", scenes: [["speed", 4.6], ["lockup", 4]], defaults: { lockup_cta: "Start watching at voidtv.net" } },
  "ad-manifesto": { title: "Ad · Human creativity", scenes: [["manifesto", 5.2], ["lockup", 4]] },
  "ad-give": { title: "Ad · Free because people give", scenes: [["give", 5.2], ["lockup", 4]],
    defaults: { lockup_cta: "Give what it is worth to you", lockup_sub: "voidtv.net · nonprofit TV, for the love of TV" } },
  "spot-30": { title: "TV spot · 30 seconds", scenes: [["free", 5.2], ["stats", 5.6], ["search", 4.6], ["speed", 4.0], ["manifesto", 4.4], ["give", 3.8], ["lockup", 4.4]] },
};
const adDur = (a) => n3(a.scenes.reduce((s, [, d]) => s + d, 0) - O * (a.scenes.length - 1));
const adFields = (a) => a.scenes.flatMap(([name]) => SCENES[name].fields.map((x) => {
  const key = `${name}_${x.key}`; return F(key, a.scenes.length > 2 ? `${SCENES[name].title}: ${x.label}` : x.label, a.defaults?.[key] ?? x.def, x.max);
}));

export const AD_PIECES = {};
for (const [id, a] of Object.entries(ADS)) {
  AD_PIECES[id] = { title: a.title, w: 1920, h: 1080, dur: adDur(a), format: "mp4", fields: adFields(a) };
  AD_PIECES[`${id}-vertical`] = { title: `${a.title} (vertical)`, w: 1080, h: 1920, dur: adDur(a), format: "mp4", fields: adFields(a) };
  AD_PIECES[`${id}-feed`] = { title: `${a.title} (4:5 feed)`, w: 1080, h: 1350, dur: adDur(a), format: "mp4", fields: adFields(a) };
}

const buildAd = (a) => (fields, spec) => {
  const { w, h } = spec, V = h > w, S = V && h < w * 1.6, total = adDur(a);
  const parts = { css: [AD_CSS], body: [], js: [] };
  let t = 0;
  a.scenes.forEach(([name, d], i) => {
    const sc = SCENES[name], p = `s${i}`, f = {};
    for (const x of sc.fields) f[x.key] = fields[`${name}_${x.key}`] ?? x.def;
    const out = sc.build({ p, t0: t, d, k: d / sc.base, f, w, h, V, S });
    parts.css.push(out.css);
    parts.body.push(clipAt(p, t, d, (i % 2) + 1, "layer", out.html));
    parts.js.push(out.js);
    // Scene seams keep one forward camera vector: the outgoing scene rushes past the lens, the next arrives from depth.
    if (i > 0) parts.js.push(`tl.fromTo("#${p}", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: ${O}, ease: "power3.out" }, ${n3(t)});`);
    if (i < a.scenes.length - 1) parts.js.push(`tl.to("#${p}", { opacity: 0, scale: 1.12, duration: ${O}, ease: "power2.in" }, ${n3(t + d - O)});`);
    t += d - O;
  });
  // Corner bug keeps the name on screen until the neon sign takes over.
  const lockStart = n3(total - a.scenes.at(-1)[1]);
  parts.css.push(`#bug { position: absolute; ${V ? `left: 0; right: 0; text-align: center; top: ${S ? 44 : 80}px;` : "right: 64px; top: 52px;"} font: 700 ${V ? (S ? 34 : 40) : 36}px/1 var(--display), sans-serif; opacity: 0; }`);
  parts.body.push(clipAt("bugw", 0, lockStart + O, 3, "layer", `<div id="bug" class="neon">${escName("voidtv.net")}</div>`));
  parts.js.push(`tl.fromTo("#bug", { opacity: 0 }, { opacity: 0.9, duration: 0.4 }, 0.6).to("#bug", { opacity: 0, duration: ${O} }, ${lockStart});`);
  return { css: parts.css.join("\n"), body: parts.body.join("\n"), js: parts.js.join("\n") };
};

export const AD_BUILD = {};
for (const [id, a] of Object.entries(ADS)) AD_BUILD[id] = AD_BUILD[`${id}-vertical`] = AD_BUILD[`${id}-feed`] = buildAd(a);
