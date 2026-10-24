#!/usr/bin/env python3
"""Rush Taxi: turn an OpenStreetMap extract of central Kaohsiung into the game's compact city data.

Input:  an Overpass JSON file (`out geom`, with way node ids) for the bbox in META below.
Output: src/taxi/world/osm/kaohsiung.json, compact data in game metres.

Axes and scale:
- x = east, z = south (Three.js, seen from above, north up).
- Positions are scaled by SCALE, so the city is smaller than the real one; road widths, car sizes and storey
  heights are NOT scaled.

Contents:
- roads (centre lines with class, width, one-way, name)
- the road graph (junction nodes; edges = road pieces between junctions)
- water polygons (Love River, harbour, canals, ponds)
- parks and land use
- building footprints (with storeys)
- the 8 districts (行政區)
- curated landmarks at their real positions

Data © OpenStreetMap contributors, ODbL 1.0. The output is a derived database under the same licence; see
src/taxi/world/osm/LICENSE.md.

Usage: python3 scripts/osm/build_city.py <overpass.json> <out.json>
Needs shapely >= 2.
"""
import json
import math
import re
import sys
from collections import defaultdict

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping
from shapely.ops import linemerge, polygonize, unary_union

META = {
    'bbox': [22.592, 120.276, 22.642, 120.322],  # s, w, n, e
    'origin': [22.617, 120.299],
    'scale': 0.55,
}
LAT0, LON0 = META['origin']
S = META['scale']
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110540


def proj(lat, lon):
    return ((lon - LON0) * KX * S, -(lat - LAT0) * KY * S)


s_, w_, n_, e_ = META['bbox']
X0, Z1 = proj(s_, w_)
X1, Z0 = proj(n_, e_)
CLIP = box(X0, Z0, X1, Z1)

# driving classes: width (two-way, one-way) in metres; road widths are not scaled
ROAD = {
    'trunk': (20, 11), 'primary': (18, 10), 'secondary': (14, 8), 'tertiary': (11, 7),
    'unclassified': (7.5, 6), 'residential': (7.5, 6), 'living_street': (6.5, 5.5),
    'trunk_link': (8, 7), 'primary_link': (8, 7), 'secondary_link': (8, 7), 'tertiary_link': (7, 6),
}
RANK = {'trunk': 5, 'primary': 5, 'secondary': 4, 'tertiary': 3, 'unclassified': 2, 'residential': 1, 'living_street': 1}

# curated landmarks: OSM name → (id, kind); kind picks the model or board in the game
LANDMARKS = {
    '高雄八五大樓': ('tower85', 'tower85'),
    '高雄流行音樂中心-高低塔': ('musiccenter', 'musiccenter'),
    '駁二碼頭': ('pier2', 'warehouses'),
    '駁二塔': ('pier2tower', 'tower'),
    '真愛碼頭': ('lovepier', 'pier'),
    '光榮碼頭': ('gloriouspier', 'pier'),
    '新光碼頭': ('xinguangpier', 'pier'),
    '高雄車站': ('mainstation', 'station'),
    '高雄鐵路地下化展示館(舊高雄車站)': ('oldstation', 'oldstation'),
    '三塊厝車站': ('sankuaicuo', 'oldstation'),
    '鼓山車站': ('gushanstation', 'station'),
    '六合夜市': ('liuhe', 'nightmarket'),
    '南華觀光夜市': ('nanhua', 'nightmarket'),
    '光華夜市': ('guanghua', 'nightmarket'),
    '城市光廊': ('lightcorridor', 'plaza'),
    '高雄歷史博物館': ('historymuseum', 'museum'),
    '高雄文學圖書館': ('literature', 'museum'),
    '高雄市立圖書館總館': ('mainlibrary', 'library'),
    '高雄市文化中心': ('culturalcenter', 'theatre'),
    '高雄市政府四維行政中心': ('cityhall', 'cityhall'),
    '原高雄市議會': ('oldcouncil', 'museum'),
    '打狗鐵道公園': ('railpark', 'park'),
    '哈瑪星台灣鐵道館': ('railmuseum', 'museum'),
    '高雄港港史館': ('harbormuseum', 'museum'),
    '勞工博物館': ('labormuseum', 'museum'),
    '鹽埕第一公有市場': ('yanchengmarket', 'market'),
    '苓雅市場': ('lingyamarket', 'market'),
    '三鳳宮': ('sanfeng', 'temple'),
    '中鋼總部大樓': ('csc', 'tower'),
    '高雄展覽館': ('exhibition', 'exhibition'),
    '中央公園': ('centralpark', 'park'),
    '大港橋': ('greatharbor', 'bridge'),
}
# station nodes that only mark a light-rail or MRT stop: keep as landmarks only if listed above
SKIP_ROAD_NAMES = set()


