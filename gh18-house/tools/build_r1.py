"""Revision R1 (owner changes, Oct 2026): house.json + the patches below, written to house_r1.json.

house.json (the version on the main site) is never edited by this script. Each change is a
small function tagged with its item in the R1 brief (ASSUMPTIONS.md section E), applied in order.
Run:  python3 tools/build_r1.py && python3 tools/check_dims.py house_r1.json && python3 tools/plans.py house_r1.json plans/r1
"""
import copy
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


PATCHES = [a1_orientation, a2_units]


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
