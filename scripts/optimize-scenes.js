// Turns the full-size photos in src/assets/scene-backgrounds/ into the
// TV-sized backgrounds and phone thumbnails the app actually loads
// (src/assets/scenes/<name>.jpg and <name>-thumb.jpg).
//
//   npm run scenes

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src/assets/scene-backgrounds");
const OUT = path.join(root, "src/assets/scenes");

fs.mkdirSync(OUT, { recursive: true });

for (const file of fs.readdirSync(SRC)) {
  if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
  const name = path.parse(file).name;
  const input = path.join(SRC, file);

  await sharp(input)
    .rotate()
    .resize({ width: 1920, height: 1080, fit: "cover" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(OUT, `${name}.jpg`));
  await sharp(input)
    .rotate()
    .resize({ width: 320, height: 180, fit: "cover" })
    .jpeg({ quality: 70, mozjpeg: true })
    .toFile(path.join(OUT, `${name}-thumb.jpg`));

  console.log(`✓ ${name}`);
}
