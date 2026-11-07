import * as THREE from 'three';

// Music in every room: speakers in the studio's spaces and in every room of the house, playing her songs
// "here" (the room where the music was started) or "everywhere".
//
// With her own audio files (pack.tracks) the music is real sound in the space: one stream feeds up to four
// voices, each a positioned source at one of the nearest playing speakers (Web Audio PannerNode, distance
// fall-off), passed through a low-pass and a gain for what stands between her and that speaker: nothing in the
// same room, a little in the studio's open plan, a wall between rooms of the house (more between floors), the
// building's skin from outside. In the car it plays through the car, straight.
// With only YouTube (no files) the same weights set the player's volume.

const MAX_VOICES = 4;

export class RoomAudio {
  // zones: [{ id, name, group ('studio' | 'house'), floor (number), speakers: [[x, y, z]], contains(x, z, foot) }]
  constructor(zones) {
    this.zones = zones;
    this.mode = 'here';                   // 'here' | 'all'
    this.here = null;                     // the zone the music was started in (mode 'here')
    this.voices = [];
    this.level = 0;                       // overall loudness at the listener, 0..1 (for the YouTube fallback)
    this.timer = 0;
  }
  zoneAt(x, z, foot) { return this.zones.find((zn) => zn.contains(x, z, foot)) || null; }

  // the music's stream (a MediaElementAudioSourceNode) feeding the voices
  attach(ctx, source, out) {
    this.ctx = ctx; this.source = source;
    this.voices = Array.from({ length: MAX_VOICES }, () => {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.2; p.rolloffFactor = 1.1; p.maxDistance = 60;
      source.connect(g).connect(lp).connect(p).connect(out);
      return { g, lp, p, spk: null };
    });
    // in the car: straight through, no room
    this.car = ctx.createGain(); this.car.gain.value = 0; source.connect(this.car).connect(out);
  }

  // what stands between the listener (in zone L, or outside) and a speaker in zone Z: [gain, low-pass Hz]
  between(L, Z, outdoors) {
    if (L && L.id === Z.id) return [1, 20000];
    if (!L || outdoors) return Z.group === 'studio' ? [0.45, 2600] : [0.25, 900];              // from outside: glass lets more through
    if (L.group === 'studio' && Z.group === 'studio') return L.floor === Z.floor || L.open || Z.open ? [0.8, 9000] : [0.45, 2200];
    if (L.group !== Z.group) return [0.08, 500];
    return L.floor === Z.floor ? [0.35, 900] : [0.18, 500];
  }

  // every frame: listener position and facing; inCar: the music plays through the car
  update(dt, cam, { playing, inCar, foot }) {
    if (this.ctx) {
      const l = this.ctx.listener, f = new THREE.Vector3(); cam.getWorldDirection(f);
      if (l.positionX) { l.positionX.value = cam.position.x; l.positionY.value = cam.position.y; l.positionZ.value = cam.position.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
      else { l.setPosition(cam.position.x, cam.position.y, cam.position.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    }
    this.timer -= dt;
    if (this.timer > 0) return this.level;
    this.timer = 0.2;
    const t = this.ctx?.currentTime ?? 0;
    if (!playing) { for (const v of this.voices) v.g.gain.setTargetAtTime(0, t, 0.15); if (this.car) this.car.gain.setTargetAtTime(0, t, 0.15); this.level = 0; return 0; }
    if (inCar) {
      for (const v of this.voices) v.g.gain.setTargetAtTime(0, t, 0.2);
      this.car?.gain.setTargetAtTime(0.85, t, 0.2);
      this.level = 1; return 1;
    }
    this.car?.gain.setTargetAtTime(0, t, 0.2);
    const L = this.zoneAt(cam.position.x, cam.position.z, foot), outdoors = !L;
    const live = this.mode === 'all' ? this.zones : this.zones.filter((zn) => zn === this.here);
    const cand = [];
    for (const Z of live) {
      const [occ, cut] = this.between(L, Z, outdoors);
      for (const s of Z.speakers) {
        const d = Math.hypot(s[0] - cam.position.x, s[1] - cam.position.y, s[2] - cam.position.z);
        if (d > 45) continue;
        cand.push({ s, occ, cut, w: occ / (1 + (d / 4.5) ** 2) });
      }
    }
    cand.sort((a, b) => b.w - a.w);
    this.level = Math.min(1, cand.slice(0, MAX_VOICES).reduce((m, c) => m + c.w, 0) * 1.1);
    this.voices.forEach((v, i) => {
      const c = cand[i];
      if (!c) { v.g.gain.setTargetAtTime(0, t, 0.2); return; }
      if (v.spk !== c.s) { v.spk = c.s; v.p.positionX ? (v.p.positionX.value = c.s[0], v.p.positionY.value = c.s[1], v.p.positionZ.value = c.s[2]) : v.p.setPosition(...c.s); }
      v.g.gain.setTargetAtTime(c.occ * 0.6, t, 0.25);
      v.lp.frequency.setTargetAtTime(c.cut, t, 0.25);
    });
    return this.level;
  }
}
