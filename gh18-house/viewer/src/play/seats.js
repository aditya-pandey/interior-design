// Places to sit (and lie) in GH-18, from the furniture in house_r1.json: sofas, the settee, chairs,
// beds, loungers, poufs. Used by the home tour inside /play/ (entry.js) and by walking on the coast
// (main.js). Plan millimetres in, metres out (world X = plan x, world Z = plan y).
//
// Furniture faces its local +Z, which in plan is (-sin rot, cos rot) (see build.js / geom.js).

// type -> [seat height m, how far in from the front edge m, label, lie down?]
const KINDS = {
  sofa: [0.44, 0.32, 'Sit on the sofa'], sofa_l: [0.44, 0.34, 'Sit on the sofa'], settee: [0.42, 0.3, 'Sit on the diwan'],
  outdoor_sofa: [0.42, 0.32, 'Sit on the sofa'], accent_chair: [0.43, 0.3, 'Sit in the armchair'],
  lounge_chair: [0.42, 0.32, 'Sit in the chair'], dining_chair: [0.46, 0.22, 'Sit at the table'],
  study_chair: [0.47, 0.22, 'Sit at the desk'], chair: [0.46, 0.22, 'Sit down'], pouf: [0.42, 0.22, 'Sit on the pouf'],
  bean_bag: [0.3, 0.35, 'Flop on the bean bag'], storage_bench: [0.45, 0.2, 'Sit on the bench'],
  bed_king: [0.55, 0.0, 'Lie on the bed', true], bed_queen: [0.55, 0.0, 'Lie on the bed', true], bed_single: [0.5, 0.0, 'Lie on the bed', true],
  lounger: [0.38, 0.0, 'Lie on the lounger', true],
};

export function houseSeats(house) {
  const out = [];
  for (const fl of house.floors) {
    const ffl = (house.levels[fl.id]?.ffl ?? 0) / 1000;
    for (const f of fl.furniture || []) {
      const K = KINDS[f.type];
      if (!K || (f.variant && f.variant !== 'no_art')) continue;
      const [sh, inset, label, lie] = K;
      const a = ((f.rot || 0) * Math.PI) / 180, fx = -Math.sin(a), fz = Math.cos(a);
      const [w, d] = f.size.map((v) => v / 1000);
      const cx = f.pos[0] / 1000, cz = f.pos[1] / 1000;
      let seat;
      if (lie) {
        // lying on the back, head on the pillow (the back of the bed), looking up and along it
        const hx = cx - fx * (d / 2 - 0.35), hz = cz - fz * (d / 2 - 0.35);
        seat = { lie: true, eye: [hx, sh + 0.32, hz], look: [fx, fz], pitch: 0.3 };
      } else {
        // sitting: on the seat near its front, facing out
        const sx = cx + fx * (d / 2 - inset - 0.08), sz = cz + fz * (d / 2 - inset - 0.08);
        seat = { lie: false, eye: [sx - fx * 0.08, sh + 0.72, sz - fz * 0.08], look: [fx, fz], pitch: 0.08 };
      }
      // where to stand up again: in front of it (beds: beside, on the side away from the wall is unknown,
      // so at the foot)
      const off = d / 2 + 0.45;
      seat.stand = [cx + fx * off, cz + fz * off];
      out.push({ id: f.id, type: f.type, floor: fl.id, ffl, label, front: [cx + fx * (d / 2), cz + fz * (d / 2)], centre: [cx, cz], size: [w, d], ...seat });
    }
  }
  return out;
}

// where to stand up: in front of the seat if that's clear, else back where she was before sitting down,
// else the first clear spot round it. isFree(x, z) says whether she can stand there (metres).
export function standSpot(s, prev, isFree) {
  if (isFree(s.stand[0], s.stand[1])) return [s.stand[0], s.stand[1]];
  if (prev && isFree(prev[0], prev[1])) return [prev[0], prev[1]];
  const [cx, cz] = s.centre, base = Math.atan2(s.look[1], s.look[0]);
  for (const r of [0.5, 0.75, 1.0, 1.3]) {
    const R = Math.max(s.size[0], s.size[1]) / 2 + r;
    for (let k = 0; k < 16; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      if (isFree(x, z)) return [x, z];
    }
  }
  return prev || [s.stand[0], s.stand[1]];
}

// the seat she's next to and facing: within ~1.4 m of its front (or its side, for beds), on her floor
export function nearestSeat(seats, x, z, foot, dirX, dirZ, floorOf) {
  let best = null, bestD = Infinity;
  for (const s of seats) {
    const base = floorOf ? floorOf(s, foot) : s.ffl;
    if (Math.abs(base - foot) > 0.6) continue;
    const dx = s.centre[0] - x, dz = s.centre[1] - z;
    const reach = Math.max(s.size[0], s.size[1]) / 2 + 1.1;
    const d = Math.hypot(dx, dz);
    if (d > reach) continue;
    if ((dx * dirX + dz * dirZ) / (d || 1) < 0.35) continue;          // roughly looking at it
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}
