import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const h = React.createElement;

// Lazy, memoized asset load. IMPORTANT: this is NOT top-level await — firebase-functions
// loads the module with require() during codebase analysis, which throws
// ERR_REQUIRE_ASYNC_MODULE on any import graph that has top-level await. Loading on first
// render keeps the graph synchronous to import. All fonts live inside functions/ so the
// deployed bundle is self-contained (nothing read from ../../public).
let _assets = null;
async function loadAssets() {
  if (_assets) return _assets;
  const [sohne, controlBold, controlReg, wordmarkPng] = await Promise.all([
    readFile(join(__dir, "fonts/soehne-mono-kraftig.ttf")),
    readFile(join(__dir, "fonts/ControlUpright-Bold.otf")),
    readFile(join(__dir, "fonts/ControlUpright-Regular.otf")),
    readFile(join(__dir, "assets/wordmark.png")),
  ]);
  _assets = {
    sohne, controlBold, controlReg,
    wordmarkDataUri: "data:image/png;base64," + wordmarkPng.toString("base64"),
  };
  return _assets;
}

const RITUAL = "rgb(0,255,30)";
const MUTED = "rgb(135,130,120)";
const VERDICT = "#F4F0EA";

// Dynamic verdict sizing: hold 70px (client parity) until the card would clip (~200 chars),
// then step down only for genuinely overflowing verdicts. lineHeight ~1.2.
function verdictSize(text) {
  const n = text.length;
  if (n <= 200) return 70;
  if (n <= 290) return 58;
  return 46;
}
function confessionSize(text) {
  return text.length <= 120 ? 42 : 36;
}

// TWO RENDERERS, ONE CARD: this server-side OG renderer and the client-side
// canvas renderer in src/pages/Verdict.tsx (generateShareCard, POST TO STORY)
// draw the same card independently — a change to one needs the same change in
// the other, or they drift. They have drifted twice already (footer handle,
// both times). The footers are now ALIGNED — handle over theboothrecord.com,
// one step dimmer — and must stay so: the story card is the MORE untappable
// of the two (it lands in an Instagram Story with no link, no preview, no way
// to act on it — the address is the only route back; this card at least sits
// on a link someone has already tapped).
function ShareCard({ confession, verdict, venue, subjectNumber, wordmarkDataUri }) {
  const vSize = verdictSize(verdict);
  const cSize = confessionSize(confession);
  const chargeLine2 = venue ? `AT ${venue.toUpperCase()}` : "LOCATION WITHHELD";

  return h("div", {
    style: {
      width: 1080, height: 1920, display: "flex", flexDirection: "column",
      backgroundColor: "#171513", fontFamily: "Sohne", color: "#fff",
    },
  }, [
    // Header (left aligned)
    h("div", { key: "hd", style: {
      display: "flex", flexDirection: "column", alignItems: "flex-start",
      padding: "165px 110px 0 110px",
    } }, [
      h("div", { key: "lbl", style: {
        color: RITUAL, fontSize: 26, letterSpacing: 6, fontWeight: 400,
      } }, "THE BOOTH NOTICED."),
      h("div", { key: "cf", style: {
        color: MUTED, fontSize: cSize, fontWeight: 300, lineHeight: 1.38,
        marginTop: 60, maxWidth: 860,
      } }, confession),
      h("div", { key: "vd", style: {
        color: VERDICT, fontFamily: "Control", fontWeight: 700, fontSize: vSize,
        lineHeight: 1.2, marginTop: 78, maxWidth: 860,
      } }, verdict),
    ]),
    // Middle group — centred in the remaining space (like the canvas)
    h("div", { key: "mid", style: {
      display: "flex", flexGrow: 1, flexDirection: "column",
      alignItems: "center", justifyContent: "center", paddingTop: 80,
    } }, [
      h("img", { key: "wm", src: wordmarkDataUri, width: 560, height: 188,
        style: { transform: "rotate(-10deg)" } }),
      // AS CHARGED stamp in State Blue NEON — BOTH lines, one treatment (a
      // two-line stamp in two colours reads as a bug). Same core + curve as
      // the app's venue-glow-text; the canvas story card mirrors this with
      // layered shadow passes (see Verdict.tsx drawNeonStamp).
      h("div", { key: "c1", style: {
        marginTop: 64, fontSize: 30, letterSpacing: 6, color: "rgb(120,205,235)",
        textShadow:
          "0 0 2.8px rgba(52,155,189,0.97), 0 0 10px rgba(52,155,189,0.68), 0 0 26px rgba(52,155,189,0.47)",
      } }, "AS CHARGED"),
      h("div", { key: "c2", style: {
        marginTop: 12, fontSize: 30, letterSpacing: 6, color: "rgb(120,205,235)",
        textShadow:
          "0 0 2.8px rgba(52,155,189,0.97), 0 0 10px rgba(52,155,189,0.68), 0 0 26px rgba(52,155,189,0.47)",
      } }, chargeLine2),
    ]),
    // Footer
    h("div", { key: "ft", style: {
      display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 96,
    } }, [
      subjectNumber ? h("div", { key: "sn", style: {
        fontSize: 24, letterSpacing: 4, color: "rgba(255,255,255,0.28)", marginBottom: 34,
      } }, `SUBJECT #${subjectNumber}`) : null,
      // NOTE: the card keeps its own white-alpha palette with ONE deliberate
      // exception — the AS CHARGED stamp above is State Blue neon. The stamp
      // is what the venue is sold on, and it receded too far in white for a
      // venue looking at their own card to feel seen. Everything else here
      // (SUBJECT #, handle, URL) STAYS white — do not extend the blue.
      // Handle and URL are near-repetition on purpose: the handle goes to
      // Instagram, the URL goes to the Booth — different destinations.
      h("div", { key: "hg", style: {
        fontSize: 28, color: "rgba(255,255,255,0.4)",
      } }, "@theboothrecord"),
      // An image can't be tapped — the address is the only way someone who
      // sees the card can act on it. (The canvas story card carries it too,
      // for the same reason — see the renderer-pair note above.)
      // Same treatment as the handle, one step dimmer (the SUBJECT# alpha).
      h("div", { key: "url", style: {
        marginTop: 12, fontSize: 28, color: "rgba(255,255,255,0.28)",
      } }, "theboothrecord.com"),
    ]),
  ]);
}

export async function renderCardPng(data) {
  const { sohne, controlBold, controlReg, wordmarkDataUri } = await loadAssets();
  const svg = await satori(ShareCard({ ...data, wordmarkDataUri }), {
    width: 1080, height: 1920,
    fonts: [
      { name: "Sohne", data: sohne, weight: 300, style: "normal" },
      { name: "Sohne", data: sohne, weight: 400, style: "normal" },
      { name: "Control", data: controlReg, weight: 400, style: "normal" },
      { name: "Control", data: controlBold, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}
