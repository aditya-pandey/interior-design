"""Materials and quantities (BOQ, quantities only) for a house file - Revision R1 by default.

Usage: python3 tools/boq.py [house_r1.json]
  -> boq_r1.json                       per-room and per-category quantities (read by the viewer's Materials view)
  -> plans/r1/GH-18_R1_materials.xlsx  one sheet per category + a room summary (editable)
  -> plans/r1/materials.html           printable summary (viewer/scripts/html2pdf.mjs makes materials.pdf)

Everything is measured from the model, so re-running after a design change updates every number.
Quantities are design-stage take-offs with the stated wastage; the contractor confirms on site.
Categories (owner's list, Oct 2026): tiles, pipes, wires, paint, POP, granite, timber, MDF in wardrobes, lights.
Living-area floors are given both ways (A: Italian marble as the PDF schedule, B: large-format tiles) for the owner to decide.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import houselib as hl  # noqa: E402

SQFT = 10.7639
FT = 3.28084
SHEET_8X4 = 2.4384 * 1.2192          # m2, MDF / ply board
GYP_BOARD = 1.8 * 1.2                # m2, 12.5 mm gypsum board
PARTY_X = (115, 9266)                # centrelines of the E / W party walls (GH-17 / GH-19)
DOORS = ('door', 'sliding_door', 'glass_door', 'pivot_door', 'lift_door')
GLASS_KINDS = ('glass_wall', 'glass_partition', 'glass_railing', 'railing', 'screen')

# ------------------------------------------------------------------ specs (defaults; edit here, everything follows)
TILE = {   # finish key -> (description, tile w x h mm, pieces per box, wastage)
    'tile_matte_lg': ('Matte porcelain 1200 x 600 mm, warm grey (washrooms, floors + walls)', (1200, 600), 2, 0.10),
    'tile_matte_dark': ('Matte porcelain 1200 x 600 mm, charcoal', (1200, 600), 2, 0.10),
    'vitrified': ('Vitrified 600 x 600 mm, light (SF service rooms)', (600, 600), 4, 0.08),
    'deck_tile': ('Wood-look porcelain deck tile 1200 x 200 mm, R11 anti-skid (balcony, terraces)', (1200, 200), 6, 0.10),
}
OPTION_B = ('Large-format glazed vitrified 1600 x 800 mm, marble look, 9 mm', (1600, 800), 2, 0.08)
MARBLE = ('Italian marble (Botticino / Perlato type), 18 mm, polished in place', 0.15)
PIPE_SPEC = {
    ('soil', 110): 'uPVC SWR 110 mm, Type B, ring-fit', ('waste', 75): 'uPVC SWR 75 mm, Type A', ('waste', 50): 'uPVC SWR 50 mm, Type A',
    ('sewer', 150): 'uPVC SN8 150 mm, underground', ('sewer', 110): 'uPVC SN8 110 mm, underground', ('rain', 100): 'uPVC SWR 110 mm (rainwater)',
    ('cold', 25): 'CPVC SDR 11, 1" (25 mm)', ('cold', 32): 'CPVC SDR 11, 1 1/4" (32 mm)', ('hot', 25): 'CPVC SDR 11, 1" (25 mm), hot',
    ('pumped', 32): 'CPVC SDR 11, 1 1/4" (32 mm), pumped riser',
}
PAINT = {   # per m2: putty kg (2 coats), primer L (1 coat), emulsion L (2 coats); indicative, confirm with the brand's data sheet
    'interior': (0.8, 0.10, 0.155), 'ceiling': (0.0, 0.10, 0.155), 'exterior': (0.0, 0.12, 0.20),
}
CABLE_SUBMAIN = {'SM-1': '4C x 16 sq mm Cu armoured (indicative)', 'SM-2': '4C x 10 sq mm Cu armoured (indicative)',
                 'SM-3': '4C x 6 sq mm Cu armoured (indicative)', 'SM-4': '2C x 6 sq mm Cu (inverter feed)'}
MDF_TYPES = {'wardrobe': 'Wardrobe', 'storage_tall': 'Tall storage', 'tall_unit': 'Kitchen tall unit', 'crockery_unit': 'Crockery unit',
             'storage_bench': 'Storage bench', 'wall_cabinet': 'Wall cabinet', 'counter': 'Kitchen / pantry base unit', 'tv_unit': 'TV unit',
             'shoe_console': 'Shoe console', 'dresser': 'Dresser', 'dressing_table': 'Dressing table', 'study_desk': 'Study desk', 'desk': 'Desk'}
WET_JOINERY = ('vanity', 'utility_counter')          # always BWP ply; plus the base unit that holds the kitchen sink


FINISH = {'marble_beige': 'Italian marble', 'tile_matte_lg': 'Porcelain 1200x600', 'vitrified': 'Vitrified 600x600', 'deck_tile': 'Deck tile',
          'granite_flamed': 'Flamed granite', 'pebbles': 'Pebbles'}
LIGHT_NAME = {'downlights': 'downlights', 'light': 'light points', 'pd': 'pendant', 'fan': 'fan', 'ml': 'mirror light', 'wl': 'wall light',
              'gl': 'garden light', 'ef': 'exhaust', 'sd': 'smoke det.', 'hd': 'heat det.'}


def lights_text(d):
    return ', '.join('%d %s' % (n, LIGHT_NAME.get(k, k)) for k, n in d.items())


def r(x, n=1):
    return round(x, n)


def sqft(m2):
    return round(m2 * SQFT)


# ------------------------------------------------------------------ geometry
def seg_dist(p, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    L2 = (bx - ax) ** 2 + (by - ay) ** 2
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / L2))
    return math.hypot(p[0] - ax - t * (bx - ax), p[1] - ay - t * (by - ay))


def wall_excess(w, p):
    """distance from p to the wall body's surface (<= 0 inside the wall), None if beyond its ends"""
    if 'arc' in w:
        a = w['arc']
        ang = math.degrees(math.atan2(p[1] - a['c'][1], p[0] - a['c'][0]))
        lo, hi = min(a['from'], a['to']), max(a['from'], a['to'])
        if not any(lo - 0.5 <= ang + k <= hi + 0.5 for k in (-360, 0, 360)):
            return None
        return abs(math.hypot(p[0] - a['c'][0], p[1] - a['c'][1]) - a['r']) - w['t'] / 2
    return seg_dist(p, w['a'], w['b']) - w['t'] / 2


def wall_at(fl, p, tol=40):
    best = None
    for w in fl['walls']:
        e = wall_excess(w, p)
        if e is not None and e <= tol and (best is None or e < best[0]):
            best = (e, w)
    return best[1] if best else None


