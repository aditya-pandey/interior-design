"""Check the services in a house file against the consultants' own rules
(Plumbing Layout Rev A and Electrical Layout Rev A, Oct 2026).

Usage: python3 tools/check_services.py [house_r1.json]   -> prints the report, writes plans/r1/services_report.txt
Each rule is PASS / WARN / FAIL. Design intent only: sizing, falls and sign-off stay with the licensed plumber
and electrical contractor. The electrical part also prints the point schedule, the circuit list and the load.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import houselib as hl  # noqa: E402

WET = {'wc_wall_hung': 'soil', 'vanity': 'waste', 'basin': 'waste', 'sink': 'waste', 'shower_head': 'waste',
       'bathtub': 'waste', 'washer_dryer': 'waste', 'utility_counter': 'waste'}
DRAIN = ('soil', 'waste', 'sewer')
MIN_FALL = {('sewer', 150): 1 / 60, ('sewer', 110): 1 / 40, ('soil', 110): 1 / 40, ('waste', 75): 1 / 60, ('waste', 50): 1 / 60, ('rain', 100): 1 / 100}
OTS = [[-735, 10451], [1031, 10451], [1031, 12965], [-735, 12965]]     # the open-to-sky shaft and its walls
PARTY = [(0, 230), (9151, 9381)]                                      # east / west party walls (R1 orientation)
FLOOR_Z = {'GF': 450, 'FF': 3750, 'SF': 7050}


def d2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def seg_point_dist(p, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    L2 = (bx - ax) ** 2 + (by - ay) ** 2
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / L2))
    return math.hypot(p[0] - ax - t * (bx - ax), p[1] - ay - t * (by - ay))


def run_dist(p, run):
    return min(seg_point_dist(p, a, b) for a, b in zip(run['pts'], run['pts'][1:]))


def box_gap(c1, c2):
    """edge-to-edge plan distance between two chamber footprints"""
    dx = abs(c1['at'][0] - c2['at'][0]) - (c1['size'][0] + c2['size'][0]) / 2
    dy = abs(c1['at'][1] - c2['at'][1]) - (c1['size'][1] + c2['size'][1]) / 2
    return math.hypot(max(dx, 0), max(dy, 0))


def plumbing(h, rule):
    pl = h['services']['plumbing']
    runs, stacks, chambers = pl['runs'], {s['id']: s for s in pl['stacks']}, {c['id']: c for c in pl['chambers']}

    # 1. every wet fixture drained (WCs by a soil pipe) and supplied with cold water on its floor
    for fl in h['floors']:
        z0 = FLOOR_Z[fl['id']]
        for f in fl['furniture']:
            need = WET.get(f['type'])
            if not need or f.get('on_roof') or (f['type'] == 'utility_counter' and not f.get('sink')):
                continue
            tubs = [t for t in fl['furniture'] if t['type'] == 'bathtub' and hl.point_in_poly(f['pos'], hl.furniture_corners(t))]
            if f['type'] == 'shower_head' and tubs:
                rule('%s %s drained' % (f['id'], f['type']), 'PASS', 'over the tub %s: drains through the tub waste' % tubs[0]['id'])
                continue
            drains = [r for r in runs if r['kind'] in DRAIN and any(d2(p, f['pos']) < 160 and abs(p[2] - z0) < 900 for p in r['pts'])]
            ok = [r for r in drains if need == 'waste' or r['kind'] == 'soil']
            rule('%s %s drained' % (f['id'], f['type']), 'PASS' if ok else 'FAIL', ', '.join(r['id'] for r in ok) or 'no %s pipe at the fixture' % need)
            cold = [r for r in runs if r['kind'] == 'cold' and any(abs(p[2] - z0) < 1500 for p in r['pts']) and run_dist(f['pos'], r) < 2200]
            if f['type'] != 'wc_wall_hung':
                rule('%s %s supplied' % (f['id'], f['type']), 'PASS' if cold else 'WARN', ', '.join(r['id'] for r in cold) or 'no cold line within 2.2 m')

    # 2. every drain ends at a stack, a chamber or another drain
    for r in runs:
        if r['kind'] not in DRAIN + ('rain',) or r['id'].startswith('RWP'):
            continue
        if r.get('outfall'):
            rule('%s outfall' % r['id'], 'PASS', r['serves'])
            continue
        end = r['pts'][-1]
        hit = [s for s in stacks.values() if d2(end, s['at']) < 150] + [c for c in chambers.values() if d2(end, c['at']) < max(c['size']) / 2 + 150] + \
              [o for o in runs if o is not r and o['kind'] in DRAIN + ('rain',) and any(d2(end, p) < 160 for p in o['pts'])]
        rule('%s ends at a stack / chamber / drain' % r['id'], 'PASS' if hit else 'FAIL', hit[0]['id'] if hit else 'open end at %s' % end)

    # 3. gravity runs fall all the way, at least at the minimum gradient
    for r in runs:
        if r['kind'] not in DRAIN + ('rain',) or r['id'].startswith('RWP'):
            continue
        worst = None
        for a, b in zip(r['pts'], r['pts'][1:]):
            L = d2(a, b)
            if L < 1:
                continue
            fall = (a[2] - b[2]) / L
            worst = fall if worst is None else min(worst, fall)
        need = MIN_FALL.get((r['kind'], r['dia']), 1 / 60)
        st = 'PASS' if worst is not None and worst >= need - 1e-6 else 'FAIL'
        rule('%s fall' % r['id'], st, '1:%.0f (min 1:%.0f)' % (1 / worst if worst and worst > 0 else 0, 1 / need))

    # 4. chambers only in lawns, OTS, courtyard, parking - never inside rooms (sealed cleanouts excepted)
    gf = next(f for f in h['floors'] if f['id'] == 'GF')
    rooms = [r for r in gf['rooms'] if r.get('kind') not in ('shaft', 'lift')]
    for c in chambers.values():
        inside = [r['name'] for r in rooms if hl.point_in_poly(c['at'], r['polygon'])]
        if c['type'] == 'cleanout':
            rule('%s sealed cleanout location' % c['id'], 'PASS', ('inside %s (sealed double-seal cover)' % inside[0]) if inside else c.get('area', ''))
        else:
            rule('%s not inside a room' % c['id'], 'FAIL' if inside else 'PASS', ('inside ' + inside[0]) if inside else c.get('area', ''))

    # 5. nothing under the guest room
    guest = next(r for r in gf['rooms'] if r['id'] == 'GF-GST')
    under = []
    for r in runs:
        for a, b in zip(r['pts'], r['pts'][1:]):
            for t in (0.1, 0.3, 0.5, 0.7, 0.9):
                p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
                if p[2] < 450 and hl.point_in_poly(p, guest['polygon']):
                    under.append(r['id'])
                    break
    rule('nothing under the guest room', 'FAIL' if under else 'PASS', ', '.join(sorted(set(under))))

    # 6. nothing in the east / west party walls (the OTS is GH-18's own shaft)
    inwall = []
    for r in runs:
        for p in r['pts']:
            if any(lo <= p[0] <= hi for lo, hi in PARTY) and not hl.point_in_poly(p, OTS) and p[1] < 22276:
                inwall.append(r['id'])
                break
    for s in stacks.values():
        if any(lo <= s['at'][0] <= hi for lo, hi in PARTY) and not hl.point_in_poly(s['at'], OTS):
            inwall.append(s['id'])
    rule('nothing in the east / west party walls', 'FAIL' if inwall else 'PASS', ', '.join(inwall))

    # 7. UGT clear of the sewer and the RWH pit
    ugt = chambers.get('UGT')
    if ugt:
        sewer_gap = min([run_dist(ugt['at'], r) - max(ugt['size']) / 2 for r in runs if r['kind'] in ('sewer', 'soil')] +
                        [box_gap(ugt, c) for c in chambers.values() if c['type'] in ('inspection', 'grease_trap')])
        rule('UGT >= 2 m from any sewer line or chamber', 'PASS' if sewer_gap >= 2000 else 'FAIL', '%.1f m' % (sewer_gap / 1000))
        if 'RWH' in chambers:
            g = box_gap(ugt, chambers['RWH'])
            rule('UGT >= 2 m from the RWH pit', 'PASS' if g >= 2000 else 'FAIL', '%.1f m' % (g / 1000))

    # 8. overhead tank head over the showers
    oht = next((f for fl in h['floors'] for f in fl['furniture'] if f['type'] == 'water_tank'), None)
    if oht:
        base = h['levels']['SF']['ffl'] + oht.get('z', 0) + 300
        for fl in h['floors']:
            heads = [f for f in fl['furniture'] if f['type'] == 'shower_head']
            if not heads:
                continue
            top = max(FLOOR_Z[fl['id']] + f.get('z', 2150) for f in heads)
            head = base - top
            st = 'PASS' if head >= 2500 else 'WARN'
            rule('%s showers: head below the OHT' % fl['id'], st, '%.2f m%s' % (head / 1000, '' if st == 'PASS' else ' - fine at low flow; a small pressure pump for the SF washroom'))

    # 9. vents >= 1 m above the roof / terrace they pass
    for s in stacks.values():
        top = s['z'][1]
        roof = h['levels']['ROOF']['ffl'] if hl.point_in_poly(s['at'], OTS) else h['levels']['SF']['ffl']
        rule('%s vent >= 1 m above the finish' % s['id'], 'PASS' if top - roof >= 1000 else 'FAIL', '%.2f m' % ((top - roof) / 1000))



# ------------------------------------------------------------------ electrical
PARTY_X = [(0, 250), (9131, 9381)]          # wall points within the E / W party walls' inner faces
CAT = {'light': 'lights', 'pd': 'lights', 'ucl': 'lights', 'ml': 'lights', 'wl': 'lights', 'gl': 'lights', 'fan': 'fan',
       's6': 's6', 's6c': 's6', 'ip65': 's6'}
KW = dict(light=0.03, pd=0.06, fan=0.06, ucl=0.02, ml=0.02, wl=0.02, gl=0.015, ef=0.04, s6=0.1, s6c=0.1, ip65=0.1, usb=0.02, tv=0.1,
          ch=0.2, ups=0.1, s16=1.5, gy=2.0, ev=7.4, cctv=0.01, vdp=0.01, vdpo=0.01, rack=0.05, spare=0.0)
SHEET = [   # Electrical Rev A point schedule (Sheet 2, A) -> the R1 rooms; minimum counts
    ('GF Drawing / Dining', ['GF-DRW', 'GF-DIN'], dict(lights=5, fan=1, s6=2, ac=1, tv=1, sd=1)),
    ('GF Kitchen', ['GF-KIT'], dict(lights=3, s6=1, ch=1, s16=3, ef=1, hd=1)),
    ('GF Toilet', ['GF-TLT'], dict(lights=2, s6=1, gy=1, ef=1)),
    ('GF Lobby / Stair / Panel rm', ['GF-LOB', 'GF-JAN'], dict(lights=2, sd=1, rack=1, inv=1)),
    ('GF Guest room', ['GF-GST'], dict(lights=2, fan=1, s6=3, ac=1, tv=1)),
    ('GF Foyer', ['GF-FOY'], dict(lights=2, vdp=1)),
    ('GF Study -> R1 guest lounge / study', ['GF-MND'], dict(lights=2, fan=1, s6=2, ups=1, ac=1, data=1)),
    ('External / Parking', ['GF-LAWN-B', 'GF-DECK', 'GF-COURT', 'GF-PARK'], dict(lights=10, s6=1, cctv=2, pump=1, ev=1, vdpo=1, mtr=1)),
    ('FF Master bedroom', ['FF-MST'], dict(lights=3, fan=1, s6=3, usb=2, ac=1, tv=1, sd=1)),
    ('FF Master toilet -> R1 master washroom', ['FF-MTL'], dict(lights=2, s6=1, gy=1, ef=1)),
    ('FF Dresser', ['FF-DRS'], dict(lights=2, s6=1, db=1)),
    ('FF Centre toilet -> R1 bedroom-3 toilet', ['FF-TL3'], dict(lights=2, gy=1, ef=1)),
    ('FF Lobby / Stair', ['FF-LOB'], dict(lights=2, sd=1)),
    ('FF Bedroom 2 -> R1 bedroom 3', ['FF-BD3'], dict(lights=2, fan=1, s6=3, ac=1, tv=1)),
    ('FF Toilet (WNW) -> R1 kids toilet', ['FF-KTL'], dict(lights=1, gy=1, ef=1)),
    ('FF Bedroom 3 -> R1 kids room', ['FF-KID'], dict(lights=2, fan=1, s6=3, ac=1, tv=1, sd=1)),
    ('FF Balconies', ['FF-BAL'], dict(lights=4, s6=2)),
    ('Terrace', ['SF-TRB', 'SF-TRF', 'ROOF'], dict(lights=2, s6=1, pump=1, spare=1)),
]
WET_TYPES = ('vanity', 'basin', 'sink', 'bathtub')


def cat(k):
    return CAT.get(k, k)


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


def wall_at(fl, p, tol=80):
    """the straight wall whose face the point sits on, with the point's position along it"""
    best = None
    for w in fl['walls']:
        if 'a' not in w:
            continue
        d = seg_point_dist(p, w['a'], w['b']) - w['t'] / 2
        if d <= tol and (best is None or d < best[0]):
            (ax, ay), (bx, by) = w['a'], w['b']
            L = math.hypot(bx - ax, by - ay)
            along = ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / L
            best = (d, w, along)
    return best


