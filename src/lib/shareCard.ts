import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";

// ── THE STORY CARD (1080×1920 PNG) ──────────────────────────────────────────
// Extracted from Verdict.tsx unchanged: every measurement, baseline, colour and
// comment below is the code that drew the card on the confessor's phone, moved
// verbatim. The ONLY difference is that it no longer reaches into
// sessionStorage — the four values it used to read from the session (the
// confession, the verdict, the subject number and the filing time) arrive as a
// record instead, so a page that holds those values in a DB row can draw the
// same card. The regression test for this move is the no-photo card's SHA-256:
// it must not change.
//
// PURE: no React, no router, no session, no network. Give it a record, get a
// Blob. Whether the venue may be stamped at all is NOT decided here — the
// caller passes filedVenue: "" for withheld, because the rule differs by
// surface (the confessor's own session vs the row's stamp_venue flag).
//
// TWO RENDERERS: the OG image at functions/src/card.mjs draws a DIFFERENT card
// (server-side, Satori, no photo) for link unfurls. They have drifted twice.
// Change one, check the other.
export type ShareCardRecord = {
  /** The confession as typed. Drawn on the no-photo card only. */
  confession: string;
  /** The verdict text. Drawn on both compositions. */
  verdict: string;
  /** Subject number as a STRING — drawn verbatim, never reformatted. "" hides the line. */
  subjectNumber: string;
  /** UPPERCASE venue name, or "" for LOCATION WITHHELD. The caller owns the decision. */
  filedVenue: string;
  /** Filing time, epoch ms. Null/0/NaN falls back to now (photo card's meta bar only). */
  filedAt: number | null;
};

// ── FILM GRADE for the story card's photo — strength in ONE place. ──────────
// 0 = off, 1 = heavy; 0.5 is the shipped medium. FIXED, never adaptive and
// never per-photo: a fixed value is what makes cards from one venue read as
// a set, which matters more than optimising any single photo.
const FILM_GRADE = 0.5;

