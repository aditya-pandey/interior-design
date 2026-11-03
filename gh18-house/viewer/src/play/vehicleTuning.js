// Every number that shapes how the Baleno drives, in one place. vehicle.js reads these; the debug
// overlay (F3 in /play/) shows what they do live, and scripts/drive_harness.mjs measures the result.
// Units: SI (kg, m, s, N, rad) unless noted. "Front" / "rear" are the axles.

export const TUNING = {
  // ---- body (2022 Maruti Suzuki Baleno)
  mass: 920,               // kg, with a driver
  wheelbase: 2.52,         // m
  cgFront: 1.02,           // m from the centre of mass to the front axle (60 % of the weight on the front)
  cgHeight: 0.52,          // m; higher = more weight transfer (more dive, squat and roll)
  length: 3.99, width: 1.745,   // m, the collision box
  inertia: 1250,           // kg·m², yaw; higher = lazier to rotate, calmer in slides
  wheelRadius: 0.30,       // m

  // ---- steering
  maxSteer: 0.58,          // rad of front-wheel lock at a standstill (sets the turning circle)
  lockSpeedFalloff: 19,    // m/s; lock = maxSteer / (1 + speed / this): lower = less lock at speed
  steerRate: 2.6,          // rad/s the wheels turn in
  steerReturn: 3.8,        // rad/s they come back towards centre (or reverse direction)
  steerRateSlide: 2,       // steering speeds up by (1 + this × slide angle) while sliding, to catch it

  // ---- engine and gearbox (front-wheel drive)
  power: 58000,            // W at the wheels; sets top speed and how hard it pulls at speed
  maxAccelForce: 3000,     // N; caps the pull at low speed (sets 0–100)
  gears: [3.55, 1.90, 1.28, 0.97, 0.78], final: 4.2, reverseRatio: 3.5,
  idle: 850, redline: 6200,     // rpm
  shiftUpRpm: 5300, shiftDownRpm: 3000, shiftTime: 0.22,   // rpm, rpm, s of drive cut while changing up
  maxReverse: 6,           // m/s

  // ---- brakes
  brakeForce: 9800,        // N at full pedal
  frontBrake: 0.66,        // share of braking on the front axle
  absFront: 0.95,          // ABS: front braking (and drive: traction control) capped at this × grip
  absRear: 0.6,            // rear braking capped at this × grip, so the rear keeps turning (stable)
  handbrakeForce: 4200,    // N (unused while the rear is locked: then it's sliding friction)

  // ---- resistance
  rollResist: 140,         // N
  drag: 0.42,              // N per (m/s)²  (½ ρ Cd A)

  // ---- tyres: Pacejka magic formula, sideways force vs slip angle
  mu: 1.0, muRear: 1.05,   // peak grip (× load) front / rear; rear a touch higher = stable at speed
  muSlide: 0.82,           // sliding grip of locked wheels (handbrake)
  peakSlip: 0.125,         // rad; slip angle of peak grip, front (smaller = sharper, stiffer)
  peakSlipRear: 0.09,      // rad; rear
  shape: 1.42,             // C front: how far grip falls past the peak (1.0 none … 1.6 a lot)
  shapeRear: 1.15,         // C rear: lower = rear lets go more gently, slides are catchable
  curvature: -0.4,         // E: roundness of the peak
  loadSens: 0.1,           // grip lost per unit of extra load (loaded tyres grip proportionally less)
  lowSpeedSlip: 1.2,       // m/s; slip angles use at least this speed (keeps them sane when slow)
  rollBlend: [0.6, 1.6],   // m/s: below the first the car just rolls (no slip); fully tyre-model above the sum

  // ---- surfaces: [grip ×, extra rolling drag N]
  surfaces: { road: [1, 0], ground: [0.9, 260], sand: [0.72, 900], water: [0.6, 2600] },

  // ---- driver aids
  counterSteer: 0.55,      // automatic counter-steer per rad of slide (0 = off)
  counterSteerMax: 0.35,   // rad, its limit
  counterSteerYield: 0.6,  // how much it backs off while the driver steers (0..1)

  // ---- body motion (filters on the accelerations that drive weight transfer and the visuals)
  accelFilter: 6,          // 1/s; lower = the weight shifts more slowly
  // the drawn body (main.js updateCar): lean per m/s² of acceleration, and its spring
  bodyRoll: 0.011,         // rad of roll per m/s² sideways
  bodyPitch: 0.010,        // rad of pitch per m/s² fore-aft (nose down under braking)
  bodySpring: 120, bodyDamp: 16,
  track: 1.52,             // m, front track (for the kerb-to-kerb turning circle)
};
