// Reads exact pixel colours from a reference screenshot (Electron main process, no window).
// usage: electron tools/sample-colors.cjs <png> x,y[,label] x,y[,label] ...
const { app, nativeImage } = require('electron');
app.whenReady().then(() => {
  const [file, ...points] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('sample-colors.cjs') && a !== '.');
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  const bmp = img.toBitmap(); // BGRA
  console.log(`image ${width}x${height}`);
  for (const p of points) {
    const [x, y, label = ''] = p.split(',');
    const i = (Number(y) * width + Number(x)) * 4;
    const hex = '#' + [bmp[i + 2], bmp[i + 1], bmp[i]].map((v) => v.toString(16).padStart(2, '0')).join('');
    console.log(`${label.padEnd(22)} (${x},${y}) ${hex}`);
  }
  app.exit(0);
});
