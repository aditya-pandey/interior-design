"""Revision R1 (owner changes, Oct 2026): house.json + the patches below, written to house_r1.json.

house.json (the version on the main site) is never edited by this script. Each change is a
small function tagged with its item in the R1 brief (ASSUMPTIONS.md section E), applied in order.
Run:  python3 tools/build_r1.py && python3 tools/check_dims.py house_r1.json && python3 tools/plans.py house_r1.json plans/r1
"""
import copy
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_house as base  # noqa: E402  (builds the base model in memory, writes nothing)

OUT = os.path.join(HERE, '..', 'house_r1.json')


def a1_orientation(h):
    """A1: north is the road side (consultant drawings, Oct 2026). The side walls are party walls
    with GH-17 (east, left on plan) and GH-19 (west, right on plan)."""
    h['meta'].update(
        entrance_faces='N (road side), per the Vastu / electrical / plumbing drawings of Oct 2026',
        north_vector=[0, 1],
        north_note='front (+y, road side) faces North; the left side (-x) is East, the right side (+x) is West',
        north_label=['N (road side,', 'per consultant drawings)'],
    )


def a2_units(h):
    """A2: show dimensions in feet-inches with metres in brackets (model stays in mm)."""
    h['meta']['display_units'] = 'ft-in (m)'


# ---------------------------------------------------------------- helpers
F, O = base.F, base.O
XL_IN, XR_IN = base.XL_IN, base.XR_IN


def floor(h, fid):
    return next(f for f in h['floors'] if f['id'] == fid)


def find(items, iid):
    return next(x for x in items if x['id'] == iid)


def drop(items, *ids):
    missing = set(ids) - {x['id'] for x in items}
    assert not missing, missing
    items[:] = [x for x in items if x['id'] not in ids]


def opening(wall, oid):
    return next(o for o in wall['openings'] if o['id'] == oid)


def rename(room, name, was, note, **kw):
    room.update(name=name, was=was, brief_change=True, note=note, **kw)
    room.pop('label_name', None)


# ---------------------------------------------------------------- B: ground floor

def b3_family_lounge(h):
    """B3: drawing room -> Family Lounge. TV + AC on the west (fluted walnut) wall with the sofa facing it
    (electrical Rev A, A2); dining kept; a small hand-wash basin in the niche by the kitchen wall."""
    gf = floor(h, 'GF')
    rename(find(gf['rooms'], 'GF-DRW'), 'Family Lounge', 'Drawing', 'R1-B3: TV on the west wall, sofa facing it; lawn glass to the south',
           label_at=[4300, 6500])
    drop(gf['furniture'], 'GF-F01', 'GF-F02', 'GF-F03', 'GF-F04', 'GF-F05', 'GF-F06', 'GF-F08', 'GF-F09', 'GF-F10', 'GF-F19')
    gf['furniture'] += [
        F('GF-F01', 'GF-DRW', 'sofa_l', (6000, 7083), (2600, 1500, 800), 270, chaise='+x', note='faces the TV; chaise toward the lawn glass'),
        F('GF-F02', 'GF-DRW', 'coffee_table', (7350, 7083), (1100, 600, 380), 270),
        F('GF-F03', 'GF-DRW', 'rug', (7000, 7083), (2800, 2400, 10), 0),
        F('GF-F04', 'GF-DRW', 'tv_unit', (8926, 7083), (1800, 400, 450), 90, note='TV + data on the west wall (electrical Rev A, A2)'),
        F('GF-F08', 'GF-DRW', 'floor_lamp', (4900, 5950), (400, 400, 1650), 0),
        F('GF-F09', 'GF-DRW', 'planter', (8950, 5880), (450, 450, 1400), 0),
        F('GF-F10', 'GF-DRW', 'planter', (3600, 5950), (450, 450, 1400), 0),
        F('GF-F19', 'GF-DIN', 'crockery_unit', (3525, 8600), (1400, 450, 2100), 270, note='R1-B3: on the kitchen wall, freeing the niche for the basin'),
        F('GF-F24', 'GF-DIN', 'vanity', (3750, 11140), (700, 450, 850), 180, mirror=True,
          note='R1-B3 hand-wash basin by the dining; drains into the GF toilet line behind the wall'),
    ]


def b4_kitchen_wash(h):
    """B4: no construction outside the house (rear setback). The walled wash area, its gate and the kitchen
    back door go; GL-4 returns to its R0 position; the deck is paving only. Utensil washing moves inside: the
    north strip of the kitchen becomes a wash nook (double sink, drainer, dish rack) venting into the OTS, which
    also puts the sink on the kitchen's north side (red-line 7). Hob stays on the east wall (cook faces east)."""
    gf = floor(h, 'GF')
    drop(gf['walls'], 'GF-S1', 'GF-S2')
    drop(gf['outdoor'], 'GF-UTIL')
    drop(gf['furniture'], 'GF-O06', 'GF-O08', 'GF-K07', 'GF-K10')
    w01 = find(gf['walls'], 'GF-W01')
    drop(w01['openings'], 'GF-D3d')
    opening(w01, 'GF-GL4').update(offset=647, note='R1-B4: back at its R0 position over the prep counter')
    deck = find(gf['outdoor'], 'GF-DECK')
    deck.update(polygon=[[XL_IN, 2814], [XR_IN, 2814], [XR_IN, 5515], [XL_IN, 5515]],
                note='R1-B4: paving across the full width; no walls or roof added outside the house (pergola kept, as before D-02)')
    gf['pergola'].update(posts=[[2489, 2964], [4659, 2964], [6830, 2964], [9001, 2964]],
                         beam=dict(a=[2414, 2964], b=[XR_IN, 2964], size=[100, 250]), ledger=dict(a=[2339, 5490], b=[XR_IN, 5490]))
    ots4 = find(gf['walls'], 'GF-OTS4')
    ots4['openings'].append(O('GF-KW1', 'KW-1', 'window', 50, 500, 600, 1050, note='R1-B4 wash-nook vent window + exhaust into the OTS'))
    h['schedule']['unscheduled']['KW-1'] = {'desc': 'R1-B4 wash-nook vent window into the OTS, 500 x 600, sill 1050, with exhaust fan.'}
    find(gf['furniture'], 'GF-K01')['note'] = 'rear run: prep counter (R1-B4: sink moved to the north wash nook)'
    find(gf['rooms'], 'GF-KIT')['note'] = 'R1-B4 closed U-kitchen; north strip = wash nook (double sink) venting into the OTS'
    gf['furniture'] += [
        F('GF-K10', 'GF-KIT', 'counter', (2090, 11065), (2100, 600, 900), 180, note='R1-B4 wash nook: double-bowl sink + drainer'),
        F('GF-K07', 'GF-KIT', 'sink', (1700, 11065), (1000, 450, 200), 180, z=700, note='double bowl; DW point beside it'),
        F('GF-K13', 'GF-KIT', 'wall_cabinet', (2090, 11190), (2100, 350, 700), 180, z=1500, note='dish rack / drainer cabinet'),
    ]


def b5_guest_lounge(h):
    """B5: Mandir + Store -> Guest Lounge / Study (NW). Work table on the east wall, user facing east, with data
    and UPS (electrical Rev A, A7); 2-seater sofa facing the TV on the west wall; a settee (sethi) on the south wall."""
    gf = floor(h, 'GF')
    rename(find(gf['rooms'], 'GF-MND'), 'Guest Lounge / Study', 'Mandir + Store', 'R1-B5 (R0: Study Room): desk, sofa + settee, TV',
           label_at=[7650, 18300])
    drop(gf['furniture'], 'GF-M01', 'GF-M02', 'GF-M03', 'GF-M04', 'GF-M05')
    gf['furniture'] += [
        F('GF-M01', 'GF-MND', 'study_desk', (6380, 18850), (1400, 600, 750), 270, note='desk on the east wall: user faces east'),
        F('GF-M02', 'GF-MND', 'study_chair', (6980, 18850), (550, 550, 900), 90),
        F('GF-M03', 'GF-MND', 'sofa', (6505, 17300), (1600, 850, 800), 270, note='2-seater facing the TV'),
        F('GF-M04', 'GF-MND', 'tv_unit', (8951, 17300), (1500, 400, 450), 90, note='TV on the west wall'),
        F('GF-M05', 'GF-MND', 'settee', (8200, 15650), (1800, 750, 450), 0, note='sethi / diwan with bolsters'),
        F('GF-M06', 'GF-MND', 'coffee_table', (7650, 17300), (900, 500, 380), 270),
        F('GF-M07', 'GF-MND', 'rug', (7700, 17100), (2200, 1800, 10), 0),
        F('GF-M08', 'GF-MND', 'planter', (8900, 19400), (450, 450, 1300), 0),
    ]


