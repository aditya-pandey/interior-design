import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Parametric furniture. Every builder works in metres in a local frame:
//   X = width (size[0]), Z = depth (size[1]) with the FRONT of the piece at +Z, Y = up from the floor.
// The caller rotates/places it from house.json (pos, rot, z). Parts are {g, m} = geometry + material key.

// Scale box UVs (0..1 per face) to metres so textures keep their real size.
function metricUV(g, w, h, d) {
  const n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let su, sv;
    if (ax >= ay && ax >= az) { su = d; sv = h; } else if (ay >= az) { su = w; sv = d; } else { su = w; sv = h; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

// Box with bottom at y0, centred on (x, z). r > 0 gives a bevelled/rounded box.
function box(parts, m, w, h, d, x = 0, y0 = 0, z = 0, r = 0.004) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, rr > 0.02 ? 3 : 2, rr) : new THREE.BoxGeometry(w, h, d);
  metricUV(g, w, h, d);
  g.translate(x, y0 + h / 2, z);
  parts.push({ g, m });
}

function cyl(parts, m, rTop, rBot, h, x = 0, y0 = 0, z = 0, seg = 28) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y0 + h / 2, z);
  parts.push({ g, m });
}

function sphere(parts, m, r, x, y, z, sy = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  parts.push({ g, m });
}

// Thin plate facing +Z (for mirrors, panels, glow surfaces).
function plateZ(parts, m, w, h, x, y0, z, t = 0.006) {
  box(parts, m, w, h, t, x, y0, z, 0);
}

function legs4(parts, m, w, d, h, inset = 0.05, s = 0.035, y0 = 0) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(parts, m, s, h, s, sx * (w / 2 - inset), y0, sz * (d / 2 - inset), 0.004);
  }
}

// Handleless door grooves on the front face.
function grooves(parts, w, h, d, y0, panel = 0.6) {
  const n = Math.max(1, Math.round(w / panel));
  for (let i = 1; i < n; i++) {
    const x = -w / 2 + (w * i) / n;
    box(parts, 'black_metal', 0.004, h - 0.02, 0.004, x, y0 + 0.01, d / 2 + 0.001, 0);
  }
}

function cushionsRow(parts, m, x0, x1, y0, z, h, d, n, r = 0.05) {
  const gap = 0.012;
  const cw = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) box(parts, m, cw, h, d, x0 + cw / 2 + i * (cw + gap), y0, z, r);
}

// ---------------------------------------------------------------- builders

const B = {};

B.sofa_l = (p, w, d, h, f) => {
  const dm = 0.95, ch = 0.95, seatH = 0.42, backH = h, arm = 0.18;
  const chaiseRight = (f.chaise || '+x') === '+x';
  const zb = -d / 2;                                   // back line
  const cx = chaiseRight ? w / 2 - ch / 2 : -w / 2 + ch / 2;
  box(p, 'black_metal', w - 0.1, 0.08, dm - 0.1, 0, 0, zb + dm / 2, 0.01);          // recessed plinth
  box(p, 'black_metal', ch - 0.1, 0.08, d - dm, cx, 0, zb + dm + (d - dm) / 2 - 0.05, 0.01);
  box(p, 'fabric_taupe', w, seatH - 0.2, dm, 0, 0.08, zb + dm / 2, 0.04);            // main base
  box(p, 'fabric_taupe', ch, seatH - 0.2, d - dm + 0.02, cx, 0.08, zb + dm + (d - dm) / 2 - 0.01, 0.04);
  box(p, 'fabric_taupe', w, backH - 0.08, 0.2, 0, 0.08, zb + 0.1, 0.06);            // back
  const armX = chaiseRight ? -w / 2 + arm / 2 : w / 2 - arm / 2;
  box(p, 'fabric_taupe', arm, 0.6 - 0.08, dm, armX, 0.08, zb + dm / 2, 0.06);       // arm at the open end
  const s0 = chaiseRight ? -w / 2 + arm : -w / 2 + ch;
  const s1 = chaiseRight ? w / 2 - ch : w / 2 - arm;
  cushionsRow(p, 'linen', s0, s1, seatH - 0.12, zb + 0.2 + (dm - 0.2) / 2, 0.16, dm - 0.22, 2, 0.06);
  box(p, 'linen', ch - 0.04, 0.16, d - 0.24, cx, seatH - 0.12, zb + 0.2 + (d - 0.22) / 2, 0.06);
  cushionsRow(p, 'linen', -w / 2 + (chaiseRight ? arm : 0.02), w / 2 - (chaiseRight ? 0.02 : arm), seatH, zb + 0.28, 0.42, 0.16, 3, 0.07);
  box(p, 'fabric_rust', 0.42, 0.42, 0.13, s0 + 0.35, seatH + 0.02, zb + 0.42, 0.06);   // accent cushions
  box(p, 'fabric_olive', 0.42, 0.42, 0.13, s1 - 0.35, seatH + 0.02, zb + 0.42, 0.06);
};

