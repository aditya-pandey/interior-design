"""Author script for gh18-house/house.json.

Every coordinate of the existing house was measured from the vector PDF (28.53 mm
per PDF point, calibrated on 2921+6000 interior width, 4000 guest room and 5100
drawing depth) and then snapped to the PDF dimension strings. Client changes are
marked C-xx (see ASSUMPTIONS.md section D).

house.json is what everything reads; this script writes it. Edit here, then run
    python3 tools/build_house.py && python3 tools/check_dims.py && python3 tools/plans.py
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from houselib import arc_point

OUT = os.path.join(HERE, '..', 'house.json')

def W(id, a, b, t, kind='internal', status='new', h=None, base=None, openings=(), note=None, **kw):
    w = dict(id=id, a=list(a), b=list(b), t=t, kind=kind, status=status)
    if h is not None: w['h'] = h
    if base is not None: w['base'] = base
    if openings: w['openings'] = list(openings)
    if note: w['note'] = note
    w.update(kw)
    return w

def ARC(id, c, r, frm, to, t, kind='internal', status='new', h=None, base=None, openings=(), note=None, **kw):
    w = dict(id=id, arc=dict(c=list(c), r=r, **{'from': frm, 'to': to}), t=t, kind=kind, status=status)
    if h is not None: w['h'] = h
    if base is not None: w['base'] = base
    if openings: w['openings'] = list(openings)
    if note: w['note'] = note
    w.update(kw)
    return w

def O(id, mark, type, offset, width, height, sill=0, hinge=None, swing=None, leaves=1, note=None, **kw):
    o = dict(id=id, mark=mark, type=type, offset=offset, width=width, height=height, sill=sill)
    if hinge: o['hinge'] = hinge
    if swing: o['swing'] = swing
    if leaves != 1: o['leaves'] = leaves
    if note: o['note'] = note
    o.update(kw)
    return o

def F(id, room, type, pos, size, rot=0, z=0, **kw):
    f = dict(id=id, room=room, type=type, pos=list(pos), size=list(size), rot=rot)
    if z: f['z'] = z
    f.update(kw)
    return f

def R(x): return [round(x[0]), round(x[1])]

def arcpts(c, r, a0, a1, step_deg=None, n=None):
    if n is None:
        n = max(2, int(abs(a1 - a0) * math.pi / 180 * r / 300))
    return [R(arc_point(c, r, a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

# ------------------------------------------------------------------ constants
XL_IN, XR_IN = 230, 9151            # interior faces of the side walls
XL_C, XR_C = 115, 9266              # side wall centrelines (230 thick)
PLOT_W = 9381
Y_REAR_GLASS = 5590                 # rear house wall centre (5515-5665)

# curved geometry (fitted to PDF vector arcs, max deviation < 3 mm)
C_GUEST = (2690, 16969)             # R1526 curved wall (guest side face)
C_FOYER = (6850, 14550)             # foyer glass R5832, step R6045, lawn edge R7476 (concentric)
C_GL9 = (9920, 10600); R_GL9 = 11044
C_ARC2 = (8889, 12023); R_ARC2 = 9344
C_GL8A = (5031, 1795); R_GL8A = 3802
C_GL8B = (8810, 8285); R_GL8B = 3710

# ------------------------------------------------------------------ levels
levels = {
    'NGL': {'z': 0, 'note': 'natural ground level (lawns, parking)'},
    'GF':  {'ffl': 450, 'floor_to_floor': 3300, 'slab': 300, 'clear': 3000},
    'FF':  {'ffl': 3750, 'floor_to_floor': 3300, 'slab': 300, 'clear': 3000},
    'SF':  {'ffl': 7050, 'floor_to_floor': 3300, 'slab': 300, 'clear': 3000, 'status': 'PROPOSED'},
    'ROOF': {'ffl': 10350, 'note': 'top of second-floor roof slab (PROPOSED)'},
}

# ------------------------------------------------------------------ schedule (re-read from the PDF table)
schedule = {
  'source': 'PDF DOOR-WINDOW SCHEDULE (re-read from the vector text layer, rows verified against positions)',
  'items': {
    'GL-1':  {'size': [2400, 2300], 'sill': 100, 'lintel': 2400, 'desc': 'Glass Window Fixed/Openable'},
    'GL-2':  {'size': [2770, 2300], 'sill': 100, 'lintel': 2400, 'desc': 'Glass Window Fixed/Openable'},
    'GL-3':  {'size': [1150, 1450], 'sill': 950, 'lintel': 2400, 'desc': 'Glass Window Openable'},
    'GL-4':  {'size': [1460, 1450], 'sill': 950, 'lintel': 2400, 'desc': 'Glass Window Openable'},
    'GL-5':  {'size': [5700, 2300], 'sill': 100, 'lintel': 2400, 'desc': 'Glass Door/Window Fixed/Openable'},
    'GL-6':  {'size': None, 'sill': 100, 'lintel': 2400, 'desc': 'Shower Partition (GL-6, 6a, 6b: as per site)'},
    'GL-7':  {'size': [3500, 2300], 'sill': 100, 'lintel': 2400, 'desc': 'Glass Door/Window Fixed/Openable'},
    'GL-8':  {'size': [3975, 1100], 'sill': 100, 'lintel': None, 'desc': 'Glass Railing'},
    'GL-9':  {'size': [4100, 2400], 'sill': 100, 'lintel': 2400, 'desc': 'Glass Window Fixed/Openable',
              'note': 'sill 100 + 2400 = 2500 conflicts with the 2400 lintel; modelled 2300 high (head at 2400). See ASSUMPTIONS A-17.'},
    'GL-10': {'size': [1000, 1450], 'sill': 950, 'lintel': 2400, 'desc': 'Glass Window Openable'},
    'D1':    {'size': [1450, 2400], 'sill': 0, 'lintel': 2400, 'desc': 'Flush Door (main door, double leaf)'},
    'D2':    {'size': [1000, 2400], 'sill': 0, 'lintel': 2400, 'desc': 'Flush Door'},
    'D3':    {'size': [800, 2400], 'sill': 0, 'lintel': 2400, 'desc': 'Flush Door'},
    'D4':    {'size': None, 'sill': 0, 'lintel': None, 'desc': 'As Lift - as per lift vendor (modelled 750 x 2100)'},
  },
  'unscheduled': {
    'GL-F':  {'desc': 'Curved frameless glass facade of the entrance foyer (drawn, not in the schedule). R5832, floor to ceiling.'},
    'GD-1':  {'desc': 'Frameless glass pivot entry door in GL-F, 1200 x 2400 (ASSUMED - the PDF shows no external door to the foyer).'},
    'GS-1':  {'desc': 'Glass screen + 1000 gate between parking and entrance court (drawn cyan, not scheduled). 2100 high (ASSUMED).'},
    'PD-1':  {'desc': 'PROPOSED SF glazed door 1000 x 2400 to terraces.'},
    'PD-2':  {'desc': 'PROPOSED SF flush door 800 x 2400.'},
    'PW-1':  {'desc': 'PROPOSED SF window 1200 x 1450, sill 950.'},
    'KD-1':  {'desc': 'D-01 kitchen door: sliding, fluted glass in a black frame, 1000 x 2400.'},
    'GT-1':  {'desc': 'D-02 wash-area service gate to the back lawn, 800 x 2000.'},
  }
}

finish_schedule_pdf = {
  'source': 'PDF FINISHING SCHEDULE, re-read row by row (the brief\'s copy was shifted by one row - see ASSUMPTIONS A-04)',
  'rows': [
    ['Ramp & Ext. Courtyard', 'Cobble Stone', 'Granite Stone', ''],
    ['Ext. Entrance Area', 'Granite Stone', 'Paint Finish', 'Paint Finish'],
    ['Entrance Foyer & Lobby', 'Italian Stone', 'Veneer Cladding', 'Veneer Polished'],
    ['Study Room', 'Italian Stone', 'Veneer Cladding', 'POP Painted'],
    ['Guest Room', 'Italian Stone', 'Paint Finish', 'POP Painted'],
    ['Guest Room Toilet', 'Tile', 'Tile', 'POP Painted'],
    ['Drawing /Dining', 'Italian Stone', 'Veneer Cladding', 'POP Painted/Veneer/Glass'],
    ['Kitchen', 'Italian Stone', 'Italian Stone', 'POP Painted'],
    ['Backyard Lawn Sitting Area', 'Granite Stone', 'Paint Finish', ''],
  ]
}

materials = {
  'marble_beige':   {'desc': 'Light beige Italian marble (Botticino / Perlato style), honed', 'color': '#e9dfcf', 'polyhaven': 'marble_01'},
  'marble_white':   {'desc': 'White Italian marble (Statuario style) for backsplash and counters', 'color': '#f1efeb', 'polyhaven': 'marble_01'},
  'walnut':         {'desc': 'Walnut veneer, matte PU', 'color': '#6b4a33', 'polyhaven': 'wood_table_001'},
  'walnut_fluted':  {'desc': 'Fluted walnut panels, 25 mm flutes', 'color': '#6b4a33', 'polyhaven': 'wood_table_001'},
  'paint_warm_white': {'desc': 'Warm white emulsion (approx. RAL 9010)', 'color': '#f4efe6', 'polyhaven': 'painted_plaster_wall'},
  'tile_matte_lg':  {'desc': 'Large-format matte porcelain tile 1200x600, warm grey', 'color': '#cfc8bd', 'polyhaven': 'large_square_tiles'},
  'tile_matte_dark':{'desc': 'Large-format matte porcelain tile, charcoal (shower floors/feature)', 'color': '#55524e', 'polyhaven': 'large_square_tiles'},
  'deck_tile':      {'desc': 'Wood-look porcelain deck tile 1200x200', 'color': '#9a7650', 'polyhaven': 'wood_floor_deck'},
  'granite_flamed': {'desc': 'Flamed grey granite', 'color': '#8d8b87', 'polyhaven': 'granite_tile'},
  'cobble':         {'desc': 'Cobble stone setts', 'color': '#7c7770', 'polyhaven': 'cobblestone_floor_01'},
  'grass':          {'desc': 'Lawn', 'color': '#7aa35a', 'polyhaven': 'aerial_grass_rock'},
  'pebbles':        {'desc': 'White pebbles (OTS floor)', 'color': '#d8d4cc', 'polyhaven': 'gravel_floor'},
  'vitrified':      {'desc': 'Vitrified tile 600x600, light (SF service rooms)', 'color': '#dedad2', 'polyhaven': 'large_square_tiles'},
  'pop_white':      {'desc': 'POP false ceiling, white paint', 'color': '#fbfaf7'},
  'glass':          {'desc': 'Clear toughened glass, IOR 1.52', 'color': '#bcd9e0'},
  'black_metal':    {'desc': 'Matte black powder-coated metal', 'color': '#1d1d1d'},
  'brass':          {'desc': 'Brushed brass', 'color': '#b08d57'},
  'polycarbonate':  {'desc': 'Opal multiwall polycarbonate sheet', 'color': '#e8eef0'},
  'concrete':       {'desc': 'Exposed / plastered concrete', 'color': '#b9b5ae'},
}

def CEIL(t='POP', h=2750, cove=True, **kw):
    c = dict(type=t, height=h)
    if cove: c['cove'] = True
    c.update(kw)
    return c

# ====================================================================== GROUND FLOOR
gf_walls = [
  # exterior / structure
  W('GF-W01', (XL_IN, Y_REAR_GLASS), (XR_IN, Y_REAR_GLASS), 150, 'external', 'new',
    note='Rear glazing line (light grey in PDF = new). 5515-5665.',
    openings=[O('GF-GL4', 'GL-4', 'window', 500, 1460, 1450, 950, note='over kitchen sink (D-01: moved 147 left to make room for the wash-area door)'),
              O('GF-D3d', 'D3', 'door', 2070, 800, 2400, 0, hinge='b', swing='-y', note='D-01 kitchen -> wash area'),
              O('GF-GL5', 'GL-5', 'sliding_door', 3071, 5700, 2300, 100, note='to deck / lawn')]),
  W('GF-W02', (XL_C, 5515), (XL_C, 10451), 230, 'external', 'existing', note='Left wall along drawing room/kitchen'),
  W('GF-W03', (XL_C, 12964), (XL_C, 19257), 230, 'external', 'existing', note='Left wall along toilet/guest room'),
  W('GF-W04', (XR_C, 5515), (XR_C, 21506), 230, 'external', 'existing', note='Right wall, full depth incl. parking (carries FF bedroom)'),
  # OTS shaft (protrudes 735 beyond the left wall line, as drawn)
  W('GF-OTS1', (-735, 10601), (1031, 10601), 300, 'shaft', 'existing'),
  W('GF-OTS2', (-585, 10751), (-585, 12665), 300, 'shaft', 'existing'),
  W('GF-OTS3', (-735, 12815), (1031, 12815), 300, 'shaft', 'existing'),
  W('GF-OTS4', (881, 10751), (881, 12665), 300, 'shaft', 'existing',
    openings=[O('GF-GL3', 'GL-3', 'window', 765, 1150, 1450, 950, note='toilet window into OTS')]),
  # lift
  W('GF-W09', (7200, 10841), (XR_IN, 10841), 150, 'lift', 'new', note='lift top wall 10766-10916'),
  W('GF-W10', (7275, 10916), (7275, 12715), 150, 'lift', 'new',
    openings=[O('GF-D4', 'D4', 'lift_door', 525, 750, 2100, 0)]),
  W('GF-W11', (7200, 12790), (XR_IN, 12790), 150, 'lift', 'existing', note='lift bottom / stair top wall 12715-12865'),
  # lobby west wall
  W('GF-W12', (4275, 10766), (4275, 15665), 150, 'internal', 'new', note='Lobby/toilet/guest wall (4200-4350)',
    openings=[O('GF-D3a', 'D3', 'door', 2349, 800, 2400, 0, hinge='b', swing='-x', note='toilet'),
              O('GF-D2a', 'D2', 'door', 3899, 1000, 2400, 0, hinge='a', swing='-x', note='guest room')]),
  W('GF-W13', (4275, 15665), (4275, 17137), 150, 'internal', 'existing'),
  ARC('GF-W14', C_GUEST, 1621, 5.0, 72.0, 190, 'internal', 'existing',
      note='Curved wall, R1526 to guest-room face (fitted centre (2690,16969), faces R1526/R1716)'),
  W('GF-W15', (3080, 18390), (3080, 19489), 300, 'external', 'existing', note='pier between GL-1 and foyer glass'),
  W('GF-W16', (XL_IN, 19181), (2930, 19181), 150, 'external', 'new',
    openings=[O('GF-GL1', 'GL-1', 'window', 136, 2400, 2300, 100, note='guest room to front lawn; 2730 = jamb-to-jamb')]),
  W('GF-W17', (1031, 11440), (4200, 11440), 150, 'internal', 'new', note='toilet top wall 11365-11515 (915 strip above)'),
  W('GF-W27', (3225, 5665), (3225, 11365), 150, 'internal', 'new',
    note='D-01 closed kitchen: wall on the PDF kitchen line (kitchen keeps its 2920 clear width)',
    openings=[O('GF-KD1', 'KD-1', 'sliding_door', 3685, 1000, 2400, 0, note='D-01 dining -> kitchen; sliding so no leaf swings into the kitchen')]),
  W('GF-W18', (XL_IN, 13991), (4200, 13991), 150, 'internal', 'new', note='toilet / guest wardrobe wall 13916-14066'),
  W('GF-W19', (5990, 13919), (5990, 16425), 180, 'internal', 'new', note='janitor/mandir west wall (5900-6080)',
    openings=[O('GF-D3b', 'D3', 'door', 353, 800, 2400, 0, hinge='b', swing='+x', note='janitor'),
              O('GF-D2b', 'D2', 'door', 1507, 1000, 2400, 0, hinge='a', swing='+x', note='mandir + store (was study)')]),
  W('GF-W20', (5990, 16425), (5990, 20602), 180, 'external', 'existing', note='study/foyer wall continuing to the courtyard'),
  W('GF-W21', (4350, 17286), (5900, 17286), 180, 'internal', 'existing', note='main door line 17196-17376',
    openings=[O('GF-D1', 'D1', 'door', 50, 1450, 2400, 0, hinge='both', swing='-y', leaves=2, note='main door, 1450 in 1550 opening')]),
  W('GF-W22', (5899, 13995), (7899, 13995), 150, 'internal', 'new', note='stair spine wall (janitor enclosure below)'),
  W('GF-W23', (6080, 15199), (XR_IN, 15199), 150, 'internal', 'new',
    note='janitor / mandir wall. PDF shows a 300 joinery strip 15124-15426; modelled as 150 wall 15124-15274.'),
  W('GF-W24', (6080, 19806), (XR_IN, 19806), 180, 'external', 'existing',
    openings=[O('GF-GL2', 'GL-2', 'window', 152, 2770, 2300, 100, note='mandir/store window to parking')]),
  ARC('GF-W25', C_FOYER, 5832, 128.4, 99.4, 60, 'glass_wall', 'new', note='GL-F curved foyer glass (unscheduled)',
      openings=[O('GF-GD1', 'GD-1', 'pivot_door', 1500, 1200, 2400, 0, swing='out', note='ASSUMED entry door')]),
  W('GF-W26', (5990, 20602), (5990, 21975), 60, 'glass_screen', 'new', h=2100, base=300,
    note='GS-1 glass screen between entrance court and parking (drawn cyan)',
    openings=[O('GF-GS1', 'GS-1', 'gate', 300, 1000, 2100, 0, hinge='a', swing='+x')]),
  # boundary walls (base at NGL, 1500 high)
  W('GF-B1', (0, 100), (PLOT_W, 100), 200, 'boundary', 'existing', h=1500, base=0),
  W('GF-B2', (XL_C, 200), (XL_C, 5515), 230, 'boundary', 'existing', h=1500, base=0),
  W('GF-B3', (XR_C, 200), (XR_C, 5515), 230, 'boundary', 'existing', h=1500, base=0),
  W('GF-B4', (XL_C, 19257), (XL_C, 21975), 230, 'boundary', 'existing', h=1500, base=0),
  W('GF-B5', (0, 22125), (6080, 22125), 300, 'boundary', 'existing', h=1500, base=0, note='front boundary wall 21975-22275'),
  W('GF-B6', (XR_C, 21506), (XR_C, 22276), 230, 'boundary', 'existing', h=1500, base=0),
  # D-02 wash area: walled service yard behind the kitchen (replaces the slatted screen)
  W('GF-S1', (3375, 2814), (3375, 5515), 150, 'external', 'proposed', h=2100, base=300,
    note='D-02 wash area | deck, 2100 high above the deck'),
  W('GF-S2', (230, 2889), (3450, 2889), 150, 'external', 'proposed', h=2100, base=300,
    note='D-02 wash area | back lawn',
    openings=[O('GF-GT1', 'GT-1', 'door', 1200, 800, 2000, 0, hinge='a', swing='-y', note='service gate to the back lawn')]),
]

# guest-room polygon with the R1526 arc
guest_poly = [[XL_IN, 14066], [4200, 14066], [4200, 16969]] + arcpts(C_GUEST, 1526, 0, 69.2) + [[2930, 18390], [2930, 19106], [XL_IN, 19106]]
# foyer: D-1 line, study wall face, glass arc (inner face), pier face, outer face of curved wall
foyer_poly = [[4350, 17376], [5900, 17376], [5900, 20290]] + arcpts(C_FOYER, 5802, 99.4, 128.4) + [[3230, 18589]] + arcpts(C_GUEST, 1716, 71.7, 13.7)

gf_rooms = [
  dict(id='GF-KIT', name='Kitchen', label_at=[1690, 8000],
       polygon=[[XL_IN, 5665], [3150, 5665], [3150, 11365], [1031, 11365], [1031, 10451], [XL_IN, 10451]],
       floor='marble_beige', wall='paint_warm_white', wall_feature='marble_white (backsplash)',
       ceiling=CEIL(), pdf_finish='Kitchen: Italian Stone / Italian Stone / POP Painted',
       brief_change=True, note='D-01 closed kitchen (U-shaped), door to the dining; the 915 strip behind it is now its pantry'),
  dict(id='GF-DIN', name='Dining', label_at=[8100, 9700],
       polygon=[[3300, 8500], [XR_IN, 8500], [XR_IN, 10766], [4200, 10766], [4200, 11365], [3300, 11365]],
       open_to=['GF-DRW', 'GF-LOB'], floor='marble_beige', wall='paint_warm_white', ceiling=CEIL(feature='walnut veneer raft over dining'),
       pdf_finish='Drawing/Dining: Italian Stone / Veneer Cladding / POP Painted/Veneer/Glass',
       brief_change=True, note='D-01 dining moved to the lobby side of the drawing room'),
  dict(id='GF-DRW', name='Drawing', label_at=[4200, 7300], polygon=[[3300, 5665], [XR_IN, 5665], [XR_IN, 8500], [3300, 8500]],
       open_to=['GF-DIN'], floor='marble_beige', wall='paint_warm_white',
       feature_walls=[dict(wall='GF-W04', side='-', from_=6200, to=10766, finish='walnut_fluted')],
       ceiling=CEIL(), pdf_finish='Drawing/Dining: Italian Stone / Veneer Cladding / POP Painted/Veneer/Glass'),
  dict(id='GF-LOB', name='Lobby', label_at=[5775, 11900], polygon=[[4350, 10766], [7200, 10766], [7200, 12865], [5900, 12865], [5900, 17196], [4350, 17196]],
       floor='marble_beige', wall='walnut (veneer cladding, PDF)', ceiling=CEIL(), pdf_finish='Entrance Foyer & Lobby'),
  dict(id='GF-TLT', name='Toilet', polygon=[[1031, 11515], [4200, 11515], [4200, 13916], [XL_IN, 13916], [XL_IN, 12965], [1031, 12965]],
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False), pdf_finish='Guest Room Toilet: Tile / Tile / POP Painted'),
  dict(id='GF-GST', name='Guest Room', polygon=guest_poly, floor='marble_beige', wall='paint_warm_white', ceiling=CEIL(),
       pdf_finish='Guest Room: Italian Stone / Paint Finish / POP Painted'),
  dict(id='GF-FOY', name='Entrance Foyer', label_at=[4850, 18900], polygon=foyer_poly, floor='marble_beige', wall='walnut (veneer cladding)',
       feature_walls=[dict(wall='GF-W20', side='-', from_=17376, to=20290, finish='walnut_fluted')],
       ceiling=CEIL(type='POP + walnut veneer'), pdf_finish='Entrance Foyer & Lobby: Italian Stone / Veneer Cladding / Veneer Polished'),
  dict(id='GF-MND', name='Mandir + Store', polygon=[[6080, 15274], [XR_IN, 15274], [XR_IN, 19716], [6080, 19716]],
       floor='marble_beige', wall='walnut (veneer cladding)', ceiling=CEIL(), was='Study Room',
       pdf_finish='Study Room: Italian Stone / Veneer Cladding / POP Painted', brief_change=True),
  dict(id='GF-JAN', name='Electrical Panel & Janitor', label_name='Janitor + DB', label_at=[8525, 14450], polygon=[[6080, 14070], [7899, 14070], [7899, 12865], [XR_IN, 12865], [XR_IN, 15124], [6080, 15124]],
       floor='granite_flamed', wall='paint_warm_white', ceiling=dict(type='stair soffit', height=None),
       note='under the second flight and the landing; clear height ~1.4-2.9 m'),
  dict(id='GF-LFT', name='Lift', kind='lift', polygon=[[7350, 10916], [XR_IN, 10916], [XR_IN, 12715], [7350, 12715]], floor=None, ceiling=None),
  dict(id='GF-OTS', name='OTS', kind='shaft', polygon=[[-435, 10751], [731, 10751], [731, 12665], [-435, 12665]], floor='pebbles', ceiling=None,
       note='open to sky'),
]

stair = dict(
  id='STAIR', type='dog_leg', floors=['GF', 'FF', 'SF'],
  note='Dog-leg stair across the plot width below the lift (PDF). 9 risers x 183.3 + 9 risers per storey; going 250; flight width 1054; 150 spine.',
  well=[[5899, 12865], [XR_IN, 12865], [XR_IN, 15124], [5899, 15124]],
  riser=183.33, going=250, flight_width=1054,
  flights=[
    dict(id='F1', start=[5899, 12865], end=[7899, 13919], dir='+x', risers=9, treads=8, from_level=0, to_level=1650),
    dict(id='F2', start=[7899, 14070], end=[5899, 15124], dir='-x', risers=9, treads=8, from_level=1650, to_level=3300),
  ],
  landing=dict(polygon=[[7899, 12865], [XR_IN, 12865], [XR_IN, 15124], [7899, 15124]], level=1650, thickness=150),
  spine=dict(a=[5899, 13995], b=[7899, 13995], t=150),
  levels_relative_to='FFL of the floor the flight starts on',
)

gf_outdoor = [
  dict(id='GF-LAWN-B', name='Back Lawn', polygon=[[XL_IN, 200], [XR_IN, 200], [XR_IN, 2814], [XL_IN, 2814]], surface='grass', z=0),
  dict(id='GF-DECK', name='Deck + Pergola', polygon=[[3450, 2814], [XR_IN, 2814], [XR_IN, 5515], [3450, 5515]], surface='deck_tile', z=300,
       brief_change=True, note='2.7 m deep from the house; PDF says granite for the lawn sitting area - wood-look deck tiles per brief'),
  dict(id='GF-UTIL', name='Wash Area', polygon=[[XL_IN, 2964], [3300, 2964], [3300, 5515], [XL_IN, 5515]], surface='granite_flamed', z=300,
       brief_change=True, note='D-02 walled wash area (utensils + laundry) outside the kitchen, door from the kitchen, gate to the lawn; open to sky'),
  dict(id='GF-LAWN-F', name='Front Lawn', polygon=[[XL_IN, 20157], [1894, 20157]] + arcpts(C_FOYER, 7476, 131.46, 118.9) + [[3229, 21975], [XL_IN, 21975]], surface='grass', z=0),
  dict(id='GF-COURT', name='Entrance Court', surface='granite_flamed', z=300,
       polygon=[[XL_IN, 19257], [2930, 19257], [2930, 19489], [3229, 19489], [3229, 19500]] + arcpts(C_FOYER, 6045, 125.0, 99.4) +
               [[5900, 20602], [5900, 21975], [3229, 21975], [3229, 21095]] + arcpts(C_FOYER, 7476, 118.9, 131.46) + [[1894, 20157], [XL_IN, 20157]],
       pdf_finish='Ext. Entrance Area: Granite Stone / Paint Finish / Paint Finish'),
  dict(id='GF-STEP', name='Foyer step', surface='granite_flamed', z=450,
       polygon=arcpts(C_FOYER, 5862, 128.4, 99.4) + arcpts(C_FOYER, 6045, 99.4, 125.0) + [[3229, 19500], [3229, 19113]],
       note='one 150 step up from the court to the foyer, along the glass (PDF arc R6045)'),
  dict(id='GF-PARK', name='Parking', label_at=[7615, 20800], polygon=[[6080, 19896], [XR_IN, 19896], [XR_IN, 22276], [6080, 22276]], surface='cobble', z=0,
       pdf_finish='Ramp & Ext. Courtyard: Cobble Stone / Granite Stone', note='only 2.38 m deep inside the plot - see ASSUMPTIONS A-24'),
  dict(id='GF-DRAIN', name='300 mm drain', polygon=[[6080, 22276], [PLOT_W, 22276], [PLOT_W, 22578], [6080, 22578]], surface='grating', z=0),
  dict(id='GF-RAMP', name='Ramp (outside plot)', polygon=[[6080, 22578], [PLOT_W, 22578], [PLOT_W, 24077], [6080, 24077]], surface='cobble', z=0, outside_plot=True),
]

pergola = dict(id='GF-PERGOLA', over='GF-DECK', status='proposed', z_top=3000, material='walnut-stain hardwood / black metal',
               posts=[[3600, 2964], [5400, 2964], [7200, 2964], [9001, 2964]], post_size=150,
               beam=dict(a=[3525, 2964], b=[XR_IN, 2964], size=[100, 250]), ledger=dict(a=[3450, 5490], b=[XR_IN, 5490]),
               rafters=dict(spacing=450, size=[60, 200], dir='y', from_y=2889, to_y=5515),
               note='top at +3000 (2.7 m above deck); stays below the FF balcony soffit (+3450)')

gf_furniture = [
  # drawing room (D-01: rear half, L-sofa faces the lawn glass)
  F('GF-F01', 'GF-DRW', 'sofa_l', (6700, 7600), (3000, 1700, 800), 180, chaise='+x', note='L-sofa facing GL-5; chaise on the kitchen side'),
  F('GF-F02', 'GF-DRW', 'coffee_table', (7100, 6800), (1300, 600, 380), 180),
  F('GF-F03', 'GF-DRW', 'rug', (6900, 7150), (3400, 2600, 10), 0),
  F('GF-F04', 'GF-DRW', 'accent_chair', (8650, 6400), (760, 800, 780), 90),
  F('GF-F05', 'GF-DRW', 'accent_chair', (8650, 7250), (760, 800, 780), 90),
  F('GF-F06', 'GF-DRW', 'side_table', (4950, 8100), (450, 450, 500), 0),
  F('GF-F08', 'GF-DRW', 'floor_lamp', (4900, 6300), (400, 400, 1650), 0),
  F('GF-F09', 'GF-DRW', 'planter', (8950, 5900), (450, 450, 1400), 0),
  F('GF-F10', 'GF-DRW', 'planter', (3600, 5950), (450, 450, 1400), 0),
  # dining (D-01: between the drawing room and the lobby, next to the kitchen door)
  F('GF-F11', 'GF-DIN', 'dining_table', (5700, 9850), (1800, 950, 750), 0, seats=6),
  F('GF-F12', 'GF-DIN', 'dining_chair', (5300, 9200), (480, 520, 850), 0),
  F('GF-F13', 'GF-DIN', 'dining_chair', (6100, 9200), (480, 520, 850), 0),
  F('GF-F14', 'GF-DIN', 'dining_chair', (5300, 10500), (480, 520, 850), 180),
  F('GF-F15', 'GF-DIN', 'dining_chair', (6100, 10500), (480, 520, 850), 180),
  F('GF-F16', 'GF-DIN', 'dining_chair', (4550, 9850), (480, 520, 850), 270),
  F('GF-F17', 'GF-DIN', 'dining_chair', (6850, 9850), (480, 520, 850), 90),
  F('GF-F18', 'GF-DIN', 'pendant_statement', (5700, 9850), (1400, 300, 250), 0, z=2000, note='linear statement pendant, bottom at +2000 FFL'),
  F('GF-F19', 'GF-DIN', 'crockery_unit', (3750, 11140), (900, 450, 2100), 180, note='in the niche between the kitchen and lobby walls'),
  # kitchen (D-01: closed, U-shaped, handleless)
  F('GF-K01', 'GF-KIT', 'counter', (1240, 5965), (2020, 600, 900), 0, note='rear run under GL-4, sink at x=1460'),
  F('GF-K02', 'GF-KIT', 'counter', (2850, 7800), (2600, 600, 900), 90, note='right run on the new kitchen wall'),
  F('GF-K03', 'GF-KIT', 'counter', (530, 7757), (2986, 600, 900), 270, note='left run 4185 incl. tall units'),
  F('GF-K04', 'GF-KIT', 'tall_unit', (530, 9851), (1200, 600, 2250), 270, note='fridge + oven tower'),
  F('GF-K05', 'GF-KIT', 'wall_cabinet', (405, 7757), (2986, 350, 750), 270, z=1500),
  F('GF-K06', 'GF-KIT', 'hood', (480, 7300), (900, 500, 600), 270, z=1600),
  F('GF-K07', 'GF-KIT', 'sink', (1460, 5965), (800, 450, 200), 0, z=700),
  F('GF-K08', 'GF-KIT', 'hob', (530, 7300), (750, 520, 50), 270, z=900),
  F('GF-K09', 'GF-KIT', 'wall_cabinet', (2975, 7800), (2600, 350, 750), 90, z=1500),
  F('GF-K10', 'GF-KIT', 'storage_tall', (2090, 11140), (2100, 450, 2400), 180, note='pantry in the former 915 strip'),
  # lobby / foyer
  F('GF-F20', 'GF-LOB', 'console', (4500, 16400), (1200, 300, 850), 270),
  F('GF-F21', 'GF-FOY', 'shoe_console', (5675, 18500), (1800, 450, 900), 90, note='floating walnut console + round mirror above'),
  F('GF-F22', 'GF-FOY', 'mirror_round', (5880, 18500), (800, 30, 800), 90, z=1200),
  F('GF-F23', 'GF-FOY', 'planter', (3700, 18850), (500, 500, 1600), 0),
  # guest room (queen)
  F('GF-G01', 'GF-GST', 'bed_queen', (1280, 16845), (1620, 2100, 1100), 270, mattress=[1524, 1981]),
  F('GF-G02', 'GF-GST', 'side_table', (455, 15785), (500, 450, 500), 270),
  F('GF-G03', 'GF-GST', 'side_table', (455, 17905), (500, 450, 500), 270),
  F('GF-G04', 'GF-GST', 'wardrobe', (2215, 14366), (3970, 600, 2700), 0, note='PDF 600 wardrobe strip'),
  F('GF-G05', 'GF-GST', 'console', (4000, 16400), (1400, 400, 600), 90, note='TV/console'),
  F('GF-G06', 'GF-GST', 'accent_chair', (2300, 18400), (750, 780, 800), 225),
  F('GF-G07', 'GF-GST', 'rug', (1900, 16845), (2400, 3000, 10), 0),
  # toilet (wall-hung WC, glass partition GL-6)
  F('GF-T01', 'GF-TLT', 'wc_wall_hung', (2850, 11946), (380, 560, 400), 0),
  F('GF-T02', 'GF-TLT', 'cistern_ledge', (2851, 11591), (900, 150, 1100), 0),
  F('GF-T03', 'GF-TLT', 'vanity', (3751, 11816), (900, 600, 850), 0, mirror=True),
  F('GF-T04', 'GF-TLT', 'shower_head', (1300, 12200), (250, 250, 50), 0, z=2150),
  # mandir + store
  F('GF-M01', 'GF-MND', 'storage_tall', (8851, 16084), (1620, 600, 2700), 90),
  F('GF-M02', 'GF-MND', 'mandir_jaali', (8851, 17495), (1200, 600, 2700), 90, note='backlit walnut jaali, warm LED strip behind'),
  F('GF-M03', 'GF-MND', 'storage_tall', (8851, 18905), (1620, 600, 2700), 90),
  F('GF-M04', 'GF-MND', 'puja_chowki', (8150, 17495), (600, 400, 150), 90),
  F('GF-M05', 'GF-MND', 'rug', (7900, 17495), (1400, 2000, 10), 0),
  # janitor
  F('GF-J01', 'GF-JAN', 'electrical_panel', (9076, 13500), (600, 150, 900), 90, z=1200),
  F('GF-J02', 'GF-JAN', 'mop_sink', (6500, 14899), (500, 450, 600), 180),
  F('GF-J03', 'GF-JAN', 'shelf', (8500, 14899), (1200, 450, 1800), 180),
  # outdoor
  F('GF-O01', 'GF-DECK', 'outdoor_sofa', (5800, 4250), (2100, 850, 750), 180),
  F('GF-O02', 'GF-DECK', 'lounge_chair', (4300, 3500), (800, 800, 750), 270),
  F('GF-O03', 'GF-DECK', 'lounge_chair', (7300, 3500), (800, 800, 750), 90),
  F('GF-O04', 'GF-DECK', 'coffee_table', (5800, 3400), (1000, 600, 380), 0),
  F('GF-O05', 'GF-DECK', 'planter', (8900, 3100), (600, 600, 900), 0),
  F('GF-O06', 'GF-UTIL', 'utility_counter', (530, 4214), (2400, 600, 900), 270, sink=True, washer=True, note='utensil-wash sink + washing machine'),
  F('GF-O08', 'GF-UTIL', 'drying_rack', (2750, 3900), (1500, 600, 1500), 90),
  F('GF-O07', 'GF-PARK', 'car_model', (7615, 21945), (1745, 3990, 1500), 0, src='models/baleno.glb', model_front='-z',
    model='Maruti Suzuki Baleno (2022), Grandeur Grey',
    credit='"2022 Maruti Suzuki Baleno" by BHP3D (sketchfab.com/BHP3D), CC BY 4.0',
    note="reversed in; the bay is 2.38 m deep inside the plot, so the nose sits over the drain and ramp"),
]

# ====================================================================== FIRST FLOOR
ff_walls = [
  W('FF-W01', (XL_IN, Y_REAR_GLASS), (5274, Y_REAR_GLASS), 150, 'external', 'new',
    openings=[O('FF-GL4', 'GL-4', 'window', 648, 1460, 1450, 950, note='master toilet')]),
  W('FF-W02', (XL_C, 5515), (XL_C, 10451), 230, 'external', 'existing'),
  W('FF-W03', (XL_C, 12964), (XL_C, 19257), 230, 'external', 'existing'),
  W('FF-W04', (XR_C, 4521), (XR_C, 21363), 230, 'external', 'existing', note='right wall incl. balcony side'),
  W('FF-OTS1', (-735, 10601), (1031, 10601), 300, 'shaft', 'existing'),
  W('FF-OTS2', (-585, 10751), (-585, 12665), 300, 'shaft', 'existing'),
  W('FF-OTS3', (-735, 12815), (1031, 12815), 300, 'shaft', 'existing'),
  W('FF-OTS4', (881, 10751), (881, 12665), 300, 'shaft', 'existing',
    openings=[O('FF-GL3', 'GL-3', 'window', 765, 1150, 1450, 950, note='bedroom 3 toilet window into OTS')]),
  W('FF-W05', (5274, 5515), (5274, 6805), 150, 'external', 'new', note='wardrobe alcove / balcony side wall'),
  W('FF-W06', (5349, 6730), (XR_IN, 6730), 150, 'external', 'new',
    openings=[O('FF-GL7', 'GL-7', 'sliding_door', 150, 3500, 2300, 100, note='master to balcony')]),
  W('FF-W07', (3068, 5665), (3068, 10669), 150, 'internal', 'existing', note='toilet/dresser | master (2993-3143)',
    openings=[O('FF-D2a', 'D2', 'door', 3242, 1000, 2400, 0, hinge='a', swing='-x', note='master to dresser')]),
  W('FF-W08', (XL_IN, 8680), (2993, 8680), 150, 'internal', 'new',
    openings=[O('FF-D3a', 'D3', 'door', 1209, 800, 2400, 0, hinge='a', swing='-y', note='dresser to master toilet')]),
  W('FF-W09', (1031, 10759), (XR_IN, 10759), 180, 'internal', 'existing', note='band wall 10669-10849 (FF only; see A-11)',
    openings=[O('FF-D2b', 'D2', 'door', 3387, 1000, 2400, 0, hinge='a', swing='-y', note='lobby to master')]),
  W('FF-W10', (4344, 10071), (4344, 10669), 150, 'internal', 'new', note='side panel of master wardrobe'),
  W('FF-W11', (4344, 10849), (4344, 15306), 150, 'internal', 'new', note='lobby west wall (4270-4420)',
    openings=[O('FF-D2c', 'D2', 'door', 2714, 1000, 2400, 0, hinge='a', swing='-x', note='bedroom 3 (D-04: was the kids room)')]),
  W('FF-W12', (1031, 12888), (4269, 12888), 150, 'internal', 'new',
    openings=[O('FF-D3b', 'D3', 'door', 1390, 800, 2400, 0, hinge='b', swing='+y', note='bedroom 3 toilet')]),
  W('FF-W13', (2343, 12963), (2343, 13563), 150, 'internal', 'new', note='vestibule to kids toilet'),
  W('FF-W14', (3298, 12963), (3298, 13563), 150, 'internal', 'new'),
  W('FF-W15', (7273, 10849), (7273, 12715), 150, 'lift', 'new',
    openings=[O('FF-D4', 'D4', 'lift_door', 557, 750, 2100, 0)]),
  W('FF-W16', (7198, 12790), (XR_IN, 12790), 150, 'lift', 'new'),
  W('FF-W17', (4269, 15381), (5900, 15381), 150, 'internal', 'new',
    openings=[O('FF-D2d', 'D2', 'door', 631, 1000, 2400, 0, hinge='b', swing='+y', note='kids room (D-04: was bedroom 3)')]),
  W('FF-W18', (5899, 15215), (XR_IN, 15215), 180, 'internal', 'new', note='stair / toilet wall 15125-15305'),
  # D-03 kids toilet moved from the stair side to the front (east) wall so it ventilates through GL-10
  W('FF-W19', (6950, 19200), (6950, 21020), 150, 'internal', 'new', note='D-03 kids toilet west wall (meets the GL-10 pier)'),
  W('FF-W20', (6875, 19125), (XR_IN, 19125), 150, 'internal', 'new',
    openings=[O('FF-D3c', 'D3', 'door', 275, 800, 2400, 0, hinge='a', swing='+y', note='kids room -> kids toilet')]),
  W('FF-W21', (4321, 15456), (4321, 20006), 100, 'internal', 'new', note='bedroom 3 | kids room (back of 550 wardrobe)'),
  W('FF-W22', (4271, 20088), (4924, 20088), 165, 'internal', 'new', note='wardrobe end cap at GL-9'),
  W('FF-W23', (4537, 20278), (4924, 20278), 215, 'internal', 'new'),
  W('FF-W24', (XL_IN, 19181), (2928, 19181), 150, 'external', 'new',
    openings=[O('FF-GL1', 'GL-1', 'window', 136, 2400, 2300, 100, note='kids room')]),
  W('FF-W25', (3079, 19106), (3079, 19489), 300, 'external', 'existing'),
  ARC('FF-W26', C_GL9, R_GL9, 127.25, 106.0, 150, 'external', 'new', note='GL-9 curved window wall (frame band)',
      openings=[O('FF-GL9', 'GL-9', 'curtain', 0, 4096, 2300, 100, note='full arc length 4096 vs schedule 4100')]),
  ARC('FF-W27', C_ARC2, R_ARC2, 102.7, 88.4, 300, 'external', 'existing', note='curved front piers with GL-10',
      openings=[O('FF-GL10', 'GL-10', 'window', 669, 1000, 1450, 950, note='D-03 now the kids toilet window: frosted, with exhaust fan')]),
  ARC('FF-W28', C_GL8A, R_GL8A, 85.1, 57.8, 40, 'glass_railing', 'new', h=1100),
  ARC('FF-W29', C_GL8B, R_GL8B, 241.8, 275.1, 40, 'glass_railing', 'new', h=1100),
  W('FF-SP1', (5899, 13995), (7899, 13995), 150, 'railing', 'new', h=1000, note='stair spine handrail'),
]

kids_seat = [[3230, 19106], [4270, 19106], [4270, 20006]] + arcpts(C_GL9, R_GL9 - 75, 121.0, 127.25)[1:] + [[3230, 19301]]
# D-04: the front-right room (east glazing GL-9) is now the kids room, the front-left room is bedroom 3
kids_poly = ([[4371, 15456], [5900, 15456], [5900, 15305], [XR_IN, 15305], [XR_IN, 19050], [6875, 19050], [6875, 21140]] +
             arcpts(C_GL9, R_GL9 - 75, 106.12, 117.3) + [[4924, 20171], [4371, 20006]])
bed3_poly = [[XL_IN, 12964], [4269, 12964], [4269, 20006]] + arcpts(C_GL9, R_GL9 - 75, 121.0, 127.25)[1:] + [[3230, 19301], [3230, 19106], [XL_IN, 19106]]
kids_tl_poly = [[7025, 19200], [XR_IN, 19200]] + arcpts(C_ARC2, R_ARC2 - 150, 88.4, 101.7) + [[7025, 21020]]
balcony_poly = [[5349, 5515]] + arcpts(C_GL8A, R_GL8A, 85.1, 57.8)[1:] + arcpts(C_GL8B, R_GL8B, 241.8, 275.1)[1:] + [[XR_IN, 4590], [XR_IN, 6655], [5349, 6655]]

ff_rooms = [
  dict(id='FF-MTL', name='Master Toilet', polygon=[[XL_IN, 5665], [2993, 5665], [2993, 8605], [XL_IN, 8605]],
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False)),
  dict(id='FF-DRS', name='Dresser', polygon=[[XL_IN, 8755], [2993, 8755], [2993, 10669], [1031, 10669], [1031, 10451], [XL_IN, 10451]],
       floor='marble_beige', wall='paint_warm_white', ceiling=CEIL()),
  dict(id='FF-MST', name='Master Bedroom', polygon=[[3143, 5665], [5199, 5665], [5199, 6805], [XR_IN, 6805], [XR_IN, 10669], [3143, 10669]],
       floor='marble_beige', wall='paint_warm_white',
       feature_walls=[dict(wall='FF-W04', side='-', from_=6805, to=10669, finish='walnut_fluted')], ceiling=CEIL()),
  dict(id='FF-BAL', name='Balcony', kind='outdoor', polygon=balcony_poly, floor='deck_tile', ceiling=None,
       note='kept as balcony (not merged) - see ASSUMPTIONS B-06'),
  dict(id='FF-TL3', name='Bedroom 3 Toilet', polygon=[[1031, 10849], [4269, 10849], [4269, 12813], [1031, 12813]],
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False), note='D-04: was the kids toilet; window GL-3 to the open-to-sky OTS'),
  dict(id='FF-LOB', name='Lobby', label_at=[5775, 11900], polygon=[[4419, 10849], [7198, 10849], [7198, 12865], [5899, 12865], [5899, 15306], [4419, 15306]],
       floor='marble_beige', wall='paint_warm_white', ceiling=CEIL()),
  dict(id='FF-BD3', name='Bedroom 3', polygon=bed3_poly, floor='marble_beige', wall='paint_warm_white', ceiling=CEIL(),
       brief_change=True, note='D-04 front-left bedroom (4070 x 5540 + wardrobes and vestibule); was the kids room'),
  dict(id='FF-KID', name='Kids Room', label_at=[6100, 17300], polygon=kids_poly, floor='marble_beige', wall='paint_warm_white', ceiling=CEIL(),
       brief_change=True, note='D-04 front-right bedroom with its own toilet; study desk at the east glazing (GL-9)'),
  dict(id='FF-KTL', name='Kids Toilet', polygon=kids_tl_poly,
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False), brief_change=True,
       note='D-03 on the front (east) wall: window GL-10 with exhaust fan; over the parking and the store end of the GF mandir room'),
  dict(id='FF-LFT', name='Lift', kind='lift', polygon=[[7348, 10849], [XR_IN, 10849], [XR_IN, 12715], [7348, 12715]], floor=None, ceiling=None),
  dict(id='FF-OTS', name='OTS', kind='shaft', polygon=[[-435, 10751], [731, 10751], [731, 12665], [-435, 12665]], floor=None, ceiling=None),
]

ff_joinery_seat = dict(id='FF-B10', room='FF-BD3', type='window_seat', polygon=kids_seat, h=450,
                       note='brown triangle in the PDF at the GL-9 corner - modelled as a walnut window seat')

ff_furniture = [
  # master
  F('FF-M01', 'FF-MST', 'bed_king', (8076, 8738), (1930, 2150, 1200), 90, mattress=[1829, 1981]),
  F('FF-M02', 'FF-MST', 'side_table', (8926, 7473), (500, 450, 500), 90),
  F('FF-M03', 'FF-MST', 'side_table', (8926, 10003), (500, 450, 500), 90),
  F('FF-M04', 'FF-MST', 'wardrobe', (4171, 5965), (2056, 600, 2700), 0, note='alcove (PDF hatch fills 1140 depth; 600 wardrobe modelled)'),
  F('FF-M05', 'FF-MST', 'wardrobe', (3706, 10369), (1127, 600, 2700), 180),
  F('FF-M06', 'FF-MST', 'tv_unit', (3343, 7800), (1800, 400, 450), 270),
  F('FF-M07', 'FF-MST', 'lounge_chair', (6100, 7500), (800, 800, 780), 315),
  F('FF-M08', 'FF-MST', 'rug', (7200, 8738), (2400, 3000, 10), 0),
  # dresser
  F('FF-D01', 'FF-DRS', 'dressing_table', (455, 9400), (1100, 450, 750), 270, mirror=True),
  F('FF-D02', 'FF-DRS', 'wardrobe', (2012, 10369), (1962, 600, 2700), 180),
  F('FF-D03', 'FF-DRS', 'wardrobe', (530, 10200), (501, 600, 2700), 270),
  F('FF-D04', 'FF-DRS', 'pouf', (1700, 9500), (600, 600, 420), 0),
  # master toilet
  F('FF-T01', 'FF-MTL', 'wc_wall_hung', (2713, 6384), (380, 560, 400), 90),
  F('FF-T02', 'FF-MTL', 'vanity', (2718, 8050), (900, 550, 850), 90, mirror=True),
  F('FF-T03', 'FF-MTL', 'shower_head', (680, 6400), (250, 250, 50), 0, z=2150),
  # bedroom 3 (D-04: front-left, was the kids room)
  F('FF-B01', 'FF-BD3', 'wardrobe', (1249, 13264), (2038, 600, 2700), 0),
  F('FF-B11', 'FF-BD3', 'wardrobe', (3821, 13264), (897, 600, 2700), 0),
  F('FF-B02', 'FF-BD3', 'bed_queen', (1280, 15576), (1620, 2100, 1100), 270, mattress=[1524, 1981]),
  F('FF-B03', 'FF-BD3', 'side_table', (455, 14516), (500, 450, 500), 270),
  F('FF-B04', 'FF-BD3', 'side_table', (455, 16636), (500, 450, 500), 270),
  # variant: 'no_art' pieces show on the main site, 'art' pieces only on /withpainting (D-05)
  F('FF-B05', 'FF-BD3', 'dresser', (4021, 16700), (1200, 450, 750), 90, mirror=True, variant='no_art'),
  F('FF-B06', 'FF-BD3', 'lounge_chair', (3500, 18300), (800, 800, 780), 225, variant='no_art'),
  F('FF-B05a', 'FF-BD3', 'console', (4071, 17250), (1800, 400, 750), 90, variant='art', note='low console under the gallery wall'),
  F('FF-B06a', 'FF-BD3', 'lounge_chair', (3300, 18550), (800, 800, 780), 225, variant='art'),
  F('FF-B08', 'FF-BD3', 'storage_bench', (1566, 18881), (2400, 450, 450), 180),
  F('FF-B07', 'FF-BD3', 'rug', (1900, 15576), (2400, 3000, 10), 0),
  # bedroom 3 toilet (D-04: was the kids toilet)
  F('FF-T21', 'FF-TL3', 'wc_wall_hung', (2920, 11129), (380, 560, 400), 0),
  F('FF-T22', 'FF-TL3', 'vanity', (3820, 11149), (900, 600, 850), 0, mirror=True),
  F('FF-T23', 'FF-TL3', 'shower_head', (1650, 11300), (250, 250, 50), 0, z=2150),
  # kids room (D-04: front-right, was bedroom 3). Desk at the GL-9 glazing so the child faces east while studying.
  F('FF-K01', 'FF-KID', 'wardrobe', (4648, 17731), (4550, 553, 2700), 270, note='PDF 550 wardrobe strip'),
  F('FF-K03', 'FF-KID', 'bed_queen', (8101, 17100), (1620, 2100, 1100), 90, mattress=[1524, 1981]),
  F('FF-K04', 'FF-KID', 'side_table', (8926, 16040), (500, 450, 500), 90),
  F('FF-K05', 'FF-KID', 'side_table', (8926, 18160), (500, 450, 500), 90),
  F('FF-K06', 'FF-KID', 'study_desk', (5856, 20411), (1600, 600, 750), 202.5, note='D-04 along GL-9: the seated child faces east (ENE)'),
  F('FF-K08', 'FF-KID', 'study_chair', (6067, 19903), (550, 550, 900), 22.5),
  F('FF-K07', 'FF-KID', 'storage_tall', (6550, 15530), (1200, 450, 2400), 0, note='books + toys'),
  F('FF-K11', 'FF-KID', 'bean_bag', (5500, 18300), (800, 800, 600), 0),
  F('FF-K12', 'FF-KID', 'rug', (7000, 17100), (2400, 3000, 10), 0),
  # kids toilet (D-03: on the east wall, window GL-10 with exhaust)
  F('FF-T11', 'FF-KTL', 'wc_wall_hung', (7305, 20550), (380, 560, 400), 270),
  F('FF-T12', 'FF-KTL', 'vanity', (8851, 19700), (900, 600, 850), 90, mirror=True),
  F('FF-T13', 'FF-KTL', 'shower_head', (8750, 20750), (250, 250, 50), 0, z=2150),
  # lobby storage (no store room)
  F('FF-L01', 'FF-LOB', 'storage_tall', (6324, 11074), (1748, 450, 2700), 0, note='full-height lobby cupboard (brief: storage instead of a store room)'),
  # balcony
  F('FF-L02', 'FF-BAL', 'lounge_chair', (6600, 5950), (750, 750, 750), 180),
  F('FF-L03', 'FF-BAL', 'lounge_chair', (7800, 5750), (750, 750, 750), 180),
  F('FF-L04', 'FF-BAL', 'side_table', (7200, 6150), (450, 450, 450), 0),
]

# client's own paintings (D-05). Textures are made by tools/prep_art.py from their photos.
# pos = point on the wall face (plan mm); rot = facing, as for furniture; z = centre height above FFL.
_gallery = json.load(open(os.path.join(HERE, '..', 'assets', 'art', 'gallery.json')))
ff_art = [
  dict(id='FF-A01', room='FF-MST', type='framed', title='Elephant', src='art/elephant.jpg', pos=[9126, 8738], rot=90, z=1720,
       canvas=[750, 400], frame=dict(width=55, depth=40, mat='art_frame_blue', lip='brass', lip_width=12), glass=True,
       note='over the bed, on the fluted walnut wall (25 mm proud of W04)'),
  dict(id='FF-A02', room='FF-MST', type='framed', title='Buddha', src='art/buddha.jpg', pos=[6250, 10669], rot=180, z=1500,
       canvas=[520, 620], frame=dict(width=45, depth=35, mat='art_frame_gold'), glass=True,
       note='40 x 50 canvas in a 60 mm black mat; on the wall between the lobby door and the bed'),
  dict(id='FF-A03', room='FF-LOB', type='framed', title='Seven horses', src='art/horses.jpg', pos=[4419, 12150], rot=270, z=1550,
       canvas=[1000, 500], frame=dict(width=70, depth=45, mat='art_frame_brown', lip='brass', lip_width=10), glass=True,
       note='faces you as you come up the stairs'),
  dict(id='FF-A04', room='FF-BD3', type='gallery', title='Gallery wall', atlas='art/gallery.jpg', pos=[4271, 17250], rot=90,
       z=950 + _gallery['size_mm'][1] // 2, depth=18, size=_gallery['size_mm'], items=_gallery['items'],
       note='the arrangement as hung at home (photo at ~1.39 mm/px), over a low console, facing the bed'),
]

# glass shower partitions (GL-6 family) as thin walls with a glass door
partitions = [
  W('GF-GL6', (2363, 11515), (2363, 13916), 10, 'glass_partition', 'new', h=2000,
    openings=[O('GF-GL6d', 'GL-6', 'glass_door', 1700, 700, 2000, 0, hinge='b', swing='+x')]),
  W('FF-GL6', (1130, 5665), (1130, 7565), 10, 'glass_partition', 'new', h=2000, note='master toilet walk-in shower (open at y=7565)'),
  W('FF-GL6a', (2380, 10849), (2380, 12813), 10, 'glass_partition', 'new', h=2000,
    openings=[O('FF-GL6ad', 'GL-6a', 'glass_door', 1264, 700, 2000, 0, hinge='b', swing='+x')]),
  W('FF-GL6b', (8350, 20300), (XR_IN, 20300), 10, 'glass_partition', 'new', h=2000, note='D-03 kids toilet walk-in shower panel'),
]
gf_walls += [partitions[0]]
ff_walls += partitions[1:]

# ====================================================================== SECOND FLOOR (PROPOSED)
P = 'proposed'
sf_walls = [
  W('SF-W01', (1031, 10759), (XR_IN, 10759), 180, 'external', P, note='on FF band wall',
    openings=[O('SF-PD1a', 'PD-1', 'glass_door', 3388, 1000, 2400, 0, hinge='a', swing='+y', note='lobby to back terrace')]),
  W('SF-W02', (XL_C, 12964), (XL_C, 15456), 230, 'external', P),
  W('SF-W03', (XR_C, 10669), (XR_C, 15306), 230, 'external', P),
  W('SF-W04', (XL_IN, 15381), (5900, 15381), 150, 'external', P, note='front wall; over FF lobby wall for x>4270, needs a beam over the kids room (A-30)',
    openings=[O('SF-PW1', 'PW-1', 'window', 970, 1200, 1450, 950, note='servant room'),
              O('SF-PD1b', 'PD-1', 'glass_door', 4670, 1000, 2400, 0, hinge='b', swing='-y', note='lobby to front terrace')]),
  W('SF-W05', (5899, 15215), (XR_IN, 15215), 180, 'external', P, note='stair enclosure (mumty)'),
  W('SF-W06', (4344, 10849), (4344, 15306), 150, 'internal', P,
    openings=[O('SF-PD2a', 'PD-2', 'door', 651, 800, 2400, 0, hinge='a', swing='-x', note='washing area'),
              O('SF-PD2b', 'PD-2', 'door', 2714, 800, 2400, 0, hinge='a', swing='-x', note='servant room')]),
  W('SF-W07', (1031, 12888), (4269, 12888), 150, 'internal', P, note='on FF toilet wall',
    openings=[O('SF-PD2c', 'PD-2', 'door', 100, 800, 2400, 0, hinge='a', swing='-y', note='servant washroom')]),
  W('SF-W08', (2343, 10849), (2343, 12813), 150, 'internal', P, note='washroom | washing area (over FF GL-6a line)'),
  W('SF-OTS1', (-735, 10601), (1031, 10601), 300, 'shaft', 'existing'),
  W('SF-OTS2', (-585, 10751), (-585, 12665), 300, 'shaft', 'existing'),
  W('SF-OTS3', (-735, 12815), (1031, 12815), 300, 'shaft', 'existing'),
  W('SF-OTS4', (881, 10751), (881, 12665), 300, 'shaft', 'existing',
    openings=[O('SF-GL3', 'GL-3', 'window', 765, 1150, 1450, 950, note='servant washroom window into OTS')]),
  W('SF-W09', (7273, 10849), (7273, 12715), 150, 'lift', P, openings=[O('SF-D4', 'D4', 'lift_door', 557, 750, 2100, 0)]),
  W('SF-W10', (7198, 12790), (XR_IN, 12790), 150, 'lift', P),
  W('SF-R1', (5899, 12865), (5899, 13919), 50, 'railing', P, h=1000, note='stair void edge'),
  W('SF-R2', (5899, 13995), (7899, 13995), 150, 'railing', P, h=1000),
  # parapets around the terraces (1050 high on the FF roof edge)
  W('SF-P01', (XL_C, 5515), (XL_C, 10451), 230, 'parapet', P, h=1050),
  W('SF-P02', (XL_IN, Y_REAR_GLASS), (5274, Y_REAR_GLASS), 150, 'parapet', P, h=1050),
  W('SF-P03', (5274, 5515), (5274, 6805), 150, 'parapet', P, h=1050),
  W('SF-P04', (5349, 6730), (XR_IN, 6730), 150, 'parapet', P, h=1050),
  W('SF-P05', (XR_C, 6655), (XR_C, 10669), 230, 'parapet', P, h=1050),
  W('SF-P06', (XL_C, 15456), (XL_C, 19257), 230, 'parapet', P, h=1050),
  W('SF-P07', (XL_IN, 19181), (2928, 19181), 150, 'parapet', P, h=1050),
  W('SF-P08', (3079, 19106), (3079, 19489), 300, 'parapet', P, h=1050),
  ARC('SF-P09', C_GL9, R_GL9, 127.25, 106.0, 150, 'parapet', P, h=1050),
  ARC('SF-P10', C_ARC2, R_ARC2, 102.7, 88.4, 230, 'parapet', P, h=1050),
  W('SF-P11', (XR_C, 15306), (XR_C, 21363), 230, 'parapet', P, h=1050),
]

back_terrace = [[XL_IN, 5665], [5199, 5665], [5199, 6805], [XR_IN, 6805], [XR_IN, 10669], [1031, 10669], [1031, 10451], [XL_IN, 10451]]
front_terrace = ([[XL_IN, 15456], [5900, 15456], [5900, 15305], [XR_IN, 15305], [XR_IN, 21215]] + arcpts(C_ARC2, R_ARC2 - 150, 88.4, 102.7) +
                 [[6869, 21146]] + arcpts(C_GL9, R_GL9 - 75, 106.0, 127.25) + [[3230, 19301], [3230, 19106], [XL_IN, 19106]])

sf_rooms = [
  dict(id='SF-LOB', name='Lobby', label_at=[5775, 11900], polygon=[[4419, 10849], [7198, 10849], [7198, 12865], [5899, 12865], [5899, 15306], [4419, 15306]],
       floor='marble_beige', wall='paint_warm_white', ceiling=CEIL(cove=False), status=P),
  dict(id='SF-SWR', name='Servant Washroom', polygon=[[1031, 10849], [2268, 10849], [2268, 12813], [1031, 12813]],
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False), status=P, note='stacked over FF kids toilet'),
  dict(id='SF-WSH', name='Washing Area', polygon=[[2418, 10849], [4269, 10849], [4269, 12813], [2418, 12813]],
       floor='tile_matte_lg', wall='tile_matte_lg', ceiling=CEIL(h=2600, cove=False), status=P, note='stacked over FF kids toilet'),
  dict(id='SF-SRV', name='Servant Room', polygon=[[XL_IN, 12963], [4269, 12963], [4269, 15306], [XL_IN, 15306]],
       floor='vitrified', wall='paint_warm_white', ceiling=CEIL(cove=False), status=P),
  dict(id='SF-TRB', name='Back Terrace (covered)', kind='outdoor', polygon=back_terrace, floor='deck_tile', status=P,
       ceiling=dict(type='polycarbonate canopy on light steel frame', height_high=3000, height_low=2600)),
  dict(id='SF-TRF', name='Front Terrace (open)', kind='outdoor', polygon=front_terrace, floor='deck_tile', status=P, ceiling=None),
  dict(id='SF-LFT', name='Lift', kind='lift', polygon=[[7348, 10849], [XR_IN, 10849], [XR_IN, 12715], [7348, 12715]], floor=None, ceiling=None, status=P),
  dict(id='SF-OTS', name='OTS', kind='shaft', polygon=[[-435, 10751], [731, 10751], [731, 12665], [-435, 12665]], floor=None, ceiling=None),
]

canopy = dict(id='SF-CANOPY', over='SF-TRB', status=P, material='polycarbonate', frame='black_metal',
              polygon=back_terrace, z_high=3000, z_low=2600, slope_dir='-y',
              posts=[[400, 5800], [2700, 5800], [5050, 5800], [5450, 6900], [7300, 6900], [9000, 6900]], post_size=100,
              note='temporary fitment: opal polycarbonate on 100x100 MS posts, falls to the rear')

sf_furniture = [
  F('SF-S01', 'SF-SRV', 'bed_single', (1205, 14731), (950, 1950, 900), 270),
  F('SF-S02', 'SF-SRV', 'wardrobe', (3500, 13264), (1000, 600, 2100), 0),
  F('SF-S03', 'SF-SRV', 'desk', (3600, 15056), (900, 500, 750), 180),
  F('SF-S04', 'SF-SRV', 'chair', (3600, 14600), (450, 450, 850), 0),
  F('SF-S05', 'SF-SWR', 'wc_wall_hung', (1950, 11129), (380, 560, 400), 0),
  F('SF-S06', 'SF-SWR', 'basin', (1350, 11024), (500, 350, 850), 0),
  F('SF-S07', 'SF-SWR', 'shower_head', (1650, 12300), (250, 250, 50), 0, z=2150),
  F('SF-W01', 'SF-WSH', 'washer_dryer', (2718, 11149), (600, 600, 1750), 0),
  F('SF-W02', 'SF-WSH', 'utility_counter', (3418, 11149), (800, 600, 900), 0, sink=True),
  F('SF-W03', 'SF-WSH', 'storage_tall', (2718, 12181), (1264, 600, 2400), 270, ironing_pullout=True),
  F('SF-W04', 'SF-WSH', 'ironing_station', (3568, 12588), (1100, 450, 900), 180),
  F('SF-T01', 'SF-TRB', 'drying_rack', (2800, 8200), (1800, 600, 1500), 0),
  F('SF-T02', 'SF-TRB', 'outdoor_table', (6800, 8600), (1200, 800, 750), 0),
  F('SF-T03', 'SF-TRB', 'chair', (6500, 8000), (450, 450, 850), 0),
  F('SF-T04', 'SF-TRB', 'chair', (7100, 8000), (450, 450, 850), 0),
  F('SF-T05', 'SF-TRB', 'chair', (6500, 9200), (450, 450, 850), 180),
  F('SF-T06', 'SF-TRB', 'chair', (7100, 9200), (450, 450, 850), 180),
  F('SF-T07', 'SF-TRF', 'lounger', (1600, 17500), (700, 1900, 400), 0),
  F('SF-T08', 'SF-TRF', 'lounger', (2600, 17500), (700, 1900, 400), 0),
  F('SF-T09', 'SF-TRF', 'planter', (8800, 17400), (600, 600, 900), 0),
  F('SF-T10', 'SF-TRF', 'planter', (500, 18850), (500, 500, 900), 0),
]

# ====================================================================== SLABS / FOOTPRINTS
gf_footprint = ([[0, 5515], [PLOT_W, 5515], [PLOT_W, 19896], [5990, 19896], [5990, 20300]] + arcpts(C_FOYER, 5862, 99.4, 128.4) +
                [[3229, 19489], [2930, 19489], [2930, 19257], [0, 19257], [0, 12964], [0, 10451]])
ff_outline = ([[0, 5515], [5349, 5515]] + arcpts((5026, 1773), 3755, 85.07, 57.87)[1:] + arcpts((8810, 8298), 3793, 241.89, 275.13)[1:] +
              [[PLOT_W, 4521], [PLOT_W, 21504]] + arcpts(C_ARC2, R_ARC2 + 150, 87.0, 102.7) + arcpts(C_GL9, R_GL9 + 75, 106.0, 127.25) +
              [[2928, 19489], [2928, 19257], [0, 19257], [0, 12964], [-735, 12964], [-735, 10451], [0, 10451]])
stair_well = [[5899, 12865], [XR_IN, 12865], [XR_IN, 15124], [5899, 15124]]
lift_shaft = [[7350, 10916], [XR_IN, 10916], [XR_IN, 12715], [7350, 12715]]
ots_void = [[-435, 10751], [731, 10751], [731, 12665], [-435, 12665]]
sf_block = [[0, 10669], [PLOT_W, 10669], [PLOT_W, 15306], [5900, 15306], [5900, 15456], [0, 15456], [0, 12964], [-735, 12964], [-735, 10451], [1031, 10451], [1031, 10669]]

slabs = [
  dict(id='S-GF', level='GF', z_top=450, thickness=450, outline=gf_footprint, holes=[lift_shaft], note='plinth / GF floor'),
  dict(id='S-FF', level='FF', z_top=3750, thickness=300, outline=ff_outline, holes=[stair_well, lift_shaft, ots_void], note='FF floor incl. balcony cantilever and front overhang'),
  dict(id='S-SF', level='SF', z_top=7050, thickness=300, outline=[p for p in ff_outline], holes=[stair_well, lift_shaft, ots_void, balcony_poly],
       note='FF roof = SF floor/terraces (balcony stays open to sky)'),
  dict(id='S-ROOF', level='ROOF', z_top=10350, thickness=300, outline=sf_block, holes=[ots_void], status=P, note='SF roof over block + stair mumty; lift overrun above'),
]

house = dict(
  meta=dict(
    project='Renovation at GH-18, Celebrity Homes, Palam Vihar, Gurugram',
    client='Mr. Praveen Kumar Yadav',
    source='GH-18 GF FF Floor Plan.pdf (UPS/GH18/PV/001 R0, 17.08.25, scale NTS)',
    units='mm',
    origin='rear-left outer corner of the plot (outer face of rear boundary wall x outer face of left wall)',
    axes=dict(x='to the right across the plot (as the PDF is read with the lawn at the top)', y='from the rear (lawn) toward the front (street)', z='up from natural ground level'),
    pdf_scale_mm_per_pt=28.53,
    entrance_faces='E (ASSUMED - brief left it blank)',
    north_vector=[1, 0], north_note='front (+y) faces East, so North is +x (right on the plan)',
    rot_convention='furniture rot in degrees; local +y is the front of the piece; rot=0 faces +y (front), 90 faces -x, 180 faces -y (lawn), 270 faces +x',
    wall_convention='walls are centrelines a->b (or arc) with thickness t; openings at `offset` mm along the wall from a; hinge a|b; swing = world direction the leaf opens into',
    plot=dict(width_outer=PLOT_W, depth_to_front_boundary=22276),
  ),
  levels=levels,
  schedule=schedule,
  finish_schedule_pdf=finish_schedule_pdf,
  materials=materials,
  stair=stair,
  slabs=slabs,
  floors=[
    dict(id='GF', name='Ground Floor', status='renovation', walls=gf_walls, rooms=gf_rooms, outdoor=gf_outdoor,
         furniture=gf_furniture, pergola=pergola),
    dict(id='FF', name='First Floor', status='renovation', walls=ff_walls, rooms=ff_rooms, outdoor=[],
         furniture=ff_furniture, joinery=[ff_joinery_seat], art=ff_art),
    dict(id='SF', name='Second Floor (PROPOSED)', status='PROPOSED', walls=sf_walls, rooms=sf_rooms, outdoor=[],
         furniture=sf_furniture, canopy=canopy),
  ],
)

# rename from_ -> from in feature walls
for fl in house['floors']:
    for r in fl['rooms']:
        for fw in r.get('feature_walls', []):
            fw['from'] = fw.pop('from_')

class Enc(json.JSONEncoder):
    pass

def dump(o, ind=0):
    """Compact-ish JSON: short lists and point lists on one line."""
    sp = '  ' * ind
    if isinstance(o, dict):
        if not o: return '{}'
        items = [f'{sp}  {json.dumps(k)}: {dump(v, ind + 1)}' for k, v in o.items()]
        return '{\n' + ',\n'.join(items) + '\n' + sp + '}'
    if isinstance(o, list):
        if all(not isinstance(x, (dict, list)) for x in o):
            return json.dumps(o)
        if all(isinstance(x, list) and all(not isinstance(y, (dict, list)) for y in x) for x in o):
            return '[' + ', '.join(json.dumps(x) for x in o) + ']'
        items = [f'{sp}  {dump(v, ind + 1)}' for v in o]
        return '[\n' + ',\n'.join(items) + '\n' + sp + ']'
    return json.dumps(o)

with open(OUT, 'w') as f:
    f.write(dump(house) + '\n')
print('wrote', OUT)