def b6_mandir(h):
    """B6: a small mandir per Vastu: NE corner of the guest room (red-line 2), on the east wall so the devotee
    faces east; a floating walnut unit with a backlit jaali, clear of the bed's side table."""
    gf = floor(h, 'GF')
    gf['furniture'].append(F('GF-G08', 'GF-GST', 'mandir_wall', (405, 18630), (600, 350, 1100), 270, z=800,
                             note='R1-B6 small mandir, NE corner; devotee faces east'))
    find(gf['rooms'], 'GF-GST')['note'] = 'R1-B6: small mandir in the NE corner; wardrobe on the south wall (red-line 2)'


def b7_under_stair(h):
    """B7: storage under the stair. The DB/panel leaves the centre of the house (Brahmasthan, red-line 4) for an
    enclosed cabinet on the kitchen east wall (SE zone, electrical Rev A A3); the inverter, battery and network rack
    get a ventilated bay under the landing (A5). Store door now opens out so it clears the cupboards."""
    gf = floor(h, 'GF')
    rename(find(gf['rooms'], 'GF-JAN'), 'Under-stair Storage', 'Electrical Panel & Janitor', 'R1-B7: cupboards cut to the stair soffit; inverter/network bay',
           label_at=[8525, 14000])
    drop(gf['furniture'], 'GF-J01', 'GF-J02', 'GF-J03', 'GF-K04')
    opening(find(gf['walls'], 'GF-W19'), 'GF-D3b').update(swing='-x', note='R1-B7 under-stair store; opens out to the lobby')
    gf['furniture'] += [
        # under the second flight: heights follow the soffit (flight F2 rises from +1650 at x 7899 to +3300 at x 5899)
        F('GF-J01', 'GF-JAN', 'storage_tall', (6480, 14824), (800, 600, 2250), 180, note='full-height cupboard'),
        F('GF-J02', 'GF-JAN', 'storage_tall', (7280, 14824), (800, 600, 1600), 180, note='cupboard under the lower soffit'),
        F('GF-J03', 'GF-JAN', 'shelf', (8525, 13090), (1100, 450, 1400), 0, note='inverter + battery + network rack (ventilated)'),
        F('GF-J04', 'GF-JAN', 'storage_tall', (8525, 14824), (1100, 600, 1400), 180, note='low cupboard under the landing'),
        # kitchen: fridge/oven tower narrowed to make room for the DB cabinet
        F('GF-K04', 'GF-KIT', 'tall_unit', (530, 10051), (800, 600, 2250), 270, note='fridge + oven tower'),
        F('GF-K12', 'GF-KIT', 'storage_tall', (530, 9451), (400, 600, 2250), 270, note='DB-1, enclosed cabinet (electrical Rev A A3, red-line 4)'),
    ]


# ---------------------------------------------------------------- C: first floor

def c8_pantry(h):
    """C8: the full-height lobby cupboard by the lift becomes a pantry: stone counter with storage above,
    kept 250 mm clear of the lift door."""
    ff = floor(h, 'FF')
    drop(ff['furniture'], 'FF-L01')
    ff['furniture'] += [
        F('FF-L01', 'FF-LOB', 'counter', (6200, 11149), (1500, 600, 900), 0, note='R1-C8 pantry counter (kettle / microwave points)'),
        F('FF-L05', 'FF-LOB', 'wall_cabinet', (6200, 11024), (1500, 350, 750), 0, z=1500, note='pantry storage above the counter'),
    ]


def c9_kids_toilet_back(h):
    """C9: D-03 reverted. The kids-room toilet returns beside the stair, where the plumbing sheet's SS-3 stack and
    red-line 15 (WNW toilet, retain) expect it; GL-10 is a bedroom window again. The D-04 room swap stays: the
    study desk along GL-9 now faces north (red-line 8: desk facing N or E)."""
    ff = floor(h, 'FF')
    W = base.W
    walls = ff['walls']
    i19 = walls.index(find(walls, 'FF-W19'))
    walls[i19] = W('FF-W19', (5973, 15306), (5973, 16956), 150, 'internal', 'new', note='R1-C9 kids toilet west wall (as R0)')
    i20 = walls.index(find(walls, 'FF-W20'))
    walls[i20] = W('FF-W20', (5900, 16880), (XR_IN, 16880), 150, 'internal', 'new',
                   openings=[O('FF-D3c', 'D3', 'door', 298, 800, 2400, 0, hinge='a', swing='-y', note='kids room -> kids toilet')])
    i6 = walls.index(find(walls, 'FF-GL6b'))
    walls[i6] = W('FF-GL6b', (8050, 15306), (8050, 16805), 10, 'glass_partition', 'new', h=2000,
                  openings=[O('FF-GL6bd', 'GL-6b', 'glass_door', 799, 700, 2000, 0, hinge='b', swing='-x')])
    opening(find(walls, 'FF-W27'), 'FF-GL10').pop('note', None)
    arcpts, C_ARC2, R_ARC2, C_GL9, R_GL9 = base.arcpts, base.C_ARC2, base.R_ARC2, base.C_GL9, base.R_GL9
    kid = find(ff['rooms'], 'FF-KID')
    kid['polygon'] = ([[4371, 15456], [5900, 15456], [5900, 16956], [XR_IN, 16956], [XR_IN, 21215]] + arcpts(C_ARC2, R_ARC2 - 150, 88.4, 102.7) +
                      [[6869, 21146]] + arcpts(C_GL9, R_GL9 - 75, 106.0, 117.3) + [[4924, 20171], [4371, 20006]])
    kid['note'] = 'R1-C9: toilet back beside the stair; study desk along GL-9 faces north (road side)'
    ktl = find(ff['rooms'], 'FF-KTL')
    ktl.update(polygon=[[6048, 15305], [XR_IN, 15305], [XR_IN, 16805], [6048, 16805]],
               note='R1-C9 back at its R0 place (WNW, red-line 15); stack SS-3 in a boxed duct')
    drop(ff['furniture'], 'FF-T11', 'FF-T12', 'FF-T13', 'FF-K03', 'FF-K04', 'FF-K05', 'FF-K07', 'FF-K12')
    ff['furniture'] += [
        F('FF-T11', 'FF-KTL', 'vanity', (6580, 15606), (1065, 600, 850), 0, mirror=True),
        F('FF-T12', 'FF-KTL', 'wc_wall_hung', (7562, 15586), (380, 560, 400), 0),
        F('FF-T13', 'FF-KTL', 'shower_head', (8620, 15700), (250, 250, 50), 0, z=2150),
        F('FF-K03', 'FF-KID', 'bed_queen', (8101, 19084), (1620, 2100, 1100), 90, mattress=[1524, 1981]),
        F('FF-K04', 'FF-KID', 'side_table', (8926, 18024), (500, 450, 500), 90),
        F('FF-K05', 'FF-KID', 'side_table', (8926, 20144), (500, 450, 500), 90),
        F('FF-K07', 'FF-KID', 'storage_tall', (7700, 17180), (1200, 450, 2400), 0, note='books + toys'),
        F('FF-K12', 'FF-KID', 'rug', (7300, 19084), (2400, 3000, 10), 0),
    ]


