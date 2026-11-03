// The time of day for /play/ as a running clock (world step 1). The sun's position comes from the real
// date and a place on India's west coast (by default near Goa, 15.5° N 73.8° E, IST): it rises behind the
// hills inland, east-south-east in November, and sets west-south-west over the Arabian Sea. The look of
// the light (sun colour and strength, sky, haze, exposure, lamps, stars) follows the sun's height, with
// a cooler, misty palette while it rises and a warmer one while it sets.
// Pure functions: no three.js here, so it can be tested in Node.

export const PLACE = { lat: 15.5, lon: 73.8, tz: 5.5 };
const R = Math.PI / 180;

function dayOfYear(d) {
  const start = Date.UTC(d.getFullYear(), 0, 1);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5) + 1;
}

// sun position at local clock time `hours` (0..24) on `date`: { az: degrees from north, clockwise
// (east = 90), el: degrees above the horizon }. NOAA's approximation, good to a fraction of a degree.
export function sunPosition(date, hours, place = PLACE) {
  const doy = dayOfYear(date);
  const g = (2 * Math.PI / 365) * (doy - 1 + (hours - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hours * 60 + eqt + 4 * place.lon - 60 * place.tz;
  const ha = (tst / 4 - 180) * R, lat = place.lat * R;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const el = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / R;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / R + 180 + 360) % 360;
  return { az, el };
}

// sunrise, solar noon and sunset (clock hours) for a date: the sun's upper edge on the horizon,
// with refraction (−0.833°)
const cache = new Map();
export function sunEvents(date, place = PLACE) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${place.lat}-${place.lon}`;
  if (cache.has(key)) return cache.get(key);
  let rise = null, set = null, noon = 12, best = -99, prev = sunPosition(date, 0, place).el;
  for (let m = 1; m <= 1440; m++) {
    const h = m / 60, el = sunPosition(date, h, place).el;
    if (prev < -0.833 && el >= -0.833) rise = h - (el + 0.833) / (el - prev) / 60;
    if (prev >= -0.833 && el < -0.833) set = h - (el + 0.833) / (el - prev) / 60;
    if (el > best) { best = el; noon = h; }
    prev = el;
  }
  const out = { rise, noon, set, noonEl: best };
  cache.set(key, out);
  return out;
}

// named moments of the day (clock hours), from the day's own sunrise and sunset
export const MOMENTS = ['sunrise', 'morning', 'day', 'evening', 'sunset', 'dusk', 'night'];
export const MOMENT_LABEL = { sunrise: 'Sunrise', morning: 'Morning', day: 'Midday', evening: 'Golden hour', sunset: 'Sunset', dusk: 'Dusk', night: 'Night' };
export function momentHour(name, date, place = PLACE) {
  const e = sunEvents(date, place);
  return {
    sunrise: e.rise + 4 / 60, morning: e.rise + 2.3, day: e.noon, evening: e.set - 38 / 60,
    sunset: e.set - 6 / 60, dusk: e.set + 16 / 60, night: e.set + 2.6,
  }[name] ?? e.set - 55 / 60;
}
// the moment a clock time is closest to (for the button's label)
export function nearestMoment(hours, date, place = PLACE) {
  let best = 'day', bd = 99;
  for (const m of MOMENTS) {
    let d = Math.abs(momentHour(m, date, place) - hours); d = Math.min(d, 24 - d);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export const fmtClock = (h) => { const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// the light for a sun height. keys: [{ el, ...look }] sorted by el; numbers and colours blend, other
// fields switch half-way. `colour(key)` tells which fields are colours.
export function blendKeys(keys, el, lerpLook) {
  if (el <= keys[0].el) return { ...keys[0] };
  for (let i = 1; i < keys.length; i++) {
    if (el <= keys[i].el) return lerpLook(keys[i - 1], keys[i], (el - keys[i - 1].el) / (keys[i].el - keys[i - 1].el));
  }
  return { ...keys[keys.length - 1] };
}
