// Motion Pack HQ (studio kit). Edit each piece, preview it live, render a finished video.
// No dependencies beyond Node. Start: node hq/server.mjs  (or double-click Start-HQ.cmd)
// Then open http://127.0.0.1:<port from kit.json>
import http from "node:http";
import { readFileSync, existsSync, statSync, createReadStream, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = join(HERE, "..", "pack");
const KIT = JSON.parse(readFileSync(join(HERE, "..", "kit.json"), "utf8"));
const { PIECES, THEME_FIELDS: TF, FONTS, loadContent, saveContent, generate, defaultContent } = await import(new URL("../pack/build-pack.mjs", import.meta.url));
const THEME_FIELDS = typeof TF === "function" ? TF() : TF;
const PORT = Number(process.env.PORT || KIT.port || 8220);
const HF = KIT.hyperframes || "hyperframes@latest";
const OUT = join(PACK, "renders");
mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm" };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, bad) => {
  const parts = []; let n = 0;
  req.on("data", (d) => { parts.push(d); n += d.length; if (n > 1e6) bad(new Error("too big")); });
  req.on("end", () => { try { const s = Buffer.concat(parts).toString("utf8"); ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } });
});
function serveFile(res, base, rel, download) {
  const p = normalize(join(base, decodeURIComponent(rel)));
  if (!p.startsWith(normalize(base)) || !existsSync(p) || statSync(p).isDirectory()) return send(res, 404, { error: "not found" });
  const headers = { "Content-Type": TYPES[extname(p).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" };
  if (download) headers["Content-Disposition"] = `attachment; filename="${p.split(/[\\/]/).pop()}"`;
  res.writeHead(200, headers); createReadStream(p).pipe(res);
}

// ---------- render jobs ----------
const jobs = new Map(); let jobSeq = 0;
function startRender(id) {
  const spec = PIECES[id];
  generate(id, loadContent());
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  const file = `${KIT.slug}-${id}-${stamp}.${spec.format}`;
  const args = ["--yes", HF, "render", ".", "-q", "high", ...(spec.format === "webm" ? ["--format", "webm"] : []), "-o", `./renders/${file}`];
  const job = { id: ++jobSeq, piece: id, file, pct: 0, state: "running", log: [], started: Date.now() };
  jobs.set(job.id, job);
  const child = spawn("npx", args, { cwd: join(PACK, id), shell: process.platform === "win32" });
  const onData = (d) => {
    for (const line of String(d).split(/\r?\n/)) {
      const m = line.match(/@hf-progress (\{.*\})/);
      if (m) { try { const p = JSON.parse(m[1]); if (typeof p.pct === "number") job.pct = p.pct; } catch {} }
      const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
      if (clean && !clean.startsWith("@hf-progress") && !clean.startsWith("[INFO]")) { job.log.push(clean); if (job.log.length > 40) job.log.shift(); }
    }
  };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  child.on("close", (code) => {
    const src = join(PACK, id, "renders", file);
    if (code === 0 && existsSync(src) && statSync(src).size > 0) {
      copyFileSync(src, join(OUT, file)); job.state = "done"; job.pct = 100; job.size = statSync(src).size;
    } else { job.state = "failed"; job.code = code; }
    job.seconds = Math.round((Date.now() - job.started) / 1000);
  });
  return job;
}
const rendersFor = (id) => readdirSync(OUT).filter((f) => f.startsWith(`${KIT.slug}-${id}-`) && /\.(mp4|webm)$/.test(f))
  .map((f) => ({ file: f, size: statSync(join(OUT, f)).size, at: statSync(join(OUT, f)).mtimeMs })).sort((a, b) => b.at - a.at);

// ---------- routes ----------
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); const path = url.pathname;
    if (path === "/" || path === "/index.html") return serveFile(res, HERE, "index.html");
        if (path === "/api/spec") return send(res, 200, { brand: KIT.brand, slug: KIT.slug, pieces: Object.fromEntries(Object.entries(PIECES).map(([k, v]) => [k, { title: v.title, w: v.w, h: v.h, dur: v.dur, format: v.format, overlay: !!v.overlay, fields: v.fields }])), theme: THEME_FIELDS, fonts: FONTS });
    if (path === "/api/content" && req.method === "GET") return send(res, 200, loadContent());
    let m;
    if ((m = path.match(/^\/api\/theme$/)) && req.method === "POST") {
      const body = await readBody(req); const c = loadContent();
      for (const f of THEME_FIELDS) if (typeof body[f.key] === "string" && (f.type !== "select" || f.options.includes(body[f.key]))) c.theme[f.key] = body[f.key].slice(0, 80);
      saveContent(c); for (const id of Object.keys(PIECES)) generate(id, c);
      return send(res, 200, { ok: true, content: c });
    }
    if ((m = path.match(/^\/api\/piece\/([\w-]+)$/)) && req.method === "POST") {
      const id = m[1]; if (!PIECES[id]) return send(res, 404, { error: "unknown part" });
      const body = await readBody(req); const c = loadContent(); const item = c.pieces[id];
      for (const f of PIECES[id].fields) if (typeof body.fields?.[f.key] === "string") item.fields[f.key] = body.fields[f.key].slice(0, f.max);
      if (body.style) for (const f of THEME_FIELDS) if (typeof body.style[f.key] === "string" && (f.type !== "select" || body.style[f.key] === "" || f.options.includes(body.style[f.key]))) item.style[f.key] = body.style[f.key].slice(0, 80);
      saveContent(c); generate(id, c);
      return send(res, 200, { ok: true, piece: item });
    }
    if ((m = path.match(/^\/api\/reset\/([\w-]+)$/)) && req.method === "POST") {
      const id = m[1]; const c = loadContent(); const d = defaultContent();
      c.pieces[id] = d.pieces[id]; saveContent(c); generate(id, c); return send(res, 200, { ok: true, piece: c.pieces[id] });
    }
    if ((m = path.match(/^\/api\/render\/([\w-]+)$/)) && req.method === "POST") {
      if (!PIECES[m[1]]) return send(res, 404, { error: "unknown part" });
      const busy = [...jobs.values()].find((j) => j.state === "running" && j.piece === m[1]);
      return send(res, 200, busy || startRender(m[1]));
    }
    if ((m = path.match(/^\/api\/job\/(\d+)$/))) return send(res, 200, jobs.get(Number(m[1])) || { state: "unknown" });
    if ((m = path.match(/^\/api\/renders\/([\w-]+)$/))) return send(res, 200, rendersFor(m[1]));
    if ((m = path.match(/^\/preview\/([\w-]+)\/(.*)$/)) && PIECES[m[1]]) return serveFile(res, join(PACK, m[1]), m[2] || "index.html");
    if ((m = path.match(/^\/files\/(.+)$/))) return serveFile(res, OUT, m[1], url.searchParams.has("download"));
    if (path.startsWith("/static/")) return serveFile(res, join(HERE, "static"), path.slice(8));
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, "127.0.0.1", () => {
  for (const id of Object.keys(PIECES)) if (!existsSync(join(PACK, id, "index.html"))) generate(id);
  console.log(`${KIT.brand} HQ running: http://127.0.0.1:${PORT}`);
});