function sofaStraight(p, w, d, h, frame = 'walnut', fab = 'linen') {
  box(p, frame, w, 0.3, d, 0, 0.1, 0, 0.02);
  legs4(p, frame, w, d, 0.1, 0.06, 0.05);
  box(p, frame, w, h - 0.1, 0.12, 0, 0.1, -d / 2 + 0.06, 0.02);
  box(p, frame, 0.08, 0.55 - 0.1, d, -w / 2 + 0.04, 0.1, 0, 0.02);
  box(p, frame, 0.08, 0.55 - 0.1, d, w / 2 - 0.04, 0.1, 0, 0.02);
  cushionsRow(p, fab, -w / 2 + 0.09, w / 2 - 0.09, 0.4, 0.06, 0.14, d - 0.16, Math.max(1, Math.round(w / 0.7)), 0.05);
  cushionsRow(p, fab, -w / 2 + 0.09, w / 2 - 0.09, 0.54, -d / 2 + 0.2, 0.4, 0.14, Math.max(1, Math.round(w / 0.7)), 0.06);
}
B.outdoor_sofa = (p, w, d, h) => sofaStraight(p, w, d, h, 'walnut', 'linen_white');
B.sofa = (p, w, d, h) => sofaStraight(p, w, d, h, 'fabric_taupe', 'linen');
// settee / diwan (sethi): low walnut platform, mattress, round bolsters at both ends, cushions against the wall
B.settee = (p, w, d, h) => {
  box(p, 'walnut', w, h - 0.14, d, 0, 0, 0, 0.012);
  box(p, 'fabric_rust', w - 0.04, 0.14, d - 0.04, 0, h - 0.14, 0, 0.04);
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.11, 0.11, d - 0.12, 20);
    g.rotateX(Math.PI / 2); g.translate(s * (w / 2 - 0.13), h + 0.1, 0.02);
    p.push({ g, m: 'fabric_olive' });
  }
  cushionsRow(p, 'linen', -w / 2 + 0.3, w / 2 - 0.3, h, -d / 2 + 0.12, 0.38, 0.14, Math.max(1, Math.round((w - 0.6) / 0.5)), 0.06);
};

function armchair(p, w, d, h, fab, legsMat = 'walnut') {
  legs4(p, legsMat, w, d, 0.16, 0.08, 0.035);
  box(p, fab, w, 0.24, d, 0, 0.16, 0, 0.06);
  box(p, fab, w, h - 0.16, 0.16, 0, 0.16, -d / 2 + 0.08, 0.07);
  box(p, fab, 0.14, 0.42, d - 0.1, -w / 2 + 0.07, 0.16, 0.05, 0.06);
  box(p, fab, 0.14, 0.42, d - 0.1, w / 2 - 0.07, 0.16, 0.05, 0.06);
  box(p, 'linen', w - 0.3, 0.12, d - 0.22, 0, 0.4, 0.06, 0.05);
}
B.accent_chair = (p, w, d, h) => armchair(p, w, d, h, 'fabric_rust');
B.lounge_chair = (p, w, d, h) => armchair(p, w, d, Math.min(h, 0.75), 'fabric_olive', 'black_metal');

