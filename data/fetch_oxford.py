#!/usr/bin/env python3
"""Download Oxford from OpenStreetMap (Overpass API) and write game_data.json for the game.

Only needs Python 3.8+, no extra packages.
Run (from data/):  python fetch_oxford.py
Raw downloads are cached in raw/raw_*.json (git-ignored), so re-running to change the crop or the
conversion is instant; delete raw/ to download again.
Data (c) OpenStreetMap contributors, ODbL.

Output format (all coordinates in decimetres, x east, z south, origin at the centre of the crop box):
  s  [width m, height m]
  c  [x m, z m] of the city centre
  x  cut-out boxes [[x0, z0, x1, z1] m], left empty and kept out of the camera's reach
  b  buildings  [ring, 2*height m, kind 0..4 ('crsuo'), name|0, holes|0, extras?{s,c,m,w,wc}]
  t  trees      [x, z, x, z, ...]
  w  water      [outer, holes?]
  r  rivers     [line, width dm]
  g  green      [ring, 0 grass | 1 pitch]
  d  roads      [line, width dm, class 0 rail | 1.. ROAD_CLASSES]
  l  colleges   [x m, z m, name]  centre of each college's grounds (the game labels the ones it knows)
"""
import json, math, os, sys, time, urllib.parse, urllib.request

# Download box. Covers Summertown (north) to Christ Church Meadow (south), the station (west) to Cowley (east).
S, W, N, E = 51.7465, -1.2745, 51.7785, -1.2050
# Playable area written to game_data.json: the crop box, minus the CUT boxes (each (S, W, N, E)).
CROP = (S, W, N, E)
# Marston, Headington and the JR: east of the Cherwell, north of Headington Road. Too big, and not what people come for.
CUT = [(51.75662, -1.24192, N, E)]

LAT0, LON0 = (CROP[0] + CROP[2]) / 2, (CROP[1] + CROP[3]) / 2
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574  # metres per degree
MIRRORS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter"]
BB = f"({S},{W},{N},{E})"
QUERIES = {
    "buildings": f'way["building"]{BB};relation["building"]{BB};',
    "trees": (f'node["natural"="tree"]{BB};way["natural"="tree_row"]{BB};'
              f'way["natural"~"^(wood|scrub)$"]{BB};way["landuse"="forest"]{BB};'),
    "water": (f'way["natural"="water"]{BB};relation["natural"="water"]{BB};'
              f'way["waterway"~"^(river|stream|canal|ditch)$"]{BB};way["landuse"="reservoir"]{BB};'),
    "green": (f'way["landuse"~"^(grass|meadow|recreation_ground|allotments|cemetery|village_green)$"]{BB};'
              f'way["leisure"~"^(park|pitch|garden|playground|common|golf_course|nature_reserve)$"]{BB};'
              f'way["natural"="grassland"]{BB};'),
    "roads": (f'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|'
              f'living_street|service|pedestrian|footway|cycleway|path|track|steps)$"]{BB};'
              f'way["railway"="rail"]{BB};'),
    "colleges": (f'way["amenity"~"^(college|university)$"]["name"]{BB};relation["amenity"~"^(college|university)$"]["name"]{BB};'
                 f'way["university"="college"]{BB};relation["university"="college"]{BB};'),
}
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")


