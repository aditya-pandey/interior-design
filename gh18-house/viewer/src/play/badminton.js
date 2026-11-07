import * as THREE from 'three';

// Badminton on her court: a game to 11 (or a relaxed rally) against a floating racket.
//
// How it plays:
//   - The view moves behind and above her baseline (as on television): the whole court, the shuttle's flight.
//   - She is her racket (no figure), with a soft shadow on the court where she stands. It runs to where the
//     shuttle will come down by itself; W A S D or the arrows move it by hand.
//   - Timing is the game: a ring closes round the shuttle as it reaches her racket; Space, a click or a tap as it
//     closes. Perfect (gold) goes where she aims, fast; good, a little off; early or late, weak and wayward.
//   - Aim: wherever the pointer is on the far court (a tap: where she taps). Keys: A / D for a side, S for short.
//     Shift (or a tap near the net) plays a drop shot. A perfect hit on a high shuttle is a smash.
//   - A ring on her side shows where the shuttle will land: red if it's going out (leave it: her point).
//   - Her partner plays real shots (clears, drops, smashes, lifts), goes back to the middle after each, misses
//     only what it can't reach in time, and gets better or gentler with the score so games stay close.
//   - Rally scoring, game to 11 (win by 2, 15 caps it), the server the last point's winner, serving from the
//     right court on an even score into the diagonal box. In a rally (R) nobody keeps score: how long it lasts.
//
// The shuttle flies with a shuttlecock's drag (a = −K|v|v, terminal speed 6.8 m/s): fast off the strings, then
// it floats and drops nearly straight down.

const G = 9.81, K = G / (6.8 * 6.8), STEP = 1 / 120;
const TO = 11, CAP = 15;
const smooth = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);

export class Badminton {
  constructor({ C, Y, group, shuttle, partner, mine, drawScore }) {
    Object.assign(this, { C, Y, group, shuttle, partner, mine, drawScore });
    this.on = false; this.mode = 'game';
    this.best = 0; this.wins = 0;
    try { this.best = +localStorage.getItem('gh18.rallyBest') || 0; this.wins = +localStorage.getItem('gh18.gamesWon') || 0; } catch { /* */ }
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.me = { x: C.x, z: C.z - 3.4, vx: 0, vz: 0, h: Y + 1.0, swing: 0, over: true, plan: null };
    this.them = { x: C.x, z: C.z + 3.4, vx: 0, vz: 0, h: Y + 1.0, swing: 0, over: true, plan: null };
    this.t = 0; this.slow = 0; this.shake = 0;
    this.aimPt = null; this.aimAt = -9; this.keys = {};
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
    this.trail = [];
    // (bigger than life, so they read from the broadcast camera)
    mine.scale.setScalar(1.5); partner.scale.setScalar(1.55); shuttle.scale.setScalar(1.7);
    partner.traverse((o) => { if (o.material && o.geometry?.type === 'SphereGeometry') o.material.opacity = 0.09; });
    this.buildFx();
    this.buildHud();
  }