def ring(geom):
    return [proj(p['lat'], p['lon']) for p in geom]


def r1(v):
    return round(v, 1)


def coords(line):
    return [[r1(x), r1(z)] for x, z in line.coords]


def poly_out(p):
    """polygon → [outer ring, hole rings...]; rings are [[x, z], ...] without the closing point"""
    out = [[[r1(x), r1(z)] for x, z in list(p.exterior.coords)[:-1]]]
    for h in p.interiors:
        out.append([[r1(x), r1(z)] for x, z in list(h.coords)[:-1]])
    return out


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [x for x in getattr(g, 'geoms', []) if isinstance(x, Polygon)]


def rel_polygon(e):
    """assemble a multipolygon relation from its member way geometries"""
    outers, inners = [], []
    for m in e.get('members', []):
        if 'geometry' not in m or m.get('type') != 'way':
            continue
        ls = LineString(ring(m['geometry']))
        (inners if m.get('role') == 'inner' else outers).append(ls)
    out = unary_union(list(polygonize(linemerge(outers)))) if outers else Polygon()
    if inners:
        out = out.difference(unary_union(list(polygonize(linemerge(inners)))))
    return out


def way_polygon(e):
    g = e.get('geometry') or []
    if len(g) < 4 or (g[0]['lat'], g[0]['lon']) != (g[-1]['lat'], g[-1]['lon']):
        return Polygon()
    p = Polygon(ring(g))
    return p if p.is_valid else p.buffer(0)


def area_of(e):
    return rel_polygon(e) if e['type'] == 'relation' else way_polygon(e)


