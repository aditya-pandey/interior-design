"""Check the services in a house file against the consultants' own rules (Plumbing Layout Rev A, Oct 2026).

Usage: python3 tools/check_services.py [house_r1.json]   -> prints the report, writes plans/r1/services_report.txt
Each rule is PASS / WARN / FAIL. Design intent only: sizing, falls and sign-off stay with the licensed plumber.
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


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'house_r1.json'
    h = hl.load(os.path.join(hl.ROOT, src))
    pl = h.get('services', {}).get('plumbing')
    if not pl:
        print('no services in', src)
        return 0
    runs, stacks, chambers = pl['runs'], {s['id']: s for s in pl['stacks']}, {c['id']: c for c in pl['chambers']}
    rows = []

    def rule(name, status, detail=''):
        rows.append((status, name, detail))

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

    n = {k: sum(1 for r in rows if r[0] == k) for k in ('PASS', 'WARN', 'FAIL')}
    out = ['GH-18 services check (%s, %s)' % (src, pl.get('source', '')), pl.get('status', ''), '']
    out += ['%-5s %-52s %s' % r for r in rows]
    out += ['', 'RESULT: %s  (%d pass, %d warn, %d fail)' % ('FAIL' if n['FAIL'] else 'PASS', n['PASS'], n['WARN'], n['FAIL'])]
    text = '\n'.join(out)
    print(text)
    out_dir = os.path.join(hl.ROOT, 'plans', 'r1' if src == 'house_r1.json' else '')
    with open(os.path.join(out_dir, 'services_report.txt'), 'w') as fp:
        fp.write(text + '\n')
    return 1 if n['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
