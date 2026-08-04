import { writeFile } from "node:fs/promises";
import { renderCardPng } from "./src/card.mjs";
const OUT = "/private/tmp/claude-501/-Users-nara-Desktop-new-confessional/1943fe96-7443-419a-84c4-99b218f3c8e6/scratchpad";

const MATCH = {
  confession: "I love expensive soda",
  verdict: "Guilty of needing your soda to come with a price tag so your little treat looks official.",
  venue: "Seoul Tiger 1988",
  subjectNumber: 354,
};
const LONG = {
  confession: "I told everyone the bulgogi was a family recipe",
  verdict: "Charged with passing off a jarred marinade as your grandmother's secret, feeding thirty guests a lie sweeter than the sauce, and accepting every compliment for a bulgogi that owed more to the supermarket than to your bloodline or any ancestor who ever held a pan.",
  venue: "Seoul Tiger 1988",
  subjectNumber: 512,
};
const SHORT = {
  confession: "I lied.",
  verdict: "Guilty.",
  venue: "Frenchie",
  subjectNumber: 77,
};

for (const [name, data] of [["match", MATCH], ["long", LONG], ["short", SHORT]]) {
  const png = await renderCardPng(data);
  await writeFile(`${OUT}/satori-${name}.png`, png);
  console.log("wrote satori-" + name + ".png", png.length, "bytes  (verdict " + data.verdict.length + " chars)");
}
