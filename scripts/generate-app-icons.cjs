// Rebuild Windows/Linux app icons from the canonical approved SVG.
// KINDRED_PLAYWRIGHT_MODULE may point to an externally installed Playwright.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '../desktop/icons');
  const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const images = await page.evaluate(async svg => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + btoa(svg);
      await image.decode();
      const result = {};
      for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        result[size] = canvas.toDataURL('image/png').split(',')[1];
      }
      return result;
    }, svg);
    fs.writeFileSync(path.join(root, 'icon.png'), Buffer.from(images[512], 'base64'));
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    const pngs = sizes.map((size, index) => {
      const png = Buffer.from(images[size], 'base64');
      const at = 6 + index * 16;
      header[at] = header[at + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, at + 4);
      header.writeUInt16LE(32, at + 6);
      header.writeUInt32LE(png.length, at + 8);
      header.writeUInt32LE(offset, at + 12);
      offset += png.length;
      return png;
    });
    fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, ...pngs]));
    console.log('Generated Linux PNG and Windows ICO (16–256 px).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