def opening_centre(w, o):
    if 'arc' in w:
        a = w['arc']
        sign = 1 if a['to'] > a['from'] else -1
        ang = math.radians(a['from']) + sign * (o['offset'] + o['width'] / 2) / a['r']
        return [a['c'][0] + a['r'] * math.cos(ang), a['c'][1] + a['r'] * math.sin(ang)]
    (ax, ay), (bx, by) = w['a'], w['b']
    L = math.hypot(bx - ax, by - ay)
    t = (o['offset'] + o['width'] / 2) / L
    return [ax + (bx - ax) * t, ay + (by - ay) * t]


def poly_dist(p, poly):
    return min(seg_dist(p, a, b) for a, b in zip(poly, poly[1:] + poly[:1]))


def polyline_len(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def bends(pts):
    n = 0
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        u = [b[i] - a[i] for i in range(len(a))]
        v = [c[i] - b[i] for i in range(len(a))]
        lu, lv = math.sqrt(sum(x * x for x in u)), math.sqrt(sum(x * x for x in v))
        if lu > 1 and lv > 1 and sum(x * y for x, y in zip(u, v)) / (lu * lv) < math.cos(math.radians(10)):
            n += 1
    return n


# ------------------------------------------------------------------ rooms: walls, openings, finishes
def room_edges(fl, room, step=50.0):
    """length of the room outline per kind: opaque wall / glass / open (no wall)"""
    out = {'opaque': 0.0, 'glass': 0.0, 'open': 0.0}
    poly = room['polygon']
    for a, b in zip(poly, poly[1:] + poly[:1]):
        L = math.dist(a, b)
        n = max(1, int(L / step))
        for i in range(n):
            t = (i + 0.5) / n
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            w = wall_at(fl, p)
            k = 'open' if w is None else 'glass' if w['kind'] in GLASS_KINDS else 'opaque'
            out[k] += L / n
    return out


def room_openings(fl, room):
    """openings in the room's boundary walls: [(wall, opening)]"""
    out = []
    for w in fl['walls']:
        for o in w.get('openings', []):
            c = opening_centre(w, o)
            if poly_dist(c, room['polygon']) <= w['t'] / 2 + 60:
                out.append((w, o))
    return out


def feature_lengths(fl, room):
    """walnut fluted feature walls on this room's outline (part inside the room's extent)"""
    tot = 0.0
    for fw in room.get('feature_walls', []):
        w = next(x for x in fl['walls'] if x['id'] == fw['wall'])
        xs, ys = [p[0] for p in room['polygon']], [p[1] for p in room['polygon']]
        if abs(w['a'][0] - w['b'][0]) < 1:       # vertical wall: range in y
            lo, hi = max(fw['from'], min(ys)), min(fw['to'], max(ys))
        else:
            lo, hi = max(fw['from'], min(xs)), min(fw['to'], max(xs))
        tot += max(0.0, hi - lo)
    return tot


def ceiling_height(room):
    c = room.get('ceiling') or {}
    if isinstance(c.get('height'), (int, float)):
        return c['height']
    return 2400 if 'stair' in str(c.get('type', '')) else 2750


def is_wet(room):
    return any(k in room['name'].lower() for k in ('toilet', 'washroom'))


# ------------------------------------------------------------------ main take-off
def take_off(h):
    floors = {f['id']: f for f in h['floors']}
    fur = [(fl['id'], f) for fl in h['floors'] for f in fl['furniture'] if f.get('variant') != 'art']
    rooms_out, rows = {}, {k: [] for k in ('tiles', 'pipes', 'wires', 'paint', 'pop', 'granite', 'timber', 'mdf', 'lights')}
    tot = {}

    def add(k, v):
        tot[k] = tot.get(k, 0) + v

    # ---------------- rooms
    for fid, fl in floors.items():
        for rm in fl['rooms']:
            if rm.get('kind') in ('shaft', 'lift'):
                continue
            area = hl.poly_area(rm['polygon']) / 1e6
            out = rm.get('kind') == 'outdoor'
            edges = room_edges(fl, rm)
            ops = room_openings(fl, rm)
            H = ceiling_height(rm)
            op_area = sum(o['width'] * min(o['height'], H - o.get('sill', 0)) for w, o in ops if w['kind'] not in GLASS_KINDS) / 1e6
            door_w = sum(o['width'] for w, o in ops if o['type'] in DOORS) / 1000
            wall_area = 0 if out else max(0.0, edges['opaque'] / 1000 * H / 1000 - op_area)
            fin_floor, fin_wall = rm.get('floor'), str(rm.get('wall') or '')
            ceil = rm.get('ceiling') or {}
            R = rooms_out[rm['id']] = dict(name=rm['name'], floor=fid, area_m2=r(area, 2), finish_floor=fin_floor, wall_finish=fin_wall,
                                           perimeter_m=r((edges['opaque'] + edges['glass']) / 1000, 2), height_mm=H)
            # floors
            if fin_floor == 'marble_beige':
                skirting = max(0.0, edges['opaque'] / 1000 - door_w)
                R['floor_optA'] = dict(material='Italian marble', area_m2=r(area * (1 + MARBLE[1]), 2), net_m2=r(area, 2))
                tw, th = OPTION_B[1]
                boxes = math.ceil(area * (1 + OPTION_B[3]) / (tw * th / 1e6 * OPTION_B[2]))
                R['floor_optB'] = dict(material='Vitrified 1600 x 800', net_m2=r(area, 2), boxes=boxes)
                R['skirting_m'] = r(skirting, 1)
                add('marble_m2', area); add('skirting_living_m', skirting)
            elif fin_floor in TILE:
                desc, (tw, th), pcs, wst = TILE[fin_floor]
                boxes = math.ceil(area * (1 + wst) / (tw * th / 1e6 * pcs))
                R['floor_tile'] = dict(material=desc, net_m2=r(area, 2), boxes=boxes)
                rows['tiles'].append([fid, rm['name'], 'Floor', desc, r(area, 2), sqft(area), int(wst * 100), boxes])
                add('tile_floor_m2:' + fin_floor, area)
                if not is_wet(rm) and not out and 'tile' not in fin_wall:
                    sk = max(0.0, edges['opaque'] / 1000 - door_w)
                    R['skirting_m'] = r(sk, 1)
                    add('skirting_tile_m', sk)
            elif fin_floor in ('granite_flamed',):
                R['floor_granite_m2'] = r(area, 2)
                rows['granite'].append([fid, rm['name'], 'Floor (flamed granite)', r(area, 2), sqft(area), 10, ''])
                add('granite_floor_m2', area)
            # walls
            fl_len = feature_lengths(fl, rm)
            feature = fl_len / 1000 * H / 1000
            if out:
                pass
            elif 'tile' in fin_wall:
                desc, (tw, th), pcs, wst = TILE['tile_matte_lg']
                boxes = math.ceil(wall_area * (1 + wst) / (tw * th / 1e6 * pcs))
                R['wall_tile'] = dict(net_m2=r(wall_area, 2), boxes=boxes)
                rows['tiles'].append([fid, rm['name'], 'Walls (full height to the false ceiling)', desc, r(wall_area, 2), sqft(wall_area), int(wst * 100), boxes])
                add('tile_wall_m2', wall_area)
                if is_wet(rm):
                    wp = area + edges['opaque'] / 1000 * 0.3
                    R['waterproofing_m2'] = r(wp, 2)
                    add('waterproofing_m2', wp)
            elif 'walnut' in fin_wall:
                clad = max(0.0, wall_area - feature)
                R['wall_cladding_m2'] = r(clad, 2)
                rows['timber'].append([fid, rm['name'], 'Walnut veneer wall cladding (PDF schedule)', 'm2', r(clad, 2), sqft(clad), ''])
                add('cladding_m2', clad)
            else:
                splash = 0.0
                if rm['id'] == 'GF-KIT':
                    splash = sum(f['size'][0] for i, f in fur if f['room'] == 'GF-KIT' and f['type'] == 'counter') / 1000 * 0.6
                    R['backsplash_m2'] = r(splash, 2)
                    rows['granite'].append([fid, rm['name'], 'Backsplash 600 mm (white marble as designed; or granite to match)', r(splash, 2), sqft(splash), 10, ''])
                    add('backsplash_m2', splash)
                paint = max(0.0, wall_area - feature - splash)
                R['paint_walls_m2'] = r(paint, 2)
                if paint > 0:
                    rows['paint'].append([fid, rm['name'], 'Interior walls', r(paint, 2), sqft(paint)] + [r(paint * x, 1) for x in PAINT['interior']])
                    add('paint_int_m2', paint)
            if feature > 0:
                R['fluted_m2'] = r(feature, 2)
                rows['timber'].append([fid, rm['name'], 'Fluted walnut feature wall (veneered MDF flutes on ply)', 'm2', r(feature, 2), sqft(feature), ''])
                add('fluted_m2', feature)
            # ceilings
            ctype = str(ceil.get('type', ''))
            if ctype.startswith('POP'):
                cove = (edges['opaque'] + edges['glass']) / 1000 if ceil.get('cove') else 0.0
                xs, ys = [p[0] for p in rm['polygon']], [p[1] for p in rm['polygon']]
                nx, ny = max(1, int((max(xs) - min(xs)) / 1400)), max(1, int((max(ys) - min(ys)) / 1400))
                grid = sum(1 for i in range(nx) for j in range(ny) if hl.point_in_poly(
                    (min(xs) + (i + 0.5) * (max(xs) - min(xs)) / nx, min(ys) + (j + 0.5) * (max(ys) - min(ys)) / ny), rm['polygon']))
                R.setdefault('lights', {})['downlights'] = grid
                add('downlights', grid)
                boards = math.ceil(area * 1.1 / GYP_BOARD)
                R['pop'] = dict(area_m2=r(area, 2), cove_m=r(cove, 1), boards=boards)
                rows['pop'].append([fid, rm['name'], ctype, H, r(area, 2), sqft(area), boards, r((edges['opaque'] + edges['glass']) / 1000, 1), r(cove, 1) or ''])
                rows['paint'].append([fid, rm['name'], 'Ceiling (on POP)', r(area, 2), sqft(area)] + [r(area * x, 1) or '' for x in PAINT['ceiling']])
                add('pop_m2', area); add('cove_m', cove); add('paint_ceil_m2', area); add('pop_perim_m', (edges['opaque'] + edges['glass']) / 1000)
                if 'veneer' in ctype:
                    rows['timber'].append([fid, rm['name'], 'Walnut veneer ceiling accent (with the POP)', 'm2', r(area * 0.3, 2), sqft(area * 0.3), 'about 30% of the ceiling'])
    # ---------------- outdoor floors (areas)
    for fid, fl in floors.items():
        for a in fl.get('outdoor', []):
            ar = hl.poly_area(a['polygon']) / 1e6
            s = a.get('surface')
            if s == 'granite_flamed':
                rows['granite'].append([fid, a['name'], 'Paving (flamed granite)', r(ar, 2), sqft(ar), 10, ''])
                add('granite_floor_m2', ar)
            elif s in TILE:
                desc, (tw, th), pcs, wst = TILE[s]
                boxes = math.ceil(ar * (1 + wst) / (tw * th / 1e6 * pcs))
                rows['tiles'].append([fid, a['name'], 'Floor', desc, r(ar, 2), sqft(ar), int(wst * 100), boxes])
                add('tile_floor_m2:' + s, ar)
            elif s == 'cobble':
                rows['granite'].append([fid, a['name'], 'Cobble setts (granite), ramp / court', r(ar, 2), sqft(ar), 10, ''])
                add('cobble_m2', ar)

    # ---------------- exterior paint
    ext = 0.0
    for fid, fl in floors.items():
        storey = 3750 if fid == 'GF' else 3300
        for w in fl['walls']:
            k = w['kind']
            if k not in ('external', 'parapet', 'boundary'):
                continue
            L = hl.wall_length(w)
            party = 'a' in w and abs(w['a'][0] - w['b'][0]) < 1 and any(abs(w['a'][0] - x) < 2 for x in PARTY_X)
            if k == 'external':
                faces, hh = (0 if party else 1), storey
            elif k == 'parapet':
                faces, hh = (1 if party else 2), w.get('h', 1050)
            else:
                faces, hh = (2 if ('a' in w and abs(w['a'][1] - w['b'][1]) < 1 and w['a'][1] > 20000) else 1), w.get('h', 1500)
            if faces == 0:
                continue
            ops = sum(o['width'] * o['height'] for o in w.get('openings', [])) if k == 'external' else 0
            a = max(0.0, (L * hh * faces - ops) / 1e6)
            ext += a
    rows['paint'].append(['ALL', 'Exterior façade, parapets, boundary walls', 'Exterior (party walls excluded)', r(ext, 2), sqft(ext)] + [r(ext * x, 1) or '' for x in PAINT['exterior']])
    add('paint_ext_m2', ext)

    # ---------------- stair (granite or marble to match the lobby)
    st = h['stair']
    storeys = len(st['floors']) - 1
    risers = sum(f['risers'] for f in st['flights']) * storeys
    treads = sum(f['treads'] for f in st['flights']) * storeys
    W = st['flight_width']
    tread_m2 = treads * W * (st['going'] + 25) / 1e6
    riser_m2 = risers * W * st['riser'] / 1e6
    land = hl.poly_area(st['landing']['polygon']) / 1e6 * storeys
    rows['granite'].append(['GF-SF', 'Stair', '%d treads (with 25 mm nosing), 30 mm' % treads, r(tread_m2, 2), sqft(tread_m2), 10, 'or Italian marble to match the lobby'])
    rows['granite'].append(['GF-SF', 'Stair', '%d risers, 18 mm' % risers, r(riser_m2, 2), sqft(riser_m2), 10, ''])
    rows['granite'].append(['GF-SF', 'Stair', '%d mid-landings' % storeys, r(land, 2), sqft(land), 10, ''])
    add('granite_stair_m2', tread_m2 + riser_m2 + land)

    # ---------------- counters, sills, thresholds
    sink_bases = set()
    for fid, f in fur:
        if f['type'] == 'sink':
            for fid2, c in fur:
                if fid2 == fid and c['type'] == 'counter' and hl.point_in_poly(f['pos'], hl.furniture_corners(c)):
                    sink_bases.add(c['id'])
    for fid, f in fur:
        if f['type'] in ('counter', 'utility_counter', 'ironing_station'):
            w, d = f['size'][0] / 1000, f['size'][1] / 1000
            cut = []
            if f['id'] in sink_bases or f['type'] == 'utility_counter':
                cut.append('sink cut-out')
            if any(g['type'] == 'hob' and hl.point_in_poly(g['pos'], hl.furniture_corners(f)) for fid2, g in fur if fid2 == fid):
                cut.append('hob cut-out')
            rows['granite'].append([fid, f['id'] + ' ' + f['room'], 'Counter top 20 mm, black granite, front edge moulded %.2f m%s' % (w, ('; ' + ', '.join(cut)) if cut else ''),
                                    r(w * d, 2), sqft(w * d), 10, ''])
            add('granite_counter_m2', w * d)
    for fid, fl in floors.items():
        for w in fl['walls']:
            for o in w.get('openings', []):
                if o['type'] == 'window':
                    a = o['width'] * (w['t'] + 50) / 1e6
                    rows['granite'].append([fid, o['id'], 'Window sill %d x %d mm, 18 mm' % (o['width'], w['t'] + 50), r(a, 3), r(a * SQFT, 1), 10, ''])
                    add('granite_sill_m2', a); add('sills', 1)
                elif o['type'] in ('door', 'sliding_door', 'glass_door', 'pivot_door'):
                    a = o['width'] * w['t'] / 1e6
                    rows['granite'].append([fid, o['id'], 'Door threshold %d x %d mm, 18 mm' % (o['width'], w['t']), r(a, 3), r(a * SQFT, 1), 10, ''])
                    add('granite_threshold_m2', a); add('thresholds', 1)

    # ---------------- timber: doors, pergola, handrail, mandir / tulsi panels
    for fid, fl in floors.items():
        for w in fl['walls']:
            for o in w.get('openings', []):
                if o['type'] == 'door':
                    frame_m = (2 * o['height'] + o['width']) / 1000
                    cft = frame_m * 0.125 * 0.060 * 35.315
                    leaves = o.get('leaves', 2 if o['width'] >= 1400 else 1)
                    main = o['width'] >= 1400
                    rows['timber'].append([fid, o['id'], ('Main door: ' if main else 'Door: ') + 'frame 125 x 60 mm %s, %d shutter(s) %d x %d x %d mm %s' % (
                        'teak' if main else 'sal / hardwood', leaves, o['width'] / leaves, o['height'], 40 if main else 35,
                        'solid teak panelled' if main else 'flush, veneer both faces'), 'frame cft', r(cft, 2), '', '%.2f m frame' % frame_m])
                    add('door_frame_cft', cft); add('doors', 1); add('shutters', leaves)
    pg = h['floors'][0].get('pergola')
    if pg:
        posts = len(pg['posts'])
        ph = (pg['z_top'] - 300) / 1000
        beam = math.dist(pg['beam']['a'], pg['beam']['b']) / 1000
        ledger = math.dist(pg['ledger']['a'], pg['ledger']['b']) / 1000
        rf = pg['rafters']
        n_raf = int(beam * 1000 / rf['spacing']) + 1
        raf_len = (rf['to_y'] - rf['from_y']) / 1000
        cft = (posts * ph * 0.15 * 0.15 + beam * 0.1 * 0.25 + ledger * 0.1 * 0.2 + n_raf * raf_len * rf['size'][0] / 1000 * rf['size'][1] / 1000) * 35.315
        rows['timber'].append(['GF', 'Pergola', '%d posts 150x150x%.1f m, beam 100x250x%.1f m, ledger 100x200x%.1f m, %d rafters 60x200x%.2f m' % (
            posts, ph, beam, ledger, n_raf, raf_len), 'cft', r(cft, 1), '', 'hardwood, walnut stain, outdoor PU'])
        add('pergola_cft', cft)
    flights = len(st['flights']) * storeys
    rail = flights * math.hypot(st['flights'][0]['treads'] * st['going'], st['flights'][0]['risers'] * st['riser']) / 1000 + storeys * 1.3
    rows['timber'].append(['GF-SF', 'Stair handrail', 'Walnut handrail 60 x 50 mm on the spine', 'm', r(rail, 1), r(rail * FT, 1), ''])
    add('handrail_m', rail)
    for fid, f in fur:
        if f['type'] == 'fluted_panel':
            a = f['size'][0] * f['size'][2] / 1e6
            rows['timber'].append([fid, f['id'] + ' (tulsi backdrop)', 'Fluted walnut cladding, exterior grade, PU', 'm2', r(a, 2), sqft(a), ''])
            add('fluted_m2', a)
        if f['type'] == 'mandir_open':
            rows['timber'].append([fid, f['id'] + ' (mandir)', 'Fluted cabinet %.1f x 0.47 x %.2f m (veneered MDF) + marble back panel %.1f x %.1f m (stone)' % (
                f['size'][0] / 1000, f['size'][1] / 1000, f['size'][0] / 1000, f['size'][2] / 1000), 'nos', 1, '', ''])

    # ---------------- MDF (wardrobes + storage) and BWP ply (wet joinery)
    for fid, f in fur:
        t = f['type']
        if t not in MDF_TYPES and t not in WET_JOINERY:
            continue
        w, d, hh = (v / 1000 for v in f['size'])
        if t in ('counter', 'utility_counter', 'vanity'):
            hh = 0.85 if t != 'vanity' else 0.45
        tall = hh >= 1.8
        verticals = max(0, math.ceil(w / 0.9) - 1)
        shelves = 4 if tall else 1
        carcass = 2 * d * hh + 2 * w * d + verticals * d * hh + shelves * w * d
        back = w * hh
        drawers_only = t in ('study_desk', 'desk', 'dressing_table', 'dresser')
        n_sh = 0 if drawers_only else max(1, math.ceil(w / (0.6 if t == 'wardrobe' else 0.55)))
        shutters = w * (0.2 if drawers_only else hh)          # drawer fronts only on desks / dressers
        hinges = n_sh * (4 if hh > 2.0 else 3 if hh > 1.2 else 2)
        edge = (n_sh * 2 * (w / n_sh + hh) if n_sh else 2 * (w + 0.2)) + shelves * w + 2 * (hh + w) + verticals * hh   # shutter / shelf / carcass edges
        outdoor_room = any(rr['id'] == f['room'] and rr.get('kind') == 'outdoor' for fl in h['floors'] for rr in fl['rooms'])
        wet = t in WET_JOINERY or f['id'] in sink_bases or outdoor_room
        board = 'BWP ply 19 mm (wet)' if wet else 'MDF 18 mm'
        sheets18 = math.ceil((carcass + shutters) * 1.15 / SHEET_8X4)
        sheets8 = math.ceil(back * 1.15 / SHEET_8X4)
        rows['mdf'].append([fid, f['id'], MDF_TYPES.get(t, t.replace('_', ' ').title()), f['room'], '%d x %d x %d' % tuple(f['size']), board,
                            r(carcass, 2), r(shutters, 2), r(back, 2), sheets18, sheets8, n_sh, hinges, r(edge, 1), r(shutters * 1.1, 2)])
        key = 'ply' if wet else ('mdf_wardrobe' if t == 'wardrobe' else 'mdf_other')
        add(key + '_sheets18', sheets18); add(key + '_sheets8', sheets8); add(key + '_hinges', hinges)

    # ---------------- lights (from the electrical points + POP coves)
    el = h.get('services', {}).get('electrical', {})
    pts = el.get('points', [])
    LIGHTS = [('light', 'Light points (switched groups, per the electrical sheet); wet rooms IP44'), ('pd', 'Statement pendant (dining)'),
              ('ml', 'Mirror light 600 mm, IP44'), ('wl', 'Wall / niche light (IP65 outdoors)'), ('gl', 'Garden bollard, 7 W, IP65'),
              ('fan', 'Ceiling fan, BLDC 1200 mm'), ('ef', 'Exhaust fan 200 mm'), ('sd', 'Smoke detector'), ('hd', 'Heat detector (kitchen)')]
    for kind, desc in LIGHTS:
        by_room = {}
        for p in pts:
            if p['kind'] == kind:
                by_room[p['room']] = by_room.get(p['room'], 0) + 1
                rooms_out.setdefault(p['room'], {}).setdefault('lights', {})
                rooms_out[p['room']]['lights'][kind] = rooms_out[p['room']]['lights'].get(kind, 0) + 1
        n = sum(by_room.values())
        if n:
            rows['lights'].append([desc, n, 'nos', ', '.join('%s %d' % (k, v) for k, v in sorted(by_room.items()))])
            add('light:' + kind, n)
    ucl = 0.0
    for p in [p for p in pts if p['kind'] == 'ucl']:
        near = min((f for fid, f in fur if fid == p['floor'] and f['type'] in ('wall_cabinet', 'crockery_unit', 'counter')),
                   key=lambda f: math.dist(f['pos'], p['at'][:2]))
        ucl += near['size'][0] / 1000
    rows['lights'].insert(0, ['Downlight fixtures, 10 W slim COB 3000 K, cut-out 75 mm, on the ~1.4 m grid shown in the 3D (each light point above switches a group)',
                              tot.get('downlights', 0), 'nos', ', '.join('%s %d' % (k, v['lights']['downlights']) for k, v in rooms_out.items() if v.get('lights', {}).get('downlights'))])
    rows['lights'].append(['LED strip under wall cabinets, 10 W/m 3000 K, aluminium profile', r(ucl, 1), 'm', '%d runs' % sum(1 for p in pts if p['kind'] == 'ucl')])
    rows['lights'].append(['Cove LED strip, 12 W/m 2700 K, in POP coves', r(tot.get('cove_m', 0), 1), 'm', '+ %d drivers (1 per 5 m)' % math.ceil(tot.get('cove_m', 0) / 5)])
    add('ucl_m', ucl)

    # ---------------- pipes (plumbing services + AC copper)
    pl = h.get('services', {}).get('plumbing', {})
    acc = {}
    for run in pl.get('runs', []):
        key = (run['kind'], run['dia'])
        a = acc.setdefault(key, [0.0, 0, 0])
        a[0] += polyline_len(run['pts']) / 1000
        a[1] += bends(run['pts'])
        a[2] += 1
    for s in pl.get('stacks', []):
        a = acc.setdefault((s['kind'], s['dia']), [0.0, 0, 0])
        a[0] += (s['z'][1] - s['z'][0]) / 1000
        a[2] += 1
    for (kind, dia), (L, nb, n) in sorted(acc.items()):
        spec = PIPE_SPEC.get((kind, dia), '%s %d mm' % (kind, dia))
        rows['pipes'].append([kind, dia, spec, r(L, 1), r(L * FT, 1), math.ceil(L * 1.1 / 3), nb, n])
        add('pipe_m:%s/%d' % (kind, dia), L)
    for c in pl.get('chambers', []):
        rows['pipes'].append(['chamber', '', '%s %s: %s, %dx%d mm, %d deep' % (c['id'], c['type'].replace('_', ' '), c.get('area', ''), c['size'][0], c['size'][1], c['depth']), '', '', '', '', 1])
    for rr in el.get('refrigerant', []):
        ac = next(p for p in pts if p['id'] == rr['ac'])
        big = ac.get('tr', 1.5) >= 2
        L = rr['length'] / 1000 * 1.1
        rows['pipes'].append(['refrigerant', '', 'Copper pair 1/4" + %s" insulated, %s AC %s -> %s (+ 20 mm PVC drain, 4C x 1.5 sq mm interconnect)' % (
            '5/8' if big else '1/2', '2 TR' if big else '1.5 TR', ac['room'], rr['odu']), r(L, 1), r(L * FT, 1), '', '', 1])
        add('copper_m', L)

    # ---------------- wires (circuit routes, sub-mains, data)
    cab = {}
    for rt in el.get('routes', []):
        c = next(x for x in el['circuits'] if x['id'] == rt['circuit'])
        L = (polyline_len(rt['trunk']) + sum(polyline_len(d) for d in rt['drops'])) / 1000
        size = c['cable']
        if c['cls'] == 'data':
            key = 'Cat-6 U/UTP (data, from the rack)'
            cores = 1
        elif 'maker' in size or 'vendor' in size:
            key = 'Per maker / vendor (lift, pumps, spare): use 4 sq mm until confirmed'
            cores = 3
        else:
            key = 'FRLS Cu %s' % size
            cores = 3
        a = cab.setdefault(key, [0.0, 0.0, 0])
        a[0] += L
        a[1] += L * cores * 1.1
        a[2] += 1
    for key, (L, wire, n) in sorted(cab.items()):
        conduit = '25 mm' if any(s in key for s in ('4 sq', '6 sq', 'maker')) else '20 mm'
        coils = math.ceil(wire / 90) if 'Cat' not in key else math.ceil(wire / 305)
        rows['wires'].append([key, n, r(L, 1), r(wire, 1), coils, '%s PVC conduit %.0f m' % (conduit, L * 1.1),
                              '3 cores (phase, neutral, earth) + 10%' if 'Cat' not in key else '1 run per point + 10% (305 m box)'])
        add('wire_m:' + key, wire); add('conduit_m', L * 1.1)
    for sm in el.get('submains', []):
        L = polyline_len(sm['pts']) / 1000 * 1.1
        rows['wires'].append(['%s %s -> %s: %s' % (sm['id'], sm['frm'], sm['to'], CABLE_SUBMAIN.get(sm['id'], '')), 1, r(L / 1.1, 1), r(L, 1), '', '32 mm conduit / buried sleeve', sm['note']])
    acc_pts = {}
    for p in pts:
        acc_pts[p['kind']] = acc_pts.get(p['kind'], 0) + 1
    dbs = {}
    for c in el.get('circuits', []):
        dbs[c['db']] = dbs.get(c['db'], 0) + 1
    rows['wires'].append(['Accessories: 6 A sockets %d, 16 A %d, USB %d, TV %d, data %d, IP65 %d, switchboards %d, bedside / 2-way %d' % (
        acc_pts.get('s6', 0) + acc_pts.get('s6c', 0) + acc_pts.get('ups', 0) + acc_pts.get('ch', 0), acc_pts.get('s16', 0), acc_pts.get('usb', 0),
        acc_pts.get('tv', 0), acc_pts.get('data', 0), acc_pts.get('ip65', 0), acc_pts.get('sb', 0), acc_pts.get('sb2w', 0)), '', '', '', '', 'modular', ''])
    rows['wires'].append(['Distribution boards: ' + ', '.join('%s %d circuits (%d ways with 20%% spare)' % (k, v, math.ceil(v * 1.2)) for k, v in sorted(dbs.items())),
                          '', '', '', '', 'DB-1 TPN', 'RCDs per the circuit list in services_report.txt'])
    return rooms_out, rows, tot


# ------------------------------------------------------------------ outputs
HEAD = {
    'tiles': ['Floor', 'Room / area', 'Surface', 'Material', 'Net m2', 'Net sq ft', 'Wastage %', 'Boxes'],
    'pipes': ['Kind', 'Dia mm', 'Specification', 'Length m', 'Length ft', '3 m lengths (+10%)', 'Bends (approx.)', 'Runs / items'],
    'wires': ['Cable', 'Circuits', 'Route m', 'Cable m (all cores + 10%)', 'Coils (90 m) / boxes', 'Conduit', 'Note'],
    'paint': ['Floor', 'Room / area', 'Surface', 'Area m2', 'Area sq ft', 'Putty kg (2 coats)', 'Primer L (1 coat)', 'Emulsion L (2 coats)'],
    'pop': ['Floor', 'Room', 'Ceiling', 'Height mm', 'Area m2', 'Area sq ft', 'Gypsum boards 1800 x 1200', 'Perimeter channel m', 'Cove m'],
    'granite': ['Floor', 'Item', 'Description', 'Net m2', 'Net sq ft', 'Wastage %', 'Note'],
    'timber': ['Floor', 'Item', 'Description', 'Unit', 'Qty', 'sq ft', 'Note'],
    'mdf': ['Floor', 'Id', 'Unit', 'Room', 'Size w x d x h mm', 'Board', 'Carcass m2', 'Shutters m2', 'Back 8 mm m2', 'Sheets 18/19 mm (8x4, +15%)',
            'Sheets 8 mm', 'Shutters (desks / dressers: drawers)', 'Soft-close hinges', 'Edge band m', 'Laminate m2 (shutter faces)'],
    'lights': ['Fitting', 'Qty', 'Unit', 'Where'],
}
TITLE = {'tiles': '1. Tiles', 'pipes': '2. Pipes', 'wires': '3. Wires', 'paint': '4. Paint', 'pop': '5. POP (false ceiling)', 'granite': '6. Granite & stone',
         'timber': '7. Timber & veneer', 'mdf': '8. MDF board (wardrobes and storage)', 'lights': '9. Lights & fittings'}


def summary_lines(rooms, tot):
    g = lambda k: tot.get(k, 0)  # noqa: E731
    tile_floor = sum(v for k, v in tot.items() if k.startswith('tile_floor_m2'))
    paint_l = g('paint_int_m2') * PAINT['interior'][2] + g('paint_ceil_m2') * PAINT['ceiling'][2]
    living = [v for v in rooms.values() if 'floor_optA' in v]
    return [
        ('1. Tiles', 'Wet-room walls %s sq ft; tiled floors %s sq ft (washrooms, servant room, store, balcony, terraces); %s sq ft waterproofing'
         % (sqft(g('tile_wall_m2')), sqft(tile_floor), sqft(g('waterproofing_m2')))),
        ('   Living floors', 'Option A Italian marble %s sq ft net (+15%% wastage = %s sq ft) | Option B 1600 x 800 vitrified %d boxes | skirting %.0f rft'
         % (sqft(g('marble_m2')), sqft(g('marble_m2') * 1.15), sum(v['floor_optB']['boxes'] for v in living), g('skirting_living_m') * FT)),
        ('2. Pipes', 'Drainage %.0f m, water %.0f m, rainwater %.0f m (+ AC copper %.0f m)' % (
            sum(v for k, v in tot.items() if k.startswith('pipe_m:') and k.split(':')[1].split('/')[0] in ('soil', 'waste', 'sewer')),
            sum(v for k, v in tot.items() if k.startswith('pipe_m:') and k.split(':')[1].split('/')[0] in ('cold', 'hot', 'pumped')),
            sum(v for k, v in tot.items() if k.startswith('pipe_m:rain')), g('copper_m'))),
        ('3. Wires', 'Power and lighting cable %.0f m, Cat-6 %.0f m, conduit %.0f m' % (
            sum(v for k, v in tot.items() if k.startswith('wire_m:') and 'Cat' not in k), sum(v for k, v in tot.items() if k.startswith('wire_m:Cat')), g('conduit_m'))),
        ('4. Paint', 'Interior walls %s sq ft, ceilings %s sq ft, exterior %s sq ft; about %.0f L interior emulsion, %.0f L exterior'
         % (sqft(g('paint_int_m2')), sqft(g('paint_ceil_m2')), sqft(g('paint_ext_m2')), paint_l, g('paint_ext_m2') * PAINT['exterior'][2])),
        ('5. POP', 'False ceiling %s sq ft (%d gypsum boards), cove %.0f rft' % (sqft(g('pop_m2')), math.ceil(g('pop_m2') * 1.1 / GYP_BOARD), g('cove_m') * FT)),
        ('6. Granite', 'Counter tops %s sq ft, %d sills %s sq ft, %d thresholds %s sq ft, stair %s sq ft, flamed paving %s sq ft' % (
            sqft(g('granite_counter_m2')), g('sills'), sqft(g('granite_sill_m2')), g('thresholds'), sqft(g('granite_threshold_m2')),
            sqft(g('granite_stair_m2')), sqft(g('granite_floor_m2')))),
        ('7. Timber', '%d door frames (%.1f cft) + %d shutters; pergola %.1f cft; handrail %.0f rft; veneer cladding %s sq ft; fluted walnut %s sq ft' % (
            g('doors'), g('door_frame_cft'), g('shutters'), g('pergola_cft'), g('handrail_m') * FT, sqft(g('cladding_m2')), sqft(g('fluted_m2')))),
        ('8. MDF', 'Wardrobes %d sheets 18 mm + %d sheets 8 mm; other storage %d + %d; BWP ply (wet) %d sheets; %d soft-close hinges' % (
            g('mdf_wardrobe_sheets18'), g('mdf_wardrobe_sheets8'), g('mdf_other_sheets18'), g('mdf_other_sheets8'), g('ply_sheets18'),
            g('mdf_wardrobe_hinges') + g('mdf_other_hinges') + g('ply_hinges'))),
        ('9. Lights', '%d downlights (on %d light points), %d fans, %.0f m cove LED, %.0f m under-cabinet LED, %d mirror, %d wall, %d garden lights' % (
            g('downlights'), g('light:light'), g('light:fan'), g('cove_m'), g('ucl_m'), g('light:ml'), g('light:wl'), g('light:gl'))),
    ]


def write_xlsx(path, h, rooms, rows, tot):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    head_fill, head_font = PatternFill('solid', fgColor='EFE6D8'), Font(bold=True, color='3E2B1F')
    ws = wb.active
    ws.title = 'Summary'
    ws.append(['GH-18 · Revision R1 · Materials and quantities (design-stage take-off, quantities only)'])
    ws['A1'].font = Font(bold=True, size=13, color='3E2B1F')
    ws.append(['Generated from house_r1.json by tools/boq.py. Re-run after any design change. Wastage as stated per sheet; quantities to be confirmed on site.'])
    ws.append([])
    for k, v in summary_lines(rooms, tot):
        ws.append([k, v])
    ws.column_dimensions['A'].width = 18
    ws.column_dimensions['B'].width = 150
    # rooms
    wr = wb.create_sheet('Rooms')
    hdr = ['Floor', 'Room', 'Floor area sq ft', 'Floor finish', 'Option A marble sq ft (+15%)', 'Option B tile boxes', 'Skirting rft', 'Wall paint sq ft',
           'Wall tiles sq ft', 'Wall tile boxes', 'Cladding / fluted sq ft', 'POP sq ft', 'Cove rft', 'Downlights', 'Fans']
    wr.append(hdr)
    for rid, v in rooms.items():
        if 'area_m2' not in v:
            continue
        wr.append([v['floor'], v['name'], sqft(v['area_m2']), FINISH.get(v['finish_floor'], v['finish_floor'] or ''), sqft(v['floor_optA']['area_m2']) if 'floor_optA' in v else '',
                   v['floor_optB']['boxes'] if 'floor_optB' in v else '', r(v.get('skirting_m', 0) * FT, 0) or '', sqft(v.get('paint_walls_m2', 0)) or '',
                   sqft(v['wall_tile']['net_m2']) if 'wall_tile' in v else '', v['wall_tile']['boxes'] if 'wall_tile' in v else '',
                   sqft(v.get('wall_cladding_m2', 0) + v.get('fluted_m2', 0)) or '', sqft(v['pop']['area_m2']) if 'pop' in v else '',
                   r(v['pop']['cove_m'] * FT, 0) if 'pop' in v and v['pop']['cove_m'] else '', v.get('lights', {}).get('downlights', ''), v.get('lights', {}).get('fan', '')])
    sheets = [('Rooms', wr)]
    for key in ('tiles', 'pipes', 'wires', 'paint', 'pop', 'granite', 'timber', 'mdf', 'lights'):
        s = wb.create_sheet(TITLE[key].split('. ')[1].split(' (')[0][:28])
        s.append(HEAD[key])
        for row in rows[key]:
            s.append(row)
        sheets.append((key, s))
    for _, s in sheets:
        for c in s[1]:
            c.fill, c.font = head_fill, head_font
            c.alignment = Alignment(wrap_text=True, vertical='top')
        for i, col in enumerate(s.columns, 1):
            width = max(len(str(c.value or '')) for c in col)
            s.column_dimensions[get_column_letter(i)].width = min(70, max(9, width + 2))
        s.freeze_panes = 'A2'
    notes = wb.create_sheet('Notes')
    for line in NOTES:
        notes.append([line])
    notes.column_dimensions['A'].width = 160
    wb.save(path)


NOTES = [
    'How the quantities are measured (all from house_r1.json):',
    '- Floors: room polygons (net). Option A Italian marble +15% wastage; Option B 1600 x 800 vitrified +8%, 2 tiles per box. Skirting = walled perimeter minus doors.',
    '- Tiles: washroom walls full height to the 2.6 m false ceiling, minus doors and windows, +10%. Waterproofing = floor + 300 mm up the walls (more in the shower: 1.8 m).',
    '- Paint: interior walls to the false ceiling minus openings, tiles, veneer cladding, fluted walls and the kitchen backsplash; ceilings = POP area;'
    ' exterior = non-party external walls x storey height, parapets and boundary walls (both faces where both are exposed). Coverage rates are indicative.',
    '- POP: ceilings of type POP (gypsum board 12.5 mm on GI framing, POP-finished), boards +10%; cove length = room perimeter where the ceiling has a cove.',
    '- Granite: counter tops (20 mm black granite, moulded front), sills on every window (wall + 50 mm), thresholds on every door, stair treads / risers /'
    ' landings (or marble to match the lobby), flamed granite paving. +10% wastage.',
    '- Timber: door frames 125 x 60 mm (teak for the main door), shutters 35 mm flush with veneer (main door 40 mm teak); pergola hardwood; handrail; walnut veneer'
    ' cladding (lobby, foyer, guest lounge, per the PDF schedule) and fluted walnut feature walls.',
    '- MDF: each wardrobe / storage unit = carcass (sides, top, bottom, a vertical every 900 mm, 4 shelves if tall) + shutters (18 mm) + back (8 mm); +15%'
    ' on 8 x 4 ft sheets. BWP ply for the vanities, the utility counter, the kitchen sink base and units on the terrace (owner: MDF elsewhere).',
    '- Lights: counts from the electrical points; cove LED = cove length; under-cabinet LED = the cabinet runs.',
    '- Pipes: lengths along the modelled routes and stacks, 3 m lengths +10%; bends counted where a route changes direction (tees and couplers extra).',
    '- Wires: route length of each circuit x 3 cores (phase, neutral, earth) +10%; 90 m coils; sub-main sizes indicative (electrician to size).',
    'Not included: labour, adhesives other than noted, hardware beyond hinges, sanitaryware, glass, aluminium windows, the lift, ACs and appliances.',
]


def write_html(path, h, rooms, rows, tot):
    esc = lambda s: str(s).replace('&', '&amp;').replace('<', '&lt;')  # noqa: E731
    out = ['<!doctype html><html><head><meta charset="utf-8"><title>GH-18 R1 materials</title><style>',
           '@page{size:A4 landscape;margin:12mm}body{font-family:Inter,"DejaVu Sans",sans-serif;font-size:8.6pt;color:#1f1d1a}',
           'h1{font-size:16pt;color:#3e2b1f;margin:0 0 4pt}h2{font-size:11.5pt;color:#6b4a33;border-bottom:1.5px solid #d9cbb8;margin:14pt 0 5pt;break-after:avoid}',
           'table{border-collapse:collapse;width:100%;margin:3pt 0 8pt}th,td{border:1px solid #ddd2c2;padding:2pt 4pt;text-align:left;vertical-align:top}',
           'th{background:#efe6d8}tr{break-inside:avoid}.sum td:first-child{font-weight:700;white-space:nowrap;width:1%}p{margin:3pt 0}.muted{color:#6f6a62}',
           '</style></head><body>',
           '<h1>GH-18 · Revision R1 · Materials and quantities</h1>',
           '<p class="muted">Design-stage take-off from the 3D model (house_r1.json, tools/boq.py). Quantities only; wastage as stated; to be confirmed on site. '
           'The editable Excel file has every line: GH-18_R1_materials.xlsx.</p>',
           '<h2>Summary</h2><table class="sum">']
    for k, v in summary_lines(rooms, tot):
        out.append('<tr><td>%s</td><td>%s</td></tr>' % (esc(k), esc(v)))
    out.append('</table>')
    out.append('<h2>Rooms</h2><table><tr><th>Floor</th><th>Room</th><th>Area sq ft</th><th>Floor</th><th>Marble A sq ft</th><th>Tiles B boxes</th>'
               '<th>Wall paint sq ft</th><th>Wall tiles sq ft</th><th>POP sq ft</th><th>Cove rft</th><th>Lights</th></tr>')
    for v in rooms.values():
        if 'area_m2' not in v:
            continue
        lights = lights_text(v.get('lights', {}))
        out.append('<tr>' + ''.join('<td>%s</td>' % esc(x) for x in [
            v['floor'], v['name'], sqft(v['area_m2']), FINISH.get(v['finish_floor'], v['finish_floor'] or ''), sqft(v['floor_optA']['area_m2']) if 'floor_optA' in v else '',
            v['floor_optB']['boxes'] if 'floor_optB' in v else '', sqft(v.get('paint_walls_m2', 0)) or '',
            sqft(v['wall_tile']['net_m2']) if 'wall_tile' in v else '', sqft(v['pop']['area_m2']) if 'pop' in v else '',
            r(v['pop']['cove_m'] * FT, 0) if 'pop' in v and v['pop']['cove_m'] else '', lights]) + '</tr>')
    out.append('</table>')
    for key in ('tiles', 'pipes', 'wires', 'paint', 'pop', 'granite', 'timber', 'mdf', 'lights'):
        out.append('<h2>%s</h2><table><tr>%s</tr>' % (TITLE[key], ''.join('<th>%s</th>' % esc(x) for x in HEAD[key])))
        for row in rows[key]:
            out.append('<tr>%s</tr>' % ''.join('<td>%s</td>' % esc(x) for x in row))
        out.append('</table>')
    out.append('<h2>How it is measured</h2>' + ''.join('<p>%s</p>' % esc(n) for n in NOTES))
    out.append('</body></html>')
    with open(path, 'w') as f:
        f.write('\n'.join(out))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'house_r1.json'
    h = hl.load(os.path.join(hl.ROOT, src))
    rooms, rows, tot = take_off(h)
    tag = 'r1' if 'r1' in src else 'main'
    out_dir = os.path.join(hl.ROOT, 'plans', 'r1') if tag == 'r1' else os.path.join(hl.ROOT, 'plans')
    with open(os.path.join(hl.ROOT, 'boq_%s.json' % tag), 'w') as f:
        json.dump(dict(source=src, note='generated by tools/boq.py - do not edit', summary=summary_lines(rooms, tot),
                       rooms=rooms, totals={k: r(v, 2) for k, v in tot.items()}), f, indent=1)
    write_xlsx(os.path.join(out_dir, 'GH-18_R1_materials.xlsx' if tag == 'r1' else 'GH-18_materials.xlsx'), h, rooms, rows, tot)
    write_html(os.path.join(out_dir, 'materials.html'), h, rooms, rows, tot)
    for k, v in summary_lines(rooms, tot):
        print('%-16s %s' % (k, v))


if __name__ == '__main__':
    main()
