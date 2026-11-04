// Layout of the /play/ world, shared by the beach, the studio and the map. Metres, the tour's frame:
// world X = plan x / 1000 (+X = west), Z = plan y / 1000 (+Z = north, GH-18's road side), Y up.
// GH-18's plot is X 0..9.381, Z 0..22.276 and faces north, onto the coastal highway.
//
// It is an imagined coast, not the real Palam Vihar: the sea is to the north and, past a headland,
// to the west, so the sun sets over the water as seen from the terrace and from her studio.

// Coastline from east to west and then south; the sea is on the left of this line as you walk it
// (north of the first stretch, west of the second). The beach runs ~34 m inland from it.
export const COAST = [
  [-2600, 70], [-1500, 66], [-1000, 72], [-700, 60], [-400, 65], [-150, 61], [40, 64], [140, 59],
  [205, 41], [250, 6], [285, -55], [315, -140], [338, -250], [358, -390], [388, -600], [430, -900],
  [480, -1400], [540, -2600],
];
export const BEACH = 34;          // sand width inland of the waterline

// Coastal highway: a closed loop, ~3 km. The first stretch runs past GH-18's gate (centre line Z 28).
export const ROAD_PTS = [
  [-700, 28], [-400, 28], [-150, 28], [0, 28], [70, 27], [140, 16], [195, -30], [232, -105],
  [254, -200], [266, -310], [262, -420], [215, -510], [80, -560], [-150, -580], [-420, -560],
  [-640, -480], [-780, -340], [-830, -180], [-805, -60], [-750, 12],
];
export const LANE = 3.6, SHOULDER = 1.6;
export const ROAD_HALF = LANE + SHOULDER;          // 5.2 m from the centre line to the edge

// Her studio (Deepti's Studio): two storeys and a roof terrace on the beach, ~100 m west of GH-18, facing the sea (north) and the
// sunset (west). Interior floor at +0.6 m on a timber deck.
export const STUDIO = { x0: 98, z0: 40, w: 18, d: 11, floor: 0.6 };
export const STUDIO_PARK = { x: 91, z: 36.5, yaw: 0 };      // parking pad off the highway, nose to the sea
