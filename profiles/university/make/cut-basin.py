"""Cut the Colorado basin for the University explainer from two public-domain downloads (NOAA ETOPO1, NASA Blue
Marble July). Writes, into the output folder:
  height.png  heights in metres, 16 bits split over red (high byte) and green (low byte), +1000 m offset; the two
              reservoirs carved to a bed that matches Reclamation's measured area at each level (ours, see lakes.json)
  color.jpg   the Blue Marble July picture cropped to the same box
  basin.json  box, grid size, river lines traced downhill (ours), the Colorado's own catchment as a mask, the lakes
usage: python -I cut_basin.py <etopo.asc> <bluemarble.jpg> <outdir>
"""
import sys, json, heapq
import numpy as np
from PIL import Image

asc, bm, out = sys.argv[1], sys.argv[2], sys.argv[3]
FT = 0.3048

# ---- heights
with open(asc) as f:
    head = {}
    for _ in range(6):
        k, v = f.readline().split()
        head[k.lower()] = float(v)
    z = np.loadtxt(f)
n = int(head['ncols']); assert z.shape == (int(head['nrows']), n)
lat0, lon0, cs = head['yllcenter'], head['xllcenter'], head['cellsize']
# Esri ASCII rows run north to south; row 0 is the top (north)
lat_top = lat0 + cs * (n - 1)
def cell(lat, lon):
    return int(round((lat_top - lat) / cs)), int(round((lon - lon0) / cs))
def latlon(r, c):
    return lat_top - r * cs, lon0 + c * cs
H, W = z.shape

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
def drainage(z):
    """Priority-flood so every cell drains, each cell to the cell it was reached from, and how many cells drain
    through each one (ours, from the heights)."""
    filled = z.copy(); seen = np.zeros(z.shape, bool); pq = []
    for r in range(H):
        for c in (0, W - 1):
            heapq.heappush(pq, (filled[r, c], r, c)); seen[r, c] = True
    for c in range(W):
        for r in (0, H - 1):
            if not seen[r, c]:
                heapq.heappush(pq, (filled[r, c], r, c)); seen[r, c] = True
    order = []; down = np.full(z.shape + (2,), -1, int)
    while pq:
        h, r, c = heapq.heappop(pq); order.append((r, c))
        for dr, dc in N8:
            rr, cc = r + dr, c + dc
            if 0 <= rr < H and 0 <= cc < W and not seen[rr, cc]:
                seen[rr, cc] = True; filled[rr, cc] = max(filled[rr, cc], h + 1e-3); down[rr, cc] = (r, c)
                heapq.heappush(pq, (filled[rr, cc], rr, cc))
    acc = np.ones(z.shape)
    for r, c in reversed(order):
        d = down[r, c]
        if d[0] >= 0:
            acc[d[0], d[1]] += acc[r, c]
    return down, acc

