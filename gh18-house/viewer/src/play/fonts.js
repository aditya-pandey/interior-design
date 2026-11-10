// The type for /play/ (bundled, open-licence, trimmed to the characters needed; licences in play/fonts/):
//   - Cormorant Garamond (italic 400, medium 500): an editorial serif for her name, the plaque and her poems
//   - Inter (500, 600): a clean sans for labels, small caps lines and the HUD
//   - Noto Serif Devanagari (400): her Hindi poems
// fontsReady resolves once they are in (or have failed: the canvases fall back to Georgia); the canvas
// textures that use them are redrawn then.
const FACES = [
  ['Kalam', 'kalam-latin-400-normal.woff2', { weight: '400' }],
  ['Kalam', 'kalam-latin-700-normal.woff2', { weight: '700' }],
  ['Kalam', 'kalam-devanagari-400-normal.woff2', { weight: '400', unicodeRange: 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF' }],
  ['Kalam', 'kalam-devanagari-700-normal.woff2', { weight: '700', unicodeRange: 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF' }],
  ['Manrope', 'manrope-latin-500-normal.woff2', { weight: '500' }],
  ['Manrope', 'manrope-latin-600-normal.woff2', { weight: '600' }],
  ['Manrope', 'manrope-latin-700-normal.woff2', { weight: '700' }],
];
// (handwritten Kalam, Latin and Devanagari, for her name, her poems and the e-reader; Manrope, a modern sans, for
// labels and the HUD; both SIL OFL, licences in play/fonts/)
export const SERIF = "Kalam, 'Segoe Print', cursive";
export const SANS = "Manrope, 'Helvetica Neue', Arial, sans-serif";
export const DEVA = "Kalam, 'Noto Serif Devanagari', serif";
export const fontsReady = typeof FontFace === 'undefined' ? Promise.resolve()
  : Promise.allSettled(FACES.map(([family, file, desc]) => new FontFace(family, `url(play/fonts/${file})`, desc).load().then((f) => document.fonts.add(f))));