def centre_of(e):
    if e['type'] == 'node':
        return proj(e['lat'], e['lon'])
    a = area_of(e)
    if not a.is_empty:
        c = a.representative_point()
        return (c.x, c.y)
    b = e.get('bounds')
    if b:
        return proj((b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2)
    return None


def main(src, dst):
    data = json.load(open(src))
    el = data['elements']

    # ---------------- water ----------------
    water = []
    for e in el:
        t = e.get('tags', {})
        if t.get('tunnel') or t.get('layer', '0').startswith('-'):
            continue
        if t.get('natural') == 'water' or t.get('landuse') in ('basin', 'reservoir', 'harbour') and t.get('natural') == 'water':
            water.append(area_of(e))
    water_u = unary_union([w for w in water if not w.is_empty]).intersection(CLIP)
    water_u = water_u.buffer(0).simplify(0.8)
    water_u = unary_union([p for p in polys(water_u) if p.area > 60])

    # ---------------- roads ----------------
    ways = []
    for e in el:
        t = e.get('tags', {})
        cls = t.get('highway')
        if e['type'] != 'way' or cls not in ROAD or t.get('area') == 'yes':
            continue
        if t.get('tunnel') in ('yes', 'building_passage') or t.get('layer', '0').startswith('-'):
            continue
        # lanes (巷, 弄) and unnamed side streets are left out: in the compressed map they would cut the blocks into
        # slivers; they come back as alleys between the buildings
        if cls in ('residential', 'unclassified', 'living_street') and (not t.get('name') or re.search('[巷弄]', t['name'])):
            continue
        pts = ring(e['geometry'])
        line = LineString(pts)
        if t.get('bridge') == 'yes':
            # keep river and harbour bridges (they cross water); drop road-over-road flyovers
            if not line.intersects(water_u):
                continue
        ways.append((e, cls, t, pts))

    # split ways at shared nodes: a node used by two or more kept ways, or a way's end, is a junction
    use = defaultdict(int)
    for e, *_ in ways:
        for i, nid in enumerate(e['nodes']):
            use[nid] += 1 if 0 < i < len(e['nodes']) - 1 else 2
    node_xy = {}
    for e, _, _, pts in ways:
        for nid, p in zip(e['nodes'], pts):
            node_xy[nid] = p
    pieces = []  # (a nid, b nid, pts, way info)
    for e, cls, t, pts in ways:
        ids = e['nodes']
        start = 0
        for i in range(1, len(ids)):
            if use[ids[i]] >= 2 or i == len(ids) - 1:
                seg = pts[start:i + 1]
                if len(seg) >= 2 and LineString(seg).length > 0.3:
                    pieces.append((ids[start], ids[i], seg, e, cls, t))
                start = i

    # keep only the largest connected network, after pruning short dead-end stubs (twice, for short chains)
    def components(pcs):
        adj = defaultdict(set)
        for k, (a, b, *_rest) in enumerate(pcs):
            adj[a].add(b)
            adj[b].add(a)
        seen, comps = set(), []
        for n in adj:
            if n in seen:
                continue
            stack, comp = [n], set()
            while stack:
                x = stack.pop()
                if x in comp:
                    continue
                comp.add(x)
                stack.extend(adj[x] - comp)
            seen |= comp
            comps.append(comp)
        return comps

    for _ in range(2):
        deg = defaultdict(int)
        for a, b, *_rest in pieces:
            deg[a] += 1
            deg[b] += 1
        pieces = [p for p in pieces if not ((deg[p[0]] == 1 or deg[p[1]] == 1) and LineString(p[2]).length < 22 and RANK.get(p[4], 1) <= 2)]
    comps = components(pieces)
    main_c = max(comps, key=len)
    pieces = [p for p in pieces if p[0] in main_c]

    # clip to the play area: drop pieces whose both ends are outside; cut the rest at the edge
    inner = CLIP.buffer(-6)
    kept = []
    for p in pieces:
        line = LineString(p[2])
        if not line.intersects(inner):
            continue
        if not inner.contains(line):
            cut = line.intersection(inner)
            if cut.is_empty or cut.geom_type != 'LineString' or cut.length < 4:
                continue
            p = (p[0] if inner.contains(Point(p[2][0])) else f'e{len(kept)}a', p[1] if inner.contains(Point(p[2][-1])) else f'e{len(kept)}b', list(cut.coords), *p[3:])
        kept.append(p)
    pieces = kept

    nid_index = {}
    nodes = []
    def node(nid, xy):
        if nid not in nid_index:
            nid_index[nid] = len(nodes)
            nodes.append([r1(xy[0]), r1(xy[1])])
        return nid_index[nid]

    roads = []
    for a, b, pts, e, cls, t in pieces:
        line = LineString(pts).simplify(0.6)
        oneway = t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout'
        if t.get('oneway') == '-1':
            line = LineString(list(line.coords)[::-1])
            a, b = b, a
            oneway = True
        w2, w1 = ROAD[cls]
        width = w1 if oneway else w2
        if t.get('lanes', '').isdigit():
            width = max(width * 0.6, min(int(t['lanes']) * 3.3 + 1.0, width * 1.4))
        cs = coords(line)
        ia = node(a, cs[0])
        ib = node(b, cs[-1])
        nodes[ia] = cs[0]
        nodes[ib] = cs[-1]
        r = {'a': ia, 'b': ib, 'cls': cls, 'w': round(width, 1), 'pts': cs}
        if oneway:
            r['oneway'] = 1
        if t.get('name'):
            r['name'] = t['name']
        if t.get('name:en'):
            r['en'] = t['name:en']
        if t.get('bridge') == 'yes':
            r['bridge'] = 1
        roads.append(r)

    road_area = unary_union([LineString(r['pts']).buffer(r['w'] / 2 + 2.0, cap_style='flat') for r in roads])

    # ---------------- parks and land use ----------------
    parks, landuse = [], []
    for e in el:
        t = e.get('tags', {})
        if t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'recreation_ground'):
            a = area_of(e).intersection(CLIP)
            for p in polys(a.difference(road_area).difference(water_u).simplify(0.8)):
                if p.area > 150:
                    parks.append({'name': t.get('name'), 'poly': poly_out(p)})
        elif t.get('landuse') in ('residential', 'commercial', 'retail', 'industrial', 'railway', 'port', 'harbour', 'military', 'construction') and t.get('natural') != 'water':
            a = area_of(e).intersection(CLIP).simplify(1.2)
            for p in polys(a):
                if p.area > 300:
                    landuse.append({'kind': t['landuse'], 'poly': poly_out(p)})

    # ---------------- buildings ----------------
    buildings = []
    for e in el:
        t = e.get('tags', {})
        if 'building' not in t or e['type'] == 'node' or t.get('building') in ('roof', 'construction', 'houseboat'):
            continue
        a = area_of(e).intersection(CLIP)
        if a.is_empty:
            continue
        a = a.difference(road_area).difference(water_u).simplify(0.5)
        for p in polys(a):
            if p.area < 25 or p.minimum_rotated_rectangle.length < 0:
                continue
            levels = None
            if t.get('building:levels', '').replace('.', '').isdigit():
                levels = float(t['building:levels'])
            h = None
            try:
                h = float(t.get('height', '').replace('m', '').strip()) if t.get('height') else None
            except ValueError:
                h = None
            b = {'poly': poly_out(p)[0]}
            if levels:
                b['lv'] = int(levels)
            if h:
                b['h'] = round(h, 1)
            if t.get('name'):
                b['name'] = t['name']
            kind = t.get('building')
            if kind and kind != 'yes':
                b['kind'] = kind
            buildings.append(b)

    # ---------------- districts ----------------
    districts = []
    for e in el:
        t = e.get('tags', {})
        if e['type'] == 'relation' and t.get('boundary') == 'administrative' and t.get('admin_level') == '7':
            a = rel_polygon(e).intersection(CLIP).simplify(2.0)
            ps = [p for p in polys(a) if p.area > 2000]
            if ps:
                districts.append({'zh': t.get('name'), 'en': t.get('name:en'), 'poly': [poly_out(p) for p in ps]})

    # ---------------- landmarks ----------------
    landmarks, got = [], set()
    for e in el:
        t = e.get('tags', {})
        n = t.get('name')
        if n not in LANDMARKS or LANDMARKS[n][0] in got:
            continue
        c = centre_of(e)
        if not c or not CLIP.contains(Point(c)):
            continue
        lid, kind = LANDMARKS[n]
        got.add(lid)
        lm = {'id': lid, 'kind': kind, 'zh': n.split('(')[0].replace('-高低塔', ''), 'en': t.get('name:en') or '', 'x': r1(c[0]), 'z': r1(c[1])}
        a = area_of(e) if e['type'] != 'node' else Polygon()
        if not a.is_empty and a.area > 40:
            lm['poly'] = poly_out(polys(a.intersection(CLIP).simplify(0.8))[0])[0] if polys(a.intersection(CLIP)) else None
        landmarks.append(lm)

    # ---------------- light rail (at grade) ----------------
    rail = []
    for e in el:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('railway') == 'light_rail' and not t.get('tunnel') and not t.get('layer', '0').startswith('-'):
            line = LineString(ring(e['geometry'])).intersection(CLIP)
            for ls in ([line] if line.geom_type == 'LineString' else list(getattr(line, 'geoms', []))):
                if ls.geom_type == 'LineString' and ls.length > 5:
                    rail.append(coords(ls.simplify(0.6)))

    out = {
        'about': 'Central Kaohsiung for Rush Taxi, from OpenStreetMap (data © OpenStreetMap contributors, ODbL 1.0; see LICENSE.md). '
                 'Game metres: x = east, z = south; positions scaled by `scale` from the real map, widths and heights are not.',
        'osmBase': data.get('osm3s', {}).get('timestamp_osm_base'),
        **META,
        'bounds': [r1(X0), r1(Z0), r1(X1), r1(Z1)],
        'nodes': nodes,
        'roads': roads,
        'water': [poly_out(p) for p in polys(water_u)],
        'parks': parks,
        'landuse': landuse,
        'buildings': buildings,
        'districts': districts,
        'landmarks': landmarks,
        'rail': rail,
    }
    s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    open(dst, 'w').write(s)
    print(f'nodes {len(nodes)} roads {len(roads)} water {len(out["water"])} parks {len(parks)} landuse {len(landuse)} '
          f'buildings {len(buildings)} districts {len(districts)} landmarks {len(landmarks)} rail {len(rail)} '
          f'size {len(s) / 1e6:.2f} MB bounds {out["bounds"]}')
    missing = sorted(set(v[0] for v in LANDMARKS.values()) - got)
    if missing:
        print('landmarks not found:', missing)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