def fetch(name):
    cache = os.path.join(RAW, f"raw_{name}.json")
    if os.path.exists(cache):
        print(f"[{name}] using cache")
        return json.load(open(cache, encoding="utf-8"))
    os.makedirs(RAW, exist_ok=True)
    q = f"[out:json][timeout:240];({QUERIES[name]});out geom;"
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            print(f"[{name}] requesting {url} ...", flush=True)
            req = urllib.request.Request(url, body, {"User-Agent": "oxford-break-game/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            json.dump(data, open(cache, "w", encoding="utf-8"))
            print(f"[{name}] {len(data['elements'])} elements")
            return data
        except Exception as ex:
            print(f"[{name}] failed: {ex}; retrying in 15 s", flush=True)
            time.sleep(15)
    sys.exit(f"could not download {name}")


def proj(p):
    return (round((p["lon"] - LON0) * KX, 1), round(-(p["lat"] - LAT0) * KZ, 1))


def box_xz(b):
    s, w, n, e = b
    return ((w - LON0) * KX, -(n - LAT0) * KZ, (e - LON0) * KX, -(s - LAT0) * KZ)


CROP_XZ = box_xz(CROP)
CUT_XZ = [box_xz(c) for c in CUT]


def keep(x, z):
    x0, z0, x1, z1 = CROP_XZ
    if not (x0 <= x <= x1 and z0 <= z <= z1):
        return False
    return not any(a <= x <= c and b <= z <= d for a, b, c, d in CUT_XZ)


def way_pts(el):
    return [proj(p) for p in el.get("geometry", [])]


def stitch(segs):
    segs = [list(s) for s in segs if len(s) > 1]
    rings = []
    while segs:
        cur = segs.pop()
        while cur[0] != cur[-1]:
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur = cur + s[1:]
                elif s[-1] == cur[-1]:
                    cur = cur + s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                break
            else:
                break
        if len(cur) > 3 and cur[0] == cur[-1]:
            rings.append(cur[:-1])
    return rings


def inside(pt, ring):
    x, z = pt
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c


def area(r):
    return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2


def centroid(r):
    return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)


def polys(el):
    """-> list of (outer, [holes])"""
    if el["type"] == "way":
        p = way_pts(el)
        if len(p) > 3 and p[0] == p[-1]:
            return [(p[:-1], [])]
        return []
    outs = stitch([way_pts(m) for m in el.get("members", []) if m.get("role") == "outer" and m["type"] == "way"])
    ins = stitch([way_pts(m) for m in el.get("members", []) if m.get("role") == "inner" and m["type"] == "way"])
    res = [(o, []) for o in outs]
    for h in ins:
        for o, hs in res:
            if inside(h[0], o):
                hs.append(h)
                break
    return res


def pdist(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    if dx == dz == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = pdist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return dp(pts[:idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def simp_ring(r, eps):
    s = dp(r + [r[0]], eps)[:-1]
    return s if len(s) >= 3 else r


def dm(pts):
    """flat list of decimetre ints"""
    return [int(round(v * 10)) for p in pts for v in p[:2]]


def num(v):
    try:
        return float(str(v).lower().replace("m", "").replace(",", ".").split()[0])
    except Exception:
        return None


def clip_line(pts):
    """split a polyline into the runs that lie in the playable area"""
    runs, cur = [], []
    for p in pts:
        if keep(*p):
            cur.append(p)
        else:
            if len(cur) > 1:
                runs.append(cur)
            cur = []
    if len(cur) > 1:
        runs.append(cur)
    return runs


# ---------- buildings ----------
def underground(t):
    """Gladstone Link, tunnels and other things OSM maps below ground."""
    if t.get("location") in ("underground", "indoor"):
        return True
    if t.get("building") in ("tunnel", "underground", "no", "construction_site"):
        return True
    lay = num(t.get("layer", ""))
    if lay is not None and lay < 0 and not any(k.startswith("roof:") for k in t):   # a mapped roof means it shows
        return True
    return t.get("building:levels") == "0" and bool(t.get("building:levels:underground"))


def b_height(t):
    h = num(t.get("height", ""))
    if h:
        return round(min(h, 80), 1)
    lv = num(t.get("building:levels", ""))
    if lv:
        return round(min(lv * 3.2 + 1.5, 70), 1)
    b = t.get("building", "yes")
    if b in ("house", "detached", "semidetached_house", "terrace", "bungalow", "residential"):
        return 6.5
    if b in ("garage", "garages", "shed", "carport", "roof", "greenhouse", "hut", "kiosk", "cabin", "service"):
        return 3
    if b in ("church", "chapel", "cathedral", "college", "university"):
        return 13
    if b in ("apartments", "dormitory", "hotel", "hospital", "office", "commercial", "retail", "school"):
        return 11
    return 8


def b_kind(t):
    b = t.get("building", "")
    am = t.get("amenity", "")
    if b in ("church", "chapel", "cathedral") or am == "place_of_worship":
        return 0
    if b in ("house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "apartments"):
        return 1
    if b in ("garage", "garages", "shed", "carport", "roof", "greenhouse", "hut", "kiosk", "cabin", "service"):
        return 2
    if b in ("college", "university", "dormitory") or am in ("college", "university"):
        return 3
    return 4


COLOURS = {"white": 0xffffff, "black": 0x000000, "grey": 0x808080, "gray": 0x808080, "silver": 0xc0c0c0,
           "red": 0xa0453a, "brown": 0x7a5a44, "beige": 0xd8c9a8, "yellow": 0xd6c27a, "green": 0x6aa392,
           "blue": 0x5a7690, "darkgrey": 0x555555, "darkgray": 0x555555, "lightgrey": 0xc8c8c8,
           "lightgray": 0xc8c8c8, "cream": 0xe8dfc4, "tan": 0xc8a878, "orange": 0xc07040}
ROOF_MAT = ("slate", "tile", "concrete", "metal", "copper", "tar_paper", "glass", "stone")
WALL_MAT = {"brick": "b", "stone": "s", "sandstone": "s", "limestone": "s", "plaster": "p", "render": "p",
            "concrete": "c"}


def colour(v):
    v = (v or "").strip().lower()
    if v.startswith("#") and len(v) in (4, 7):
        v = v[1:]
        if len(v) == 3:
            v = "".join(c * 2 for c in v)
        try:
            return int(v, 16)
        except ValueError:
            return None
    return COLOURS.get(v)


def extras(t):
    ex = {}
    s = {"flat": "f", "gabled": "g", "hipped": "h"}.get(t.get("roof:shape"))
    if s:
        ex["s"] = s
    c = colour(t.get("roof:colour"))
    if c is not None:
        ex["c"] = c
    if t.get("roof:material") in ROOF_MAT:
        ex["m"] = t["roof:material"]
    w = WALL_MAT.get(t.get("building:material"))
    if w:
        ex["w"] = w
    wc = colour(t.get("building:colour"))
    if wc is not None:
        ex["wc"] = wc
    return ex


ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
                "living_street", "service", "pedestrian", "footway", "cycleway", "path", "track", "steps"]
ROAD_W = {"motorway": 4, "trunk": 4, "primary": 4, "secondary": 3.5, "tertiary": 3, "unclassified": 2.6,
          "residential": 2.6, "living_street": 2.2, "service": 1.8, "pedestrian": 1.6, "footway": .9,
          "cycleway": 1, "path": .8, "track": 1.2, "steps": .7}


def main():
    raw = {n: fetch(n) for n in QUERIES}
    x0, z0, x1, z1 = CROP_XZ
    cen = proj({"lat": 51.75223, "lon": -1.25774})   # Carfax: buildings get taller and roofs older towards it
    out = {"s": [round(x1 - x0), round(z1 - z0)], "c": [round(cen[0]), round(cen[1])],
           "x": [[round(v) for v in c] for c in CUT_XZ],
           "b": [], "t": [], "w": [], "r": [], "g": [], "d": []}
    skipped = []

    for el in raw["buildings"]["elements"]:
        t = el.get("tags", {})
        if underground(t):
            skipped.append(t.get("name") or t.get("building"))
            continue
        for outer, holes in polys(el):
            a = area(outer)
            if a < 12 or not keep(*centroid(outer)):
                continue
            nm = t.get("name") if a > 250 else None
            rec = [dm(simp_ring(outer, .5)), int(round(b_height(t) * 2)), b_kind(t), (nm or "")[:48] or 0]
            hs = [dm(simp_ring(h, .5)) for h in holes]
            ex = extras(t)
            if hs or ex:
                rec.append(hs or 0)
            if ex:
                rec.append(ex)
            out["b"].append(rec)

    seen = set()
    trees = []
    for el in raw["trees"]["elements"]:
        t = el.get("tags", {})
        if el["type"] == "node":
            trees.append(proj(el))
        elif t.get("natural") == "tree_row":
            pts, l = way_pts(el), []
            carry = 0
            for a, b in zip(pts, pts[1:]):
                d = math.hypot(b[0] - a[0], b[1] - a[1])
                s = carry
                while s < d:
                    l.append((a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d))
                    s += 7
                carry = s - d
            trees += l
        else:
            for outer, _ in polys(el):
                xs, zs = [p[0] for p in outer], [p[1] for p in outer]
                x, k, n = min(xs), 0, 0
                while x <= max(xs) and n < 4000:
                    z = min(zs) + (k % 2) * 4
                    while z <= max(zs):
                        jx = ((int(x * 7 + z * 13) % 100) / 100 - .5) * 4.8
                        jz = ((int(x * 11 + z * 5) % 100) / 100 - .5) * 4.8
                        if inside((x, z), outer):
                            trees.append((x + jx, z + jz))
                            n += 1
                        z += 8
                    x += 8
                    k += 1
    for x, z in trees:
        key = (round(x * 10), round(z * 10))
        if key in seen or not keep(x, z):
            continue
        seen.add(key)
        out["t"] += key

    for el in raw["water"]["elements"]:
        t = el.get("tags", {})
        if t.get("tunnel") in ("yes", "culvert") or t.get("location") == "underground":
            continue
        if t.get("waterway"):
            w = {"river": 14, "canal": 8, "stream": 3, "ditch": 1.5}.get(t["waterway"], 3)
            if t.get("width") and num(t["width"]):
                w = num(t["width"])
            for run in clip_line(dp(way_pts(el), .8)):
                out["r"].append([dm(run), int(round(w * 10))])
        else:
            for outer, holes in polys(el):
                if not keep(*centroid(outer)):
                    continue
                rec = [dm(simp_ring(outer, .8))]
                hs = [dm(simp_ring(h, .8)) for h in holes if area(h) > 20]
                if hs:
                    rec.append(hs)
                out["w"].append(rec)

    for el in raw["green"]["elements"]:
        t = el.get("tags", {})
        kind = 1 if t.get("leisure") == "pitch" else 0
        for outer, holes in polys(el):
            if area(outer) > 30 and keep(*centroid(outer)):
                out["g"].append([dm(simp_ring(outer, 1)), kind])

    for el in raw["roads"]["elements"]:
        t = el.get("tags", {})
        if t.get("tunnel") == "yes":
            continue
        hw = t.get("highway")
        if t.get("railway"):
            cls, w = 0, 2.2
        elif hw in ROAD_W:
            cls, w = ROAD_CLASSES.index(hw) + 1, ROAD_W[hw]
        else:
            continue
        for run in clip_line(dp(way_pts(el), 1 if cls == 0 else .8)):
            out["d"].append([dm(run), int(round(w * 10)), cls])

    out["l"] = []
    for el in raw["colleges"]["elements"]:
        nm = el.get("tags", {}).get("name")
        ps = polys(el)
        if not nm or not ps:
            continue
        outer = max((o for o, _ in ps), key=area)
        c = centroid(outer)
        if keep(*c):
            out["l"].append([round(c[0]), round(c[1]), nm])

    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "game_data.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"\nDone: game_data.json  {os.path.getsize(dst) / 1e6:.1f} MB, map {out['s']} m")
    for k in "btwrgdl":
        print(f"  {k} {len(out[k]) // (2 if k == 't' else 1)}")
    print("skipped underground:", sorted(set(map(str, skipped)))[:30])


if __name__ == "__main__":
    main()
