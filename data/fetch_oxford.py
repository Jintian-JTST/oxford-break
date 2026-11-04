#!/usr/bin/env python3
"""Download Oxford from OpenStreetMap (Overpass API) and write oxford_map.json.

Only needs Python 3.8+, no extra packages.
Run:  python fetch_oxford.py
Takes a few minutes. Raw downloads are cached as raw_*.json, so a re-run is instant.
Coverage: Summertown (north), Christ Church Meadow (south),
          Oxford station (west), Iffley / Cowley up to Oxford Brookes (east).
Data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

S, W, N, E = 51.7465, -1.2745, 51.7785, -1.2050      # south, west, north, east
LAT0, LON0 = (S + N) / 2, (W + E) / 2
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
}


def fetch(name):
    cache = f"raw_{name}.json"
    if os.path.exists(cache):
        print(f"[{name}] using cache")
        return json.load(open(cache, encoding="utf-8"))
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


def simp_line(l, eps):
    return dp(l, eps)


def flat(pts):
    return [v for p in pts for v in p]


def num(v):
    try:
        return float(str(v).lower().replace("m", "").replace(",", ".").split()[0])
    except Exception:
        return None


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
        return 3.2
    if b in ("church", "chapel", "cathedral", "college", "university"):
        return 13
    if b in ("apartments", "dormitory", "hotel", "hospital", "office", "commercial", "retail", "school"):
        return 11
    return 8


def b_kind(t):
    b = t.get("building", "")
    am = t.get("amenity", "")
    if b in ("church", "chapel", "cathedral") or am == "place_of_worship":
        return "c"
    if b in ("college", "university", "dormitory") or am in ("college", "university"):
        return "u"
    if b in ("house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "apartments"):
        return "r"
    if b in ("garage", "garages", "shed", "carport", "roof", "greenhouse", "hut", "kiosk", "cabin", "service"):
        return "s"
    return "o"


def sample_poly(outer, step, cap):
    xs = [p[0] for p in outer]
    zs = [p[1] for p in outer]
    pts = []
    x = min(xs)
    k = 0
    while x <= max(xs):
        z = min(zs) + (k % 2) * step / 2
        while z <= max(zs):
            jx = ((int(x * 7 + z * 13) % 100) / 100 - .5) * step * .6
            jz = ((int(x * 11 + z * 5) % 100) / 100 - .5) * step * .6
            if inside((x, z), outer):
                pts.append((round(x + jx, 1), round(z + jz, 1), 0))
            z += step
        x += step
        k += 1
    return pts[:cap]


def sample_line(l, step):
    out = []
    carry = 0
    for a, b in zip(l, l[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        t = carry
        while t < d:
            out.append((round(a[0] + (b[0] - a[0]) * t / d, 1), round(a[1] + (b[1] - a[1]) * t / d, 1), 0))
            t += step
        carry = t - d
    return out


def main():
    raw = {n: fetch(n) for n in QUERIES}
    out = {"bbox": [S, W, N, E], "origin": [LAT0, LON0],
           "size": [round((E - W) * KX), round((N - S) * KZ)],
           "buildings": [], "trees": [], "water": [], "rivers": [], "green": [], "roads": []}

    for el in raw["buildings"]["elements"]:
        t = el.get("tags", {})
        for outer, holes in polys(el):
            a = area(outer)
            if a < 12:
                continue
            o = simp_ring(outer, .5)
            b = {"p": flat(o), "h": b_height(t), "k": b_kind(t)}
            if holes:
                b["o"] = [flat(simp_ring(h, .5)) for h in holes]
            nm = t.get("name")
            if nm and a > 250:
                b["n"] = nm[:40]
            out["buildings"].append(b)

    seen = set()
    for el in raw["trees"]["elements"]:
        t = el.get("tags", {})
        if el["type"] == "node":
            p = proj(el)
            h = num(t.get("height", "")) or 0
            out["trees"].append((p[0], p[1], round(h, 1)))
        elif t.get("natural") == "tree_row":
            out["trees"] += sample_line(way_pts(el), 7)
        else:
            for outer, _ in polys(el):
                out["trees"] += sample_poly(outer, 8, 4000)
    out["trees"] = [t for t in out["trees"] if not ((t[0], t[1]) in seen or seen.add((t[0], t[1])))]

    for el in raw["water"]["elements"]:
        t = el.get("tags", {})
        if t.get("waterway"):
            w = {"river": 14, "canal": 8, "stream": 3, "ditch": 1.5}.get(t["waterway"], 3)
            if t.get("width") and num(t["width"]):
                w = num(t["width"])
            out["rivers"].append({"p": flat(simp_line(way_pts(el), .8)), "w": w})
        else:
            for outer, holes in polys(el):
                out["water"].append({"p": flat(simp_ring(outer, .8))})

    for el in raw["green"]["elements"]:
        t = el.get("tags", {})
        kind = "pitch" if t.get("leisure") == "pitch" else "grass"
        for outer, holes in polys(el):
            if area(outer) > 30:
                out["green"].append({"p": flat(simp_ring(outer, 1)), "t": kind})

    cls = {"motorway": 4, "trunk": 4, "primary": 4, "secondary": 3.5, "tertiary": 3, "unclassified": 2.6,
           "residential": 2.6, "living_street": 2.2, "service": 1.8, "pedestrian": 1.6, "footway": .9,
           "cycleway": 1, "path": .8, "track": 1.2, "steps": .7}
    for el in raw["roads"]["elements"]:
        t = el.get("tags", {})
        hw = t.get("highway")
        if t.get("railway"):
            out["roads"].append({"p": flat(simp_line(way_pts(el), 1)), "w": 2.2, "c": "rail"})
        elif hw:
            out["roads"].append({"p": flat(simp_line(way_pts(el), .8)), "w": cls.get(hw, 1.5), "c": hw})

    json.dump(out, open("oxford_map.json", "w", encoding="utf-8"), separators=(",", ":"))
    mb = os.path.getsize("oxford_map.json") / 1e6
    print(f"\nDone: oxford_map.json  {mb:.1f} MB")
    for k in ("buildings", "trees", "water", "rivers", "green", "roads"):
        print(f"  {k:10s} {len(out[k])}")
    print("Map size (m):", out["size"])


if __name__ == "__main__":
    main()
