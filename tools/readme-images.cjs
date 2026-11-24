// The README's pictures, cut from the gallery's demo shots (made-up data only).
// usage: npx electron tools/shoot.cjs chat-working new accounts ask relay chat-long
//        npx electron tools/readme-images.cjs
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');
const DOCS = path.join(__dirname, '..', 'docs');
const CUTS = [ // [file in docs/, gallery shot, crop (null = whole window)]
  ['screenshot.png', 'chat-working-dark.png', null],
  ['pick-who-answers.png', 'new-dark.png', { x: 430, y: 170, width: 720, height: 430 }],
  ['usage.png', 'accounts-dark.png', { x: 0, y: 552, width: 300, height: 308 }],
  ['questions.png', 'ask-dark.png', { x: 400, y: 112, width: 660, height: 612 }],
  ['chats-talk.png', 'relay-dark.png', { x: 400, y: 112, width: 770, height: 612 }],
  ['light.png', 'chat-long-light.png', null],
];
app.whenReady().then(() => {
  fs.mkdirSync(DOCS, { recursive: true });
  for (const [out, shot, crop] of CUTS) {
    const img = nativeImage.createFromPath(path.join(SHOTS, shot));
    if (img.isEmpty()) { console.error('missing shot: ' + shot); continue; }
    const pic = crop ? img.crop(crop) : img;
    fs.writeFileSync(path.join(DOCS, out), pic.toPNG());
    const s = pic.getSize(); console.log(`${out} ${s.width}x${s.height}`);
  }
  app.exit(0);
});