B.coffee_table = (p, w, d, h) => {
  box(p, 'marble_white', w, 0.04, d, 0, h - 0.04, 0, 0.012);
  box(p, 'black_metal', w - 0.25, h - 0.04, 0.05, 0, 0, -d / 2 + 0.12, 0.004);
  box(p, 'black_metal', w - 0.25, h - 0.04, 0.05, 0, 0, d / 2 - 0.12, 0.004);
};
B.outdoor_table = (p, w, d, h) => { box(p, 'walnut', w, 0.04, d, 0, h - 0.04, 0, 0.01); legs4(p, 'black_metal', w, d, h - 0.04, 0.08, 0.04); };
B.side_table = (p, w, d, h) => {
  const r = Math.min(w, d) / 2;
  cyl(p, 'marble_white', r, r, 0.03, 0, h - 0.03, 0, 32);
  cyl(p, 'brass', 0.025, 0.025, h - 0.03, 0, 0, 0, 12);
  cyl(p, 'brass', r * 0.6, r * 0.6, 0.015, 0, 0, 0, 24);
};
B.console = (p, w, d, h) => {
  box(p, 'walnut', w, 0.05, d, 0, h - 0.05, 0, 0.01);
  box(p, 'walnut', w - 0.1, 0.2, d - 0.04, 0, h - 0.25, 0, 0.01);
  legs4(p, 'black_metal', w, d, h - 0.25, 0.04, 0.03);
};
B.shoe_console = (p, w, d, h) => {          // floating
  box(p, 'walnut', w, h - 0.18, d, 0, 0.18, 0, 0.01);
  grooves(p, w, h - 0.18, d, 0.18, 0.45);
  box(p, 'cove', w - 0.1, 0.01, 0.02, 0, 0.17, 0, 0);       // LED under the floating unit
};
B.floor_lamp = (p, w, d, h) => {
  cyl(p, 'black_metal', 0.15, 0.17, 0.02, 0, 0, 0);
  cyl(p, 'black_metal', 0.012, 0.012, h - 0.35, 0, 0.02, 0, 10);
  cyl(p, 'lamp', w / 2, w / 2 * 0.85, 0.35, 0, h - 0.35, 0, 32);
};
B.planter = (p, w, d, h) => {
  const r = Math.min(w, d) / 2;
  const pot = Math.min(0.55, h * 0.4);
  cyl(p, 'terracotta', r, r * 0.8, pot, 0, 0, 0, 28);
  const fh = h - pot;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.5 + 0.3 * ((i * 37) % 5) / 5);
    sphere(p, i % 2 ? 'foliage' : 'foliage_dark', r * 0.7, Math.cos(a) * rr * 0.6, pot + fh * (0.35 + 0.5 * ((i * 13) % 7) / 7), Math.sin(a) * rr * 0.6, 1.25, 1);
  }
  cyl(p, 'walnut', 0.015, 0.02, fh * 0.6, 0, pot, 0, 8);
};
B.dining_table = (p, w, d, h) => {
  box(p, 'walnut', w, 0.045, d, 0, h - 0.045, 0, 0.012);
  for (const sx of [-1, 1]) {           // trestle legs
    box(p, 'black_metal', 0.06, h - 0.045, d - 0.25, sx * (w / 2 - 0.3), 0, 0, 0.005);
  }
  box(p, 'black_metal', w - 0.6, 0.05, 0.05, 0, h - 0.12, 0, 0.004);
};
B.dining_chair = (p, w, d, h) => {
  legs4(p, 'walnut', w, d, 0.45, 0.04, 0.03);
  box(p, 'fabric_taupe', w, 0.07, d, 0, 0.42, 0.01, 0.025);
  box(p, 'walnut', w - 0.04, 0.3, 0.035, 0, h - 0.32, -d / 2 + 0.03, 0.012);
  box(p, 'walnut', 0.03, h - 0.45, 0.03, -w / 2 + 0.04, 0.45, -d / 2 + 0.04, 0.004);
  box(p, 'walnut', 0.03, h - 0.45, 0.03, w / 2 - 0.04, 0.45, -d / 2 + 0.04, 0.004);
};
B.chair = B.dining_chair;
B.study_chair = (p, w, d, h) => {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(p, 'black_metal', 0.04, 0.03, 0.3, Math.sin(a) * 0.14, 0.04, Math.cos(a) * 0.14, 0.006);
  }
  cyl(p, 'black_metal', 0.025, 0.025, 0.4, 0, 0.05, 0, 10);
  box(p, 'fabric_blue', w - 0.05, 0.08, d - 0.05, 0, 0.45, 0.02, 0.03);
  box(p, 'fabric_blue', w - 0.08, 0.42, 0.06, 0, 0.55, -d / 2 + 0.06, 0.03);
};
B.bar_stool = (p, w, d, h) => {
  cyl(p, 'walnut', w / 2, w / 2, 0.05, 0, h - 0.05, 0, 28);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(p, 'black_metal', 0.022, h - 0.05, 0.022, Math.cos(a) * w * 0.35, 0, Math.sin(a) * w * 0.35, 0.004);
  }
  cyl(p, 'black_metal', w * 0.36, w * 0.36, 0.015, 0, 0.3, 0, 20);
};
B.pendant_statement = (p, w, d, h) => {
  box(p, 'brass', w, 0.06, 0.08, 0, 0.02, 0, 0.012);
  box(p, 'lamp', w - 0.04, 0.012, 0.05, 0, 0.012, 0, 0.002);
  for (const sx of [-1, 1]) cyl(p, 'black_metal', 0.003, 0.003, 0.68, sx * (w / 2 - 0.15), 0.08, 0, 6);
};

