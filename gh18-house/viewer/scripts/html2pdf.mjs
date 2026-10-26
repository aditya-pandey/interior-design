// HTML -> PDF with Playwright's Chromium (page size from the HTML's @page rule).
// Usage (from gh18-house/viewer): node scripts/html2pdf.mjs ../plans/r1/materials.html ../plans/r1/GH-18_R1_materials.pdf [footer label | -]
// A footer label of '-' prints no header or footer (drawing sheets carry their own title block).
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}
const [, , src, out, label = 'GH-18 R1 materials'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
await page.pdf({
  path: out, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: label !== '-',
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="font-size:7px;width:100%;padding:0 12mm;color:#8a7a5c;font-family:Inter,sans-serif;text-align:right">' + label + ' · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
});
await browser.close();
console.log('wrote', out);
