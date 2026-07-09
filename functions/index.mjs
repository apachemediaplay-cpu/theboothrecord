// Booth share endpoints (Firebase Cloud Functions, Blaze).
//   /og/{token}.png  -> per-verdict card image, rendered server-side with Satori (card.mjs)
//   /v/{token}       -> the React app with per-token OG/Twitter meta injected for scrapers
//
// Reads verdicts ONLY through get_share_verdict(token) — an unguessable token, never the
// sequential id — so nothing here is enumerable. Does not touch the verdict engine.
import { onRequest } from "firebase-functions/v2/https";
import { renderCardPng } from "./src/card.mjs";

const ORIGIN = "https://theboothrecord.com";

// Minimal source -> venue display name (mirrors src/lib/source.ts VENUES). Used for the
// "AS CHARGED AT <venue>" line; unknown/direct -> LOCATION WITHHELD (handled in card.mjs).
const VENUE = {
  seoultiger1988: "Seoul Tiger 1988",
  frenchie: "Frenchie", frenchiecbd: "Frenchie", frenchiecbda: "Frenchie", frenchiecbdb: "Frenchie",
};
const venueFor = (source) => VENUE[(source || "").toLowerCase()] || "";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// id is the confession uuid (from the URL). Calls the get_share_verdict RPC over PostgREST
// with plain fetch — NO supabase-js (its client constructor inits a realtime WebSocket that
// throws on the Node 20 runtime, and we only need this one read). get_share_verdict compares
// id as text, so a non-uuid like "1" matches nothing and this returns null → the caller 404s.
async function fetchVerdict(id) {
  if (!id) return null;
  const key = process.env.SUPABASE_ANON_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_share_verdict`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _id: id }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return Array.isArray(data) && data.length ? data[0] : null;
}

// Cache the built index.html per function instance (it only changes on deploy).
let _indexHtml = null;
async function getIndexHtml() {
  if (_indexHtml) return _indexHtml;
  const r = await fetch(`${ORIGIN}/index.html`);
  _indexHtml = await r.text();
  return _indexHtml;
}

// Strip the generic og:/twitter: tags and inject per-token ones before </head>.
function injectOg(html, { title, description, image, url }) {
  const stripped = html
    .replace(/\s*<meta[^>]+(property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/g, "");
  const tags = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join("\n    ");
  return stripped.replace("</head>", `    ${tags}\n  </head>`);
}

// /og/{token}.png
export const ogImage = onRequest(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 30, maxInstances: 10, secrets: [] },
  async (req, res) => {
    try {
      const m = req.path.match(/\/og\/([^/.]+)\.png$/);
      const row = m && (await fetchVerdict(m[1]));
      if (!row) { res.status(404).send("Not found"); return; }
      const png = await renderCardPng({
        confession: row.confession_text || "",
        verdict: row.verdict_text || "",
        venue: venueFor(row.source),
        subjectNumber: row.subject_number,
      });
      // uuid -> content is immutable, so cache hard.
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.status(200).send(png);
    } catch (e) {
      console.error("ogImage error", e);
      res.status(500).send("Error");
    }
  },
);

// /v/{token}
export const share = onRequest(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 20, maxInstances: 20, secrets: [] },
  async (req, res) => {
    try {
      const m = req.path.match(/\/v\/([^/]+)/);
      const id = m && m[1];
      const html = await getIndexHtml();
      const row = id && (await fetchVerdict(id));
      res.set("Content-Type", "text/html; charset=utf-8");
      if (!row) { res.status(200).send(html); return; } // unknown uuid -> plain app (VerdictShare shows not-found)
      const venue = venueFor(row.source);
      const out = injectOg(html, {
        title: venue ? `Guilty as charged at ${venue}.` : "The booth noticed.",
        description: row.verdict_text || "You've been summoned. You know what you did.",
        image: `${ORIGIN}/og/${id}.png`,
        url: `${ORIGIN}/v/${id}`,
      });
      res.set("Cache-Control", "public, max-age=300");
      res.status(200).send(out);
    } catch (e) {
      // Never 500 the human page — fall back to the app with generic OG.
      console.error("share error", e);
      try {
        res.set("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(await getIndexHtml());
      } catch {
        res.status(500).send("Error");
      }
    }
  },
);