function beds(p, w, d, h, matW, matD, pillows, frameMat = 'walnut', head = 'fabric_taupe') {
  const zb = -d / 2;
  box(p, 'black_metal', w - 0.2, 0.08, d - 0.3, 0, 0, 0.05, 0.005);
  box(p, frameMat, w, 0.22, d - 0.08, 0, 0.08, 0.04, 0.02);
  box(p, head, w + 0.1, h - 0.08, 0.1, 0, 0.08, zb + 0.05, 0.04);                     // upholstered headboard
  box(p, 'mattress', matW, 0.22, matD, 0, 0.3, zb + 0.1 + matD / 2, 0.06);
  box(p, 'linen_white', matW + 0.06, 0.06, matD * 0.72, 0, 0.47, zb + 0.1 + matD * 0.28 + matD * 0.36, 0.03);   // duvet
  box(p, 'fabric_olive', matW + 0.08, 0.05, 0.45, 0, 0.5, zb + 0.1 + matD - 0.3, 0.02);                          // throw
  const pw = (matW - 0.12) / pillows - 0.04;
  for (let i = 0; i < pillows; i++) {
    const x = -matW / 2 + 0.06 + pw / 2 + i * (pw + 0.04) + 0.02;
    box(p, 'linen_white', pw, 0.14, 0.45, x, 0.5, zb + 0.38, 0.06);
  }
}
B.bed_queen = (p, w, d, h, f) => beds(p, w, d, h, (f.mattress?.[0] || 1524) / 1000, (f.mattress?.[1] || 1981) / 1000, 2);
B.bed_king = (p, w, d, h, f) => beds(p, w, d, h, (f.mattress?.[0] || 1829) / 1000, (f.mattress?.[1] || 1981) / 1000, 2, 'walnut', 'linen');
B.bed_single = (p, w, d, h) => beds(p, w, d, h, 0.914, 1.905, 1, 'lacquer_greige', 'fabric_blue');