def poly_dist(p, poly):
    if hl.point_in_poly(p, poly):
        return 0
    return min(seg_point_dist(p, a, b) for a, b in zip(poly, poly[1:] + poly[:1]))


def zone(p, box):
    """Vastu 3 x 3 grid over the house footprint (R1: north = +y, east = -x); the centre ninth is the Brahmasthan"""
    x0, y0, x1, y1 = box
    col = 'E' if p[0] < x0 + (x1 - x0) / 3 else 'W' if p[0] > x0 + 2 * (x1 - x0) / 3 else ''
    row = 'S' if p[1] < y0 + (y1 - y0) / 3 else 'N' if p[1] > y0 + 2 * (y1 - y0) / 3 else ''
    return (row + col) or 'centre'


def electrical(h, rule, out):
    el = h['services']['electrical']
    pts, circuits = el['points'], el['circuits']
    byid = {p['id']: p for p in pts}
    fls = {f['id']: f for f in h['floors']}
    rooms = {r['id']: r for f in h['floors'] for r in f['rooms']}
    fur = {f['id']: f for fl in h['floors'] for f in fl['furniture']}
    ffl = {k: v['ffl'] for k, v in h['levels'].items() if 'ffl' in v}
    ext = [w for w in fls['GF']['walls'] if w.get('kind') == 'external' and 'a' in w]
    box = (0, min(min(w['a'][1], w['b'][1]) for w in ext), h['meta']['plot']['width_outer'], max(max(w['a'][1], w['b'][1]) for w in ext))
    polys = {**{rid: r['polygon'] for rid, r in rooms.items()}, **{a['id']: a['polygon'] for f in h['floors'] for a in f.get('outdoor', [])}}
    rel = lambda p: p['at'][2] - (ffl['ROOF'] if p['room'] == 'ROOF' else ffl[p['floor']] if p['room'] in rooms else 0)  # noqa: E731
    in_room = lambda rid: [p for p in pts if p['room'] == rid or p['serves'] == rid]  # noqa: E731

    # 1. the sheet's point schedule, row by row (R1 may add, never drop)
    for name, rids, need in SHEET:
        mine = [p for p in pts if p['room'] in rids and not (p['kind'] == 'sb' and p['serves'] not in rids)]
        have = {}
        for p in mine:
            have[cat(p['kind'])] = have.get(cat(p['kind']), 0) + 1
        short = ['%s %d/%d' % (k, have.get(k, 0), v) for k, v in need.items() if have.get(k, 0) < v]
        extra = ['%s +%d' % (k, have[k] - need.get(k, 0)) for k in sorted(have) if k in need and have[k] > need[k]]
        rule('sheet schedule: %s' % name, 'FAIL' if short else 'PASS', ('short: ' + ', '.join(short)) if short else ('R1 adds ' + ', '.join(extra)) if extra else 'as the sheet')

    # 2. every room lit and switched; the switchboard at a door
    doors = {}
    for fid, fl in fls.items():
        for w in fl['walls']:
            for o in w.get('openings', []):
                if o['type'] in ('door', 'sliding_door', 'glass_door', 'pivot_door'):
                    doors.setdefault(fid, []).append((o['id'], opening_centre(w, o)))
    for rid, r in rooms.items():
        if r.get('kind') in ('shaft', 'lift', 'outdoor'):
            continue
        mine = in_room(rid)
        lit = [p for p in mine if cat(p['kind']) == 'lights' and p['room'] == rid]
        sbs = [p for p in mine if p['kind'] in ('sb', 'sb2w') and p['serves'] == rid]
        rule('%s lit and switched' % rid, 'PASS' if lit and sbs else 'FAIL', '%d light(s), %d switchboard(s)' % (len(lit), len(sbs)))
        mydoors = [c for _, c in doors.get(rid[:2], []) if poly_dist(c, r['polygon']) < 250]
        if mydoors and sbs and any(p['kind'] == 'sb' for p in sbs):      # open plan / lobbies are switched 2-way at their ends
            d = min(math.dist(p['at'][:2], c) for p in sbs for c in mydoors)
            rule('%s switchboard at a door' % rid, 'PASS' if d <= 1800 else 'WARN', '%.1f m from the door centre' % (d / 1000))

    # 3. wet rooms: switches outside, exhaust out, geyser high and out of the splash zone
    wetrooms = [rid for rid, r in rooms.items() if any(w in r['name'].lower() for w in ('toilet', 'washroom'))]
    for rid in wetrooms:
        fl = fls[rid[:2]]
        sbs = [p for p in pts if p['kind'] == 'sb' and p['serves'] == rid]
        rule('%s switches outside' % rid, 'PASS' if sbs and all(p['room'] != rid for p in sbs) else 'FAIL', ', '.join('%s in %s' % (p['id'], p['room']) for p in sbs))
        efs = [p for p in pts if p['kind'] == 'ef' and p['room'] == rid]
        ok = []
        for p in efs:
            if p.get('ceiling'):
                above = fls.get({'GF': 'FF', 'FF': 'SF'}.get(rid[:2]))
                open_above = above and any(r.get('kind') == 'outdoor' and hl.point_in_poly(p['at'], r['polygon']) for r in above['rooms'])
                ok.append(('ceiling, ducted to the open terrace above' if open_above else None))
                continue
            w = wall_at(fl, p['at'])
            party = any(lo <= p['at'][0] <= hi for lo, hi in PARTY_X)
            ok.append(('on %s wall %s' % (w[1]['kind'], w[1]['id'])) if w and (w[1]['kind'] == 'shaft' or (w[1]['kind'] == 'external' and not party)) else None)
        good = [o for o in ok if o]
        rule('%s exhaust to the outside' % rid, 'PASS' if good else 'FAIL', good[0] if good else 'no EF on the OTS / an external non-party wall')
        heads = [f for f in fl['furniture'] if f['type'] in ('shower_head', 'bathtub') and hl.point_in_poly(f['pos'], rooms[rid]['polygon'])]
        for g in [p for p in pts if p['kind'] == 'gy' and p['room'] == rid]:
            clear = min((math.dist(g['at'][:2], f['pos']) if f['type'] == 'shower_head' else poly_dist(g['at'], hl.furniture_corners(f))) for f in heads) if heads else 9999
            st = 'PASS' if rel(g) >= 1800 and clear >= 600 else 'FAIL'
            rule('%s geyser high, out of the splash zone' % rid, st, '%.2f m up, %.1f m from the shower / tub' % (rel(g) / 1000, clear / 1000))
        if not [p for p in pts if p['kind'] == 'gy' and p['room'] == rid]:
            rule('%s geyser' % rid, 'FAIL', 'none')

    # 4. sockets clear of water (0.6 m from basins, sinks, tubs, shower heads)
    for fid, fl in fls.items():
        wet = []
        for f in fl['furniture']:
            if f.get('on_roof'):
                continue
            if f['type'] in WET_TYPES:
                wet.append((f['id'], hl.furniture_corners(f)))
            elif f['type'] == 'utility_counter' and f.get('sink'):
                wet.append((f['id'], hl.furniture_corners(dict(f, size=[500, 400, 0]))))
            elif f['type'] == 'shower_head':
                x, y = f['pos']
                wet.append((f['id'], [(x - 1, y - 1), (x + 1, y - 1), (x + 1, y + 1), (x - 1, y + 1)]))
        socks = [p for p in pts if p['floor'] == fid and p['kind'] in ('s6', 's6c', 's16', 'usb', 'ip65', 'ups') and p['room'] != 'ROOF']
        bad = []
        for p in socks:      # fixtures in the same room only (a wall between them is enough)
            near = [(poly_dist(p['at'], c), i) for i, c in wet if hl.point_in_poly(fur[i]['pos'], polys[p['room']])]
            d, wid = min(near) if near else (9999, '')
            if d < 600:
                bad.append('%s %.2f m from %s' % (p['id'], d / 1000, wid))
        rule('%s sockets >= 0.6 m from water' % fid, 'FAIL' if bad else 'PASS', '; '.join(bad) or '%d sockets' % len(socks))

    # 5. beds: 2-way switch and a socket at each side table
    for fid, fl in fls.items():
        beds = [f for f in fl['furniture'] if f['type'].startswith('bed_')]
        for t in [f for f in fl['furniture'] if f['type'] == 'side_table' and any(b['room'] == f['room'] for b in beds)]:
            near = [p for p in pts if p['floor'] == fid and math.dist(p['at'][:2], t['pos']) < 700]
            has = {p['kind'] for p in near}
            rule('%s bedside (%s)' % (t['id'], t['room']), 'PASS' if {'sb2w', 's6'} <= has else 'FAIL', ', '.join(sorted(has)) or 'nothing')

    # 6. ACs: off the glazing, high, each with its own outdoor unit on a short route
    odus = {f['id']: f for f in fur.values() if f['type'] == 'ac_odu'}
    used = []
    for a in [p for p in pts if p['kind'] == 'ac']:
        fl = fls[a['floor']]
        w = wall_at(fl, a['at'])
        glazed = [o['id'] for o in (w[1].get('openings', []) if w else []) if o['offset'] - 450 < w[2] < o['offset'] + o['width'] + 450
                  and (o.get('sill', 0) + o['height']) > rel(a) - 50]
        rule('%s AC (%s) off the glazing, high' % (a['id'], a['room']), 'PASS' if not glazed and rel(a) >= 2000 else 'FAIL',
             ('over ' + ', '.join(glazed)) if glazed else '%.2f m on %s' % (rel(a) / 1000, w[1]['id'] if w else '?'))
        r = next((r for r in el['refrigerant'] if r['ac'] == a['id']), None)
        if not r:
            rule('%s AC refrigerant route' % a['id'], 'FAIL', 'none')
            continue
        o = odus.get(r['odu'])
        end_ok = o and math.dist(r['pts'][-1][:2], o['pos']) < 400
        used.append(r['odu'])
        st = 'FAIL' if not end_ok else 'PASS' if r['length'] <= 15000 else 'WARN' if r['length'] <= 25000 else 'FAIL'
        rule('%s AC route to %s' % (a['id'], r['odu']), st, '%.1f m (standard charge to 15 m)' % (r['length'] / 1000))
        through = [q for q in r['pts'][1:] if any(lo < q[0] < hi for lo, hi in ((0, 230), (9151, 9381)))]
        rule('%s AC route clear of the party walls' % a['id'], 'FAIL' if through else 'PASS', str(through[0]) if through else r['note'])
    spare = sorted(set(odus) - set(used))
    rule('every outdoor unit serves one AC', 'PASS' if not spare and len(used) == len(set(used)) else 'FAIL', ('unused ' + ', '.join(spare)) if spare else '%d units' % len(used))
    for oid in sorted(odus):
        z = zone(odus[oid]['pos'], box)
        rule('%s outdoor unit zone' % oid, 'WARN' if z in ('NE', 'N', 'E') else 'PASS',
             z + (' - Rev A A6 puts the guest-room unit here; Vastu consultant to confirm' if oid == 'GF-O08' else ''))

    # 7. DBs out of the Brahmasthan and the wet rooms, SE preferred, clear of water pipes
    runs = h['services'].get('plumbing', {}).get('runs', [])
    for d in [p for p in pts if p['kind'] == 'db']:
        z = zone(d['at'], box)
        wetroom = [r for r in wetrooms if r[:2] == d['floor'] and hl.point_in_poly(d['at'], rooms[r]['polygon'])]
        rule('%s not in the Brahmasthan or a wet room' % d['tag'], 'FAIL' if z == 'centre' or wetroom else 'PASS', '%s zone, in %s' % (z, d['room']))
        rule('%s in the SE zone (sheet)' % d['tag'], 'PASS' if z == 'SE' else 'WARN', z + ('' if z == 'SE' else ' - ' + d['note']))
        gap = min((min(math.dist(d['at'], [a[i] + (b[i] - a[i]) * t for i in range(3)]) for t in (k / 20 for k in range(21)))
                   for r in runs for a, b in zip(r['pts'], r['pts'][1:])), default=9999)
        rule('%s >= 0.6 m from water / drain pipes' % d['tag'], 'PASS' if gap >= 600 else 'FAIL', '%.1f m' % (gap / 1000))

    # 8. detectors: smoke in every bedroom, lounge and lobby; heat (not smoke) in the kitchen
    for rid, r in rooms.items():
        n = r['name'].lower()
        if r.get('kind') in ('shaft', 'lift', 'outdoor'):
            continue
        kinds = {p['kind'] for p in pts if p['room'] == rid}
        if any(w in n for w in ('bedroom', 'kids', 'guest room', 'lounge', 'lobby', 'servant room')) and 'toilet' not in n:
            rule('%s smoke detector' % rid, 'PASS' if 'sd' in kinds else 'WARN', 'yes' if 'sd' in kinds else 'none (not on the sheet for this room)')
        if 'kitchen' in n:
            rule('%s heat detector, no smoke detector' % rid, 'PASS' if 'hd' in kinds and 'sd' not in kinds else 'FAIL', ', '.join(sorted(kinds & {'hd', 'sd'})))

    # 9. circuits: point limits, dedicated circuits, RCDs, every point fed from its own floor's DB
    for c in circuits:
        loads = [byid[i] for i in c['points'] if byid[i]['kind'] not in ('sb', 'sb2w')]
        if c['cls'] == 'lighting':
            rule('%s lighting <= 10 points' % c['id'], 'PASS' if len(loads) <= 10 else 'FAIL', '%d' % len(loads))
        elif c['cls'] == 'sockets':
            rule('%s sockets <= 8 points, RCD' % c['id'], 'PASS' if len(loads) <= 8 and c['rcd'] else 'FAIL', '%d, RCD %s' % (len(loads), c['rcd']))
        elif c['cls'] in ('power', 'geyser', 'ac'):
            need_rcd = c['cls'] == 'geyser' or any(byid[i]['kind'] in ('ev', 's16', 'pump') for i in c['points'])
            rule('%s dedicated%s' % (c['id'], ', RCD' if need_rcd else ''), 'PASS' if len(loads) == 1 and (c['rcd'] or not need_rcd) else 'FAIL',
                 '%s %s' % (loads[0]['kind'] if loads else '-', c['mcb']))
    wet_l = [c for c in circuits if c['cls'] == 'lighting' and any(byid[i]['serves'] in wetrooms for i in c['points'])]
    rule('lighting circuits with wet-room points on an RCD', 'PASS' if all(c['rcd'] for c in wet_l) else 'FAIL', ', '.join(c['id'] for c in wet_l))
    loose = [p['id'] for p in pts if p['kind'] not in ('db', 'mtr', 'inv', 'data') and not p.get('circuit')]
    rule('every point on a circuit', 'FAIL' if loose else 'PASS', ', '.join(loose) or '%d points' % len(pts))
    dbfloor = {'DB-1': ('GF',), 'DB-2': ('FF',), 'DB-3': ('SF',), 'INV': ('GF', 'FF', 'SF')}
    wrong = [c['id'] for c in circuits if c['id'] != 'LIFT' and any(byid[i]['floor'] not in dbfloor[c['db']] for i in c['points'])]
    rule('circuits fed from their own floor DB', 'FAIL' if wrong else 'PASS', ', '.join(wrong) or 'DB-1 GF + outside, DB-2 FF, DB-3 SF + roof')

    # 10. no exhaust fans or AC units on the party walls
    on_party = [p['id'] for p in pts if p['kind'] in ('ef', 'ac', 'odu') and not p.get('ceiling') and p['kind'] != 'ac' and any(lo <= p['at'][0] <= hi for lo, hi in PARTY_X)]
    on_party += [o for o, f in odus.items() if any(lo <= f['pos'][0] <= hi for lo, hi in ((0, 600), (8781, 9381)))]
    rule('no exhaust or outdoor units on the E / W party walls', 'FAIL' if on_party else 'PASS', ', '.join(on_party))

    # 11. load
    def kw(p):
        if p['kind'] == 'ac':
            return 2.2 if p.get('tr', 1.5) >= 2 else 1.5
        if p['kind'] in ('pump', 'iso'):
            return p.get('kw', 0.75)
        return KW.get(p['kind'], 0)
    conn = sum(kw(p) for p in pts)
    demand = conn * 0.55
    rule('connected load and supply', 'PASS' if demand > 7.5 else 'WARN', '%.1f kW connected (sheet ~41), ~%.0f kW max demand at 0.55 -> 3-phase, as the sheet' % (conn, demand))

    # tables for the electrician
    out.append('')
    out.append('POINT SCHEDULE (R1)  rooms x points; L = lights, F = fans, 6A = sockets (incl. counter / IP65), 16A, AC, GY = geyser, EF, TV, D = data')
    cols = ['lights', 'fan', 's6', 'usb', 's16', 'ac', 'gy', 'ef', 'tv', 'data', 'sd', 'hd', 'sb', 'sb2w']
    out.append('%-26s ' % 'room' + ' '.join('%5s' % c[:5] for c in cols))
    seen = []
    for p in pts:
        if p['room'] not in seen:
            seen.append(p['room'])
    names = {**{rid: r['name'] for rid, r in rooms.items()}, **{a['id']: a['name'] for f in h['floors'] for a in f.get('outdoor', [])}, 'ROOF': 'SF roof'}
    for rid in seen:
        mine = [p for p in pts if p['room'] == rid]
        cnt = lambda c: sum(1 for p in mine if cat(p['kind']) == c)  # noqa: E731
        out.append('%-26s ' % ('%s %s' % (rid, names.get(rid, '')))[:26] + ' '.join('%5s' % (cnt(c) or '.') for c in cols))
    out.append('')
    out.append('CIRCUITS')
    out.append('%-6s %-5s %-9s %4s  %-20s %-16s %-4s %6s  %s' % ('id', 'DB', 'class', 'pts', 'MCB', 'cable', 'RCD', 'kW', 'serves'))
    for c in circuits:
        mem = [byid[i] for i in c['points']]
        where = sorted({names.get(p['room'], p['room']) for p in mem})
        out.append('%-6s %-5s %-9s %4d  %-20s %-16s %-4s %6.2f  %s' % (c['id'], c['db'], c['cls'], len(mem), c['mcb'], c['cable'], 'yes' if c['rcd'] else '-',
                                                                       0 if c['cls'] == 'data' else sum(kw(p) for p in mem), ', '.join(where)[:70]))
    out.append('')
    out.append('AC REFRIGERANT ROUTES')
    for r in el['refrigerant']:
        out.append('%-7s -> %-7s %5.1f m  %s' % (r['ac'], r['odu'], r['length'] / 1000, r['note']))


