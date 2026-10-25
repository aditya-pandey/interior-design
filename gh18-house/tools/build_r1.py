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


PATCHES = [a1_orientation, a2_units, b3_family_lounge, b4_kitchen_wash, b5_guest_lounge, b6_mandir, b7_under_stair,
           c8_pantry, c9_kids_toilet_back, c10_master_suite, d11_utility_terrace, e12_plumbing]


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