function cabinet(p, w, d, h, mat, y0 = 0, panel = 0.55, plinth = 0.08) {
  if (plinth > 0) box(p, 'black_metal', w - 0.04, plinth, d - 0.06, 0, y0, -0.03, 0.002);
  box(p, mat, w, h - plinth, d, 0, y0 + plinth, 0, 0.006);
  grooves(p, w, h - plinth, d, y0 + plinth, panel);
}
B.wardrobe = (p, w, d, h) => {
  // wardrobes along walls: walnut-trimmed greige lacquer, handleless, with a walnut pull strip
  cabinet(p, w, d, h, 'lacquer_greige', 0, 0.55, 0.08);
  box(p, 'walnut', w, 0.04, 0.02, 0, 1.05, d / 2 + 0.008, 0.003);
};
B.storage_tall = (p, w, d, h, f) => cabinet(p, w, d, h, /MND/.test(f.room || '') ? 'walnut' : 'lacquer_greige', 0, 0.5, 0.08);
B.tall_unit = (p, w, d, h) => {
  cabinet(p, w, d, h, 'lacquer_greige', 0, 0.6, 0.1);
  box(p, 'steel', 0.56, 0.6, 0.01, w / 2 - 0.3, 1.0, d / 2 + 0.005, 0.002);   // built-in oven
};
B.crockery_unit = (p, w, d, h) => {
  cabinet(p, w, d, 0.85, 'walnut', 0, 0.6, 0.08);
  box(p, 'marble_white', w + 0.02, 0.03, d + 0.02, 0, 0.85, 0, 0.006);
  box(p, 'walnut', w, h - 1.35, d, 0, 1.35, 0, 0.006);
  box(p, 'glass_frosted', w - 0.06, h - 1.4, 0.01, 0, 1.38, d / 2 + 0.005, 0);
  box(p, 'cove', w - 0.1, 0.01, 0.03, 0, 1.34, 0, 0);
};
B.counter = (p, w, d, h) => {
  cabinet(p, w, d - 0.02, h - 0.03, 'lacquer_greige', 0, 0.6, 0.1);
  box(p, 'marble_white', w, 0.03, d, 0, h - 0.03, 0.01, 0.004);
};
B.utility_counter = (p, w, d, h) => {
  cabinet(p, w, d - 0.02, h - 0.03, 'lacquer_white', 0, 0.6, 0.1);
  box(p, 'granite_flamed', w, 0.03, d, 0, h - 0.03, 0.01, 0.004);
  box(p, 'steel', 0.5, 0.01, 0.4, -w / 4, h + 0.001, 0, 0.002);
  cyl(p, 'steel', 0.012, 0.012, 0.3, -w / 4, h, -d / 2 + 0.06, 10);
  if (w > 1.2) {     // front-load washer under the counter
    const g = new THREE.TorusGeometry(0.17, 0.025, 10, 40);
    g.translate(w / 4, 0.45, d / 2 + 0.005);
    p.push({ g, m: 'black_metal' });
  }
};
B.counter_peninsula = (p, w, d, h, f) => {
  const r = (f.end_radius || 300) / 1000;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2 - r);
  s.absarc(0, d / 2 - r, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, -d / 2);
  for (const [mat, y0, hh] of [['lacquer_greige', 0.1, h - 0.13], ['marble_white', h - 0.03, 0.03], ['black_metal', 0, 0.1]]) {
    const g = new THREE.ExtrudeGeometry(s, { depth: hh, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(Math.PI / 2);                  // shape y -> world z, extrusion -> down
    g.translate(0, y0 + hh, 0);
    if (mat === 'black_metal') g.scale(0.94, 1, 0.97);
    p.push({ g, m: mat });
  }
};
B.wall_cabinet = (p, w, d, h) => { box(p, 'lacquer_greige', w, h, d, 0, 0, 0, 0.005); grooves(p, w, h, d, 0, 0.6); box(p, 'cove', w - 0.05, 0.01, 0.02, 0, -0.005, d / 2 - 0.05, 0); };
B.overhead_storage = (p, w, d, h) => { box(p, 'walnut', w, h, d, 0, 0, 0, 0.005); grooves(p, w, h, d, 0, 0.6); box(p, 'cove', w - 0.05, 0.01, 0.02, 0, -0.005, d / 2 - 0.05, 0); };
B.hood = (p, w, d, h) => { box(p, 'steel', w, 0.12, d, 0, 0, 0, 0.01); box(p, 'steel', 0.3, h - 0.12, 0.25, 0, 0.12, -d / 2 + 0.13, 0.005); };
B.sink = (p, w, d) => {
  box(p, 'steel', w - 0.02, 0.006, d - 0.02, 0, 0.2, 0, 0.002);
  cyl(p, 'black_metal', 0.014, 0.014, 0.32, 0, 0.2, -d / 2 - 0.02, 10);
  box(p, 'black_metal', 0.02, 0.02, 0.2, 0, 0.5, -d / 2 + 0.08, 0.004);
};
B.hob = (p, w, d) => { box(p, 'black_metal', w, 0.008, d, 0, 0.002, 0, 0.003); };
B.mirror_round = (p, w, d, h) => {
  const g = new THREE.CylinderGeometry(w / 2, w / 2, 0.012, 48);
  g.rotateX(Math.PI / 2); g.translate(0, h / 2, 0.01);
  p.push({ g, m: 'mirror' });
  const r = new THREE.TorusGeometry(w / 2, 0.012, 8, 64);
  r.translate(0, h / 2, 0.016);
  p.push({ g: r, m: 'brass' });
};
B.rug = (p, w, d) => box(p, 'rug', w, 0.012, d, 0, 0.006, 0, 0.004);
B.wc_wall_hung = (p, w, d) => {
  box(p, 'ceramic', w, 0.2, d - 0.04, 0, 0.22, 0.02, 0.09);
  box(p, 'ceramic', w + 0.01, 0.02, d - 0.06, 0, 0.42, 0.03, 0.01);
  box(p, 'black_metal', 0.22, 0.15, 0.01, 0, 0.95, -d / 2 + 0.004, 0.003);   // flush plate on the ledge/wall
};
B.cistern_ledge = (p, w, d, h) => box(p, 'tile_matte_lg', w, h, d, 0, 0, 0, 0.003);
B.vanity = (p, w, d, h, f) => {
  box(p, 'walnut', w, 0.42, d - 0.03, 0, h - 0.47, -0.015, 0.006);
  grooves(p, w, 0.42, d - 0.03, h - 0.47, 0.45);
  box(p, 'marble_white', w, 0.03, d, 0, h - 0.05, 0, 0.004);
  box(p, 'ceramic', Math.min(0.5, w - 0.2), 0.12, Math.min(0.38, d - 0.12), 0, h - 0.02, 0.03, 0.05);
  cyl(p, 'black_metal', 0.012, 0.012, 0.22, 0, h - 0.02, -d / 2 + 0.06, 10);
  if (f.mirror) {
    plateZ(p, 'mirror', Math.min(0.9, w - 0.1), 0.8, 0, h + 0.25, -d / 2 + 0.004);
    box(p, 'cove', Math.min(0.9, w - 0.1), 0.012, 0.02, 0, h + 1.06, -d / 2 + 0.02, 0);
  }
};
B.basin = (p, w, d, h) => {
  box(p, 'ceramic', w, 0.16, d, 0, h - 0.16, 0, 0.05);
  cyl(p, 'black_metal', 0.01, 0.01, 0.18, 0, h, -d / 2 + 0.05, 10);
};
// built-in bath tub: tiled apron, white shell with a rim, inner basin, overflow + spout
B.bathtub = (p, w, d, h) => {
  const rim = 0.07, depth = 0.4;
  box(p, 'tile_matte_lg', w, h - 0.02, d, 0, 0, 0, 0.004);
  box(p, 'ceramic', w, 0.02, rim, 0, h - 0.02, -d / 2 + rim / 2, 0.006);
  box(p, 'ceramic', w, 0.02, rim, 0, h - 0.02, d / 2 - rim / 2, 0.006);
  box(p, 'ceramic', rim, 0.02, d - 2 * rim, -w / 2 + rim / 2, h - 0.02, 0, 0.006);
  box(p, 'ceramic', rim, 0.02, d - 2 * rim, w / 2 - rim / 2, h - 0.02, 0, 0.006);
  box(p, 'ceramic', w - 2 * rim, depth, d - 2 * rim, 0, h - depth, 0, 0.08);
  cyl(p, 'steel', 0.012, 0.012, 0.12, w / 2 - 0.2, h, -d / 2 + 0.035, 10);
};
B.shower_head = (p, w) => {
  cyl(p, 'black_metal', w / 2, w / 2, 0.012, 0, 0, 0, 32);
  cyl(p, 'black_metal', 0.01, 0.01, 0.4, 0, 0.012, 0, 8);
};
B.mandir_jaali = (p, w, d, h) => {
  const zf = d / 2;
  box(p, 'walnut', w, 0.72, d, 0, 0, 0, 0.006);                       // drawers
  grooves(p, w, 0.72, d, 0, 0.4);
  box(p, 'marble_white', w, 0.04, d, 0, 0.72, 0, 0.004);              // pedestal top
  box(p, 'walnut', w, 0.04, d, 0, 0.76 + 1.25, 0, 0.004);             // top of niche
  box(p, 'walnut', 0.05, 1.25, d, -w / 2 + 0.025, 0.76, 0, 0.004);    // niche sides
  box(p, 'walnut', 0.05, 1.25, d, w / 2 - 0.025, 0.76, 0, 0.004);
  box(p, 'walnut', w, 1.25, 0.02, 0, 0.76, -d / 2 + 0.01, 0);           // back panel
  plateZ(p, 'jaali_glow', w - 0.1, 1.25, 0, 0.76, -d / 2 + 0.03, 0.01);   // backlit panel
  // diagonal lattice (jaali) in front of the glow, each bar clipped to the niche
  const lw = w - 0.1, lh = 1.25, zl = -d / 2 + 0.05, y0 = 0.76, sp = 0.11;
  for (const dir of [1, -1]) {
    for (let k = -30; k <= 30; k++) {
      const seg = clipLine(k * sp, dir, -lw / 2, lw / 2, 0, lh);
      if (!seg) continue;
      const [[ax, ay], [bx, by]] = seg;
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.02) continue;
      const g = new THREE.BoxGeometry(0.016, L, 0.012);
      g.rotateZ(-Math.atan2(bx - ax, by - ay));
      g.translate((ax + bx) / 2, y0 + (ay + by) / 2, zl);
      p.push({ g, m: 'walnut' });
    }
  }
  box(p, 'walnut', w, h - 2.05, d, 0, 2.05, 0, 0.006);                // upper storage
  grooves(p, w, h - 2.05, d, 2.05, 0.4);
  cyl(p, 'brass', 0.07, 0.09, 0.03, 0, 0.76, zf - 0.25, 24);           // idol base
  sphere(p, 'brass', 0.06, 0, 0.88, zf - 0.25, 1.4, 2);
  for (const sx of [-0.3, 0.3]) { cyl(p, 'brass', 0.04, 0.03, 0.03, sx, 0.76, zf - 0.12, 16); sphere(p, 'lamp', 0.012, sx, 0.8, zf - 0.12, 1.6, 1); }
};
// small floating wall mandir: drawer ledge, marble shelf, niche with a backlit jaali, stepped walnut crown, brass diya
B.mandir_wall = (p, w, d, h) => {
  box(p, 'walnut', w, 0.16, d, 0, 0, 0, 0.006);
  box(p, 'marble_white', w + 0.02, 0.025, d + 0.01, 0, 0.16, 0.005, 0.004);
  const nh = h - 0.38;                                   // niche height
  box(p, 'walnut', 0.035, nh, d, -w / 2 + 0.0175, 0.185, 0, 0.004);
  box(p, 'walnut', 0.035, nh, d, w / 2 - 0.0175, 0.185, 0, 0.004);
  box(p, 'walnut', w, 0.015, d, 0, 0.185 + nh - 0.015, 0, 0);
  box(p, 'walnut', w, nh, 0.015, 0, 0.185, -d / 2 + 0.0075, 0);
  plateZ(p, 'jaali_glow', w - 0.1, nh - 0.08, 0, 0.225, -d / 2 + 0.02, 0.008);
  for (let i = 0; i < 3; i++) {                          // stepped shikhar-like crown
    const s = 1 - i * 0.22;
    box(p, 'walnut', w * s, 0.065, d * (0.95 - i * 0.12), 0, 0.185 + nh + i * 0.065, -d * i * 0.04, 0.006);
  }
  cyl(p, 'brass', 0.035, 0.025, 0.03, -0.12, 0.185, 0.05, 16);       // diya
  sphere(p, 'lamp', 0.012, -0.12, 0.23, 0.05, 1.5, 1);
  box(p, 'cove', w - 0.08, 0.008, 0.015, 0, 0.185 + nh - 0.03, d / 2 - 0.03, 0);   // LED strip in the niche head
};
B.puja_chowki = (p, w, d, h) => { box(p, 'walnut', w, 0.03, d, 0, h - 0.03, 0, 0.008); legs4(p, 'walnut', w, d, h - 0.03, 0.04, 0.04); };
B.electrical_panel = (p, w, d, h) => box(p, 'appliance', w, h, d, 0, 0, 0, 0.006);
B.mop_sink = (p, w, d, h) => { box(p, 'ceramic', w, 0.25, d, 0, h - 0.25, 0, 0.03); legs4(p, 'steel', w, d, h - 0.25, 0.04, 0.03); };
B.shelf = (p, w, d, h) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 'black_metal', 0.025, h, 0.025, sx * (w / 2 - 0.013), 0, sz * (d / 2 - 0.013), 0.002);
  for (let i = 0; i < 4; i++) box(p, 'walnut', w, 0.025, d, 0, 0.1 + i * (h - 0.15) / 3, 0, 0.004);
};
B.car_reference = (p, w, d) => {
  // hatchback ~3.8 m (local Z = length)
  box(p, 'car_paint', w, 0.6, d, 0, 0.25, 0, 0.12);
  box(p, 'car_paint', w - 0.12, 0.55, d * 0.55, 0, 0.82, -0.12, 0.15);
  box(p, 'car_glass', w - 0.1, 0.45, d * 0.5, 0, 0.88, -0.12, 0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 24);
    g.rotateZ(Math.PI / 2); g.translate(sx * (w / 2 - 0.12), 0.31, sz * (d / 2 - 0.65));
    p.push({ g, m: 'tyre' });
  }
};
B.car_model = () => {};             // glTF model, loaded separately (build.js -> models)
B.tv_unit = (p, w, d, h) => {
  box(p, 'walnut', w, h - 0.15, d, 0, 0.15, 0, 0.006);
  grooves(p, w, h - 0.15, d, 0.15, 0.45);
  box(p, 'black_metal', 1.45, 0.83, 0.03, 0, 1.05, -d / 2 + 0.03, 0.006);
};
B.dressing_table = (p, w, d, h, f) => {
  box(p, 'walnut', w, 0.18, d, 0, h - 0.18, 0, 0.006);
  legs4(p, 'black_metal', w, d, h - 0.18, 0.04, 0.025);
  if (f.mirror) plateZ(p, 'mirror', w * 0.8, 0.9, 0, h + 0.2, -d / 2 + 0.004);
};
B.dresser = (p, w, d, h, f) => {
  cabinet(p, w, d, h, 'walnut', 0, 0.4, 0.1);
  if (f.mirror) plateZ(p, 'mirror', w * 0.7, 0.8, 0, h + 0.3, -d / 2 + 0.004);
};
B.pouf = (p, w, d, h) => { const g = new THREE.CylinderGeometry(w / 2, w / 2, h, 32); g.translate(0, h / 2, 0); p.push({ g, m: 'fabric_taupe' }); };
B.bean_bag = (p, w, d, h) => sphere(p, 'fabric_olive', w / 2, 0, h / 2, 0, (h / w) * 1.1, 3);
B.study_desk = (p, w, d, h) => {
  box(p, 'walnut', w, 0.035, d, 0, h - 0.035, 0, 0.006);
  box(p, 'lacquer_white', 0.45, h - 0.035, d - 0.05, w / 2 - 0.25, 0, -0.02, 0.006);    // drawer pedestal
  for (let i = 1; i < 3; i++) box(p, 'black_metal', 0.44, 0.004, 0.004, w / 2 - 0.25, (i * (h - 0.035)) / 3, d / 2 - 0.044, 0);
  box(p, 'black_metal', 0.04, h - 0.035, d - 0.1, -w / 2 + 0.05, 0, 0, 0.004);
};
B.desk = (p, w, d, h) => { box(p, 'walnut', w, 0.035, d, 0, h - 0.035, 0, 0.006); legs4(p, 'black_metal', w, d, h - 0.035, 0.04, 0.03); };
B.storage_bench = (p, w, d, h) => { cabinet(p, w, d, h - 0.08, 'lacquer_white', 0, 0.6, 0.05); box(p, 'fabric_blue', w - 0.02, 0.08, d - 0.02, 0, h - 0.08, 0, 0.03); };
B.washer_dryer = (p, w, d, h) => {
  box(p, 'appliance', w, h / 2 - 0.01, d, 0, 0, 0, 0.02);
  box(p, 'appliance', w, h / 2 - 0.01, d, 0, h / 2 + 0.01, 0, 0.02);
  for (const y of [h / 4, (3 * h) / 4]) {
    const g = new THREE.TorusGeometry(0.17, 0.025, 10, 40);
    g.translate(0, y, d / 2 + 0.01);
    p.push({ g, m: 'black_metal' });
  }
};
B.ironing_station = (p, w, d, h) => { box(p, 'lacquer_white', w, 0.04, d, 0, h - 0.04, 0, 0.015); cabinet(p, w, d, h - 0.04, 'lacquer_greige', 0, 0.55, 0.05); };
B.drying_rack = (p, w, d, h) => {
  for (const sx of [-1, 1]) box(p, 'steel', 0.03, h, d, sx * (w / 2 - 0.015), 0, 0, 0.004);
  for (let i = 0; i < 6; i++) { const g = new THREE.CylinderGeometry(0.008, 0.008, w, 8); g.rotateZ(Math.PI / 2); g.translate(0, h - 0.05 - i * 0.02, -d / 2 + (i + 0.5) * (d / 6)); p.push({ g, m: 'steel' }); }
};
B.lounger = (p, w, d, h) => {
  box(p, 'walnut', w, 0.12, d, 0, 0.18, 0, 0.01);
  legs4(p, 'walnut', w, d, 0.18, 0.05, 0.04);
  box(p, 'linen_white', w - 0.06, 0.08, d * 0.65, 0, 0.3, d * 0.17, 0.03);
  const g = new RoundedBoxGeometry(w - 0.06, 0.08, d * 0.35, 2, 0.03);
  g.rotateX(-0.6); g.translate(0, 0.45, -d / 2 + d * 0.17);
  p.push({ g, m: 'linen_white' });
};

