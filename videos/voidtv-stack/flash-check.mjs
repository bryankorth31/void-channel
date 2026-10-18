// Photosensitivity check (WCAG 2.3.1, general flash): per-frame mean relative luminance in a 6x4 grid of
// windows; a transition is a swing of >= 0.10 (relative luminance, 0-1) in one direction, measured from the
// last extreme, where the darker state is < 0.80. Consecutive transitions therefore alternate direction.
// Prints the most transitions found in any sliding 1 s window, per grid cell and overall (must be <= 3).
// Usage: node flash-check.mjs renders/draft-16x9.mp4
import { spawn, spawnSync } from "node:child_process";

const file = process.argv[2];
if (!file) throw new Error("usage: node flash-check.mjs <video>");
const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
const st = JSON.parse(probe.stdout).streams[0];
const [num, den] = st.r_frame_rate.split("/").map(Number);
const fps = num / den;
const W = st.width, H = st.height, GX = 6, GY = 4;
const lut = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const colOf = new Int32Array(W), rowOf = new Int32Array(H);
for (let x = 0; x < W; x++) colOf[x] = Math.min(GX - 1, Math.floor((x * GX) / W));
for (let y = 0; y < H; y++) rowOf[y] = Math.min(GY - 1, Math.floor((y * GY) / H));
const cellPx = new Float64Array(GX * GY);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cellPx[rowOf[y] * GX + colOf[x]]++;

const series = Array.from({ length: GX * GY }, () => []);
const frameBytes = W * H * 3;
let pending = Buffer.alloc(0);
const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
ff.stdout.on("data", (chunk) => {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= frameBytes) {
    const fr = pending.subarray(0, frameBytes);
    const acc = new Float64Array(GX * GY);
    let p = 0;
    for (let y = 0; y < H; y++) {
      const rowBase = rowOf[y] * GX;
      for (let x = 0; x < W; x++, p += 3) {
        acc[rowBase + colOf[x]] += 0.2126 * lut[fr[p]] + 0.7152 * lut[fr[p + 1]] + 0.0722 * lut[fr[p + 2]];
      }
    }
    for (let c = 0; c < GX * GY; c++) series[c].push(acc[c] / cellPx[c]);
    pending = Buffer.from(pending.subarray(frameBytes));
  }
});
ff.on("close", () => {
  const n = series[0].length;
  const win = Math.round(fps);
  let worst = 0, worstAt = null;
  const perCell = [];
  series.forEach((s, c) => {
    // hysteresis transitions
    const ev = [];
    let dir = 0, ext = s[0], lo = s[0], hi = s[0], loI = 0, hiI = 0;
    for (let i = 1; i < n; i++) {
      const v = s[i];
      if (dir === 0) {
        if (v > hi) { hi = v; hiI = i; }
        if (v < lo) { lo = v; loI = i; }
        if (hi - lo >= 0.1 && lo < 0.8) { dir = hiI > loI ? 1 : -1; ev.push({ i, dir }); ext = v; }
      } else if (dir === 1) {
        if (v > ext) ext = v;
        else if (ext - v >= 0.1 && v < 0.8) { dir = -1; ev.push({ i, dir }); ext = v; }
      } else {
        if (v < ext) ext = v;
        else if (v - ext >= 0.1 && ext < 0.8) { dir = 1; ev.push({ i, dir }); ext = v; }
      }
    }
    let m = 0, mAt = -1;
    for (let a = 0; a < ev.length; a++) {
      let k = 0;
      for (let b = a; b < ev.length && ev[b].i - ev[a].i < win; b++) k++;
      if (k > m) { m = k; mAt = ev[a].i; }
    }
    const range = Math.max(...s) - Math.min(...s);
    perCell.push({ cell: `r${Math.floor(c / GX)}c${c % GX}`, transitions: ev.length, maxIn1s: m, at: mAt >= 0 ? +(mAt / fps).toFixed(2) : null, range: +range.toFixed(3), events: ev.map((e) => `${(e.i / fps).toFixed(2)}${e.dir > 0 ? "+" : "-"}`).join(" ") });
    if (m > worst) { worst = m; worstAt = perCell[perCell.length - 1]; }
  });
  console.log(`${file}: ${W}x${H} @ ${fps} fps, ${n} frames, grid ${GX}x${GY}`);
  perCell.filter((p) => p.transitions).forEach((p) => console.log(`  ${p.cell} range ${p.range} transitions ${p.transitions} max/1s ${p.maxIn1s} [${p.events}]`));
  const big = perCell.slice().sort((x, y) => y.range - x.range).slice(0, 3);
  console.log(`  largest per-cell luminance ranges over the whole clip: ${big.map((p) => `${p.cell} ${p.range}`).join(", ")} (peak cell mean ${Math.max(...series.flat()).toFixed(3)})`);
  console.log(`MAX opposing transitions in any 1 s window: ${worst}${worstAt ? ` (cell ${worstAt.cell} at ${worstAt.at}s)` : ""} -> ${worst <= 3 ? "PASS" : "FAIL"}`);
  process.exit(worst <= 3 ? 0 : 1);
});
