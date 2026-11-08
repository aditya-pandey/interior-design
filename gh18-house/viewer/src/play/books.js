// Her books: PDFs read on her e-reader (ereader.js). pdf.js (Mozilla's PDF reader) is loaded only when she
// first opens a book.
//
// Two ways to read one:
//   reflowed — the text taken out of the PDF and set again on the e-reader's page at her size: lines joined into
//              paragraphs, headings found by their size, page numbers and running headers dropped, words broken
//              across lines with a hyphen joined again. Best for novels and essays.
//   original — the PDF's own pages, drawn on the screen as they are (for picture books, poetry with its own
//              layout, or a PDF whose text can't be taken out, as with some Hindi fonts). O switches.

let lib = null;
async function pdfjs() {
  if (!lib) lib = (async () => {
    const m = await import('pdfjs-dist');
    const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    m.GlobalWorkerOptions.workerSrc = worker;
    return m;
  })();
  return lib;
}

export async function loadBook(url) {
  const m = await pdfjs();
  const abs = (u) => new URL(u, document.baseURI).href;            // (the worker fetches: relative paths would be from its own folder)
  const doc = await m.getDocument({ url: abs(url), standardFontDataUrl: abs('play/pdfjs/standard_fonts/'), cMapUrl: abs('play/pdfjs/cmaps/'), cMapPacked: true }).promise;
  return { doc, pages: doc.numPages, text: null };
}

// ---- the text, as paragraphs: [{ kind: 'p' | 'h', text }]
export async function bookText(book) {
  if (book.text) return book.text;
  const { doc } = book, perPage = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const lines = [];
    let cur = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const [a, b, , , x, y] = it.transform, size = Math.hypot(a, b) || it.height || 10;
      if (!cur || Math.abs(y - cur.y) > size * 0.5) {
        if (cur) lines.push(cur);
        cur = { text: '', y, x0: x, x1: x, size };
      }
      if (it.str) {
        const gap = x - cur.x1;
        if (cur.text && gap > size * 0.15 && !cur.text.endsWith(' ') && !it.str.startsWith(' ')) cur.text += ' ';
        cur.text += it.str; cur.x1 = x + (it.width || 0); cur.size = Math.max(cur.size, size);
      }
      if (it.hasEOL) { lines.push(cur); cur = null; }
    }
    if (cur) lines.push(cur);
    perPage.push({ h: vp.height, lines: lines.filter((l) => l.text.trim()) });
  }
  // running headers and page numbers: short lines near the top or bottom that repeat, or are only a number
  const edge = new Map();
  for (const p of perPage) for (const l of p.lines) if (l.y > p.h * 0.9 || l.y < p.h * 0.1) { const k = l.text.trim().toLowerCase(); edge.set(k, (edge.get(k) || 0) + 1); }
  const isFurniture = (p, l) => {
    const t = l.text.trim(), near = l.y > p.h * 0.9 || l.y < p.h * 0.1;
    return near && (/^[-–—\s]*([0-9]{1,4}|[ivxlc]{1,6})[-–—\s]*$/i.test(t) || (edge.get(t.toLowerCase()) || 0) >= Math.max(3, perPage.length * 0.3));
  };
  const sizes = perPage.flatMap((p) => p.lines.map((l) => l.size)).sort((a, b) => a - b), body = sizes[Math.floor(sizes.length / 2)] || 10;
  const paras = [];
  let open = null;
  const flush = () => { if (open && open.text.trim()) paras.push(open); open = null; };
  for (const p of perPage) {
    const ls = p.lines.filter((l) => !isFurniture(p, l));
    if (!ls.length) continue;
    const left = Math.min(...ls.map((l) => l.x0)), right = Math.max(...ls.map((l) => l.x1));
    const gaps = []; for (let i = 1; i < ls.length; i++) gaps.push(ls[i - 1].y - ls[i].y);
    const step = gaps.filter((g) => g > 0).sort((a, b) => a - b)[Math.floor(gaps.length / 3)] || body * 1.4;
    ls.forEach((l, i) => {
      const t = l.text.replace(/\s+/g, ' ').trim();
      if (l.size > body * 1.28) {                                        // a heading (one paragraph however many lines)
        if (open?.kind === 'h' && i > 0 && ls[i - 1].y - l.y < l.size * 1.8) { open.text += ' ' + t; return; }
        flush(); open = { kind: 'h', text: t }; return;
      }
      const prev = ls[i - 1], gap = prev ? prev.y - l.y : 0;
      const indented = l.x0 > left + body * 0.8, prevShort = prev && prev.x1 < right - body * 3, prevEnds = open && /[.!?"”’':]$/.test(open.text);
      const start = !open || open.kind === 'h' || (prev && gap > step * 1.45) || (indented && (prevEnds || prevShort)) || (i === 0 && prevEnds && indented);
      if (start) { flush(); open = { kind: 'p', text: t }; return; }
      // the same paragraph: a word broken over the line is joined again
      if (/[a-zA-Z]-$/.test(open.text) && /^[a-z]/.test(t)) open.text = open.text.slice(0, -1) + t;
      else if (/­$/.test(open.text)) open.text = open.text.slice(0, -1) + t;
      else open.text += ' ' + t;
    });
  }
  flush();
  book.text = paras;
  return paras;
}

// ---- a page as a picture (the original layout), fitted to w × h
export async function renderPage(book, n, w, h) {
  const page = await book.doc.getPage(n), vp0 = page.getViewport({ scale: 1 });
  const scale = Math.min(w / vp0.width, h / vp0.height), vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}
