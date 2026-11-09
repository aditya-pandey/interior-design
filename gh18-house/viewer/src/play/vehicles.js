import { TUNING } from './vehicleTuning.js';

// The garage: every ride she can take, where each is parked, how each drives and sounds.
// spec: the Baleno's TUNING with what's different (vehicle.js). sound: CarAudio's engine voice (audio.js).
// cam: the chase camera's distance and height (m). Credits: shown in the game, with the Baleno's.

export const FLEET = [
  {
    id: 'baleno', name: 'the Baleno', verb: 'Get in', kind: 'car', model: 'baleno',
    park: null,                                    // (at GH-18, main.js HOME)
    spec: TUNING, sound: { freq: 1, gain: 1, tone: 1 }, cam: { dist: 1, height: 1 },
    credit: '“2022 Maruti Suzuki Baleno” by BHP3D (CC BY 4.0)',
  },
  {
    id: 'roma', name: 'the Ferrari', verb: 'Get in', kind: 'car', model: 'roma', url: 'play/models/roma.glb',
    load: { length: 4.656, front: 1, eye: [0.37, 1.02, -0.32], lamps: { light: /Light/, tail: /RED_GLASS/ }, beamY: 0.62, beamX: 0.7 },
    park: { x: 87.4, z: 34.8, yaw: Math.PI },      // the studio's parking pad, beside where the Baleno stops, nose to the road
    spec: {
      ...TUNING,
      rwd: true,
      mass: 1650, wheelbase: 2.67, cgFront: 1.3, cgHeight: 0.46, length: 4.66, width: 1.97, inertia: 2700, wheelRadius: 0.35,
      maxSteer: 0.6, steerRate: 3.0, steerRateFalloff: 14,
      power: 400000, maxAccelForce: 12500,
      gears: [5.3, 3.3, 2.3, 1.75, 1.4, 1.15, 0.9, 0.7], final: 4.4, reverseRatio: 4.5,
      idle: 950, redline: 7500, shiftUpRpm: 7100, shiftDownRpm: 4200, shiftTime: 0.08, maxReverse: 7,
      brakeForce: 23000, rollResist: 200, drag: 0.37,
      mu: 1.2, muRear: 1.32, peakSlip: 0.11, peakSlipRear: 0.085,
      track: 1.65, rollStiff: 140000, rollDamp: 6500, pitchStiff: 260000, pitchDamp: 17000,
    },
    sound: { freq: 2, gain: 1.3, tone: 1.5 },     // a V8: twice the firing frequency of the Baleno's four, fuller
    cam: { dist: 1.12, height: 0.92 },
    credit: '“2020 Ferrari Roma” by Ddiaz Design (CC BY 4.0)',
  },
  {
    id: 'vespa', name: 'the Vespa', verb: 'Ride', kind: 'scooter', model: 'vespa', url: 'play/models/vespa.glb',
    load: { kind: 'scooter', scale: 1.86 / 4.64, flip: false, front: [1.696, 0.517, 0.6], rear: [-1.665, 0.517, 0.57], halfWidth: 0.26,
      axis: { at: [0.9, 2.5], dir: [-0.8, 1.98] }, barsAbove: 2.52, barsBehind: 0.75, lamp: [1.05, 2.75], eye: [0, 1.52, -0.22] },
    park: { x: 95.4, z: 37.4, yaw: -Math.PI / 2 }, // by the studio, at the end of the parking pad, facing it
    spec: {
      ...TUNING,
      rwd: true,
      mass: 210, wheelbase: 1.34, cgFront: 0.72, cgHeight: 0.6, length: 1.86, width: 0.72, inertia: 55, wheelRadius: 0.27,
      maxSteer: 0.55, lockFreeSpeed: 2, lockSpeedFalloff: 9, steerRate: 3.2, steerRateFalloff: 8,
      power: 6200, maxAccelForce: 900, gears: [3.0, 2.1, 1.55, 1.15, 0.9], final: 7.5, reverseRatio: 1, maxReverse: 0.01,
      idle: 1800, redline: 8500, shiftUpRpm: 7400, shiftDownRpm: 5600, shiftTime: 0.02,
      brakeForce: 2300, rollResist: 40, drag: 0.26,
      mu: 1.0, muRear: 1.05, track: 0.6, rollStiff: 30000, rollDamp: 1500, rollInertia: 12, pitchStiff: 30000, pitchDamp: 2400, pitchInertia: 40,
      counterSteer: 0.2, escGain: 6,
      surfaces: { road: [1, 0], ground: [0.9, 50], sand: [0.75, 150], water: [0.6, 300] },
    },
    sound: { freq: 0.25, gain: 0.75, tone: 2.2, cvt: true },    // one cylinder, a belt drive keeping the revs up
    cam: { dist: 0.55, height: 0.75 },
    credit: '“Vespa scooty” by yogendraprajapati298 (CC BY 4.0)',
  },
  {
    id: 'bicycle', name: 'her bicycle', verb: 'Ride', kind: 'bicycle', model: 'bicycle', url: 'play/models/bike.glb',
    load: { kind: 'bicycle', scale: 0.0435, flip: true, front: [-0.83, 0.3, 7.7], rear: [25.23, 0.3, 7.7], halfWidth: 1.6,
      axis: { at: [3.78, 17.3], dir: [4.61, 16.83] }, steerBehind: 0.7, barsAbove: 16, barsBehind: 7, crank: [14.2, -1.3, 3.2], eye: [0, 1.62, -0.12] },
    park: { x: 102.8, z: 37.9, yaw: -Math.PI / 2 },          // on the sand by the studio's front, where her old bicycle leaned
    spec: {
      ...TUNING,
      rwd: true,
      mass: 85, wheelbase: 1.12, cgFront: 0.62, cgHeight: 0.85, length: 1.85, width: 0.6, inertia: 22, wheelRadius: 0.335,
      maxSteer: 0.5, lockFreeSpeed: 2, lockSpeedFalloff: 6, steerRate: 2.6, steerRateFalloff: 6,
      power: 230, maxAccelForce: 230, gears: [1], final: 1, reverseRatio: 1, maxReverse: 0.01,
      idle: 0, redline: 400, shiftUpRpm: 1e9, shiftDownRpm: -1, shiftTime: 0,
      brakeForce: 700, rollResist: 12, drag: 0.3,
      mu: 0.95, muRear: 1.0, track: 0.5, rollStiff: 12000, rollDamp: 700, rollInertia: 6, pitchStiff: 12000, pitchDamp: 900, pitchInertia: 15,
      counterSteer: 0.2, escGain: 6,
      surfaces: { road: [1, 0], ground: [0.9, 20], sand: [0.7, 45], water: [0.6, 90] },
    },
    sound: { engine: false, freewheel: true },
    cam: { dist: 0.5, height: 0.75 },
    credit: '“Retro bike” by annzep (CC BY 4.0)',
  },
];