def c10_master_suite(h):
    """C10: master washroom and dresser swapped, with a bath tub (owner decision; red-line 11 advised keeping the
    toilet in its sunken area - hold point: new sunken floor over the kitchen, waterproofing + flood test, SS-2
    re-planned). Route: bedroom -> dresser -> washroom.
    Washroom (old dresser zone, ~9'-1" x 5'-7"): tub with over-tub shower on the west side, WC on the east wall by
    the OTS (drains to the OTS stack SS-1), basin on the south wall, vent window + exhaust into the OTS.
    Dresser (old washroom zone, ~9'-1" x 9'-8"): lit by GL-4, dressing mirror on the east wall (red-line 12),
    wardrobes, window bench."""
    ff = floor(h, 'FF')
    walls = ff['walls']
    opening(find(walls, 'FF-W07'), 'FF-D2a').update(offset=685, hinge='a', swing='-x', note='R1-C10 master bedroom -> dresser')
    opening(find(walls, 'FF-W08'), 'FF-D3a').update(offset=1159, hinge='a', swing='+y', note='R1-C10 dresser -> master washroom')
    opening(find(walls, 'FF-W01'), 'FF-GL4')['note'] = 'R1-C10 now the dresser window'
    find(walls, 'FF-OTS1').setdefault('openings', []).append(
        O('FF-MW1', 'KW-1', 'window', 1015, 500, 600, 1500, note='R1-C10 master washroom vent window + exhaust into the OTS'))
    drop(walls, 'FF-GL6')
    walls.append(base.W('FF-GL6', (2243, 9800), (2243, 10669), 10, 'glass_partition', 'new', h=2000, note='R1-C10 over-tub shower screen'))
    mtl, drs = find(ff['rooms'], 'FF-MTL'), find(ff['rooms'], 'FF-DRS')
    mtl.update(name='Master Washroom', polygon=[[XL_IN, 8755], [2993, 8755], [2993, 10669], [1031, 10669], [1031, 10451], [XL_IN, 10451]],
               brief_change=True, was='Dresser', note='R1-C10: bath tub with shower over, WC by the OTS, vent into the OTS; hold point: new sunken floor over the kitchen')
    drs.update(polygon=[[XL_IN, 5665], [2993, 5665], [2993, 8605], [XL_IN, 8605]], brief_change=True, was='Master Toilet',
               note='R1-C10: walk-in dresser lit by GL-4; mirror on the east wall (red-line 12)')
    drop(ff['furniture'], 'FF-T01', 'FF-T02', 'FF-T03', 'FF-D01', 'FF-D02', 'FF-D03', 'FF-D04', 'FF-M06')
    ff['furniture'] += [
        # washroom
        F('FF-T01', 'FF-MTL', 'bathtub', (2618, 9712), (1700, 750, 560), 90, note='1700 x 750 tub, shower over'),
        F('FF-T03', 'FF-MTL', 'shower_head', (2850, 10400), (250, 250, 50), 0, z=2150),
        F('FF-T02', 'FF-MTL', 'wc_wall_hung', (510, 10050), (380, 560, 400), 270, note='by the OTS: soil to SS-1'),
        F('FF-T04', 'FF-MTL', 'vanity', (780, 9030), (1000, 550, 850), 0, mirror=True),
        # dresser
        F('FF-D01', 'FF-DRS', 'dressing_table', (455, 6350), (1100, 450, 750), 270, mirror=True, note='mirror on the east wall'),
        F('FF-D02', 'FF-DRS', 'wardrobe', (530, 7755), (1700, 600, 2700), 270),
        F('FF-D03', 'FF-DRS', 'wardrobe', (1110, 8305), (560, 600, 2700), 180),
        F('FF-D05', 'FF-DRS', 'wardrobe', (2593, 8305), (800, 600, 2700), 180),
        F('FF-D04', 'FF-DRS', 'pouf', (1700, 7300), (600, 600, 420), 0),
        F('FF-D06', 'FF-DRS', 'storage_bench', (1608, 5890), (1460, 450, 450), 0, note='window bench under GL-4'),
        # master bedroom TV moved along the wall for the new dresser door
        F('FF-M06', 'FF-MST', 'tv_unit', (3343, 8550), (1800, 400, 450), 270),
    ]


# ---------------------------------------------------------------- D: second floor + roof

def d11_utility_terrace(h):
    """D11: an open utility on the covered back terrace instead of the enclosed washing room: washer-dryer,
    utility sink, ironing counter and tall storage against the wall right outside the lobby door, draining to the
    OTS stack beside it; two drying racks under the polycarbonate roof. The old washing room becomes a store.
    Terrace zoning per the plumbing sheet: heavy items S/SW, N/NE (front terrace) kept open. With a second floor
    the overhead tank and the solar heater go on the SF roof (head for every floor, incl. the SF washroom, without
    a booster pump); AC outdoor units along the rear parapet of the back terrace."""
    sf = floor(h, 'SF')
    drop(sf['furniture'], 'SF-W01', 'SF-W02', 'SF-W03', 'SF-W04')
    rename(find(sf['rooms'], 'SF-WSH'), 'Store', 'Washing Area', 'R1-D11 linen / utility store (washing moved out to the terrace)')
    opening(find(sf['walls'], 'SF-W06'), 'SF-PD2a')['note'] = 'lobby -> store'
    trb = find(sf['rooms'], 'SF-TRB')
    trb.update(name='Back Terrace + Utility (covered)', label_at=[4700, 7600],
               note='R1-D11 open utility along the SF wall + drying under the polycarbonate roof; AC outdoor units on the rear parapet')
    sf['furniture'] += [
        F('SF-U01', 'SF-TRB', 'washer_dryer', (1331, 10369), (600, 600, 1750), 180, note='front-load washer + dryer'),
        F('SF-U02', 'SF-TRB', 'utility_counter', (2131, 10369), (1000, 600, 900), 180, sink=True, note='utility sink; drains to SS-1 in the OTS'),
        F('SF-U03', 'SF-TRB', 'ironing_station', (3231, 10444), (1100, 450, 900), 180, note='ironing counter with storage below'),
        F('SF-U04', 'SF-TRB', 'storage_tall', (4081, 10369), (600, 600, 2100), 180, note='detergents, iron, utility'),
        F('SF-T11', 'SF-TRB', 'drying_rack', (4700, 8200), (1800, 600, 1500), 0),
        F('SF-S11', 'SF-WSH', 'storage_tall', (3150, 12513), (1400, 600, 2400), 180, note='linen'),
        F('SF-S12', 'SF-WSH', 'shelf', (2643, 11500), (1200, 450, 2100), 270),
    ]
    for i, x in enumerate((5975, 6800, 7775, 8540)):      # in the bays between the canopy posts at x 5450 / 7300 / 9000
        sf['furniture'].append(F('SF-AC%d' % (i + 1), 'SF-TRB', 'ac_odu', (x, 6955), (750, 300, 600), 0, note='AC outdoor unit (S/SW zone)'))
    # on the SF roof (z = height above the SF floor; on_roof puts them with the roof in the viewer)
    roof = h['levels']['ROOF']['ffl'] - h['levels']['SF']['ffl']
    sf['furniture'] += [
        F('SF-R01', 'SF-LOB', 'water_tank', (6300, 11600), (1400, 1400, 1900), 0, z=roof, on_roof=True,
          note='overhead tank 2000 L on a 300 stand, south-west part of the roof beside the lift overrun'),
        F('SF-R02', 'SF-LOB', 'solar_heater', (3000, 11500), (2100, 1600, 1500), 180, z=roof, on_roof=True,
          note='solar water heater facing south; hot water to the master washroom + kitchen'),
    ]


# ---------------------------------------------------------------- E: services (design intent; positions indicative)

