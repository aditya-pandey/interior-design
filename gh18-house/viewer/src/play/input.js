// Driving input for /play/ (phase 3): keyboard, gamepad and touch turned into smooth throttle, brake and
// steering, plus the driving-aid levels. The pure parts (ramps, the keyboard steering limit, the stick
// curve) take no DOM, so scripts/drive_harness.mjs can test them.
//
// Keyboard and touch are on/off, so they are shaped:
//   - steering eases in (faster at low speed, calmer at speed), snaps back to centre, and swaps sides quickly
//   - with aids on, a full key press turns the wheels only as far as the tyres can use at that speed
//     (about their peak slip): holding a key carves the corner at the limit instead of scrubbing past it
//   - throttle and brake ramp in over ~0.2 s, so a tap doesn't spin the front wheels
// Gamepad (standard mapping): left stick steers (dead zone, a curve for precision near centre, the same
// speed-sensitive limit as a soft ceiling), RT / LT throttle / brake (analogue), RB or A handbrake, Y get
// in / out, B horn, View camera, D-pad up lights, right stick looks around. Rumble follows tyre slip,
// the road surface and impacts.

export const AID_LEVELS = {
  assisted: { label: 'Assisted', counter: 1, esc: 1, tcs: true, abs: true, keyLimit: 1.0, padLimit: 1.15 },
  sport: { label: 'Sport', counter: 0.35, esc: 0.3, tcs: true, abs: true, keyLimit: 1.15, padLimit: 1.5 },
  off: { label: 'Aids off', counter: 0, esc: 0, tcs: false, abs: false, keyLimit: Infinity, padLimit: Infinity },
};
export const AID_ORDER = ['assisted', 'sport', 'off'];

// how much of the available steering lock reaches about the tyres' peak grip at speed u (m/s), 0..1
export function steerLimit(u, s) {
  const au = Math.abs(u);
  if (au < 6) return 1;
  const lock = s.maxSteer / (1 + Math.max(0, au - s.lockFreeSpeed) / s.lockSpeedFalloff);
  // the wheel angle for a steady corner at ~0.9 of the grip, plus the front tyres' slip at that load
  const need = (s.wheelbase * 0.9 * s.mu * 9.81) / (au * au) * (1 + s.understeerK * au * au) + s.peakSlip * 0.85;
  return Math.min(1, need / lock);
}

// shape an on/off steering key into a smooth input. state: { steer }, target -1 / 0 / 1.
export function rampKeySteer(state, target, u, dt, limit = 1) {
  const au = Math.abs(u);
  const want = target * limit;
  const rateIn = 1.6 + 4.2 / (1 + au / 12);              // per second
  const rate = target === 0 ? 6 : Math.sign(want) !== Math.sign(state.steer) && state.steer !== 0 ? 9 : rateIn;
  state.steer += Math.max(-rate * dt, Math.min(rate * dt, want - state.steer));
  return state.steer;
}
export function rampPedal(v, target, dt, up, down) {
  return v + Math.max(-down * dt, Math.min(up * dt, target - v));
}
// stick: dead zone, then a curve (fine control near the centre)
export function stickCurve(x, dead = 0.08, power = 1.6) {
  const a = Math.abs(x);
  if (a < dead) return 0;
  return Math.sign(x) * Math.pow((a - dead) / (1 - dead), power);
}

export class DriverInput {
  constructor(spec) {
    this.s = spec;
    this.key = { steer: 0 };
    this.throttle = 0; this.brake = 0;
    this.level = 'assisted';
    try { const l = localStorage.getItem('gh18.aids'); if (AID_LEVELS[l]) this.level = l; } catch { /* storage off */ }
    this.prevButtons = [];
    this.pad = null;
    this.padLook = { x: 0, y: 0 };
    this.rumbleT = 0;
    this.onPadConnect = null;
    window.addEventListener('gamepadconnected', (e) => this.onPadConnect?.(e.gamepad));
  }
  get aids() { return AID_LEVELS[this.level]; }
  setLevel(l) { this.level = AID_LEVELS[l] ? l : 'assisted'; try { localStorage.setItem('gh18.aids', this.level); } catch { /* ignore */ } return this.aids; }
  cycleLevel() { return this.setLevel(AID_ORDER[(AID_ORDER.indexOf(this.level) + 1) % AID_ORDER.length]); }