# ------------------------------------------------------------------ Vastu placements (red-line register + owner items)
def vastu(h, rule):
    fls = {f['id']: f for f in h['floors']}
    fur = [(fl['id'], f) for fl in h['floors'] for f in fl['furniture']]
    rooms = {r['id']: r for f in h['floors'] for r in f['rooms']}
    ext = [w for w in fls['GF']['walls'] if w.get('kind') == 'external' and 'a' in w]
    box = (0, min(min(w['a'][1], w['b'][1]) for w in ext), h['meta']['plot']['width_outer'], max(max(w['a'][1], w['b'][1]) for w in ext))
    nv = h['meta']['north_vector']
    ev = [-nv[1], nv[0]]
    def facing(v):          # plan vector -> compass word (R1: north = +y, east = -x)
        n, e = v[0] * nv[0] + v[1] * nv[1], v[0] * ev[0] + v[1] * ev[1]
        return ('north' if n > 0 else 'south') if abs(n) > abs(e) else ('east' if e > 0 else 'west')
    wet = [r for r in rooms.values() if any(w in r['name'].lower() for w in ('toilet', 'washroom'))]
    for fid, m in [(i, f) for i, f in fur if f['type'] in ('mandir_open', 'mandir_wall', 'mandir_jaali')]:
        a = math.radians(m.get('rot', 0))
        front = (-math.sin(a), math.cos(a))
        dev = facing((-front[0], -front[1]))
        rule('%s mandir: devotee faces east or north' % m['id'], 'PASS' if dev in ('east', 'north') else 'FAIL', 'faces ' + dev)
        r = rooms[m['room']]
        xs, ys = [p[0] for p in r['polygon']], [p[1] for p in r['polygon']]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        q = facing((m['pos'][0] - cx, 0)) if abs(m['pos'][0] - cx) > 1 else '', facing((0, m['pos'][1] - cy))
        rule('%s mandir in the NE quarter of %s' % (m['id'], r['name']), 'PASS' if set(q) == {'east', 'north'} else 'WARN', '-'.join(reversed(q)))
        corners = hl.furniture_corners(m)
        near = [w['name'] for w in wet if w['id'][:2] == fid and min(poly_dist(c, w['polygon']) for c in corners) < 400]
        rule('%s mandir: no toilet behind or beside it' % m['id'], 'FAIL' if near else 'PASS', ', '.join(near) or 'kitchen wall behind' if 'KIT' in str([rid for rid, rr in rooms.items() if rid[:2] == fid and min(poly_dist(c, rr['polygon']) for c in corners) < 300]) else '')
        up = {'GF': 'FF', 'FF': 'SF'}.get(fid)
        above = [rr['name'] for rr in rooms.values() if up and rr['id'][:2] == up and hl.point_in_poly(m['pos'], rr['polygon'])]
        bad = [n for n in above if any(w in n.lower() for w in ('toilet', 'washroom'))]
        rule('%s mandir: no toilet above' % m['id'], 'FAIL' if bad else 'PASS', ', '.join(above) or 'open above')
    areas = {a['id']: a for f in h['floors'] for a in f.get('outdoor', [])}
    for fid, t in [(i, f) for i, f in fur if f['type'] == 'tulsi_platform']:
        g = areas.get(t['room']) or rooms[t['room']]
        xs, ys = [p[0] for p in g['polygon']], [p[1] for p in g['polygon']]
        q = facing((t['pos'][0] - (min(xs) + max(xs)) / 2, 0)), facing((0, t['pos'][1] - (min(ys) + max(ys)) / 2))
        rule('%s tulsi in the NE corner of %s' % (t['id'], g['name']), 'PASS' if set(q) == {'east', 'north'} else 'WARN', '-'.join(reversed(q)))
        a = math.radians(t.get('rot', 0))
        dev = facing((math.sin(a), -math.cos(a)))
        rule('%s tulsi: devotee faces east or north' % t['id'], 'PASS' if dev in ('east', 'north') else 'WARN', 'faces ' + dev)
        z = zone(t['pos'], (0, 0, box[2], h['meta']['plot']['depth_to_front_boundary']))
        rule('%s tulsi zone of the plot (N / NE / E preferred)' % t['id'], 'PASS' if z in ('NE', 'N', 'E') else 'WARN',
             z + ' zone' + ('' if z in ('NE', 'N', 'E') else ' - owner placed it in the back garden; Vastu consultant to confirm'))
        covered = [rr['name'] for f2 in h['floors'] if f2['id'] != 'GF' for rr in f2['rooms'] if hl.point_in_poly(t['pos'], rr['polygon'])]
        rule('%s tulsi open to the sky' % t['id'], 'FAIL' if covered else 'PASS', ', '.join(covered) or 'nothing above')
    pl = h.get('services', {}).get('plumbing', {})
    for c in pl.get('chambers', []):
        if c['type'] == 'tank':
            rule('%s underground tank in the NE' % c['id'], 'PASS' if zone(c['at'], (0, box[1], box[2], h['meta']['plot']['depth_to_front_boundary'])) == 'NE' else 'WARN', 'red-line 6 / plumbing P4')
    for fid, f in fur:
        if f['type'] == 'water_tank':
            z = zone(f['pos'], box)
            rule('%s overhead tank in the S / SW / W' % f['id'], 'PASS' if z in ('SW', 'S', 'W') else 'WARN', z + ' zone (red-line T)')
        if f['type'] == 'hob':
            a = math.radians(f.get('rot', 0))
            rule('%s cook faces east (red-line 7)' % f['id'], 'PASS' if facing((math.sin(a), -math.cos(a))) == 'east' else 'WARN', facing((math.sin(a), -math.cos(a))))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'house_r1.json'
    h = hl.load(os.path.join(hl.ROOT, src))
    sv = h.get('services')
    if not sv:
        print('no services in', src)
        return 0
    out = ['GH-18 services check (%s)' % src]
    tables = []
    n = {'PASS': 0, 'WARN': 0, 'FAIL': 0}
    for name, fn, part in (('PLUMBING', plumbing, sv.get('plumbing')), ('ELECTRICAL', electrical, sv.get('electrical')),
                           ('VASTU PLACEMENTS', vastu, {'source': 'red-line register + owner items (mandir, tulsi, tanks, hob)', 'status': 'checked against the model; the Vastu consultant re-checks R1 before freeze'})):
        if not part:
            continue
        rows = []

        def rule(nm, status, detail=''):
            rows.append((status, nm, detail))
        extra = []
        if fn is electrical:
            fn(h, rule, extra)
        else:
            fn(h, rule)
        k = {s: sum(1 for r in rows if r[0] == s) for s in n}
        for s_ in n:
            n[s_] += k[s_]
        out += ['', '== %s: %s' % (name, part.get('source', '')), part.get('status', ''), '']
        out += ['%-5s %-52s %s' % r for r in rows]
        out += ['', '%s: %s  (%d pass, %d warn, %d fail)' % (name, 'FAIL' if k['FAIL'] else 'PASS', k['PASS'], k['WARN'], k['FAIL'])]
        tables += extra
    out += ['', 'RESULT: %s  (%d pass, %d warn, %d fail)' % ('FAIL' if n['FAIL'] else 'PASS', n['PASS'], n['WARN'], n['FAIL'])] + tables
    text = '\n'.join(out)
    print(text)
    out_dir = os.path.join(hl.ROOT, 'plans', 'r1' if src == 'house_r1.json' else '')
    with open(os.path.join(out_dir, 'services_report.txt'), 'w') as fp:
        fp.write(text + '\n')
    return 1 if n['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