const DEFAULT = (p, w, d, h) => box(p, 'walnut', w, h, d, 0, 0, 0, 0.01);

// Build one furniture item; returns parts transformed into world space (metres).
// plan (x, y) mm -> world (X = x/1000, Z = y/1000); rot is clockwise-on-plan degrees.
export function buildFurniture(f, floorY) {
  const [w, d, h] = f.size.map((v) => v / 1000);
  const parts = [];
  (B[f.type] || DEFAULT)(parts, w, d, h, f);
  const m = new THREE.Matrix4()
    .makeTranslation(f.pos[0] / 1000, floorY + (f.z || 0) / 1000, f.pos[1] / 1000)
    .multiply(new THREE.Matrix4().makeRotationY(-((f.rot || 0) * Math.PI) / 180));
  const out = [];
  for (const part of parts) {
    if (!part.g || !part.g.attributes) continue;
    part.g.applyMatrix4(m);
    out.push(part);
  }
  return out;
}

// Clip the 45-degree line through (c, 0) with slope `dir` to a rectangle (Liang-Barsky).
function clipLine(c, dir, x0, x1, y0, y1) {
  const ax = c - dir * 10, ay = -10, dx = dir * 20, dy = 20;
  let t0 = 0, t1 = 1;
  for (const [pp, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (pp === 0) { if (q < 0) return null; continue; }
    const r = q / pp;
    if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [[ax + t0 * dx, ay + t0 * dy], [ax + t1 * dx, ay + t1 * dy]];
}

// Polygon joinery (window seat) extruded from the plan.
export function buildJoinery(j, floorY) {
  const s = new THREE.Shape(j.polygon.map(([x, y]) => new THREE.Vector2(x / 1000, -y / 1000)));
  const h = (j.h || 450) / 1000;
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 0.08, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, floorY, 0);
  const c = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: -0.02, bevelSegments: 2 });
  c.rotateX(-Math.PI / 2); c.translate(0, floorY + h - 0.08, 0);
  return [{ g, m: 'walnut' }, { g: c, m: 'linen' }];
}