def e12_plumbing(h):
    """E12 plumbing: the Plumbing Rev A intent re-applied to the R1 layout (it was drawn on R0).
    Points are [x, y, z] in mm, z absolute from natural ground (GF FFL +450, FF +3750, SF +7050, roof +10350).
    Kinds: soil, waste, vent, cold, hot, pumped, rain, sewer. Fixture ends come from the furniture in this file."""
    fur = {f['id']: f for fl in h['floors'] for f in fl['furniture']}
    at = lambda fid, z: [*fur[fid]['pos'], z]  # noqa: E731
    SS1, SS3 = (450, 11100), (8950, 15420)
    OHT = fur['SF-R01']['pos']
    roof = h['levels']['ROOF']['ffl']
    stacks = [
        dict(id='SS-1', kind='soil', dia=110, at=list(SS1), z=[-300, roof + 1000],
             serves='GF toilet, dining basin, kitchen wash nook (via GT-1), FF master washroom, FF bedroom-3 toilet, SF servant washroom, SF utility',
             note='in the OTS (open to sky); 50 mm vent 1 m above the roof'),
        dict(id='SS-3', kind='soil', dia=110, at=list(SS3), z=[-300, 7050 + 1300], serves='FF kids toilet',
             note='boxed duct in the SW corner of the GF guest lounge; vent above the front terrace parapet'),
    ]
    chambers = [
        dict(id='IC-2', type='inspection', at=[150, 11700], size=[600, 600], depth=700, area='OTS', note='SS-1 + GT-1 discharge'),
        dict(id='GT-1', type='grease_trap', at=[150, 12350], size=[450, 450], depth=500, area='OTS', note='kitchen wash-nook waste'),
        dict(id='CO-1', type='cleanout', at=[4800, 14200], size=[300, 300], depth=500, area='GF lobby', note='sealed double-seal access cover'),
        dict(id='CO-2', type='cleanout', at=[4800, 18000], size=[300, 300], depth=580, area='GF lobby / foyer', note='sealed double-seal access cover'),
        dict(id='IC-3', type='inspection', at=[5300, 20300], size=[600, 600], depth=800, area='entrance court'),
        dict(id='IC-4', type='inspection', at=[8700, 20300], size=[600, 600], depth=700, area='parking', note='heavy-duty cover; SS-3'),
        dict(id='IC-5', type='inspection', at=[7600, 21900], size=[600, 600], depth=900, area='parking', note='heavy-duty cover; the only connection to the municipal sewer'),
        dict(id='RWH', type='rwh_pit', at=[4500, 21400], size=[1200, 1200], depth=2000, area='entrance court', note='rainwater harvesting + recharge; overflow to the storm drain'),
        dict(id='UGT', type='tank', at=[900, 21100], size=[1500, 1200], depth=1500, area='front lawn (NE)', note='5000 L underground tank, sealed manhole; pump PP 0.5-1 HP'),
    ]
    runs = []

    def run(rid, kind, dia, pts, serves=''):
        runs.append(dict(id=rid, kind=kind, dia=dia, pts=[list(map(round, p)) for p in pts], serves=serves))

    SLOPE = {'sewer': 1 / 50, 'soil': 1 / 40, 'waste': 1 / 50, 'rain': 1 / 100}   # minimum falls (110 mm sewer: 1:40)

    def drain(rid, kind, dia, pts, serves='', outfall=False):
        """Gravity run: the first point's z is the start invert; every later z is computed from the length run so far
        at the kind's fall (any z given after the first point is ignored)."""
        fall = (1 / 40 if (kind, dia) == ('sewer', 110) else SLOPE[kind]) * 1.1      # 10% margin over the minimum
        out, z = [list(pts[0])], pts[0][2]
        for p0, p1 in zip(pts, pts[1:]):
            z = math.floor(z - math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * fall)      # round down per segment, never under the fall
            out.append([p1[0], p1[1], z])
        run(rid, kind, dia, out, serves)
        if outfall:
            runs[-1]['outfall'] = True
        return out[-1][2]

    s1 = lambda z: [*SS1, z]  # noqa: E731
    s3 = lambda z: [*SS3, z]  # noqa: E731
    # ---- GF (in the plinth, falling to IC-2 / GT-1)
    drain('GF-S1', 'soil', 110, [at('GF-T01', 300), [900, 11900, 120], [150, 11700, -200]], 'GF toilet WC -> IC-2')
    drain('GF-W1', 'waste', 75, [at('GF-T03', 330), [3000, 12300, 300], [1300, 12200, 260], [900, 12000, 130], [150, 11700, -180]], 'GF toilet basin + shower -> IC-2')
    drain('GF-W2', 'waste', 50, [at('GF-F24', 380), [3750, 11600, 340], [3000, 12300, 300]], 'dining hand-wash basin -> GF toilet line')
    drain('GF-W3', 'waste', 75, [at('GF-K07', 380), [1031, 11000, 300], [500, 11600, 100], [150, 12350, -150]], 'kitchen wash nook -> GT-1')
    drain('GF-W4', 'waste', 75, [[150, 12350, -250], [150, 11700, -300]], 'GT-1 -> IC-2')
    # ---- FF (in sunken floors, into SS-1 / SS-3)
    drain('FF-S1', 'soil', 110, [at('FF-T02', 3550), [500, 10700, 3500], s1(3450)], 'FF master washroom WC -> SS-1')
    drain('FF-W1', 'waste', 75, [at('FF-T01', 3580), [1500, 9950, 3560], [700, 10400, 3530], s1(3500)], 'FF master tub + basin -> SS-1')
    drain('FF-W1b', 'waste', 50, [at('FF-T04', 3580), [1500, 9950, 3560]], 'FF master basin')
    drain('FF-S2', 'soil', 110, [at('FF-T21', 3550), [1500, 11150, 3500], s1(3450)], 'FF bedroom-3 toilet WC -> SS-1')
    drain('FF-W2', 'waste', 75, [at('FF-T22', 3580), [3300, 11400, 3570], at('FF-T23', 3560), [900, 11200, 3520], s1(3500)], 'FF bedroom-3 toilet basin + shower -> SS-1')
    drain('FF-S3', 'soil', 110, [at('FF-T12', 3550), [8700, 15500, 3500], s3(3450)], 'FF kids toilet WC -> SS-3')
    drain('FF-W3', 'waste', 75, [at('FF-T11', 3580), [7000, 15900, 3570], at('FF-T13', 3560), s3(3500)], 'FF kids toilet basin + shower -> SS-3')
    # ---- SF
    drain('SF-S1', 'soil', 110, [at('SF-S05', 6850), [1000, 11150, 6800], s1(6750)], 'SF servant washroom WC -> SS-1')
    drain('SF-W1', 'waste', 75, [at('SF-S06', 6880), at('SF-S07', 6860), [900, 11500, 6820], s1(6800)], 'SF servant basin + shower -> SS-1')
    drain('SF-W2', 'waste', 75, [at('SF-U02', 6900), at('SF-U01', 6880), [700, 10500, 6840], s1(6800)], 'SF utility sink + washer -> SS-1')
    # ---- sewer: IC-2 -> under GF toilet and lobby/foyer (sleeved, CO-1/CO-2) -> IC-3 -> IC-5 -> municipal; SS-3 -> IC-4 -> IC-5
    z = drain('SW-1', 'sewer', 150, [[150, 11700, -450], [1500, 12600], [4600, 13900], [4800, 14200], [4800, 18000], [4800, 18600], [5300, 20300]],
              'IC-2 -> CO-1 -> CO-2 -> IC-3 (sleeved; nothing under the guest room)')
    z = drain('SW-2', 'sewer', 150, [[5300, 20300, z - 20], [7600, 21900]], 'IC-3 -> IC-5')
    z4 = drain('SW-3', 'sewer', 110, [s3(-300), [8950, 19000], [8700, 20300]], 'SS-3 -> IC-4 (sleeved under the guest lounge)')
    z4 = drain('SW-4', 'sewer', 150, [[8700, 20300, z4 - 20], [7600, 21900]], 'IC-4 -> IC-5')
    drain('SW-5', 'sewer', 150, [[7600, 21900, min(z, z4) - 20], [7600, 23600]], 'IC-5 -> municipal sewer (confirm connection with RWA / MCG)', outfall=True)
    # ---- water: inlet -> UGT -> pump -> riser R-1 (E-wall chase + OTS) -> OHT on the SF roof; down-takes DT-1 (OTS) and DT-2 (SS-3 duct)
    run('W-IN', 'cold', 25, [[2500, 23600, -400], [2500, 22300, -400], [1400, 21700, -300]], 'municipal inlet with meter + check valve -> UGT (does not cross the sewer)')
    run('R-1', 'pumped', 32, [[900, 21100, -200], [330, 20000, -200], [330, 19300, 700], [330, 12800, 700], [100, 12500, 700],
                              [100, 12500, roof + 100], [OHT[0] - 700, OHT[1], roof + 100], [OHT[0] - 650, OHT[1], roof + 1500]], 'pumped riser to the OHT, in a boxed chase on the inner face of the east wall (not in the party wall, not across the guest room)')
    run('DT-1', 'cold', 32, [[OHT[0], OHT[1] - 600, roof + 400], [OHT[0], 11000, roof + 100], [300, 11000, roof + 100], [300, 11000, 900]],
        'down-take in the OTS: GF, FF and SF wet areas west of the stair')
    for rid, pts, what in [
        ('DT-1a', [[300, 11000, 1200], [1300, 12200, 1200], [2850, 12000, 1200], [3750, 11400, 1150]], 'GF toilet + dining basin'),
        ('DT-1b', [[300, 11000, 1100], [1700, 11000, 1100]], 'GF wash nook'),
        ('DT-1c', [[300, 11000, 4500], [500, 10300, 4500], [700, 9300, 4500], [2618, 9450, 4500]], 'FF master washroom'),
        ('DT-1d', [[300, 11000, 4600], [1650, 11300, 4600], [3820, 11300, 4600]], 'FF bedroom-3 toilet'),
        ('DT-1e', [[300, 11000, 7900], [1650, 11300, 7900]], 'SF servant washroom'),
        ('DT-1f', [[300, 11000, 7850], [600, 10500, 7850], [2131, 10500, 7850]], 'SF utility'),
    ]:
        run(rid, 'cold', 25, pts, what)
    run('DT-2', 'cold', 25, [[OHT[0] + 600, OHT[1], roof + 400], [OHT[0] + 600, 15300, roof + 100], [8950, 15300, roof + 100],
                             [8950, 15300, 4600], [7562, 15400, 4600], [6580, 15400, 4600]], 'down-take in the SS-3 duct: FF kids toilet')
    sol = fur['SF-R02']['pos']
    run('HW-1', 'hot', 25, [[sol[0], sol[1] - 600, roof + 1200], [sol[0], 10900, roof + 100], [400, 10900, roof + 100], [400, 10900, 4400],
                            [700, 9600, 4400], [2618, 9600, 4400]], 'solar hot water -> FF master washroom')
    run('HW-2', 'hot', 25, [[400, 10900, 4400], [400, 10900, 1250], [1700, 10950, 1250]], 'solar hot water -> GF kitchen wash nook')
    # ---- rain: terrace slope 1:100 to the north; 4 RWPs down the front face -> RWH pit; overflow -> storm drain
    rwp = [(300, 19300), (2950, 19560), (6870, 21300), (9100, 21420)]
    for i, (x, y) in enumerate(rwp):
        run('RWP-%d' % (i + 1), 'rain', 100, [[x, y, 7050], [x, y, -300]], 'terrace / balcony rainwater')
    drain('RW-C1', 'rain', 100, [[300, 19300, -300], [2950, 19560, -320], [4100, 21000, -380], [4500, 21400, -400]], 'RWP-1/2 -> RWH')
    drain('RW-C2', 'rain', 100, [[9100, 21420, -300], [6870, 21300, -330], [5100, 21450, -380], [4500, 21400, -400]], 'RWP-3/4 -> RWH')
    drain('RW-OF', 'rain', 100, [[4900, 21800, -300], [6300, 22420, -350]], 'RWH overflow -> 300 mm storm drain (no sewage)', outfall=True)
    h['services'] = dict(
        plumbing=dict(stacks=stacks, chambers=chambers, runs=runs,
                      source='Plumbing Layout Rev A (Oct 2026) re-applied to the R1 layout; SS-2 dropped (R1-C10 master washroom on SS-1)',
                      status='design intent - sizing, falls and municipal connection by the licensed plumbing consultant'),
    )


