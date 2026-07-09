import { readFile, writeFile, copyFile } from "node:fs/promises";
import { decompress } from "wawoff2";
import { Resvg } from "@resvg/resvg-js";

// 0. Control Upright otf -> functions/ so the deployed bundle is self-contained (the
// function can't read ../../public at runtime).
for (const f of ["ControlUpright-Bold.otf", "ControlUpright-Regular.otf"]) {
  await copyFile(`../public/fonts/${f}`, `src/fonts/${f}`);
  console.log("font:", f, "(copied)");
}

// 1. Söhne Mono woff2 -> ttf (Satori can't read woff2). Lossless sfnt unwrap.
const woff2 = await readFile("../public/fonts/soehne-mono-kraftig.woff2");
const ttf = await decompress(woff2);
await writeFile("src/fonts/soehne-mono-kraftig.ttf", Buffer.from(ttf));
console.log("font: soehne-mono-kraftig.ttf", ttf.length, "bytes");

// 2. GUILTY wordmark SVG -> PNG (embed as <img> in the card; robust vs Satori SVG quirks).
const svg = await readFile("../src/assets/Guilty_Wordmark_RGB_Orange.svg", "utf8");
const r = new Resvg(svg, { fitTo: { mode: "width", value: 1120 } });
const png = r.render().asPng();
await writeFile("src/assets/wordmark.png", png);
console.log("wordmark.png", png.length, "bytes", r.width + "x" + r.height);