  // keys: held key codes; touch: on-screen buttons; u: car's forward speed (m/s)
  read(dt, keys, touch, u) {
    const k = (...c) => c.some((x) => keys[x]);
    const aids = this.aids;
    const lim = steerLimit(u, this.s);
    // keyboard / touch
    const tK = (k('KeyW', 'ArrowUp') || touch.gas ? 1 : 0), bK = (k('KeyS', 'ArrowDown') || touch.brake ? 1 : 0);
    const sK = (k('KeyA', 'ArrowLeft') || touch.left ? 1 : 0) - (k('KeyD', 'ArrowRight') || touch.right ? 1 : 0);
    this.throttle = rampPedal(this.throttle, tK, dt, 5, 9);
    this.brake = rampPedal(this.brake, bK, dt, 7, 12);
    let steer = rampKeySteer(this.key, sK, u, dt, Math.min(1, lim * aids.keyLimit));
    let throttle = this.throttle, brake = this.brake;
    let handbrake = !!keys.Space;
    // gamepad
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const pad = pads.find((p) => p.mapping === 'standard') || pads[0] || null;
    this.pad = pad;
    this.events = [];
    if (pad) {
      const sx = stickCurve(pad.axes[0] || 0);
      if (sx !== 0) steer = -sx * Math.min(1, lim * aids.padLimit);
      const rt = pad.buttons[7]?.value || 0, lt = pad.buttons[6]?.value || 0;
      if (rt > 0.04) throttle = Math.max(throttle, rt);
      if (lt > 0.04) brake = Math.max(brake, lt);
      handbrake = handbrake || !!pad.buttons[5]?.pressed || !!pad.buttons[0]?.pressed;
      this.padLook.x = stickCurve(pad.axes[2] || 0, 0.12, 1.3);
      this.padLook.y = stickCurve(pad.axes[3] || 0, 0.12, 1.3);
      // button presses (edges): Y in / out, B horn (held), View camera, D-pad up lights
      const pressed = (i) => !!pad.buttons[i]?.pressed;
      for (const [i, name] of [[3, 'foot'], [8, 'camera'], [12, 'lights'], [13, 'time'], [9, 'music']]) if (pressed(i) && !this.prevButtons[i]) this.events.push(name);
      this.horn = pressed(1);
      this.lookBack = pressed(11) || pressed(4);              // right-stick click or LB: look behind
      this.prevButtons = pad.buttons.map((b) => b.pressed);
    } else { this.padLook.x = this.padLook.y = 0; this.horn = false; }
    return { throttle, brake, steer, handbrake };
  }

  // rumble: weak motor for tyre slip and rough ground, strong one for impacts
  rumble(dt, sim) {
    const act = this.pad?.vibrationActuator;
    if (!act) return;
    this.rumbleT -= dt;
    const hit = Math.min(1, sim.impact / 6);
    if (this.rumbleT > 0 && hit < 0.2) return;
    this.rumbleT = 0.1;
    const rough = sim.surface === 'sand' ? 0.12 : sim.surface === 'ground' ? 0.18 : sim.surface === 'water' ? 0.2 : 0;
    const v = Math.min(1, Math.abs(sim.speed) / 20);
    const weak = Math.min(1, sim.slip * 0.55 + rough * v);
    const strong = Math.min(1, hit + (sim.tel?.abs ? 0.25 : 0));
    if (weak < 0.02 && strong < 0.02) return;
    act.playEffect?.('dual-rumble', { startDelay: 0, duration: 120, weakMagnitude: weak, strongMagnitude: strong }).catch?.(() => {});
  }
}