def e13_electrical(h):
    """E13 electrical: Electrical Layout Rev A (point schedule, circuits, DB positions) re-placed for R1.
    The sheet was drawn on R0, so its rules are kept and each point is set against the R1 furniture.
    Points: {id, kind, room, serves, at [x, y, z]} with z absolute like the plumbing (GF FFL +450 ...).
    Circuits are grouped per DB by the sheet's rules; conduit routes run in the slab above and drop to each
    point (loop-in), the outdoor ones buried at -300. AC refrigerant routes are drawn by hand."""
    lv = h['levels']
    fl_of = {fl['id']: fl for fl in h['floors']}
    rooms = {r['id']: r for fl in h['floors'] for r in fl['rooms']}
    areas = {a['id']: a for fl in h['floors'] for a in fl.get('outdoor', [])}
    fur = {f['id']: f for fl in h['floors'] for f in fl['furniture']}

    # ---- ODUs re-placed for R1 (party walls E/W: none on them; S/SW on the back terrace, else short routes)
    sf, gf = fl_of['SF'], fl_of['GF']
    drop(sf['furniture'], 'SF-AC2')
    fur['SF-AC1'].update(pos=[655, 5815], note='AC outdoor unit, SE corner of the back terrace (bedroom 3, via the OTS)')
    sf['furniture'] += [
        F('SF-AC5', 'SF-TRF', 'ac_odu', (8300, 15455), (750, 300, 600), 0, note='AC outdoor unit, kids room; NW of the front terrace against the stair wall'),
        F('SF-AC6', 'SF-TRF', 'ac_odu', (7400, 15455), (750, 300, 600), 0, note='AC outdoor unit, guest lounge / study; up the SS-3 duct'),
    ]
    gf['furniture'].append(F('GF-O08', 'GF-COURT', 'ac_odu', (2700, 19700), (750, 300, 600), 0, note='AC outdoor unit, guest room, front lawn (Electrical Rev A, A6)'))

    CEIL = ('light', 'pd', 'fan', 'sd', 'hd')
    HEIGHT = dict(sb=1200, sb2w=600, s6=300, s6c=1100, s16=300, usb=800, tv=1100, data=300, ac=2150, gy=1900, ef=2250, ml=2000,
                  ucl=1450, ch=2200, ip65=600, wl=2100, gl=600, cctv=2700, vdp=1400, vdpo=1500, ev=1200, iso=1500, mtr=1500,
                  db=1500, inv=400, rack=1200, pump=500, ups=900, spare=1500)
    pts = []
    w_tol = lambda p: 400  # noqa: E731  (half the thickest wall + the 20 mm stand-off)

    def P(kind, room, x, y, z=None, note='', serves=None, **kw):
        if room in rooms:
            fid, base = room[:2], lv[room[:2]]['ffl']
            ceil = (rooms[room].get('ceiling') or {}).get('height', 2750)
        elif room == 'ROOF':
            fid, base, ceil = 'SF', lv['ROOF']['ffl'], 0
        else:
            fid, base, ceil = room[:2], areas[room].get('z', 0), 2750
        if z is None:
            z = ceil if kind in CEIL else HEIGHT[kind]
        n = sum(1 for p in pts if p['floor'] == fid) + 1
        pts.append(dict(id='%s-E%02d' % (fid, n), kind=kind, floor=fid, room=room, serves=serves or room, at=[x, y, base + z], base=base, note=note, **kw))

    def bedside(room, wx, ty, usb=False):
        P('sb2w', room, wx, ty - 330, note='bedside 2-way + fan regulator')
        P('s6', room, wx, ty + 330, note='bedside socket')
        if usb:
            P('usb', room, wx, ty + 330, z=800, note='bedside USB')

    # ---------------- GF (DB-1 = main DB)
    K = 'GF-KIT'
    P('light', K, 1700, 7300); P('light', K, 1700, 9800)
    P('ucl', K, 430, 7757, note='under the east wall cabinets'); P('ucl', K, 2950, 7800, note='under the west wall cabinets')
    P('ucl', K, 2090, 11190, note='under the wash-nook cabinet (R1-B4)')
    P('hd', K, 1700, 8500, note='heat detector (A3)')
    P('sb', K, 3130, 9200, note='by the kitchen door')
    P('ch', K, 250, 7300, note='chimney over the hob on the east wall (A3), duct along the cabinets to the rear wall')
    P('s6c', K, 250, 8700, note='counter socket')
    P('s16', K, 3130, 7300, z=1100, note='microwave, west counter')
    P('s16', K, 250, 10051, note='fridge, in the tall unit')
    P('s16', K, 2850, 11345, note='dishwasher under the wash-nook counter, 0.65 m from the sink')
    P('ef', K, 2650, 5685, note='exhaust fan on the rear external wall (A3)')
    P('ef', K, 1051, 11050, z=1400, note='wash-nook exhaust into the OTS through KW-1 (R1-B4)')
    P('db', K, 250, 9451, note='DB-1 (main), 400 mm enclosed cabinet on the kitchen east wall, SE zone (A3, R1-B7)', tag='DB-1')
    L, D = 'GF-DRW', 'GF-DIN'
    P('light', L, 4800, 6400); P('light', L, 8200, 6400); P('light', D, 8200, 9700); P('light', D, 3900, 9700)
    P('pd', D, 5700, 9850, note='pendant over the dining table (A2)')
    P('fan', L, 7000, 7083)
    P('sd', L, 6000, 8400, note='smoke detector (A2)')
    P('ac', L, 9131, 7083, note='2 TR, west wall above the TV (A2)', tr=2.0)
    P('tv', L, 9131, 7083, note='TV + 5 A + data, west wall (A2)')
    P('s6', L, 9131, 8100); P('s6', L, 3320, 6600)
    P('sb2w', L, 3320, 5900, z=1200, note='2-way, lounge end by the lawn door (A2)')
    P('sb2w', D, 7400, 10746, z=1200, note='2-way, dining end on the lift wall (A2)')
    P('ml', D, 3750, 11345, note='mirror light over the dining basin (R1-B3)')
    T = 'GF-TLT'
    P('light', T, 3300, 12800); P('light', T, 1700, 12800)
    P('ef', T, 630, 12985, note='on the OTS wall (A4)')
    P('gy', T, 1500, 11535, note='high on the south wall, 0.7 m clear of the shower')
    P('s6', T, 4180, 12800, z=1100, note='0.68 m from the vanity, RCD (A4)')
    P('sb', 'GF-LOB', 4370, 12950, serves=T, note='toilet switches outside the door (A4)')
    B = 'GF-LOB'
    P('light', B, 5100, 12000); P('light', B, 5100, 15800)
    P('sd', B, 5100, 14000, note='smoke detector (A5)')
    P('sb2w', B, 7180, 12500, z=1200, note='2-way stair switching (A5)')
    J = 'GF-JAN'
    P('light', J, 7000, 14600, z=2100)
    P('sb', J, 6100, 14150)
    P('inv', J, 8525, 12885, note='inverter + battery on the ventilated rack (A5, R1-B7)', tag='INV')
    P('rack', J, 8525, 12885, note='network rack + router (A5)')
    Y = 'GF-FOY'
    P('light', Y, 5100, 18000); P('light', Y, 4800, 19300)
    P('vdp', Y, 5880, 17900, note='video door phone screen (A8)')
    P('sb', Y, 5880, 20100, note='by the main door')
    G = 'GF-GST'
    P('light', G, 1900, 15300); P('light', G, 1900, 18300); P('fan', G, 1900, 16845)
    P('ac', G, 1566, 19086, z=2450, note='1.5 TR, north wall above GL-1 (head 2400) (A6)', tr=1.5)
    P('tv', G, 4180, 16845, note='west wall facing the bed (A6)')
    P('s6', G, 4180, 15300)
    P('sb', G, 4180, 15850, note='by the door')
    P('sd', G, 1900, 16000, note='smoke detector (R1 addition)')
    bedside(G, 250, 15785); bedside(G, 250, 17905)
    P('wl', G, 250, 18630, z=1700, note='mandir niche light (R1-B6)')
    S = 'GF-MND'
    P('light', S, 7600, 16300); P('light', S, 7600, 18500); P('fan', S, 7600, 17300)
    P('ac', S, 8500, 15294, note='1.5 TR, south wall above the settee; refrigerant up the SS-3 duct', tr=1.5)
    P('tv', S, 9131, 17300, note='TV for the guest lounge (R1-B5)')
    P('s6', S, 6100, 18600, z=900, note='desk (A7)'); P('s6', S, 6100, 19100, z=900, note='desk (A7)')
    P('ups', S, 6100, 18850, note='UPS socket at the desk (A7)')
    P('data', S, 6100, 18350, z=900, note='Cat-6 at the desk (A7)')
    P('sb', S, 6100, 16600, note='by the door')
    P('sd', S, 7600, 16900, note='smoke detector (R1 addition)')
    # outside (DB-1, RCD)
    for x in (1200, 3600, 5900, 8200):
        P('gl', 'GF-LAWN-B', x, 1300, note='garden light')
    P('wl', 'GF-DECK', 250, 4200, note='pergola wall light'); P('wl', 'GF-DECK', 9131, 4200, note='pergola wall light')
    P('gl', 'GF-COURT', 2400, 21800, note='garden light'); P('gl', 'GF-COURT', 3900, 21300, note='garden light')
    P('wl', 'GF-COURT', 6000, 20750, note='gate light (A8)'); P('wl', 'GF-COURT', 6000, 21950, note='gate light (A8)')
    P('ip65', 'GF-LAWN-B', 9131, 3000, note='weatherproof socket, rear lawn (A1)')
    P('pump', 'GF-LAWN-B', 300, 2700, note='irrigation pump point (A1)', kw=0.75)
    P('cctv', 'GF-DECK', 9100, 5540, note='rear CCTV (A1)')
    P('cctv', 'GF-COURT', 5700, 22000, note='gate + street CCTV')
    P('vdpo', 'GF-COURT', 5900, 22050, note='outdoor VDP unit at the gate (A8)')
    P('mtr', 'GF-COURT', 5000, 22290, note='meter + main switch on the front boundary wall, read from the street', tag='MTR')
    P('pump', 'GF-COURT', 1800, 21100, note='UGT pump PP 0.5-1 HP (plumbing E12)', kw=0.75)
    P('ev', 'GF-PARK', 8600, 19916, note='EV charger 32 A under the FF overhang')

    # ---------------- FF (DB-2)
    M = 'FF-MST'
    P('light', M, 4300, 8200); P('light', M, 6000, 10000); P('light', M, 6000, 7500); P('fan', M, 6900, 8738)
    P('sd', M, 5500, 8738, note='smoke detector (B2)')
    P('ac', M, 9131, 7300, note='2 TR, west wall off the glazing (B2)', tr=2.0)
    P('tv', M, 3163, 8550)
    P('s6', M, 6000, 6825, note='by the lounge chair')
    bedside(M, 9131, 7473, usb=True); bedside(M, 9131, 10003, usb=True)
    P('sb', M, 5550, 10649, note='by the door')
    P('wl', 'FF-BAL', 5420, 6635, note='balcony wall light'); P('wl', 'FF-BAL', 9070, 6635, note='balcony wall light')
    P('gl', 'FF-BAL', 6600, 4900, z=300, note='planter light'); P('gl', 'FF-BAL', 8300, 4900, z=300, note='planter light')
    P('ip65', 'FF-BAL', 5420, 6635, note='weatherproof (B1/B9)'); P('ip65', 'FF-BAL', 9070, 6635, note='weatherproof (B1/B9)')
    R = 'FF-DRS'
    P('light', R, 1600, 7100)
    P('ml', R, 250, 6350, note='mirror light, east wall (B3/B4, red-line 12)')
    P('s6', R, 250, 6850, z=900, note='at the dressing table')
    P('db', R, 2973, 5950, note='DB-2 on the dresser west wall, SE zone of the plot. Rev A had it over DB-1, which is now the R1-C10 washroom', tag='DB-2')
    P('sb', R, 2973, 7500, note='by the door')
    W = 'FF-MTL'
    P('sb', R, 2973, 7700, serves=W, note='washroom switches outside, at the dresser door (B3)')
    P('light', W, 1300, 9900); P('light', W, 2600, 9300)
    P('ml', W, 780, 8775, note='mirror light over the vanity')
    P('ef', W, 530, 10431, z=1800, note='in KW-1 on the OTS wall (FF-MW1)')
    P('gy', W, 250, 9550, note='east wall, 2 m from the shower, high (B3)')
    P('s6', W, 1500, 10649, z=1100, note='0.75 m clear of the tub, RCD')
    T3 = 'FF-TL3'
    P('light', T3, 2600, 11800); P('ml', T3, 3820, 10869)
    P('ef', T3, 1051, 11100, note='on the OTS wall (B5)')
    P('gy', T3, 2920, 10869, note='above the WC, 1.3 m from the shower')
    P('sb', 'FF-BD3', 3203, 13250, serves=T3, note='toilet switches outside, in the bedroom niche (B5)')
    Lf = 'FF-LOB'
    P('light', Lf, 5100, 12100); P('light', Lf, 5100, 14300)
    P('sd', Lf, 5100, 13300, note='smoke detector')
    P('sb2w', Lf, 7178, 12600, z=1200, note='2-way stair switching')
    P('s6c', Lf, 5700, 10869, note='pantry counter (R1-C8)'); P('s6c', Lf, 6700, 10869, note='pantry counter (R1-C8)')
    P('ucl', Lf, 6200, 11150, note='under the pantry wall cupboards (R1-C8)')
    B3 = 'FF-BD3'
    P('light', B3, 2200, 14400); P('light', B3, 2200, 17800); P('fan', B3, 2200, 15576)
    P('sd', B3, 2200, 16700, note='smoke detector')
    P('ac', B3, 4249, 15100, note='1.5 TR, west wall; refrigerant through the toilet ceiling and the OTS (B6: E wall is a party wall)', tr=1.5)
    P('tv', B3, 4249, 15576)
    P('s6', B3, 4249, 16050)
    P('sb', B3, 4249, 14700, note='by the door')
    bedside(B3, 250, 14516); bedside(B3, 250, 16636)
    Kd = 'FF-KID'
    P('light', Kd, 6800, 18000); P('light', Kd, 6800, 20000); P('fan', Kd, 7300, 19084)
    P('sd', Kd, 6000, 18500, note='smoke detector (B8)')
    P('ac', Kd, 8710, 16975, z=2400, note='1.5 TR, south wall above the tall storage; ODU on the front terrace', tr=1.5)
    P('tv', Kd, 4944, 19084, face=[1, 0], note='TV niche in the wardrobe run, facing the bed')
    P('sb', Kd, 5878, 15700, note='by the door')
    bedside(Kd, 9131, 18024); bedside(Kd, 9131, 20144)
    P('s6', Kd, 5856, 20411, z=0, note='floor box under the study desk')
    P('data', Kd, 5856, 20300, z=0, note='Cat-6 in the desk floor box')
    Kt = 'FF-KTL'
    P('light', Kt, 7500, 16100)
    P('ef', Kt, 8600, 16100, z=2600, ceiling=True, note='ceiling fan ducted up to the front terrace: the west wall is the GH-19 party wall (B7)')
    P('gy', Kt, 7300, 16785, note='on the inner (north) wall, 1.6 m from the shower (B7)')
    P('sb', Kd, 7050, 16975, serves=Kt, note='toilet switches outside the door')

    # ---------------- SF (DB-3; the SF is not on R0, so these are R1 additions)
    Ls = 'SF-LOB'
    P('light', Ls, 5100, 12100); P('light', Ls, 5100, 14300)
    P('sd', Ls, 5100, 13300, note='smoke detector')
    P('sb2w', Ls, 7178, 12600, z=1200, note='2-way stair switching')
    P('iso', Ls, 7178, 11000, note='lift isolator at the top landing (machine-room-less lift)', kw=4.0)
    Sv = 'SF-SRV'
    P('light', Sv, 2500, 13700); P('fan', Sv, 1700, 14400)
    P('s6', Sv, 3600, 15286, z=900, note='at the desk'); P('s6', Sv, 250, 14100, z=600, note='bedside')
    P('sb', Sv, 4249, 14500, note='by the door')
    P('sd', Sv, 2500, 14300, note='smoke detector')
    P('db', Sv, 250, 13300, note='DB-3 for the SF + terrace, east wall (no indoor SE space on the SF)', tag='DB-3')
    Sw = 'SF-SWR'
    P('light', Sw, 1650, 11800)
    P('ef', Sw, 1051, 11200, note='on the OTS wall')
    P('gy', Sw, 1950, 10869, note='above the WC, 1.4 m from the shower')
    P('sb', Sv, 2050, 12983, serves=Sw, note='washroom switches outside the door')
    St = 'SF-WSH'
    P('light', St, 3300, 11800); P('sb', St, 4249, 12400)
    U = 'SF-TRB'
    P('s16', U, 1200, 10649, z=1100, note='washer-dryer, 0.68 m from the utility sink (R1-D11)')
    P('s6c', U, 3231, 10649, note='ironing counter (R1-D11)')
    P('ip65', U, 5600, 10649, note='terrace weatherproof socket')
    P('wl', U, 2600, 10649, z=2300, note='utility light'); P('wl', U, 7000, 10649, z=2300, note='terrace light')
    P('spare', U, 8800, 10649, note='solar PV inverter provision + spare conduit to the main panel')
    P('pump', 'ROOF', 5300, 11600, z=300, note='pressure pump on the feed to the SF washroom (services check: 1.45 m head)', kw=0.37)

    # wall-mounted points face into their room: unit plan normal of the nearest straight wall (for the 3D symbols)
    for p in pts:
        if 'face' in p or p['kind'] in CEIL or p.get('ceiling') or p['kind'] in ('gl', 'pump') or (p['kind'] in ('s6', 'data') and p['at'][2] == lv[p['floor']]['ffl']):
            continue
        best = None
        for w in fl_of[p['floor']]['walls']:
            if 'a' not in w:
                continue
            (ax, ay), (bx, by) = w['a'], w['b']
            L = math.hypot(bx - ax, by - ay)
            t = max(0, min(1, ((p['at'][0] - ax) * (bx - ax) + (p['at'][1] - ay) * (by - ay)) / L ** 2))
            qx, qy = ax + t * (bx - ax), ay + t * (by - ay)
            d = math.hypot(p['at'][0] - qx, p['at'][1] - qy)
            if best is None or d < best[0]:
                best = (d, (p['at'][0] - qx) / (d or 1), (p['at'][1] - qy) / (d or 1))
        if best and best[0] < w_tol(p):
            p['face'] = [round(best[1], 3), round(best[2], 3)]

    # ---------------- DBs, circuits
    DB = {p['tag']: p for p in pts if p['kind'] == 'db'}
    MTR = next(p for p in pts if p['kind'] == 'mtr')
    INV = next(p for p in pts if p['kind'] == 'inv')
    db_of = lambda p: DB['DB-1'] if p['floor'] == 'GF' else DB['DB-2'] if p['floor'] == 'FF' else DB['DB-3']  # noqa: E731
    outdoor = lambda p: p['room'] not in rooms or rooms[p['room']].get('kind') == 'outdoor'  # noqa: E731
    LIGHT = ('light', 'pd', 'fan', 'sd', 'hd', 'ml', 'ucl', 'wl', 'gl', 'ef', 'sb', 'sb2w')
    SOCK = ('s6', 's6c', 'usb', 'tv', 'ch', 'ip65')
    UPS = ('ups', 'cctv', 'vdp', 'vdpo', 'rack')
    circuits = []

    def circuit(cid, cls, db, members, **kw):
        circuits.append(dict(id=cid, cls=cls, db=db['tag'] if 'tag' in db else db['id'], points=[p['id'] for p in members], **kw))
        for p in members:
            p['circuit'] = cid

    def chunk(members, n):
        out, cur = [], []
        for p in members:
            if sum(1 for q in cur if q['kind'] not in ('sb', 'sb2w')) >= n and p['kind'] not in ('sb', 'sb2w'):
                out.append(cur)
                cur = []
            cur.append(p)
        return out + ([cur] if cur else [])

    count = {}

    def next_id(prefix):
        count[prefix] = count.get(prefix, 0) + 1
        return '%s%d' % (prefix, count[prefix])

    for tag in ('DB-1', 'DB-2', 'DB-3'):
        db = DB[tag]
        mine = [p for p in pts if db_of(p) is db and p['kind'] not in ('db', 'mtr', 'inv', 'data')]
        inside = [p for p in mine if not outdoor(p)]
        out = [p for p in mine if outdoor(p)]
        for grp in chunk([p for p in inside if p['kind'] in LIGHT], 10):
            circuit(next_id('L'), 'lighting', db, grp, mcb='10A', cable='1.5 sq mm', rcd=any(rooms[p['serves']]['name'].lower().find(w) >= 0 for p in grp for w in ('toilet', 'washroom')), backup=True)
        for grp in chunk([p for p in inside if p['kind'] in SOCK], 8):
            circuit(next_id('S'), 'sockets', db, grp, mcb='16A', cable='2.5 sq mm', rcd=True)
        if [p for p in out if p['kind'] in LIGHT]:
            circuit(next_id('L'), 'lighting', db, [p for p in out if p['kind'] in LIGHT], mcb='10A', cable='1.5 sq mm', rcd=True, backup=False, note='outdoor')
        if [p for p in out if p['kind'] in SOCK]:
            circuit(next_id('S'), 'sockets', db, [p for p in out if p['kind'] in SOCK], mcb='16A', cable='2.5 sq mm', rcd=True, note='outdoor')
        for p in mine:
            k = p['kind']
            if k == 's16':
                circuit(next_id('P'), 'power', db, [p], mcb='20A', cable='4 sq mm', rcd=True)
            elif k == 'gy':
                circuit(next_id('G'), 'geyser', db, [p], mcb='20A', cable='4 sq mm', rcd=True)
            elif k == 'ac':
                circuit(next_id('AC'), 'ac', db, [p], mcb='25A' if p['tr'] >= 2 else '20A', cable='4 sq mm', rcd=False)
            elif k == 'ev':
                circuit('EV', 'power', db, [p], mcb='40A (maker)', cable='6 sq mm (maker)', rcd=True, note='type A/B RCD per charger maker')
            elif k == 'iso':
                circuit('LIFT', 'power', DB['DB-1'], [p], mcb='as vendor (3-phase)', cable='as vendor', rcd=False)
            elif k in ('pump', 'spare'):
                circuit(next_id('PUMP') if k == 'pump' else 'SPARE', 'power', db, [p], mcb='as maker', cable='as maker', rcd=True)
    circuit('UPS', 'ups', INV, [p for p in pts if p['kind'] in UPS], mcb='16A', cable='2.5 sq mm', rcd=True, note='inverter backup: also the lighting circuits marked backup')
    circuit('DATA', 'data', INV, [p for p in pts if p['kind'] in ('data', 'tv')], mcb='-', cable='Cat-6', rcd=False, note='from the network rack')
    for p in pts:      # TV points are on a socket circuit and on the data run: keep the socket one as the power circuit
        if p['kind'] == 'tv':
            p['circuit'] = next(c['id'] for c in circuits if p['id'] in c['points'] and c['cls'] == 'sockets')

    # ---------------- conduit routes (loop-in, in the slab above; outdoor buried)
    byid = {p['id']: p for p in pts}
    SLAB = {'GF': lv['FF']['ffl'] - 150, 'FF': lv['SF']['ffl'] - 150, 'SF': lv['ROOF']['ffl'] - 150}
    routes = []
    for c in circuits:
        src = DB[c['db']] if c['db'] in DB else INV
        members = [byid[i] for i in c['points']]
        segs = []
        cur = src
        left = list(members)
        level = lambda p: -300 if outdoor(p) and p['floor'] == 'GF' else SLAB[p['floor']]  # noqa: E731
        trunk = [list(src['at'])]
        while left:
            nxt = min(left, key=lambda q: abs(q['at'][0] - cur['at'][0]) + abs(q['at'][1] - cur['at'][1]) + abs(level(q) - level(cur)) * 0.5)
            left.remove(nxt)
            za, zb = level(cur), level(nxt)
            if not trunk or trunk[-1][2] != za:
                trunk.append([cur['at'][0], cur['at'][1], za])
            trunk.append([nxt['at'][0], cur['at'][1], za])
            if za != zb:
                trunk.append([nxt['at'][0], cur['at'][1], zb])
            trunk.append([nxt['at'][0], nxt['at'][1], zb])
            segs.append([[nxt['at'][0], nxt['at'][1], zb], list(nxt['at'])])
            cur = nxt
        clean = [trunk[0]] + [q for a, q in zip(trunk, trunk[1:]) if q != a]
        routes.append(dict(circuit=c['id'], cls=c['cls'], trunk=clean, drops=segs))
    # sub-mains and refrigerant (by hand)
    sub = [
        dict(id='SM-1', frm='MTR', to='DB-1', note='4-core armoured, buried, sleeved under the lobby floor; clear of the sewer',
             pts=[MTR['at'], [5000, 22290, -450], [5700, 22290, -450], [5700, 17300, -450], [5700, 17300, 250], [5700, 10900, 250], [3400, 10900, 250],
                  [3400, 9451, 250], [250, 9451, 250], DB['DB-1']['at']]),
        dict(id='SM-2', frm='DB-1', to='DB-2', note='in the GF ceiling slab, up the dresser west wall',
             pts=[DB['DB-1']['at'], [250, 9451, SLAB['GF']], [250, 5950, SLAB['GF']], [2973, 5950, SLAB['GF']], DB['DB-2']['at']]),
        dict(id='SM-3', frm='DB-1', to='DB-3', note='in the GF ceiling slab, then a riser in the east-wall chase (guest room / bedroom 3 / servant room)',
             pts=[DB['DB-1']['at'], [250, 9451, SLAB['GF']], [1100, 9451, SLAB['GF']], [1100, 13300, SLAB['GF']], [330, 13300, SLAB['GF']],
                  [330, 13300, DB['DB-3']['at'][2]], DB['DB-3']['at']]),
        dict(id='SM-4', frm='DB-1', to='INV', note='inverter charger feed + UPS changeover',
             pts=[DB['DB-1']['at'], [250, 9451, SLAB['GF']], [8525, 9451, SLAB['GF']], [8525, 12885, SLAB['GF']], INV['at']]),
    ]
    acs = {p['room']: p for p in pts if p['kind'] == 'ac'}
    G0 = lambda r: lv[r[:2]]['ffl']  # noqa: E731
    ref = [
        dict(ac=acs['GF-DRW']['id'], odu='SF-AC3', note='out above the GL-5 head, up the balcony west wall (inside the plot), over the parapet',
             pts=[acs['GF-DRW']['at'], [9050, 7083, 3300], [9050, 5750, 3300], [9050, 5750, 8250], [9050, 6900, 8250], [7775, 6900, 8250], [7775, 6955, 7650]]),
        dict(ac=acs['FF-MST']['id'], odu='SF-AC4', note='straight up through the slab to the back terrace',
             pts=[acs['FF-MST']['at'], [9050, 7300, 6900], [9050, 7300, 7350], [8540, 7300, 7350], [8540, 6955, 7650]]),
        dict(ac=acs['FF-BD3']['id'], odu='SF-AC1', note='in the ceiling void, through the toilet ceiling into the OTS, up to the back terrace (drains via the OTS)',
             pts=[acs['FF-BD3']['at'], [4100, 15100, 6600], [4100, 12700, 6600], [700, 12700, 6600], [700, 12500, 6600], [700, 12500, 7350],
                  [700, 10300, 7350], [655, 6000, 7350], [655, 5815, 7650]]),
        dict(ac=acs['FF-KID']['id'], odu='SF-AC5', note='up through the slab to the front terrace',
             pts=[acs['FF-KID']['at'], [8710, 16975, 7350], [8300, 16975, 7350], [8300, 15455, 7650]]),
        dict(ac=acs['GF-MND']['id'], odu='SF-AC6', note='up the SS-3 boxed duct to the front terrace',
             pts=[acs['GF-MND']['at'], [8850, 15400, 2600], [8850, 15400, 7350], [7400, 15650, 7350], [7400, 15455, 7650]]),
        dict(ac=acs['GF-GST']['id'], odu='GF-O08', note='through the north wall, down to the front-lawn unit (A6)',
             pts=[acs['GF-GST']['at'], [1566, 19300, 3150], [2700, 19300, 3150], [2700, 19550, 3150], [2700, 19700, 650]]),
    ]
    for r in ref:
        r['length'] = round(sum(math.dist(a, b) for a, b in zip(r['pts'], r['pts'][1:])))
    h['services']['electrical'] = dict(
        source='Electrical Layout Rev A (Oct 2026) re-placed for the R1 layout; SF points added (SF not on R0)',
        status='design intent - final design, cable sizes, load sanction and test certificate by the licensed electrical contractor',
        points=pts, circuits=circuits, routes=routes, submains=sub, refrigerant=ref)


PATCHES = [a1_orientation, a2_units, b3_family_lounge, b4_kitchen_wash, b5_guest_lounge, b6_mandir, b7_under_stair,
           c8_pantry, c9_kids_toilet_back, c10_master_suite, d11_utility_terrace, e12_plumbing, e13_electrical]


def build():
    h = copy.deepcopy(base.house)
    h['meta']['revision'] = 'R1'
    h['meta']['revision_note'] = 'Owner changes of Oct 2026 on top of the main-site model; see ASSUMPTIONS.md section E'
    for patch in PATCHES:
        patch(h)
    return h


if __name__ == '__main__':
    h = build()
    with open(OUT, 'w') as f:
        f.write(base.dump(h) + '\n')
    print('wrote', os.path.normpath(OUT), '-', len(PATCHES), 'R1 patches')
