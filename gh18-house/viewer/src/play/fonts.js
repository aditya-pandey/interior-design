// The type for /play/ (bundled, open-licence, trimmed to the characters needed; licences in play/fonts/):
//   - Cormorant Garamond (italic 400, medium 500): an editorial serif for her name, the plaque and her poems
//   - Inter (500, 600): a clean sans for labels, small caps lines and the HUD
//   - Noto Serif Devanagari (400): her Hindi poems
// fontsReady resolves once they are in (or have failed: the canvases fall back to Georgia); the canvas
// textures that use them are redrawn then.
const FACES = [
  ['Cormorant Garamond', 'CormorantGaramond-Italic.woff2', { style: 'italic', weight: '400' }],
  ['Cormorant Garamond', 'CormorantGaramond-Medium.woff2', { weight: '500' }],
  ['Inter', 'Inter-Medium.woff2', { weight: '500' }],
  ['Inter', 'Inter-SemiBold.woff2', { weight: '600' }],
  ['Noto Serif Devanagari', 'NotoSerifDevanagari-Regular.woff2', { weight: '400' }],
];
export const SERIF = "'Cormorant Garamond', Georgia, serif";
export const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
export const DEVA = "'Noto Serif Devanagari', Georgia, serif";
export const fontsReady = typeof FontFace === 'undefined' ? Promise.resolve()
  : Promise.allSettled(FACES.map(([family, file, desc]) => new FontFace(family, `url(play/fonts/${file})`, desc).load().then((f) => document.fonts.add(f))));