# ---- the lakes: everything connected to a seed below full pool (+ a margin for 1 arc-minute averaging)
LAKES = {
    'powell': {'seed': [(37.07, -111.25), (37.50, -110.73), (37.25, -110.95)], 'full_ft': 3700, 'dam': (36.937, -111.484), 'grow': 'river',
               # Reclamation hydrodata 919, medians 1990 to 2026: elevation ft -> area thousand acres
               'area': [(3520, 56.0), (3540, 63.1), (3560, 71.2), (3580, 85.3), (3600, 95.4), (3620, 105.9), (3640, 118.0), (3660, 131.0), (3680, 145.7), (3700, 154.7)]},
    'mead': {'seed': [(36.10, -114.70), (36.15, -114.40), (36.30, -114.25)], 'full_ft': 1229, 'dam': (36.016, -114.738),
             # Reclamation hydrodata 921 storage (million acre-feet) at each elevation; area = storage change per foot
             'storage': [(1040, 6.99), (1060, 8.43), (1080, 10.0), (1100, 11.49), (1120, 13.54), (1140, 15.37), (1160, 17.61), (1180, 20.1), (1200, 22.92)]},
}
for k, L in LAKES.items():
    if 'storage' in L:
        s = L['storage']
        L['area'] = [((a[0] + b[0]) / 2, (b[1] - a[1]) * 1000 / (b[0] - a[0])) for a, b in zip(s, s[1:])]  # thousand acres
    # grow from the seeds, always taking the lowest cell on the edge, until the lake covers the largest area
    # Reclamation measured: in narrow canyons a cell mixes the canyon floor with its rims, so a plain fill stops short
    cellkm2 = np.array([(cs * 111.32 * np.cos(np.radians(latlon(r, 0)[0]))) * (cs * 110.57) for r in range(H)])
    want = L['area'][-1][1] * 1000 * 0.0040469
    mask = np.zeros_like(z, dtype=bool); seen = np.zeros_like(z, dtype=bool); pq = []; got = 0.0
    if L.get('grow') == 'river':
        # a canyon lake: up every channel from the dam, nearest first, until it covers the measured area
        down0, acc0 = drainage(z) if 'd0' not in globals() else globals()['d0']
        globals()['d0'] = (down0, acc0)
        r, c = cell(*L['dam']); best = max(((acc0[r + a, c + b], r + a, c + b) for a in range(-2, 3) for b in range(-2, 3)))
        heapq.heappush(pq, (0, best[1], best[2])); seen[best[1], best[2]] = True; top_acc = best[0]
        while pq and got < want:
            d, r, c = heapq.heappop(pq)
            mask[r, c] = True; got += cellkm2[r]
            for dr, dc in N8:
                rr, cc = r + dr, c + dc
                if not (0 <= rr < H and 0 <= cc < W) or seen[rr, cc]:
                    continue
                if z[rr, cc] <= L['full_ft'] * FT and dr * dc == 0:
                    # a cell the heights already show as water at or under full pool: the lake's wide bays
                    seen[rr, cc] = True; heapq.heappush(pq, (d + 0.5, rr, cc))
                elif tuple(down0[rr, cc]) == (r, c) and acc0[rr, cc] >= 300:
                    # up a channel; a big river carries the lake farther than a side canyon (ours)
                    seen[rr, cc] = True; heapq.heappush(pq, (d + 1 + 1.5 * (np.log10(top_acc) - np.log10(acc0[rr, cc])), rr, cc))
    else:
        for p in L['seed']:
            r, c = cell(*p); heapq.heappush(pq, (z[r, c], r, c)); seen[r, c] = True
        while pq and got < want:
            h, r, c = heapq.heappop(pq)
            mask[r, c] = True; got += cellkm2[r]
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, c + dc
                if 0 <= rr < H and 0 <= cc < W and not seen[rr, cc]:
                    seen[rr, cc] = True; heapq.heappush(pq, (z[rr, cc], rr, cc))
    L['mask'] = mask
    km2 = float((cellkm2[:, None] * mask).sum())
    print(k, 'cells', int(mask.sum()), 'km2', round(km2), 'measured full area km2', round(L['area'][-1][1] * 1000 * 0.0040469))