// Grade the baked photo and return a new canvas. Applied ONLY to the photo
// pixels, BEFORE they are drawn into the card — never to the whole canvas:
// grading the card would shift the #171513 mount blue and warm the orange
// wordmark, breaking the match with the no-photo card and the app's tokens.
// The moves, in order: split tone (shadows lifted toward cool blue-grey,
// highlights pushed toward amber — Frenchie and Gigi already look like this,
// so the grade amplifies the room rather than inventing a look), slight
// contrast soften, slight desaturation, fine grain to break the digital
// cleanliness, and a soft bloom on the brightest points.
// EXPECTED BEHAVIOUR: strong on dark warm rooms (the venues), nearly
// invisible on bright daytime photos (most Direct traffic) — split-toning
// needs shadows to work on. That asymmetry is correct, not a bug.
const gradePhoto = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const w = src.width;
  const h = src.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const g = out.getContext("2d");
  if (!g) return src;
  g.drawImage(src, 0, 0);
  const S = FILM_GRADE;
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  const contrast = 1 - 0.12 * S; // soften around mid-grey
  const desat = 0.18 * S;
  const grain = 16 * S;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let gg = d[i + 1];
    let b = d[i + 2];
    const t = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    // Split tone: weight the tints by squared distance from mid so mids stay
    // honest — shadows go cool blue-grey, highlights go amber.
    const sw = (1 - t) * (1 - t);
    const hw = t * t;
    r += S * (sw * -14 + hw * 16);
    gg += S * (sw * 2 + hw * 7);
    b += S * (sw * 18 + hw * -14);
    r = 128 + (r - 128) * contrast;
    gg = 128 + (gg - 128) * contrast;
    b = 128 + (b - 128) * contrast;
    const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    r += (l - r) * desat;
    gg += (l - gg) * desat;
    b += (l - b) * desat;
    // Fine monochrome grain (same offset on all channels = luma noise).
    const n = (Math.random() - 0.5) * grain;
    r += n;
    gg += n;
    b += n;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  g.putImageData(id, 0, 0);
  // Bloom: pull the brightest points into their own layer, blur them by
  // round-tripping through a 1/10-scale canvas (works everywhere — no
  // ctx.filter dependency), and screen the result back over the photo.
  const hi = document.createElement("canvas");
  hi.width = w;
  hi.height = h;
  const hictx = hi.getContext("2d");
  if (hictx) {
    const hid = hictx.createImageData(w, h);
    const hd = hid.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const m = l > 208 ? (l - 208) / 47 : 0; // only the brightest points
      hd[i] = d[i] * m;
      hd[i + 1] = d[i + 1] * m;
      hd[i + 2] = d[i + 2] * m;
      hd[i + 3] = 255;
    }
    hictx.putImageData(hid, 0, 0);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / 10));
    small.height = Math.max(1, Math.round(h / 10));
    const sctx = small.getContext("2d");
    if (sctx) {
      sctx.drawImage(hi, 0, 0, small.width, small.height);
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.4 * S;
      g.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
      g.restore();
    }
  }
  return out;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
};
export const renderShareCard = async (
  record: ShareCardRecord,
  photo?: HTMLCanvasElement,
): Promise<Blob> => {
  const { confession, verdict, subjectNumber, filedVenue, filedAt: filedAtMs } = record;
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Make sure custom fonts are ready before drawing.
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load("300 42px 'Söhne Mono'"),
      document.fonts.load("400 28px 'Söhne Mono'"),
      document.fonts.load("700 70px 'Control Upright'"),
    ]);
  } catch {
    /* fall back to whatever is available */
  }

  const setLS = (v: string) => {
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = v;
    } catch {
      /* letterSpacing unsupported — ignore */
    }
  };

  const pad = 110;
  const maxW = W - pad * 2;

  // Layered neon glow — ONE structure, per-colour variants below (not
  // special cases: any future element picks a colourway). Three shadow
  // passes at the app's curve (2.8/10/26 @ .97/.68/.47) filled with the
  // CORE colour so only the halos accumulate, then a crisp core draw.
  // The core must stay brighter than the halo or it reads as blur.
  const drawNeonText = (
    text: string,
    x: number,
    y: number,
    core: string,
    halo: [string, string, string],
  ) => {
    const layers: [number, string][] = [
      [2.8, halo[0]],
      [10, halo[1]],
      [26, halo[2]],
    ];
    ctx.fillStyle = core;
    for (const [blur, color] of layers) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.fillText(text, x, y);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillText(text, x, y);
  };
  // State Blue — the filing voice (both compositions' stamps, the header).
  const drawNeonStamp = (text: string, x: number, y: number) =>
    drawNeonText(text, x, y, "rgb(120,205,235)", [
      "rgba(52,155,189,0.97)",
      "rgba(52,155,189,0.68)",
      "rgba(52,155,189,0.47)",
    ]);
  // Ritual green — the ask (the card's CTA). Halo is the token green
  // (rgb(0,255,30), card.mjs's RITUAL); core lightened one step, mirroring
  // how the blue core sits above State Blue.
  const drawNeonGreen = (text: string, x: number, y: number) =>
    drawNeonText(text, x, y, "rgb(140,255,150)", [
      "rgba(0,255,30,0.97)",
      "rgba(0,255,30,0.68)",
      "rgba(0,255,30,0.47)",
    ]);

  if (photo) {
    // ── PHOTO COMPOSITION: THE MINIMAL CARD ──────────────────────────
    // Header (filing time left, venue chip right) → print → verdict →
    // URL footer. Assembled from three successive briefs; the confession
    // and the band venue line are GONE by that design — the venue lives
    // in the header chip, and the verdict stands alone as the record.
    // (This supersedes the earlier recorded positions: "the venue moved
    // into the band to sit with the verdict" and "the verdict needs its
    // question visible" — both were re-decided by the minimal-card briefs.)
    // The time is the CONFESSION'S OWN timestamp (specced): filedAt from
    // Receiving, HH:MM 24h — see the header block below.
    // DERIVED, NOT SPECCED — verify and correct: time/chip type sizes
    // (26/24 mono), flat State Blue for the whole header (filing-mark
    // voice, matching the wall stamps' flat convention), chip vertical
    // padding (14), and the top margin value (81, from the brief's own
    // artifact).
    ctx.fillStyle = "#171513";
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // Real ink extents for a rendered string — the actual bounding box,
    // not em fractions. ALL vertical gaps on this card are measured ink:
    // descender of one element to cap-height of the next.
    const inkOf = (font: string, text: string) => {
      ctx.font = font;
      const m = ctx.measureText(text);
      return {
        asc: Math.round(m.actualBoundingBoxAscent),
        desc: Math.round(m.actualBoundingBoxDescent),
      };
    };

    // THE STACK: meta bar → print → verdict → URL, all ink-measured.
    //   meta ink bottom → print top   24
    //   print bottom    → verdict cap 48  (image to text)
    //   verdict ink     → URL cap     32  (the verdict and its footer)
    //
    // MARGINS ARE CHROME RESERVES, MEASURED — not taste. On a published
    // Story viewed AS A VIEWER (13 Aug 2026, single handset), Instagram
    // covers card y 0–165 (top) and y 1809–1920 (bottom). Everything the
    // card says must live between those lines.
    // marginTop 172 is the META'S INK TOP (not the print's): it clears
    // the 165 top reserve with 7px to spare. The meta sits on the card
    // background above the print — ON BLACK, never on the photo, where
    // its legibility would depend on what was shot.
    // marginBottom 170 puts the last ink near 1750 — ~59px clear of the
    // bottom reserve. THAT 59px IS DELIBERATE TOLERANCE for handsets with
    // a taller home indicator: do not spend it to grow the print without
    // re-measuring on a second device.
    const inset = 56;
    const marginTop = 172; // meta INK TOP (top reserve is 165)
    const metaToPrint = 24; // meta ink bottom → print top
    const marginBottom = 170; // URL ink bottom → card bottom (reserve 111)
    const printToVerdict = 48;
    const verdictToUrl = 32;
    const photoW = W - inset * 2; // 968
    const photoPrefH = Math.round(H * 0.65); // step the verdict below this
    const photoGuardH = Math.round(H * 0.55); // absolute floor

    // ── THE META BAR: time left, venue right, on the card background
    // above the print. Not a header block, not a chip, not a rule — two
    // facts on one line at the frame's own margins, so the bar IS the
    // alignment. Fixed 26px with NO step-down: at this size the two
    // strings sit ~600px apart on a 1080 row, so nothing can collide and
    // nothing needs to shrink.
    // It sits on black rather than on the photo because on-print type
    // failed twice for the same reason — its legibility depended on
    // whatever was photographed.
    const metaFont = "400 26px 'Söhne Mono', monospace";
    // The FILING time, not card-generation time: the card is a record of
    // when the confession happened, and someone can share hours later —
    // render time would misdate the night. filedAt is captured by
    // Receiving at the moment the verdict lands, on the confessor's phone
    // at the venue, so device-local IS venue-local (no timezone column
    // exists on confessions or venues, and none is needed). The
    // render-time fallback only fires for a session predating this build.
    const filedAtRaw = Number(filedAtMs);
    const filedAt = Number.isFinite(filedAtRaw) && filedAtRaw > 0
      ? new Date(filedAtRaw)
      : new Date();
    const timeText = `${String(filedAt.getHours()).padStart(2, "0")}:${String(
      filedAt.getMinutes(),
    ).padStart(2, "0")}`;
    // The venue is ALWAYS cut at its first comma — "The StandardX,
    // Melbourne" → "THE STANDARDX". The city is the droppable half: the
    // room is what a viewer acts on, and the cut keeps the bar to two
    // short facts. Unconditional, not a width fallback. (LOCATION
    // WITHHELD has no comma and passes through whole.)
    const rawVenue = filedVenue || "LOCATION WITHHELD";
    const venueText = rawVenue.includes(",")
      ? rawVenue.slice(0, rawVenue.indexOf(",")).trim()
      : rawVenue;

    // Draw the bar: ink-positioned at both ends — the time's ink starts
    // at the inset, the venue's ink ends on the print's right edge, and
    // the row's ink top is marginTop. Baseline/extents come from the
    // taller of the two strings so the row reads as one line.
    setLS("2px");
    ctx.font = metaFont;
    const timeM = ctx.measureText(timeText);
    const venueM = ctx.measureText(venueText);
    const metaAsc = Math.max(timeM.actualBoundingBoxAscent, venueM.actualBoundingBoxAscent);
    const metaDesc = Math.max(timeM.actualBoundingBoxDescent, venueM.actualBoundingBoxDescent);
    const metaBaseline = marginTop + metaAsc;
    const metaInkBottom = metaBaseline + metaDesc;
    drawNeonStamp(timeText, inset + timeM.actualBoundingBoxLeft, metaBaseline);
    drawNeonStamp(
      venueText,
      W - inset - venueM.actualBoundingBoxRight,
      metaBaseline,
    );
    setLS("0px");

    // ── Print size: the photo takes everything the fixed stack doesn't
    // need — no ceiling; the % is an OUTCOME (reported per render in dev).
    // The verdict steps down (42 → 38 → 34, leading 1.22) below a 65%
    // print; 55% guards absurd inputs. 42 as the top step, down from 54:
    // with the confession gone from the band the verdict is ALONE down
    // there, and 54 filled the space rather than sitting in it — 42 gives
    // the band negative space and the print grows into the difference.
    const photoTop = metaInkBottom + metaToPrint;
    // The CTA's OWN size — it inherited chipFont (24) in the minimal-card
    // rewrite and lost its constant; the URL is the only route back to the
    // site on an image nobody can tap, and it earns its own scale. Keep
    // this constant so it can't get absorbed a second time.
    const ctaSize = 28;
    const ctaFont = `400 ${ctaSize}px 'Söhne Mono', monospace`;
    const ctaInk = inkOf(ctaFont, "confess at theboothrecord.com");
    const vSteps: [number, number][] = [
      [40, 49],
      [36, 44],
      [32, 39],
    ];
    let vSize = 32;
    let vLH = 39;
    let vLines: string[] = [];
    let vTopInk = 0;
    let vBottomInk = 0;
    let photoH = photoPrefH;
    for (const [s, lh] of vSteps) {
      const vFont = `700 ${s}px 'Control Upright', sans-serif`;
      ctx.font = vFont;
      const vl = wrapText(ctx, verdict, photoW);
      const vAsc = inkOf(vFont, vl[0] ?? "").asc;
      const vDesc = inkOf(vFont, vl[vl.length - 1] ?? "").desc;
      const below =
        printToVerdict +
        vAsc +
        (vl.length - 1) * lh +
        vDesc +
        verdictToUrl +
        ctaInk.asc +
        ctaInk.desc;
      const fitH = H - marginBottom - below - photoTop;
      vSize = s;
      vLH = lh;
      vLines = vl;
      vTopInk = vAsc;
      vBottomInk = vDesc;
      if (fitH >= photoPrefH) {
        photoH = fitH;
        break;
      }
      photoH = Math.max(fitH, photoGuardH);
    }
    const photoBottom = photoTop + photoH;

    // The crop step bakes the photo at 968×1520 — just above the tallest
    // print this layout produces (a one-line verdict lands ~1515 since the
    // 42px verdict step; only ~5px of headroom remains, so re-check this
    // if the band shrinks again). Cards take a centred slice down to the
    // actual print height; the slice is small on short cards and grows
    // with the verdict.
    // FILM GRADE applied here, to the photo pixels ONLY (see gradePhoto):
    // everything drawn after this — mount, wordmark, band type — stays in
    // the app's own colours.
    const graded = gradePhoto(photo);
    const srcY = Math.max(0, Math.round((graded.height - photoH) / 2));
    ctx.drawImage(
      graded,
      0,
      srcY,
      photoW,
      Math.min(photoH, graded.height),
      inset,
      photoTop,
      photoW,
      photoH,
    );

    // ── Stamp ON the print: the WORDMARK ALONE, bottom-right corner —
    // NOTHING else goes on the print. The charge line lived here briefly
    // (under the mark, neon) and left FOR GOOD: its legibility depended on
    // whatever was photographed, and pale rooms washed it out. On-print
    // type has now failed twice for that reason (white wordmark before
    // it); the print carries the orange mark and only the mark — the
    // venue reads from the header chip, on a surface we control.
    // KNOWN TRADE: the bottom of a photo is usually the foreground — the
    // crop step mitigates this, because the mark's position is fixed and
    // people frame knowing where it lands.
    // NOTE the -10° tilt swings the mark's lower-left corner below its
    // nominal box, but the SVG's ink is inset within that box and absorbs
    // most of it. The centre is nudged UP 7px off the pure box math so the
    // measured INK sits equidistant from the print's right and bottom
    // edges (~35px each) — position the ink, not the box.
    const wm = await loadImage(guiltyWordmark);
    const stampW = 340;
    const wmRatio = wm.height && wm.width ? wm.height / wm.width : 335.5 / 1000;
    const stampH = stampW * wmRatio;
    const stampCx = inset + photoW - 34 - stampW / 2;
    const stampCy = photoBottom - 34 - stampH / 2 - 7;

    // GUILTY ORANGE, the asset's own colour — one brand mark on every
    // surface (WHITE WAS TRIED AND REVERTED: no separation on a pale
    // photo, read as generic app chrome — don't repeat it). NO shadow any
    // more: that was a white-stamp legibility fix, and it measured near
    // invisible even then.
    ctx.save();
    ctx.translate(stampCx, stampCy);
    ctx.rotate((-10 * Math.PI) / 180);
    ctx.drawImage(wm, -stampW / 2, -stampH / 2, stampW, stampH);
    ctx.restore();

    // ── Below the print: verdict, then its footer. Baselines chained from
    // MEASURED INK: baseline = previous ink bottom + stated gap + this
    // element's measured cap ascent. The verdict stands alone — the
    // minimal card carries no confession and no band venue line (the
    // venue is the header chip).
    ctx.fillStyle = "#F4F0EA";
    ctx.font = `700 ${vSize}px 'Control Upright', sans-serif`;
    let vy = photoBottom + printToVerdict + vTopInk;
    for (const ln of vLines) {
      ctx.fillText(ln, inset, vy);
      vy += vLH;
    }
    const vInkBottom = vy - vLH + vBottomInk;
    // ── FOOTER: the URL alone, flush left at the inset. The filing
    // meta moved to the top bar, so there is no second element on this
    // line and no collision rule — the cascade that used to shrink,
    // de-time and truncate the meta here is gone with it.
    // 32px of ink gap above: related to the verdict — its footer — where
    // the 48px above that is the image-to-text break.
    const ctaBaseline = vInkBottom + verdictToUrl + ctaInk.asc;
    // FLAT ritual green, no glow: the lit voice on this card is the meta
    // bar's State Blue, and the URL is the quieter fact.
    const rootStyle = getComputedStyle(document.documentElement);
    const ritualGreen = `hsl(${rootStyle.getPropertyValue("--ritual-green").trim()})`;
    setLS("2px");
    ctx.font = ctaFont;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = ritualGreen;
    ctx.fillText("confess at theboothrecord.com", inset, ctaBaseline);
    setLS("0px");

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to render image"))),
        "image/png",
      );
    });
  }

  // Background
  ctx.fillStyle = "#171513";
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Reuse the verdict screen's CSS tokens so the card matches (no hardcoded hex):
  // --ritual-green is what .text-ritual uses; --muted-foreground is the on-screen grey.
  const root = getComputedStyle(document.documentElement);
  const ritualGreen = `hsl(${root.getPropertyValue("--ritual-green").trim()})`;
  const mutedGrey = `hsl(${root.getPropertyValue("--muted-foreground").trim()})`;

  // Label — same green as the screen's "The booth noticed."
  setLS("6px");
  ctx.fillStyle = ritualGreen;
  ctx.font = "400 26px 'Söhne Mono', monospace";
  ctx.fillText("THE BOOTH NOTICED.", pad, 210);
  setLS("0px");

  // Confession — same grey as on screen, light weight (sits below the verdict).
  ctx.fillStyle = mutedGrey;
  ctx.font = "300 42px 'Söhne Mono', monospace";

  let y = 300;
  const cLH = 58;
  for (const ln of wrapText(ctx, confession, maxW)) {
    ctx.fillText(ln, pad, y);
    y += cLH;
  }

  // Verdict
  y += 80;
  ctx.fillStyle = "#F4F0EA";
  ctx.font = "700 70px 'Control Upright', sans-serif";
  const vLH = 84;
  for (const ln of wrapText(ctx, verdict, maxW)) {
    ctx.fillText(ln, pad, y);
    y += vLH;
  }

  // ── Lower composition: TWO GROUPS ──
  // Group 1 (centred): GUILTY wordmark + AS CHARGED stamp, centred in the space below
  //   the verdict so the larger wordmark breathes.
  // Group 2 (footer, pinned to the bottom): SUBJECT # + @theboothrecord +
  //   theboothrecord.com.
  const img = await loadImage(guiltyWordmark);
  const stampW = 560;
  const ratio = img.height && img.width ? img.height / img.width : 335.5 / 1000;
  const stampH = stampW * ratio;

  const gapStampToCharge = 64;
  const chargeLH = 44;
  const groupH = stampH + gapStampToCharge + chargeLH; // wordmark + AS CHARGED (2 lines)

  // Centre group 1 between the verdict and the pinned footer. The group's
  // BOTTOM is clamped to regionBottom: when long text shrinks the region
  // below groupH, overflow spills UPWARD into the verdict gap, never
  // downward into the footer — if something has to give, it should be
  // whitespace between two readable things, not two lines of text printing
  // over each other. A cramped card is legible; an overlapping one isn't.
  // (Without the clamp, a 140-char confession + a ~140-char verdict printed
  // LOCATION WITHHELD through SUBJECT #.)
  const regionTop = y + 70;
  const regionBottom = H - 420; // leave room for the bottom-pinned footer (3 lines)
  const stampTopY = Math.min(
    regionTop + Math.max(0, (regionBottom - regionTop - groupH) / 2),
    regionBottom - groupH
  );

  const cx = W / 2;
  const cy = stampTopY + stampH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-10 * Math.PI) / 180);
  ctx.drawImage(img, -stampW / 2, -stampH / 2, stampW, stampH);
  ctx.restore();

  ctx.textAlign = "center";

  // AS CHARGED — two lines, directly under the wordmark (group 1).
  //   line 1: "AS CHARGED" · line 2: "AT <VENUE>" or "LOCATION WITHHELD".
  // State Blue NEON on BOTH lines — one stamp, one treatment (two colours
  // would read as a bug). The OG card (card.mjs) carries the same core and
  // curve via CSS text-shadow; canvas has ONE shadow per draw, so the
  // three-layer curve is approximated with three shadow passes and a final
  // crisp core draw (drawNeonStamp above — the glow passes fill with the
  // CORE colour so only the halos accumulate, rather than the off-canvas
  // shadow-offset trick, which some renderers cull).
  const chargeLine1 = "AS CHARGED";
  const chargeLine2 = filedVenue ? `AT ${filedVenue}` : "LOCATION WITHHELD";
  const charge1Y = stampTopY + stampH + gapStampToCharge;
  setLS("6px");
  ctx.font = "400 30px 'Söhne Mono', monospace";
  drawNeonStamp(chargeLine1, cx, charge1Y);
  drawNeonStamp(chargeLine2, cx, charge1Y + chargeLH);
  setLS("0px");

  // Group 2 — footer pinned to the bottom: SUBJECT # then @theboothrecord
  // then theboothrecord.com. The footer sits ABOVE Instagram's bottom safe
  // zone — Meta reserves the bottom 250px of a 1080×1920 story (from y=1670)
  // for the reply box / send / swipe UI, and the handle and address are the
  // only things telling a viewer where the card came from. Lowest ink lands
  // at ~1649 (address baseline H - 270), 20px above the band. This is a
  // DELIBERATE geometry difference from the OG card, which is a link
  // preview with no safe zone — the pair-note's "aligned" means content and
  // treatment, not position. Do not push this footer back down.
  if (subjectNumber) {
    setLS("4px");
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = "400 24px 'Söhne Mono', monospace";
    ctx.fillText(`SUBJECT #${subjectNumber}`, cx, H - 370);
    setLS("0px");
  }

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "400 28px 'Söhne Mono', monospace";
  ctx.fillText("@theboothrecord", cx, H - 310);

  // theboothrecord.com — one step dimmer than the handle (the SUBJECT #
  // alpha), the OG card's treatment. Handle and URL are near-repetition on
  // purpose: the handle goes to Instagram, the URL goes to the Booth.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText("theboothrecord.com", cx, H - 270);
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to render image"))),
      "image/png"
    );
  });
};