  // ---------------------------------------------------------------- what she sees on the court
  buildFx() {
    const { group, Y } = this;
    const flat = (geo, color, opacity, add = false) => {
      const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.position.y = Y + 0.006; m.renderOrder = 5; m.visible = false; group.add(m); return m;
    };
    const soft = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const shadow = (size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false })); m.position.y = Y + 0.005; m.renderOrder = 4; m.visible = false; group.add(m); return m; };
    this.fx = {
      land: flat(new THREE.RingGeometry(0.17, 0.22, 40), 0xffffff, 0.85),
      landDot: flat(new THREE.CircleGeometry(0.05, 20), 0xffffff, 0.85),
      aim: flat(new THREE.RingGeometry(0.2, 0.235, 40), 0xe9c27a, 0.9),
      meShadow: shadow(0.9), themShadow: shadow(1.0), shuttleShadow: shadow(0.16),
    };
    // the timing ring round the shuttle (turned to face the camera)
    this.fx.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fx.ring.renderOrder = 20; this.fx.ring.visible = false; group.add(this.fx.ring);
    // a flash where the racket meets the shuttle
    this.fx.burst = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fx.burst.renderOrder = 21; this.fx.burst.visible = false; group.add(this.fx.burst); this.burstT = 0;
    // the shuttle's trail (additive: fading to black is fading away)
    const N = 18, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fx.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fx.trail.frustumCulled = false; this.fx.trail.visible = false; this.fx.trail.renderOrder = 6; group.add(this.fx.trail);
  }
  buildHud() {
    const el = document.createElement('div');
    el.id = 'bm'; el.hidden = true;
    el.innerHTML = `<div class="bm-score"></div><div class="bm-call"></div>
      <div class="bm-help"><p><kbd>Space</kbd> or click to swing — as the ring closes round the shuttle</p>
      <p>Point where you want it to go · <kbd>Shift</kbd> a drop shot · perfect on a high one: a smash</p>
      <p>Your racket runs to the shuttle by itself (<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move it) · <kbd>R</kbd> <span class="other">a relaxed rally</span> · <kbd>Esc</kbd> stop</p></div>
      <button class="bm-stop" aria-label="Stop playing">Stop</button>`;
    document.body.append(el);
    this.hud = { el, score: el.querySelector('.bm-score'), call: el.querySelector('.bm-call'), help: el.querySelector('.bm-help') };
    el.querySelector('.bm-stop').addEventListener('click', () => this.onStop?.());
  }
  call(text, kind = '', hold = 1.3) {
    const c = this.hud.call; c.textContent = text; c.className = 'bm-call show ' + kind; this.callT = hold;
  }
  showScore() {
    const s = this.hud.score;
    if (this.mode === 'rally') s.innerHTML = `<span class="lbl">Rally</span><b>${this.count}</b><span class="sep"></span><span class="lbl">Best</span><b>${this.best}</b>`;
    else s.innerHTML = `<span class="who${this.server === 'me' ? ' srv' : ''}">Deepti</span><b>${this.score.me}</b><span class="sep">–</span><b>${this.score.them}</b><span class="who${this.server === 'them' ? ' srv' : ''}">Partner</span>`;
    if (this.mode === 'rally') this.drawScore('RALLY', this.count, 'BEST', this.best); else this.drawScore('DEEPTI', this.score.me, 'PARTNER', this.score.them);
  }

  // ---------------------------------------------------------------- the game
  start(mode = 'game') {
    this.on = true; this.mode = mode;
    this.score = { me: 0, them: 0 }; this.count = 0; this.server = 'me';
    this.skill = 0.5; this.cam.ready = false;
    this.partner.visible = this.mine.visible = true;
    for (const k of ['meShadow', 'themShadow']) this.fx[k].visible = true;
    this.hud.el.hidden = false; requestAnimationFrame(() => this.hud.el.classList.add('in'));
    this.hud.help.classList.add('show'); this.helpT = 9;
    this.hud.help.querySelector('.other').textContent = mode === 'rally' ? 'a game to 11' : 'a relaxed rally';
    this.call(mode === 'rally' ? 'A relaxed rally' : 'Game to 11', 'title', 1.8);
    this.newPoint(1.6);
    this.showScore();
  }
  stop() {
    this.on = false;
    this.shuttle.visible = this.partner.visible = this.mine.visible = false;
    for (const k in this.fx) this.fx[k].visible = false;
    this.hud.el.classList.remove('in'); setTimeout(() => { if (!this.on) this.hud.el.hidden = true; }, 400);
    try { localStorage.setItem('gh18.rallyBest', String(this.best)); localStorage.setItem('gh18.gamesWon', String(this.wins)); } catch { /* */ }
  }
  newPoint(delay = 1.1) {
    const { C, Y } = this;
    this.phase = 'serve'; this.timer = delay; this.inFlight = false; this.lastHitter = null; this.pending = null; this.serving = true;
    this.me.plan = this.them.plan = null; this.trail.length = 0;
    // the server serves from the right court on an even score (their own right: hers is −x, facing north)
    const sc = this.mode === 'rally' ? 0 : this.score[this.server], right = sc % 2 === 0;
    const meSide = this.server === 'me' ? (right ? -1 : 1) : (this.score.them % 2 === 0 ? -1 : 1);   // she receives diagonally
    const themSide = this.server === 'them' ? (right ? 1 : -1) : (this.score.me % 2 === 0 ? 1 : -1);
    this.me.x = C.x + meSide * 1.0; this.me.z = C.z - (this.server === 'me' ? 3.0 : 3.6); this.me.vx = this.me.vz = 0;
    this.them.x = C.x + themSide * 1.0; this.them.z = C.z + (this.server === 'them' ? 3.0 : 3.6); this.them.vx = this.them.vz = 0;
    this.serveSide = this.server === 'me' ? meSide : themSide;
    const s = this.server === 'me' ? this.me : this.them;
    this.p.set(s.x + (this.server === 'me' ? 0.25 : -0.25), Y + 0.95, s.z + (this.server === 'me' ? 0.35 : -0.35)); this.v.set(0, 0, 0);
    this.shuttle.visible = true;
    this.fx.land.visible = this.fx.landDot.visible = false;
  }
  // the box the serve must land in: diagonally opposite, between the short service line and the back line (singles)
  serveBox(to) {
    const { C } = this, side = -this.serveSide, dir = to === 'them' ? 1 : -1;
    const x0 = side > 0 ? C.x + 0.1 : C.x - C.sw + 0.1, x1 = side > 0 ? C.x + C.sw - 0.1 : C.x - 0.1;
    return { x0, x1, zn: C.z + dir * 2.1, zf: C.z + dir * (C.hl - 0.15), dir };
  }

  // ---------------------------------------------------------------- flight
  sim(p0, v0, maxT = 3.2) {
    const p = p0.clone(), v = v0.clone(), out = [];
    let t = 0, netHit = false;
    while (t < maxT) {
      const s = v.length(); v.x -= K * s * v.x * STEP; v.z -= K * s * v.z * STEP; v.y -= (G + K * s * v.y) * STEP;
      const pz = p.z; p.addScaledVector(v, STEP); t += STEP;
      if ((pz - this.C.z) * (p.z - this.C.z) <= 0 && Math.abs(p.x - this.C.x) < this.C.hw + 0.05 && p.y < this.Y + 1.53) { netHit = true; out.push({ t, x: p.x, y: p.y, z: p.z, net: true }); break; }
      if (out.length === 0 || t - out[out.length - 1].t >= 1 / 60 - 1e-6) out.push({ t, x: p.x, y: p.y, z: p.z });
      if (p.y <= this.Y) break;
    }
    return { pts: out, net: netHit, end: out[out.length - 1] };
  }
  // a launch velocity from p0 to land at (tx, tz) peaking about `apex` above the court; clear of the net
  solve(p0, tx, tz, apex) {
    const d = new THREE.Vector3(tx - p0.x, 0, tz - p0.z), dist = d.length(); d.normalize();
    let best = null;
    const tryOne = (vy, vh) => {
      const r = this.sim(p0, new THREE.Vector3(d.x * vh, vy, d.z * vh)), e = r.end;
      let peak = p0.y; for (const q of r.pts) peak = Math.max(peak, q.y);
      const err = Math.abs(Math.hypot(e.x - p0.x, e.z - p0.z) - dist) * 3 + Math.abs(peak - (this.Y + apex)) * 0.4 + (r.net ? 50 : 0);
      if (!best || err < best.err) best = { err, vh, vy };
    };
    for (let vy = -4; vy <= 17; vy += 1.5) for (let vh = 2; vh <= 34; vh += 2) tryOne(vy, vh);
    const c = { ...best };
    for (let vy = c.vy - 1.5; vy <= c.vy + 1.5; vy += 0.25) for (let vh = c.vh - 2; vh <= c.vh + 2; vh += 0.25) if (vh > 0) tryOne(vy, vh);
    return new THREE.Vector3(d.x * best.vh, best.vy, d.z * best.vh);
  }
  // a smash: hard and steep, the lowest angle that still clears the net
  solveSmash(p0, tx, tz, speed) {
    const d = new THREE.Vector3(tx - p0.x, 0, tz - p0.z), dist = d.length(); d.normalize();
    let best = null;
    for (let a = -0.6; a <= 0.25; a += 0.02) {
      const v = new THREE.Vector3(d.x * Math.cos(a) * speed, Math.sin(a) * speed, d.z * Math.cos(a) * speed), r = this.sim(p0, v);
      if (r.net) continue;
      const err = Math.abs(Math.hypot(r.end.x - p0.x, r.end.z - p0.z) - dist);
      if (!best || err < best.err) best = { err, v };
      if (err < 0.3) break;
    }
    return best ? best.v : this.solve(p0, tx, tz, 2.6);
  }
  hit(who, kind, tx, tz, q = 1) {
    const { C, Y } = this, p0 = this.p.clone();
    let v;
    if (kind === 'smash') v = this.solveSmash(p0, tx, tz, 24 + 10 * q);
    else {
      const apex = { clear: rnd(5.2, 6.4), lift: rnd(4.8, 5.8), drive: Math.max(p0.y - Y, 1.9) + 0.35, drop: Math.max(p0.y - Y + 0.1, 2.0), serve: 4.9, gentle: 4.2 }[kind] ?? 4.5;
      v = this.solve(p0, tx, tz, apex);
    }
    this.v.copy(v); this.inFlight = true; this.lastHitter = who; this.serving = kind === 'serve';
    this.lastKind = kind; this.lastQ = q;
    const pl = who === 'me' ? this.me : this.them;
    pl.swing = 0.24; pl.over = p0.y > Y + 1.55;
    // the flash and the sound
    const b = this.fx.burst; b.visible = true; b.position.copy(p0); this.burstT = 0.22; b.material.color.set(who === 'me' && q >= 1 ? 0xffd27a : 0xfff4e0);
    this.sfx?.('hit', { power: kind === 'smash' ? 1 : kind === 'drop' ? 0.25 : 0.6, perfect: who === 'me' && q >= 1 });
    if (kind === 'smash') { this.sfx?.('whoosh'); this.shake = 0.25; if (who === 'me') this.slow = 0.5; }
    if (this.mode === 'rally' && !this.serving) { this.count++; this.best = Math.max(this.best, this.count); this.showScore(); }
    // whoever is on the other side plans their return
    this.me.plan = this.them.plan = null;
    this.planFor(who === 'me' ? 'them' : 'me');
  }

  // ---------------------------------------------------------------- where to meet it
  planFor(who) {
    const { C, Y } = this, pl = this[who], r = this.sim(this.p, this.v);
    this.flight = r;
    const mine = who === 'me', onSide = (q) => (mine ? q.z < C.z - 0.25 : q.z > C.z + 0.25);
    const vmax = mine ? 4.4 : 3.4 + 1.6 * this.skill, react = mine ? 0.08 : 0.3 - 0.15 * this.skill, reach = 0.6;
    let plan = null, last = null;
    for (const q of r.pts) {
      if (!onSide(q) || q.net || q.y > Y + 2.75 || q.y < Y + 0.3) continue;
      last = q;
      const need = Math.max(0, Math.hypot(q.x - pl.x, q.z - pl.z) - reach);
      if (need <= vmax * Math.max(0, q.t - react)) { plan = { ...q }; break; }
    }
    const e = r.end, inX = Math.abs(e.x - C.x) <= C.sw + 0.03, inZ = Math.abs(e.z - C.z) <= C.hl + 0.03;
    let inBox = true;
    if (this.serving) { const bx = this.serveBox(who); inBox = e.x >= bx.x0 - 0.12 && e.x <= bx.x1 + 0.12 && Math.abs(e.z - C.z) >= 1.98 - 0.03; }
    this.landsIn = !r.net && inX && inZ && inBox;
    pl.plan = plan ? { ...plan, at: this.t + plan.t } : last ? { ...last, at: this.t + last.t, lunge: true } : null;
    // her partner leaves one that's going out (most of the time), and sometimes just doesn't get there
    if (!mine && pl.plan) {
      pl.leave = !this.landsIn && Math.random() < 0.85;
      const hard = (this.lastKind === 'smash' ? 0.1 + 0.2 * (1 - this.skill) : 0) + (this.lastKind === 'drop' && pl.z > C.z + 3 ? 0.12 : 0) + (this.lastQ >= 1 ? 0.04 : 0);
      pl.miss = pl.plan.lunge || Math.random() < (this.mode === 'rally' ? 0.02 : 0.05 + 0.1 * (1 - this.skill) + hard);
    }
  }

  // ---------------------------------------------------------------- her input
  press({ drop = false } = {}) {
    if (!this.on) return;
    if (this.phase === 'over') { this.start(this.mode); return; }
    if (this.phase === 'serve' && this.server === 'me' && this.timer <= 0.6) {
      const bx = this.serveBox('them'), a = this.aimPoint();
      const tx = THREE.MathUtils.clamp(a.x, bx.x0 + 0.25, bx.x1 - 0.25), tz = drop ? bx.zn + 0.5 : THREE.MathUtils.clamp(a.z, bx.zn + 0.6, bx.zf - 0.35);
      this.phase = 'play'; this.hit('me', drop ? 'drop' : 'serve', tx, tz, 1);
      return;
    }
    if (this.phase !== 'play' || this.me.swing > 0.05 || this.swingCool > 0) return;
    this.me.swing = 0.24; this.swingCool = 0.3;
    const plan = this.me.plan;
    if (!plan || this.lastHitter === 'me') return;                        // (a swing at nothing)
    const err = this.t - plan.at;
    if (err < -0.26) return;                                              // far too early: a swing through air
    const q = Math.abs(err) < 0.055 ? 1 : Math.abs(err) < 0.12 ? 0.75 : Math.abs(err) < 0.2 ? 0.5 : 0.28;
    this.pending = { at: Math.max(this.t, plan.at), q, drop, aim: this.aimPoint() };
  }
  aimFromScreen(point) { if (point) { this.aimPt = point; this.aimAt = this.t; } }
  aimPoint() {
    const { C } = this;
    if (this.aimPt && this.t - this.aimAt < 4) return { x: this.aimPt.x, z: Math.max(this.aimPt.z, C.z + 0.6) };
    // by keys: A / D a side (the view looks north: A is +x), S short, else deep, away from her partner
    const k = this.keys, side = k.KeyA || k.ArrowLeft ? 1 : k.KeyD || k.ArrowRight ? -1 : (this.them.x > C.x ? -1 : 1);
    return { x: C.x + side * 1.7, z: k.KeyS || k.ArrowDown ? C.z + 1.6 : C.z + 5.4 };
  }
  // her shot when the racket meets it
  myShot() {
    const { C, Y } = this, pd = this.pending; this.pending = null;
    const d = this.p.distanceTo(new THREE.Vector3(this.me.x, this.me.h, this.me.z));
    if (d > 1.0 || this.p.y < Y + 0.12) return false;                     // she wasn't there
    const q = pd.q, high = this.p.y > Y + 2.0, a = pd.aim;
    const short = pd.drop || a.z < C.z + 2.4;
    let kind = short ? 'drop' : high && q >= 1 ? 'smash' : this.p.y < Y + 1.0 ? 'lift' : high ? 'clear' : 'drive';
    if (this.mode === 'rally' && kind === 'smash') kind = 'clear';
    // how far off the aim: perfect is close; late or early wanders, and may go long or wide
    const spread = { 1: 0.15, 0.75: 0.55, 0.5: 1.0, 0.28: 1.7 }[q];
    let tx = a.x + rnd(-1, 1) * spread, tz = a.z + rnd(-0.6, 1) * spread * (kind === 'drop' ? 0.5 : 1);
    if (q < 0.4 && Math.random() < 0.35) tz = C.z + rnd(0.2, 0.9);    // (a weak one may not clear the net)
    if (this.mode === 'rally') { tx = THREE.MathUtils.clamp(tx, C.x - C.sw + 0.4, C.x + C.sw - 0.4); tz = THREE.MathUtils.clamp(tz, C.z + 1.2, C.z + C.hl - 0.6); }
    this.hit('me', kind, tx, tz, q);
    const words = { 1: kind === 'smash' ? 'Smash!' : 'Perfect', 0.75: 'Good', 0.5: 'Early', 0.28: 'Late' };
    let w = words[q]; if (q === 0.5 && pd.at > (this.me.plan?.at ?? 0)) w = 'Late';
    this.call(w, q >= 1 ? 'gold' : 'soft', 0.7);
    return true;
  }
  // her partner's shot
  theirShot() {
    const { C, Y } = this, s = this.skill, me = this.me;
    const high = this.p.y > Y + 2.0, low = this.p.y < Y + 1.0, deepMe = me.z < C.z - 3.8, away = me.x > C.x ? -1 : 1;
    let kind, tx, tz;
    if (this.mode === 'rally') { kind = 'gentle'; tx = me.x + rnd(-1.2, 1.2); tz = me.z + rnd(-0.8, 1.2); }
    else if (high && Math.random() < 0.15 + 0.45 * s && this.p.z < C.z + 4.5) { kind = 'smash'; tx = C.x + away * rnd(0.6, 2.2); tz = C.z - rnd(2.4, 5.2); }
    else if ((high && deepMe && Math.random() < 0.5) || (low && this.p.z < C.z + 1.6 && Math.random() < 0.5)) { kind = 'drop'; tx = C.x + away * rnd(0.3, 2.0); tz = C.z - rnd(0.9, 2.2); }
    else { kind = low ? 'lift' : high ? 'clear' : 'drive'; tx = C.x + away * rnd(0.5, 2.3); tz = C.z - rnd(4.4, 6.3); }
    // its mistakes: a little wide, long or into the net now and then
    const err = this.mode === 'rally' ? 0.1 : 0.25 + 0.55 * (1 - s);
    tx += rnd(-1, 1) * err; tz += rnd(-1, 1) * err * 0.8;
    // and now and then a plain error: long, wide, or into the net
    if (this.mode !== 'rally' && Math.random() < 0.04 + 0.08 * (1 - s)) { const k = Math.random(); if (k < 0.4) tz = C.z - C.hl - rnd(0.25, 0.8); else if (k < 0.7) tx = C.x + Math.sign(tx - C.x || 1) * (C.sw + rnd(0.2, 0.6)); else kind = 'net'; }
    if (this.mode === 'rally') { tx = THREE.MathUtils.clamp(tx, C.x - C.sw + 0.5, C.x + C.sw - 0.5); tz = THREE.MathUtils.clamp(tz, C.z - C.hl + 0.6, C.z - 1.4); }
    if (kind === 'net') {                                              // a flat one that doesn't rise enough
      this.hit('them', 'drive', tx, C.z - 2, 0.8);
      const d = new THREE.Vector3(tx - this.p.x, 0, C.z - 2 - this.p.z).normalize();
      this.v.set(d.x * 9, 0.3, d.z * 9); this.me.plan = null; this.planFor('me');
      return;
    }
    this.hit('them', kind, tx, tz, 0.8);
  }

  // ---------------------------------------------------------------- a point
  point(to, why) {
    if (this.phase !== 'play') return;
    this.phase = 'point'; this.inFlight = false; this.timer = 1.5;
    this.me.plan = this.them.plan = null; this.pending = null;
    this.fx.land.visible = this.fx.landDot.visible = this.fx.ring.visible = false;
    if (this.mode === 'rally') {
      this.call(this.count > 2 ? `${this.count} in a row` : { net: 'Into the net', out: 'Out', missed: 'Missed it' }[why] || 'Again', this.count >= this.best && this.count > 2 ? 'gold' : '', 1.4);
      this.sfx?.(why === 'net' ? 'net' : 'land');
      this.count = 0; this.server = 'me';
      try { localStorage.setItem('gh18.rallyBest', String(this.best)); } catch { /* */ }
      this.showScore(); return;
    }
    this.score[to]++; this.server = to;
    this.skill = THREE.MathUtils.clamp(this.skill + (to === 'me' ? 0.035 : -0.025), 0.3, 0.95);   // (keeps it close)
    const words = { net: to === 'me' ? 'Into the net — your point' : 'Into the net', out: to === 'me' ? 'Out — your point' : 'Out', in: to === 'me' ? 'Winner!' : 'Their point', missed: 'Their point', fault: to === 'me' ? 'Fault — your point' : 'Fault' };
    this.sfx?.(why === 'net' ? 'net' : 'land'); this.sfx?.(to === 'me' ? 'point' : 'lost');
    const { me, them } = this.score;
    if ((me >= TO || them >= TO) && (Math.abs(me - them) >= 2 || me === CAP || them === CAP)) {
      this.phase = 'over'; this.timer = 1e9;
      const won = me > them; if (won) this.wins++;
      try { localStorage.setItem('gh18.gamesWon', String(this.wins)); } catch { /* */ }
      this.call(won ? `Game, Deepti · ${me}–${them}` : `Game to Partner · ${them}–${me}`, won ? 'gold big' : 'big', 1e9);
      this.hud.help.classList.add('show'); this.hud.help.querySelector('p').innerHTML = '<kbd>Space</kbd> or click to play again · <kbd>R</kbd> a relaxed rally · <kbd>Esc</kbd> stop';
      this.helpT = 1e9; this.sfx?.(won ? 'won' : 'point');
    } else this.call(words[why] || 'Point', to === 'me' ? 'gold' : '', 1.3);
    this.showScore();
  }

  // ---------------------------------------------------------------- each frame
  update(realDt, camera) {
    if (!this.on) return;
    if (this.slow > 0) this.slow -= realDt;
    const dt = Math.min(0.05, realDt) * (this.slow > 0 ? 0.35 : 1);
    const { C, Y } = this;
    this.t += dt; this.swingCool = Math.max(0, (this.swingCool || 0) - dt);
    if (this.callT != null) { this.callT -= realDt; if (this.callT <= 0) { this.hud.call.classList.remove('show'); this.callT = null; } }
    if (this.helpT != null) { this.helpT -= realDt; if (this.helpT <= 0) { this.hud.help.classList.remove('show'); this.helpT = null; } }

    if (this.phase === 'serve') {
      this.timer -= dt;
      const s = this.server === 'me' ? this.me : this.them;
      this.p.set(s.x + (this.server === 'me' ? 0.25 : -0.25), Y + 0.95 + Math.sin(this.t * 3) * 0.02, s.z + (this.server === 'me' ? 0.35 : -0.35));
      if (this.server === 'me' && this.timer <= 0.6 && !this.serveHinted) { this.serveHinted = true; if (this.score.me + this.score.them === 0) this.call('Your serve — point and click', 'soft', 1.6); }
      if (this.server === 'them' && this.timer <= 0) {
        const bx = this.serveBox('me');
        this.phase = 'play';
        this.hit('them', Math.random() < 0.2 * this.skill ? 'drop' : 'serve', rnd(bx.x0 + 0.3, bx.x1 - 0.3), Math.random() < 0.2 * this.skill ? bx.zn - 0.3 : rnd(bx.zf + 0.35, bx.zf + 1.4), 0.8);
      }
    } else this.serveHinted = false;
    if (this.phase === 'point' || (this.phase === 'serve' && this.timer > 0 && false)) { this.timer -= dt; if (this.timer <= 0) this.newPoint(); }

    // the shuttle
    if (this.phase === 'play' && this.inFlight) {
      const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n;
      for (let i = 0; i < n && this.inFlight; i++) {
        const s = this.v.length(); this.v.x -= K * s * this.v.x * h; this.v.z -= K * s * this.v.z * h; this.v.y -= (G + K * s * this.v.y) * h;
        const pz = this.p.z; this.p.addScaledVector(this.v, h);
        if ((pz - C.z) * (this.p.z - C.z) <= 0 && Math.abs(this.p.x - C.x) < C.hw + 0.05 && this.p.y < Y + 1.53) { this.inFlight = false; this.point(this.lastHitter === 'me' ? 'them' : 'me', 'net'); break; }
        if (this.p.y <= Y) {
          this.p.y = Y; this.inFlight = false;
          const mySide = this.p.z < C.z, inX = Math.abs(this.p.x - C.x) <= C.sw + 0.02, inZ = Math.abs(this.p.z - C.z) <= C.hl + 0.02;
          let good = inX && inZ;
          if (this.serving) { const bx = this.serveBox(mySide ? 'me' : 'them'); good = good && this.p.x >= bx.x0 - 0.1 && this.p.x <= bx.x1 + 0.1 && Math.abs(this.p.z - C.z) >= 1.96; }
          const owner = mySide ? 'me' : 'them', other = mySide ? 'them' : 'me';
          this.point(good ? other : owner, good ? (owner === 'me' ? 'missed' : 'in') : this.serving ? 'fault' : 'out');
          break;
        }
        // her racket meets it (a timed swing) — or her partner's
        if (this.pending && this.t >= this.pending.at - 1e-3 && this.lastHitter !== 'me') { if (!this.myShot()) this.pending = null; }
        const tp = this.them.plan;
        if (tp && this.lastHitter === 'me' && !this.them.miss && !this.them.leave && this.t >= tp.at - 1e-3 && this.p.distanceTo(new THREE.Vector3(this.them.x, this.them.h, this.them.z)) < 1.0) this.theirShot();
      }
    }
    // where she and her partner go
    this.move(this.me, 'me', dt);
    this.move(this.them, 'them', dt);
    this.draw(dt, camera);
  }
  move(pl, who, dt) {
    const { C, Y } = this, mine = who === 'me', sign = mine ? -1 : 1;
    let tx, tz, th;
    const plan = pl.plan, incoming = this.phase === 'play' && this.inFlight && this.lastHitter !== who;
    const leaving = mine ? !this.landsIn : pl.leave;                     // (going out: let it go)
    if (incoming && plan && !leaving) { tx = plan.x; tz = plan.z; th = plan.y; }
    else if (this.phase === 'play') { tx = C.x + (mine ? 0 : (this.p.x - C.x) * 0.2); tz = C.z + sign * 3.3; th = Y + 1.0; }
    else { tx = pl.x; tz = pl.z; th = Y + 1.0; }
    if (incoming && !mine && pl.miss && plan) { tx = pl.x + (plan.x - pl.x) * 0.6; tz = pl.z + (plan.z - pl.z) * 0.6; }
    // her keys move her (and she stays where she's put for a moment)
    let mx = 0, mz = 0;
    if (mine && this.phase === 'play') {
      const k = this.keys; mx = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0); mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      if (mx || mz) this.manualT = 0.8; else this.manualT = Math.max(0, (this.manualT || 0) - dt);
    }
    const vmax = mine ? 4.4 : 3.4 + 1.6 * this.skill;
    let dvx, dvz;
    if (mine && (mx || mz)) { const l = Math.hypot(mx, mz); dvx = (mx / l) * 4.2; dvz = (mz / l) * 4.2; }
    else if (mine && this.manualT > 0) { dvx = 0; dvz = 0; }
    else { const dx = tx - pl.x, dz = tz - pl.z, d = Math.hypot(dx, dz), sp = Math.min(vmax, d * 5); dvx = d > 1e-3 ? (dx / d) * sp : 0; dvz = d > 1e-3 ? (dz / d) * sp : 0; }
    const a = 1 - Math.exp(-12 * dt);
    pl.vx += (dvx - pl.vx) * a; pl.vz += (dvz - pl.vz) * a;
    if (this.phase !== 'serve') { pl.x += pl.vx * dt; pl.z += pl.vz * dt; }
    pl.x = THREE.MathUtils.clamp(pl.x, C.x - C.hw - 0.9, C.x + C.hw + 0.9);
    pl.z = mine ? THREE.MathUtils.clamp(pl.z, C.z - C.hl - 1.3, C.z - 0.5) : THREE.MathUtils.clamp(pl.z, C.z + 0.5, C.z + C.hl + 1.3);
    // the racket rises to meet it as it comes
    const want = incoming && plan && !leaving ? THREE.MathUtils.lerp(Y + 1.0, plan.y, smooth(THREE.MathUtils.clamp(1 - (plan.at - this.t) / 0.6, 0, 1))) : Y + 1.0;
    pl.h += (want - pl.h) * (1 - Math.exp(-10 * dt));
    pl.swing = Math.max(0, pl.swing - dt);
  }

  // ---------------------------------------------------------------- drawing
  draw(dt, camera) {
    const { C, Y, fx } = this;
    // the rackets: hers facing north, theirs south; a swing sweeps the head through (overhead or from below)
    for (const [pl, mesh, face] of [[this.me, this.mine, 0], [this.them, this.partner, Math.PI]]) {
      const k = pl.swing > 0 ? 1 - pl.swing / 0.24 : 0, arc = Math.sin(k * Math.PI);
      const s = mesh.scale.x, head = 0.55 * s;
      mesh.position.set(pl.x + (face ? -0.18 : 0.18), pl.h - head * Math.cos(arc * 0.9), pl.z);
      mesh.rotation.set((pl.over ? -1 : 1) * (arc * 1.3 - 0.15), face, (face ? -1 : 1) * 0.25, 'YXZ');
      const sh = face ? fx.themShadow : fx.meShadow; sh.position.set(pl.x, Y + 0.005, pl.z);
    }
    // the shuttle: cork first along its flight, its shadow, its trail
    this.shuttle.position.copy(this.p);
    if (this.inFlight && this.v.lengthSq() > 1e-3) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.v.clone().normalize());
      this.shuttle.quaternion.slerp(q, 1 - Math.exp(-18 * dt));
    }
    fx.shuttleShadow.visible = this.shuttle.visible; fx.shuttleShadow.position.set(this.p.x, Y + 0.005, this.p.z);
    fx.shuttleShadow.material.opacity = THREE.MathUtils.clamp(1.2 - (this.p.y - Y) / 6, 0.15, 1);
    if (this.inFlight) { this.trail.unshift(this.p.clone()); if (this.trail.length > 18) this.trail.pop(); } else if (this.trail.length) this.trail.pop();
    const tp = fx.trail.geometry.attributes.position, tc = fx.trail.geometry.attributes.color, fast = Math.min(1, this.v.length() / 20);
    for (let i = 0; i < 18; i++) { const q = this.trail[Math.min(i, this.trail.length - 1)] || this.p; tp.setXYZ(i, q.x, q.y, q.z); const c = this.trail.length ? (1 - i / 18) * 0.5 * (0.3 + fast) : 0; tc.setXYZ(i, c, c, c); }
    tp.needsUpdate = tc.needsUpdate = true; fx.trail.visible = this.trail.length > 1;
    // where it will come down on her side (red: going out), and the timing ring as it reaches her racket
    const incoming = this.phase === 'play' && this.inFlight && this.lastHitter === 'them' && this.flight;
    fx.land.visible = fx.landDot.visible = !!incoming;
    if (incoming) {
      const e = this.flight.end, col = this.landsIn ? 0xffffff : 0xff5a4a, pulse = 1 + Math.sin(this.t * 10) * 0.06;
      fx.land.position.set(e.x, Y + 0.006, e.z); fx.landDot.position.set(e.x, Y + 0.006, e.z); fx.land.scale.setScalar(pulse);
      fx.land.material.color.set(col); fx.landDot.material.color.set(col);
    }
    const plan = this.me.plan, tc0 = plan && incoming ? plan.at - this.t : null;
    fx.ring.visible = tc0 != null && tc0 < 0.95 && tc0 > -0.15 && !this.pending && this.landsIn;
    if (fx.ring.visible) {
      const u = THREE.MathUtils.clamp(tc0 / 0.95, 0, 1), sz = 0.07 + 1.1 * u;
      fx.ring.position.copy(this.p); fx.ring.quaternion.copy(camera.quaternion); fx.ring.scale.setScalar(sz);
      const now = Math.abs(tc0) < 0.06;
      fx.ring.material.color.set(now ? 0xffc65a : 0xffffff); fx.ring.material.opacity = 0.35 + 0.55 * (1 - u);
    }
    // where she's aiming
    const showAim = this.aimPt && this.t - this.aimAt < 4 && (this.phase === 'play' || (this.phase === 'serve' && this.server === 'me'));
    fx.aim.visible = !!showAim;
    if (showAim) { const a = this.aimPoint(); fx.aim.position.set(a.x, Y + 0.006, a.z); }
    // the flash
    if (this.burstT > 0) { this.burstT -= dt; const k = 1 - this.burstT / 0.22; fx.burst.scale.setScalar(0.06 + k * 0.22); fx.burst.material.opacity = 0.85 * (1 - k); fx.burst.quaternion.copy(camera.quaternion); } else fx.burst.visible = false;
  }
  // the broadcast camera: behind her baseline and above, following her a little; a jolt on a smash
  placeCamera(camera, dt) {
    if (!this.on) return false;
    const { C, Y } = this, follow = (this.me.x - C.x) * 0.3, fz = THREE.MathUtils.clamp(this.me.z - (C.z - 3.4), -2, 2) * 0.25;
    const pos = new THREE.Vector3(C.x + follow, Y + 4.5, C.z - C.hl - 3.5 + fz), look = new THREE.Vector3(C.x + follow * 0.7, Y + 0.5, C.z + 0.4 + fz * 0.5);
    if (!this.cam.ready) { this.cam.pos.copy(camera.position); this.cam.look.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3())); this.cam.ready = true; this.cam.t = 0; }
    this.cam.t += dt;
    const k = this.cam.t < 1.2 ? 1 - Math.exp(-4 * dt) : 1 - Math.exp(-6 * dt);
    this.cam.pos.lerp(pos, k); this.cam.look.lerp(look, k);
    camera.position.copy(this.cam.pos);
    if (this.shake > 0) { this.shake -= dt; camera.position.x += rnd(-1, 1) * this.shake * 0.06; camera.position.y += rnd(-1, 1) * this.shake * 0.04; }
    camera.up.set(0, 1, 0); camera.lookAt(this.cam.look);
    camera.fov += (52 - camera.fov) * (1 - Math.exp(-4 * dt)); camera.near = 0.1; camera.updateProjectionMatrix();
    return true;
  }
}