# ---- carve each bed so the share of the lake under water at each level follows the measured area curve (ours)
for k, L in LAKES.items():
    mask = L['mask']
    # distance from the shore, in cells, by breadth-first steps inward
    dist = np.full(z.shape, -1, int)
    from collections import deque
    q = deque()
    for r, c in zip(*np.nonzero(mask)):
        if any(not (0 <= r + dr < H and 0 <= c + dc < W) or not mask[r + dr, c + dc] for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            dist[r, c] = 0; q.append((r, c))
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < H and 0 <= cc < W and mask[rr, cc] and dist[rr, cc] < 0:
                dist[rr, cc] = dist[r, c] + 1; q.append((rr, cc))
    cells = list(zip(*np.nonzero(mask)))
    # deepest first: far from the shore, then near the dam
    dr_, dc_ = cell(*L['dam'])
    cells.sort(key=lambda rc: (-dist[rc], abs(rc[0] - dr_) + abs(rc[1] - dc_)))
    area = L['area']; full = area[-1][1]
    # below the lowest measured level, the area falls to nothing along the lowest measured slope (ours)
    (h0, a0), (h1, a1) = area[0], area[1]
    slope = (a1 - a0) / (h1 - h0)
    bottom = h0 - a0 / slope
    curve = [(bottom, 0.0)] + area
    if curve[-1][0] < L['full_ft']:
        curve.append((L['full_ft'], full))
    L['bottom_ft'] = bottom
    hs = np.array([p[0] for p in curve]); fs = np.array([p[1] for p in curve]) / curve[-1][1]
    N = len(cells)
    for i, rc in enumerate(cells):
        f = (i + 0.5) / N
        z[rc] = np.interp(f, fs, hs) * FT
    print(k, 'bed from', round(bottom), 'ft; cells', N)

down, acc = drainage(z)
# the Colorado's own catchment: every cell whose path passes Hoover Dam's cell or reaches the river below it
def path_hits(r, c, targets, memo):
    trail = []
    while True:
        if memo[r, c] >= 0:
            v = memo[r, c]; break
        if (r, c) in targets:
            v = 1; break
        trail.append((r, c))
        d = down[r, c]
        if d[0] < 0:
            v = 0; break
        r, c = d
    for t in trail:
        memo[t] = v
    return v
# the river's lowest cell in the box: follow the biggest flow from Hoover Dam down to the edge
r, c = cell(*LAKES['mead']['dam'])
while down[r, c][0] >= 0:
    r, c = down[r, c]
outlet = (r, c)
memo = np.full(z.shape, -1, int)
basin = np.zeros(z.shape, bool)
for r in range(H):
    for c in range(W):
        basin[r, c] = path_hits(r, c, {outlet}, memo) == 1
print('outlet', latlon(*outlet), 'basin share', round(basin.mean(), 3), 'max acc', int(acc.max()))
# river lines: cells draining 1,500 cells (about 4,000 km2) or more, inside the basin, as chains of lat/lon points
TH = 1500
riv = (acc >= TH) & basin
lines = []
heads = [(r, c) for r, c in zip(*np.nonzero(riv)) if not any(0 <= r + dr < H and 0 <= c + dc < W and riv[r + dr, c + dc] and tuple(down[r + dr, c + dc]) == (r, c) for dr, dc in N8)]
done = set()
for r, c in heads:
    pts = []
    while True:
        pts.append([round(latlon(r, c)[0], 4), round(latlon(r, c)[1], 4), round(float(np.log10(acc[r, c])), 2)])
        if (r, c) in done:
            break
        done.add((r, c))
        d = down[r, c]
        if d[0] < 0 or not riv[d[0], d[1]]:
            break
        r, c = d
    if len(pts) > 1:
        lines.append(pts)
print('river lines', len(lines), 'points', sum(len(l) for l in lines))

# ---- write
hh = np.clip(np.round(z + 1000), 0, 65535).astype(np.uint32)
rgb = np.zeros((H, W, 3), np.uint8)
rgb[..., 0] = hh >> 8; rgb[..., 1] = hh & 255; rgb[..., 2] = (basin * 255).astype(np.uint8)
for L in LAKES.values():
    rgb[..., 2][L['mask']] = 200  # a lake's own cells, so the stage can draw its dry bed as the pale ring the water leaves
Image.fromarray(rgb, 'RGB').save(out + '/height.png', optimize=True)
Image.MAX_IMAGE_PIXELS = None
img = Image.open(bm)
px = img.width / 360.0
box = (int(round((lon0 - cs / 2 + 180) * px)), int(round((90 - (lat_top + cs / 2)) * px)), int(round((lon0 + cs * (n - 0.5) + 180) * px)), int(round((90 - (lat0 - cs / 2)) * px)))
img.crop(box).resize((1024, 1024), Image.LANCZOS).save(out + '/color.jpg', quality=88, optimize=True, progressive=True)
lakes = {}
for k, L in LAKES.items():
    idx = [int(r * W + c) for r, c in zip(*np.nonzero(L['mask']))]
    lakes[k] = {'cells': idx, 'bottomFt': round(L['bottom_ft'], 1), 'fullFt': L['full_ft'], 'dam': L['dam']}
json.dump({'box': {'latTop': lat_top, 'lon0': lon0, 'cs': cs, 'n': n, 'offset': 1000}, 'outlet': list(latlon(*outlet)), 'rivers': lines, 'lakes': lakes}, open(out + '/basin.json', 'w'), separators=(',', ':'))
print('written')
