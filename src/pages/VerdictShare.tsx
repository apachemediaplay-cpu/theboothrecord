import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { fetchSharedVerdict, logBoothEvent, logShare, type SharedVerdict } from "@/lib/metrics";
import { venueDisplayName, mayStampVenue, resolveVenueDisplayName } from "@/lib/source";
import StoryFlow from "@/components/StoryFlow";
import firstOffence from "@/assets/first-offence.webp";

// ── THE ?k= OFFER ───────────────────────────────────────────────────────────
// A kiosk QR carries ?k={key}; this page turns that key into a discount code.
// The TABLE HOLDS THE CODE ONLY — the line beside it is fixed copy, because
// the offer is always the same offer; only the code changes per event.
//
// The KEY IS UNTRUSTED (it comes from a URL): it is only ever used as a lookup
// into this table, never rendered. An unknown or absent key renders NOTHING —
// no empty row, no "offer expired", no trace that an offer exists at all.
//
// TODO: hardcoded for the first event. When a second venue or a second night
// needs its own code, move it to a table (site_copy-shaped, console-edited)
// rather than growing this object — the console already owns every other piece
// of per-venue copy.
const OFFER_CODES: Record<string, string> = {
  woolstore: "GUILTY10",
};

// THE FILING TIME, IN THE ROOM'S OWN CLOCK. created_at is UTC and
// filed_offset_minutes is the offset of the device that FILED the confession
// (minutes east of UTC), so created_at + offset read with the UTC getters is
// the wall clock in the room it happened in — on any viewer's device, anywhere,
// at any later date. Returns undefined when either is missing (every row
// predating 20260818100000, or a database where that migration has not been
// pasted yet) and the card then falls back to its own clock rather than
// printing a confident wrong hour.
const filedTimeText = (row: SharedVerdict): string | undefined => {
  const ms = row.created_at ? Date.parse(row.created_at) : NaN;
  if (!Number.isFinite(ms)) return undefined;
  const offset = row.filed_offset_minutes;
  if (offset == null || !Number.isFinite(offset)) return undefined;
  const wall = new Date(ms + offset * 60000);
  return `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
};

// The shop's discount link drops the code straight into a pre-filled cart.
const offerHref = (code: string) =>
  `https://shop.houseofguilty.com/discount/${encodeURIComponent(code)}?redirect=/cart/52182988423451:1`;

// The Booth mark — STATIC by design: this page is read, not passed through, and
// YOUR TURN's label already carries the page's only pulse. No glow, no animation
// of any kind; the dot stays inside the SVG (no box-shadow), unlike the gate.
// marginClass: the found state uses the default mb-8 (32px); the notfound state
// passes mb-4 so its container's gap-4 stacks to the SAME 32px — one number.
const BoothMark = ({ marginClass = "mb-8" }: { marginClass?: string }) => (
  <svg viewBox="0 0 240 240" className={`${marginClass} h-10 w-10`} aria-hidden="true">
    <path
      d="M58.5 210 L58.5 109 A61.5 61.5 0 0 1 181.5 109 L181.5 210"
      fill="none"
      stroke="hsl(var(--ritual-green))"
      strokeWidth="31"
    />
    <rect x="32" y="210" width="175" height="18" fill="hsl(var(--ritual-green))" />
    <circle cx="120" cy="161" r="19" fill="hsl(var(--ritual-green))" />
  </svg>
);

// Public landing for a shared verdict link (/v/:id). A recipient — not the confessor —
// lands here. Reads the verdict by its unguessable uuid via get_share_verdict; an unknown
// or non-uuid id resolves to nothing and shows the not-found state. No names, venue only.
const VerdictShare = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const offerCode = OFFER_CODES[(searchParams.get("k") || "").trim().toLowerCase()] ?? null;
  const [status, setStatus] = useState<"loading" | "found" | "notfound">("loading");
  const [row, setRow] = useState<SharedVerdict | null>(null);
  // ── THE PHOTO FLOW, GATED ON ?k= ───────────────────────────────────────────
  // The booth ends on a web page: the tablet hides the share actions (its
  // camera is the wrong camera) and the person's own phone only ever sees THIS
  // page, so without this there is no way for a kiosk confessor to make a card
  // at all.
  //
  // ?k= IS NOT SECURITY and is not treated as such — it survives a forward,
  // a screenshot of the address bar, a copy-paste. What it does mean is that
  // this URL came off a booth screen, which is the case the flow is built for.
  // A public record is not a licence to mint artefacts from it: without the
  // gate, anyone holding a link could pair THEIR photo with someone else's
  // confession under a venue's stamp, which is a new thing for this page to
  // invite. Presence of the key, not a KNOWN key — an unknown key still means
  // "scanned a code" (see OFFER_CODES above, which needs a known one).
  const canMakeCard = (searchParams.get("k") || "").trim().length > 0;
  const [storyOpen, setStoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchSharedVerdict(id).then((r) => {
      if (cancelled) return;
      setRow(r);
      setStatus(r ? "found" : "notfound");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // CTA carries the venue source so a scan-through from the shared link still attributes.
  const source = row?.source ?? "";
  const ctaHref =
    source && source !== "direct" ? `/confess?source=${encodeURIComponent(source)}` : "/confess";
  // FAIL CLOSED: only an explicit stamp_venue === true shows the venue. A missing field (older
  // get_share_verdict), a null row, or a failed fetch all fall through to "" → the existing
  // "Location withheld". Name resolution: venues.json synchronously at render (existing
  // venues — unchanged, no DB call, no flash), with the active-only DB fallback for
  // console-added venues filling in async. Any fallback failure → "" → withheld.
  const syncVenue = mayStampVenue(row?.stamp_venue) ? venueDisplayName("", source) : "";
  const [dbVenue, setDbVenue] = useState("");
  useEffect(() => {
    setDbVenue(""); // never carry a stale name across row changes
    if (!mayStampVenue(row?.stamp_venue)) return; // stamp not permitted — no lookup at all
    if (venueDisplayName("", source)) return; // venues.json covers it — DB fallback never runs
    let cancelled = false;
    resolveVenueDisplayName(source).then((name) => {
      if (!cancelled) setDbVenue(name);
    });
    return () => {
      cancelled = true;
    };
  }, [row, source]);
  const venue = syncVenue || dbVenue;

  if (status === "loading") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ritual text-lg font-mono-light tracking-wide">Pulling the record…</p>
        </div>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <BoothMark marginClass="mb-4" />
          <p className="text-muted-foreground type-confession font-mono-light">This record doesn't exist.</p>
        </div>
        {/* THE PRIMARY-ACTION RULE (see index.css) applies here too — same primary
            action, same slot; a dead share link must not surface a button style
            that exists nowhere else in the app. */}
        {/* max-w-md mx-auto: the FIXED block escapes screen-container's column
            (fixed spans the viewport) — same cap as the gate's BEGIN block and
            every action screen, so the button matches the found state's. */}
        <div className="fixed bottom-32 left-0 right-0 mx-auto column-cap flex justify-center px-6">
          <Link
            to="/confess"
            className="btn-booth border border-muted-foreground/40 bg-transparent type-action-14 text-center hover:bg-transparent"
          >
            <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
              ENTER THE BOOTH →
            </span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        <BoothMark />
        {/* System stamp, not a headline — Verdict's treatment but UPPERCASE: this reader
            is a stranger arriving cold, and caps read as a document stamp. */}
        {/* Masthead rhythm: 32px above this stamp (the mark is a heading), 12px
            below it (stamp + confession are one block). */}
        <p className="text-ritual type-filing font-mono-light tracking-[0.2em] uppercase mb-3">
          The booth noticed.
        </p>
        {row?.confession_text ? (
          <p className="text-muted-foreground type-confession font-mono-light whitespace-pre-wrap mb-8">
            {row.confession_text}
          </p>
        ) : null}
        {/* 24px to the venue line below — metadata attached to the verdict, not a
            peer of it; keeps confession → verdict (32px) the widest gap in the
            record. */}
        <p className="font-control type-verdict font-bold text-[#F4F0EA] leading-tight mb-6">
          {row?.verdict_text}
        </p>
        {/* Filing line in State Blue NEON — venue-glow-text, the gate strip's
            exact static treatment, reused rather than duplicated. Raised from
            flat 75% deliberately: this is the one screen a cold stranger sees,
            and the venue name is the thing venues are sold on. One line, on a
            page with almost nothing else — the same conditions that make the
            gate's version work. (Contrast the wall's stamps, which stay FLAT —
            see ConfessionCard.) */}
        {/* No SUBJECT # here, deliberately: this page is a stranger's first
            contact, and the subject number is an internal reference that
            means nothing to them — it doubled the line for no reader. (It
            still travels on the story card and the verdict screen, where the
            confessor it belongs to can see it.) */}
        <p className="venue-glow-text type-filing-12 font-mono-light tracking-[0.2em] uppercase">
          {venue ? `As charged at ${venue}` : "Location withheld"}
        </p>

        {/* THE OFFER — only ever with a known ?k=. Rebuilt: the dashed coupon
            box, the wordmark and the tagline are all GONE. A box drew a border
            around the one commercial thing on a page about confession and made
            it louder than the verdict; a hairline and a product shot let it sit
            in the page's own rhythm and still be unmistakably a different kind
            of object.
            ORANGE is the ONE SANCTIONED EXCEPTION to orange-means-confess —
            this is a buy CTA, and the exception exists so a buy CTA can never
            hide inside the app's own voice. The GLOW is on the code alone (the
            thing you carry to the bar), not the line.
            THE WHOLE ROW IS THE LINK: on a phone, a 64px image and two short
            lines are one target, and splitting them would give a thumb three
            small ones. */}
        {offerCode ? (
          <a
            href={offerHref(offerCode)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 w-full max-w-xs flex items-center gap-[14px] border-t pt-5"
            style={{ borderColor: "rgba(244,240,234,0.18)" }}
          >
            <img
              src={firstOffence}
              alt=""
              className="w-16 shrink-0"
              // Decorative: the line beside it already says what this is, and a
              // second reading of "first offence" would be noise on a screen
              // reader.
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-[#F4F0EA] text-[13px] font-mono-light tracking-wide">
                commit your first offence{" "}
                <span style={{ opacity: 0.5 }}>→</span>
              </span>
              <span
                className="block text-[15px] font-mono-light mt-1"
                style={{
                  color: "#FF6A2E",
                  letterSpacing: "0.14em",
                  textShadow:
                    "0 0 3px rgba(255,150,110,.9), 0 0 9px rgba(255,72,0,.85), 0 0 24px rgba(255,72,0,.55), 0 0 46px rgba(255,72,0,.3)",
                }}
              >
                {offerCode}
              </span>
            </span>
          </a>
        ) : null}
      </div>

      {/* NO divider rule above this block — REMOVED, deliberately, matching both
          Verdict states (the notfound state above never had one). This page
          doesn't scroll: the large gap, the Control→mono switch, and the
          left-record/centred-actions change already separate record from
          actions — a fourth signal was furniture. Checked before removal:
          the State Blue filing line stays glued to the verdict (24px above,
          ~300px+ to the actions, opposite alignment) and does NOT read as
          part of the action block. The wall's rule STAYS: a scrolling feed
          meeting a pinned bar is a real boundary — don't remove it for
          consistency. pt-6 kept: the separation was always the gap's job. */}
      <div className="shrink-0 w-full pt-6 flex flex-col items-center gap-3">
        {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
            hairline (muted-foreground/40, the divider's own rule),
            transparent — the glow is the only colour in the box. The
            emphasis on THIS page is entering, not
            the shop — no FIRST OFFENCE here at all (it lives on
            Verdict's post-share state; a cold stranger gets pushed into the
            Booth, not to a $55 buy link). */}
        <Link
          to={ctaHref}
          className="btn-booth border border-muted-foreground/40 bg-transparent type-action-14 text-center hover:bg-transparent"
        >
          <span className="enter-glow-text text-[hsl(var(--ritual-green))]">YOUR TURN →</span>
        </Link>
        {/* Quiet exit below the box — NO arrow (the arrow belongs to YOUR TURN
            alone). Same wallLink treatment as Verdict's quiet exit. onClick is a
            fire-and-forget metric; Link handles the navigation. The LABEL is
            SEE THE RECORD (the wall is PUBLIC RECORD now) but the logged event
            type stays see_guilty — it's in the log_booth_event RPC whitelist,
            and renaming it would need a migration for no benefit. */}
        {/* POST TO STORY — same treatment and same position in the stack as on
            the verdict screen: a quiet underlined action under the primary box,
            never a second box (one primary action per screen). */}
        {canMakeCard && status === "found" ? (
          <button
            onClick={() => setStoryOpen(true)}
            disabled={storyOpen}
            className="type-action text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
          >
            {storyOpen ? "PREPARING…" : "POST TO STORY"}
          </button>
        ) : null}
        <Link
          to="/thewall"
          onClick={() => logBoothEvent("see_guilty", source, { from: "share" })}
          className="type-action text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          SEE THE RECORD
        </Link>
      </div>

      {/* The SAME component the verdict screen mounts — see StoryFlow. What
          differs is only what this page can know: a row instead of a session. */}
      <StoryFlow
        open={storyOpen}
        onClose={() => setStoryOpen(false)}
        secondaryClass="type-action text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
        resolve={async () => {
          if (!row) return null;
          return {
            record: {
              confession: row.confession_text || "",
              verdict: row.verdict_text || "",
              subjectNumber: row.subject_number != null ? String(row.subject_number) : "",
              // THE ROW'S FLAG, NEVER isPhysicalScan(). That helper reads the
              // VIEWING session, which on this page is always "not physical" —
              // gating on it would strip the venue from a genuine booth
              // confession. stamp_venue already encodes the physical test,
              // applied by tag_confession at filing time.
              filedVenue: mayStampVenue(row.stamp_venue) ? venue.toUpperCase() : "",
              // Epoch is unused when filedTimeText is supplied; kept null so a
              // build without the created_at columns falls back to "now"
              // rather than to a wrong hour.
              filedAt: null,
              filedTimeText: filedTimeText(row),
            },
            shareUrl: `https://theboothrecord.com/v/${id}`,
          };
        }}
        onShared={() => {
          logShare(source);
          logBoothEvent("share_card", source);
        }}
      />
    </main>
  );
};

export default VerdictShare;
